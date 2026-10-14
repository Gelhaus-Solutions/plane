# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Epics (E11): the Epic type made on demand, the roll-up of children, health, waves and the two lists."""

from datetime import date, timedelta

import pytest
from django.utils import timezone
from rest_framework import status

from django.core.management import call_command

from plane.db.models import (
    EpicDetail,
    EpicUpdate,
    EpicWave,
    Issue,
    IssueAssignee,
    IssueRelation,
    IssueLabel,
    IssueType,
    Label,
    Module,
    ModuleIssue,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
)
from plane.utils.epics import derive_health, empty_progress
from plane.utils.state_groups import default_states


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Epics", identifier="EPC", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    State.objects.bulk_create(default_states(project))
    return project


@pytest.fixture
def states(project):
    return {state.name: state for state in State.objects.filter(project=project)}


def base(workspace, project):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}"


def make_child(project, parent, state, name="Child", completed_days_ago=None):
    child = Issue.objects.create(name=name, project=project, state=state, parent=parent)
    if completed_days_ago is not None:
        Issue.objects.filter(pk=child.pk).update(completed_at=timezone.now() - timedelta(days=completed_days_ago))
    return child


def create_epic(client, workspace, project, **data):
    response = client.post(f"{base(workspace, project)}/epics/", {"name": "E07 PQL", **data}, format="json")
    assert response.status_code == status.HTTP_201_CREATED, response.data
    return response.data


@pytest.mark.contract
class TestEpicType:
    @pytest.mark.django_db
    def test_the_first_epic_makes_the_type_and_links_the_project(self, session_client, workspace, project):
        assert IssueType.objects.filter(workspace=workspace, is_epic=True).count() == 0
        epic = create_epic(session_client, workspace, project)
        issue = Issue.objects.get(pk=epic["id"])
        assert issue.type.is_epic
        assert ProjectIssueType.objects.filter(project=project, issue_type=issue.type).count() == 1
        create_epic(session_client, workspace, project, name="E09 UI")
        assert IssueType.objects.filter(workspace=workspace, is_epic=True).count() == 1

    @pytest.mark.django_db
    def test_create_sets_lead_wave_and_size(self, session_client, workspace, project, create_user):
        wave = EpicWave.objects.create(project=project, code="W1", name="Priorities")
        epic = create_epic(
            session_client, workspace, project, lead_id=str(create_user.id), wave_id=str(wave.id), size="L"
        )
        assert (epic["lead_id"], epic["wave_id"], epic["size"]) == (str(create_user.id), str(wave.id), "L")

    @pytest.mark.django_db
    def test_create_refuses_a_wave_of_another_project(self, session_client, workspace, project, create_user):
        other = Project.objects.create(name="Other", identifier="OTH", workspace=workspace, created_by=create_user)
        wave = EpicWave.objects.create(project=other, code="W1")
        response = session_client.post(
            f"{base(workspace, project)}/epics/", {"name": "X", "wave_id": str(wave.id)}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Issue.objects.filter(name="X").exists()

    @pytest.mark.django_db
    def test_convert_takes_the_first_assignee_as_lead_and_back(self, session_client, workspace, project, create_user):
        item = Issue.objects.create(name="E11 Epics", project=project)
        IssueAssignee.objects.create(issue=item, assignee=create_user, project=project)
        url = f"{base(workspace, project)}/epics/convert/"
        response = session_client.post(url, {"issue_id": str(item.id)}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["lead_id"] == str(create_user.id)
        response = session_client.post(url, {"issue_id": str(item.id), "is_epic": False}, format="json")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        item.refresh_from_db()
        assert item.type_id is None

    @pytest.mark.django_db
    def test_work_item_payloads_say_is_epic(self, session_client, workspace, project, states):
        epic = create_epic(session_client, workspace, project)
        make_child(project, Issue.objects.get(pk=epic["id"]), states["Todo"])
        response = session_client.get(f"{base(workspace, project)}/issues/")
        assert response.status_code == status.HTTP_200_OK
        flags = {row["name"]: row["is_epic"] for row in response.data["results"]}
        assert flags == {"E07 PQL": True, "Child": False}
        detail = session_client.get(f"{base(workspace, project)}/issues/{epic['id']}/")
        assert detail.data["is_epic"] is True


@pytest.mark.contract
class TestEpicList:
    @pytest.mark.django_db
    def test_rolls_up_children_by_bucket(self, session_client, workspace, project, states):
        epic = Issue.objects.get(pk=create_epic(session_client, workspace, project)["id"])
        for name in ("Done", "Done", "Review", "In Progress", "Todo", "Backlog", "Cancelled"):
            make_child(project, epic, states[name])
        make_child(project, None, states["Done"], name="Not a child")
        rows = session_client.get(f"{base(workspace, project)}/epics/").data
        assert len(rows) == 1
        progress = rows[0]["progress"]
        assert progress == {
            "completed": 2,
            "review": 1,
            "started": 1,
            "unstarted": 1,
            "backlog": 1,
            "cancelled": 1,
            "total": 6,
        }

    @pytest.mark.django_db
    def test_plain_work_items_are_not_listed(self, session_client, workspace, project):
        Issue.objects.create(name="Plain", project=project)
        assert session_client.get(f"{base(workspace, project)}/epics/").data == []

    @pytest.mark.django_db
    def test_a_posted_update_wins_over_the_pace(self, session_client, workspace, project, states):
        epic_row = create_epic(
            session_client, workspace, project, target_date=str(timezone.localdate() + timedelta(days=60))
        )
        epic = Issue.objects.get(pk=epic_row["id"])
        make_child(project, epic, states["Done"], completed_days_ago=3)
        make_child(project, epic, states["Todo"])
        row = session_client.get(f"{base(workspace, project)}/epics/").data[0]
        assert (row["health"], row["health_source"]) == ("on_track", "pace")

        url = f"{base(workspace, project)}/epics/{epic.id}/updates/"
        response = session_client.post(url, {"health": "at_risk", "body": "Parser slips a week."}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        row = session_client.get(f"{base(workspace, project)}/epics/").data[0]
        assert (row["health"], row["health_source"]) == ("at_risk", "update")
        assert row["latest_update"]["body"] == "Parser slips a week."

    @pytest.mark.django_db
    def test_an_update_needs_a_known_health(self, session_client, workspace, project):
        epic = create_epic(session_client, workspace, project)
        url = f"{base(workspace, project)}/epics/{epic['id']}/updates/"
        response = session_client.post(url, {"health": "fine"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert EpicUpdate.objects.count() == 0


@pytest.mark.contract
class TestEpicDetail:
    @pytest.mark.django_db
    def test_detail_has_burnup_needs_and_review_states(self, session_client, workspace, project, states):
        epic = Issue.objects.get(pk=create_epic(session_client, workspace, project)["id"])
        make_child(project, epic, states["Done"], completed_days_ago=10)
        make_child(project, epic, states["Todo"])
        blocker = Issue.objects.create(name="E06 Sync engine", project=project, state=states["Backlog"])
        IssueRelation.objects.create(issue=epic, related_issue=blocker, relation_type="blocked_by", project=project)

        data = session_client.get(f"{base(workspace, project)}/epics/{epic.id}/").data
        assert [point["scope"] for point in data["burnup"]][-1] == 2
        assert [point["done"] for point in data["burnup"]] == [0, 0, 0, 1, 1]
        assert data["added_this_month"] in (1, 2)
        assert [need["name"] for need in data["needs"]] == ["E06 Sync engine"]
        assert data["review_state_ids"] == [str(states["Review"].id)]

    @pytest.mark.django_db
    def test_needs_leave_out_projects_the_viewer_is_not_in(self, session_client, workspace, project, create_user):
        epic = Issue.objects.get(pk=create_epic(session_client, workspace, project)["id"])
        hidden = Project.objects.create(name="Hidden", identifier="HDN", workspace=workspace, created_by=create_user)
        secret = Issue.objects.create(name="Secret blocker", project=hidden)
        IssueRelation.objects.create(issue=epic, related_issue=secret, relation_type="blocked_by", project=project)
        data = session_client.get(f"{base(workspace, project)}/epics/{epic.id}/").data
        assert data["needs"] == []

    @pytest.mark.django_db
    def test_patch_sets_and_clears_the_epic_fields(self, session_client, workspace, project, create_user):
        epic = create_epic(session_client, workspace, project)
        wave = EpicWave.objects.create(project=project, code="W2", name="Foundations")
        url = f"{base(workspace, project)}/epics/{epic['id']}/"
        response = session_client.patch(
            url, {"wave_id": str(wave.id), "size": "XL", "lead_id": str(create_user.id)}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert (response.data["wave_id"], response.data["size"]) == (str(wave.id), "XL")
        response = session_client.patch(url, {"wave_id": None, "size": None}, format="json")
        assert (response.data["wave_id"], response.data["size"], response.data["lead_id"]) == (
            None,
            None,
            str(create_user.id),
        )
        assert EpicDetail.objects.filter(epic_id=epic["id"]).count() == 1

    @pytest.mark.django_db
    def test_patch_refuses_an_unknown_size(self, session_client, workspace, project):
        epic = create_epic(session_client, workspace, project)
        response = session_client.patch(
            f"{base(workspace, project)}/epics/{epic['id']}/", {"size": "XXL"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_a_plain_work_item_has_no_epic_page(self, session_client, workspace, project):
        item = Issue.objects.create(name="Plain", project=project)
        response = session_client.get(f"{base(workspace, project)}/epics/{item.id}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.contract
class TestEpicWaves:
    @pytest.mark.django_db
    def test_waves_come_in_order_and_codes_are_unique(self, session_client, workspace, project):
        url = f"{base(workspace, project)}/epic-waves/"
        assert session_client.post(url, {"code": "W1", "name": "Priorities"}, format="json").status_code == 201
        assert session_client.post(url, {"code": "W2", "name": "Foundations"}, format="json").status_code == 201
        assert session_client.post(url, {"code": "w1"}, format="json").status_code == status.HTTP_409_CONFLICT
        assert [wave["code"] for wave in session_client.get(url).data] == ["W1", "W2"]

    @pytest.mark.django_db
    def test_deleting_a_wave_leaves_its_epics(self, session_client, workspace, project):
        wave = EpicWave.objects.create(project=project, code="W3")
        epic = create_epic(session_client, workspace, project, wave_id=str(wave.id))
        response = session_client.delete(f"{base(workspace, project)}/epic-waves/{wave.id}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert EpicDetail.objects.get(epic_id=epic["id"]).wave_id is None


@pytest.mark.contract
class TestWorkspaceEpics:
    @pytest.mark.django_db
    def test_lists_open_epics_across_member_projects(self, session_client, workspace, project, states, create_user):
        other = Project.objects.create(name="Ops", identifier="OPS", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=other, member=create_user, role=20, is_active=True)
        State.objects.bulk_create(default_states(other))
        hidden = Project.objects.create(name="Hidden", identifier="HID", workspace=workspace, created_by=create_user)

        open_epic = create_epic(session_client, workspace, project, state_id=str(states["In Progress"].id))
        done_state = State.objects.get(project=other, name="Done")
        create_epic(session_client, workspace, other, name="Fork rollout", state_id=str(done_state.id))
        Issue.objects.filter(project=other).update(completed_at=timezone.now())
        Issue.objects.create(name="Not mine", project=hidden, type=IssueType.objects.get(is_epic=True))

        url = f"/api/workspaces/{workspace.slug}/epics/"
        data = session_client.get(url).data
        assert [row["id"] for row in data["results"]] == [open_epic["id"]]
        assert data["stats"]["total"] == 2
        assert data["stats"]["projects"] == 2
        assert data["stats"]["in_progress"] == 1
        assert data["stats"]["done_this_quarter"] == 1
        assert len(session_client.get(url, {"status": "all"}).data["results"]) == 2
        assert len(session_client.get(url, {"status": "done"}).data["results"]) == 1
        only = session_client.get(url, {"status": "all", "project_ids": str(other.id)}).data["results"]
        assert [row["name"] for row in only] == ["Fork rollout"]


@pytest.mark.unit
class TestDeriveHealth:
    TODAY = date(2026, 10, 15)

    def progress(self, completed=0, started=0, total=10):
        return {**empty_progress(), "completed": completed, "started": started, "total": total}

    def test_no_verdict_without_target_or_children_or_start(self):
        assert derive_health(self.progress(total=0), self.TODAY, self.TODAY, 0)[0] is None
        assert derive_health(self.progress(completed=2), None, self.TODAY, 2)[0] is None
        assert derive_health(self.progress(), self.TODAY + timedelta(days=30), self.TODAY, 0)[0] is None

    def test_on_track_when_the_pace_reaches_the_target(self):
        # 4 done in 28 days, 6 left: 42 days at this pace
        health, projected = derive_health(self.progress(completed=4), self.TODAY + timedelta(days=50), self.TODAY, 4)
        assert (health, projected) == ("on_track", self.TODAY + timedelta(days=42))

    def test_at_risk_when_the_pace_misses_the_target_or_stalls(self):
        assert derive_health(self.progress(completed=4), self.TODAY + timedelta(days=30), self.TODAY, 4)[0] == "at_risk"
        assert derive_health(self.progress(started=1), self.TODAY + timedelta(days=30), self.TODAY, 0)[0] == "at_risk"

    def test_off_track_past_the_target(self):
        assert (
            derive_health(self.progress(completed=4), self.TODAY - timedelta(days=1), self.TODAY, 4)[0] == "off_track"
        )

    def test_all_done_is_on_track(self):
        assert derive_health(self.progress(completed=10), None, self.TODAY, 0)[0] == "on_track"


@pytest.mark.contract
class TestConvertLabelledEpics:
    @pytest.mark.django_db
    def test_converts_labelled_items_with_lead_wave_and_size(self, workspace, project, create_user):
        label = Label.objects.create(name="Epic", project=project)
        module = Module.objects.create(name="W1 Priorities", project=project)
        epic = Issue.objects.create(name="E07 PQL", project=project)
        IssueLabel.objects.create(issue=epic, label=label, project=project)
        IssueAssignee.objects.create(issue=epic, assignee=create_user, project=project)
        ModuleIssue.objects.create(issue=epic, module=module, project=project)
        plain = Issue.objects.create(name="Python parser", project=project, parent=epic)

        call_command("convert_labelled_epics", workspace=workspace.slug, project="epc", size=["E07=L"], dry_run=True)
        epic.refresh_from_db()
        assert epic.type_id is None and not EpicWave.objects.exists()

        call_command("convert_labelled_epics", workspace=workspace.slug, project="EPC", size=["E07=L"])
        epic.refresh_from_db()
        plain.refresh_from_db()
        assert epic.type.is_epic and plain.type_id is None
        detail = EpicDetail.objects.get(epic=epic)
        assert (detail.lead_id, detail.size, detail.wave.code, detail.wave.name) == (
            create_user.id,
            "L",
            "W1",
            "Priorities",
        )
        # Running it again changes nothing
        call_command("convert_labelled_epics", workspace=workspace.slug)
        assert EpicDetail.objects.count() == 1 and EpicWave.objects.count() == 1

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The project's Features page (D45): the per-feature settings, what they change when work is made, and the
scheduled carry-over, cycle archive and stale intake decline."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status

from plane.bgtasks.project_feature_task import (
    archive_completed_cycles,
    carry_over_ended_cycles,
    decline_stale_intake_requests,
)
from plane.db.models import (
    Cycle,
    CycleIssue,
    Intake,
    IntakeIssue,
    Issue,
    IssueAssignee,
    IssueComment,
    IssueType,
    Module,
    Project,
    ProjectMember,
    State,
    User,
)
from plane.db.models.intake import IntakeIssueStatus
from plane.utils.state_groups import default_states


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Features", identifier="FEA", workspace=workspace, created_by=create_user, intake_view=True
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    State.objects.bulk_create(default_states(project))
    return project


@pytest.fixture
def lead(db, workspace, project):
    user = User.objects.create(email="lead@plane.so", username="lead", first_name="Lea", last_name="Lead")
    ProjectMember.objects.create(project=project, member=user, role=15, is_active=True)
    Project.objects.filter(pk=project.pk).update(project_lead=user)
    return user


@pytest.fixture
def states(project):
    return {state.name: state for state in State.objects.filter(project=project)}


def url(workspace, project, path=""):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/{path}"


def patch_project(client, workspace, project, **data):
    return client.patch(url(workspace, project), data, format="json")


@pytest.mark.contract
class TestFeatureSettings:
    @pytest.mark.django_db
    def test_the_settings_save_and_come_back(self, session_client, workspace, project, states):
        response = patch_project(
            session_client,
            workspace,
            project,
            cycle_length_weeks=3,
            cycle_start_day=2,
            cycle_auto_carry_over=True,
            cycle_archive_in=6,
            module_default_lead="project_lead",
            module_default_status="planned",
            intake_assignee="none",
            intake_accepted_state=str(states["Todo"].id),
            intake_decline_after_days=14,
            epic_view=False,
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        project.refresh_from_db()
        assert (project.cycle_length_weeks, project.cycle_start_day, project.cycle_archive_in) == (3, 2, 6)
        assert project.cycle_auto_carry_over and not project.epic_view
        assert (project.module_default_lead, project.module_default_status) == ("project_lead", "planned")
        assert (project.intake_assignee, project.intake_accepted_state_id) == ("none", states["Todo"].id)
        assert project.intake_decline_after_days == 14

    @pytest.mark.django_db
    @pytest.mark.parametrize(
        "field,value",
        [("cycle_length_weeks", 5), ("cycle_start_day", 7), ("cycle_archive_in", 13), ("intake_assignee", "bot")],
    )
    def test_out_of_range_values_are_refused(self, session_client, workspace, project, field, value):
        response = patch_project(session_client, workspace, project, **{field: value})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_accepted_requests_land_in_a_state_of_this_project(self, session_client, workspace, project, create_user):
        other = Project.objects.create(name="Other", identifier="OTH", workspace=workspace, created_by=create_user)
        State.objects.bulk_create(default_states(other))
        foreign = State.objects.filter(project=other).first()
        response = patch_project(session_client, workspace, project, intake_accepted_state=str(foreign.id))
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_new_projects_have_epics_on(self, session_client, workspace):
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/", {"name": "Fresh", "identifier": "FRE"}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert Project.objects.get(pk=response.data["id"]).epic_view is True


@pytest.mark.contract
class TestModuleDefaults:
    @pytest.mark.django_db
    def test_a_new_module_takes_the_project_defaults(self, session_client, workspace, project, lead):
        Project.objects.filter(pk=project.pk).update(module_default_lead="project_lead", module_default_status="paused")
        response = session_client.post(url(workspace, project, "modules/"), {"name": "W1"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        module = Module.objects.get(pk=response.data["id"])
        assert (module.lead_id, module.status) == (lead.id, "paused")

    @pytest.mark.django_db
    def test_what_the_request_says_wins(self, session_client, workspace, project, lead):
        Project.objects.filter(pk=project.pk).update(module_default_lead="project_lead", module_default_status="paused")
        response = session_client.post(
            url(workspace, project, "modules/"), {"name": "W2", "status": "planned", "lead_id": None}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        module = Module.objects.get(pk=response.data["id"])
        assert (module.lead_id, module.status) == (None, "planned")


@pytest.mark.contract
class TestIntakeRouting:
    def create_request(self, client, workspace, project):
        Intake.objects.get_or_create(project=project, workspace=workspace, defaults={"name": "Intake"})
        response = client.post(
            url(workspace, project, "intake-issues/"), {"issue": {"name": "Broken export"}}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        return Issue.objects.get(pk=response.data["issue"]["id"])

    @pytest.mark.django_db
    def test_requests_go_to_the_lead(self, session_client, workspace, project, lead):
        Project.objects.filter(pk=project.pk).update(intake_assignee="project_lead")
        issue = self.create_request(session_client, workspace, project)
        assert list(IssueAssignee.objects.filter(issue=issue).values_list("assignee_id", flat=True)) == [lead.id]

    @pytest.mark.django_db
    def test_nobody_leaves_them_unassigned(self, session_client, workspace, project, lead):
        Project.objects.filter(pk=project.pk).update(intake_assignee="none", default_assignee=lead)
        issue = self.create_request(session_client, workspace, project)
        assert not IssueAssignee.objects.filter(issue=issue).exists()

    @pytest.mark.django_db
    def test_accepting_moves_into_the_chosen_state(self, session_client, workspace, project, states):
        Project.objects.filter(pk=project.pk).update(intake_accepted_state=states["In Progress"])
        issue = self.create_request(session_client, workspace, project)
        response = session_client.patch(
            url(workspace, project, f"intake-issues/{issue.id}/"), {"status": 1}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        issue.refresh_from_db()
        assert issue.state_id == states["In Progress"].id


def make_cycle(project, name, start_days, end_days):
    now = timezone.now()
    return Cycle.objects.create(
        name=name,
        project=project,
        owned_by=ProjectMember.objects.filter(project=project, role=20).first().member,
        start_date=now + timedelta(days=start_days),
        end_date=now + timedelta(days=end_days),
    )


def add_to_cycle(project, cycle, state, name):
    issue = Issue.objects.create(name=name, project=project, state=state)
    CycleIssue.objects.create(cycle=cycle, issue=issue, project=project, workspace=project.workspace)
    return issue


@pytest.mark.contract
class TestCycleAutomations:
    @pytest.mark.django_db
    def test_unfinished_work_moves_to_the_running_cycle(self, project, states):
        Project.objects.filter(pk=project.pk).update(cycle_view=True, cycle_auto_carry_over=True)
        ended = make_cycle(project, "C41", -15, -1)
        running = make_cycle(project, "C42", 0, 13)
        open_item = add_to_cycle(project, ended, states["Todo"], "Open")
        done_item = add_to_cycle(project, ended, states["Done"], "Done")
        carry_over_ended_cycles()
        assert CycleIssue.objects.get(issue=open_item).cycle_id == running.id
        assert CycleIssue.objects.get(issue=done_item).cycle_id == ended.id
        ended.refresh_from_db()
        assert ended.carried_over_at is not None and ended.progress_snapshot

    @pytest.mark.django_db
    def test_nothing_moves_without_the_setting_or_a_next_cycle(self, project, states):
        Project.objects.filter(pk=project.pk).update(cycle_view=True)
        ended = make_cycle(project, "C41", -15, -1)
        open_item = add_to_cycle(project, ended, states["Todo"], "Open")
        carry_over_ended_cycles()
        Project.objects.filter(pk=project.pk).update(cycle_auto_carry_over=True)
        carry_over_ended_cycles()
        assert CycleIssue.objects.get(issue=open_item).cycle_id == ended.id
        ended.refresh_from_db()
        assert ended.carried_over_at is None

    @pytest.mark.django_db
    def test_cycles_that_ended_long_ago_stay(self, project, states):
        Project.objects.filter(pk=project.pk).update(cycle_view=True, cycle_auto_carry_over=True)
        old = make_cycle(project, "C30", -60, -30)
        make_cycle(project, "C42", 0, 13)
        open_item = add_to_cycle(project, old, states["Todo"], "Open")
        carry_over_ended_cycles()
        assert CycleIssue.objects.get(issue=open_item).cycle_id == old.id

    @pytest.mark.django_db
    def test_completed_cycles_are_archived_after_the_months(self, project):
        Project.objects.filter(pk=project.pk).update(cycle_archive_in=1)
        old = make_cycle(project, "C30", -60, -40)
        recent = make_cycle(project, "C41", -15, -1)
        archive_completed_cycles()
        old.refresh_from_db()
        recent.refresh_from_db()
        assert old.archived_at is not None and recent.archived_at is None


@pytest.mark.contract
class TestStaleIntake:
    def make_request(self, project, workspace, states, days_old):
        intake, _ = Intake.objects.get_or_create(project=project, workspace=workspace, defaults={"name": "Intake"})
        issue = Issue.objects.create(name=f"Request {days_old}", project=project, state=states["Backlog"])
        request = IntakeIssue.objects.create(intake=intake, project=project, issue=issue)
        then = timezone.now() - timedelta(days=days_old)
        Issue.objects.filter(pk=issue.pk).update(updated_at=then)
        IntakeIssue.objects.filter(pk=request.pk).update(updated_at=then)
        return request

    @pytest.mark.django_db
    def test_old_pending_requests_are_declined_with_a_note(self, project, workspace, states):
        Project.objects.filter(pk=project.pk).update(intake_decline_after_days=7)
        old = self.make_request(project, workspace, states, 10)
        fresh = self.make_request(project, workspace, states, 2)
        decline_stale_intake_requests()
        old.refresh_from_db()
        fresh.refresh_from_db()
        assert old.status == IntakeIssueStatus.REJECTED and fresh.status == IntakeIssueStatus.PENDING
        note = IssueComment.objects.get(issue_id=old.issue_id)
        assert "7 days" in note.comment_stripped and note.actor.is_bot

    @pytest.mark.django_db
    def test_without_the_setting_nothing_is_declined(self, project, workspace, states):
        old = self.make_request(project, workspace, states, 400)
        decline_stale_intake_requests()
        old.refresh_from_db()
        assert old.status == IntakeIssueStatus.PENDING


@pytest.mark.contract
class TestEpicsSwitch:
    @pytest.mark.django_db
    def test_switched_off_projects_leave_the_workspace_list(self, session_client, workspace, project):
        response = session_client.post(url(workspace, project, "epics/"), {"name": "E07 PQL"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert IssueType.objects.filter(workspace=workspace, is_epic=True).exists()
        listed = session_client.get(f"/api/workspaces/{workspace.slug}/epics/?status=all")
        assert [row["name"] for row in listed.data["results"]] == ["E07 PQL"]
        Project.objects.filter(pk=project.pk).update(epic_view=False)
        listed = session_client.get(f"/api/workspaces/{workspace.slug}/epics/?status=all")
        assert listed.data["results"] == []

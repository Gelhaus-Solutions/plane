# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The workspace analytics screens read one endpoint: tiles, series and tables per tab, for a period and the
projects the viewer is a member of; an item with a bot among its assignees counts as the bots' work."""

from datetime import datetime, timezone

import pytest
from rest_framework import status

from plane.db.models import Issue, IssueAssignee, Project, ProjectMember, State

PERIOD = {"start": "2026-09-01", "end": "2026-09-30"}


def at(month, day):
    return datetime(2026, month, day, 12, tzinfo=timezone.utc)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Insights", identifier="INS", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def items(db, workspace, project, create_user, create_bot_user):
    states = {
        group: State.objects.create(name=group.title(), group=group, project=project, workspace=workspace)
        for group in ("backlog", "completed")
    }
    # A project the viewer is not a member of stays out
    elsewhere = Project.objects.create(name="Elsewhere", identifier="ELS", workspace=workspace, created_by=create_user)

    def item(name, group, created, completed=None, assignee=None, in_project=project):
        state = states[group] if in_project == project else None
        issue = Issue.objects.create(
            name=name, state=state, project=in_project, workspace=workspace, created_by=create_user
        )
        Issue.objects.filter(pk=issue.pk).update(created_at=created, completed_at=completed)
        if assignee:
            IssueAssignee.objects.create(issue=issue, assignee=assignee, project=in_project, workspace=workspace)
        return issue

    item("open", "backlog", at(9, 3), assignee=create_user)
    item("done by a person", "completed", at(9, 2), at(9, 5), assignee=create_user)
    item("done by a bot", "completed", at(9, 2), at(9, 4), assignee=create_bot_user)
    item("done before", "completed", at(8, 10), at(8, 20), assignee=create_user)
    item("not mine", "backlog", at(9, 3), in_project=elsewhere)


def insights(client, workspace, tab, **params):
    response = client.get(f"/api/workspaces/{workspace.slug}/analytics/insights/", {"tab": tab, **PERIOD, **params})
    assert response.status_code == status.HTTP_200_OK, response.data
    return response.data


@pytest.mark.contract
class TestAnalyticsInsights:
    @pytest.mark.django_db
    def test_overview_tiles_compare_with_the_previous_period(self, session_client, workspace, items):
        data = insights(session_client, workspace, "overview")
        assert data["period"]["bucket"] == "day"
        assert len(data["period"]["buckets"]) == 30
        tiles = data["tiles"]
        assert tiles["created"] == {"value": 3, "previous": 1}
        assert tiles["done"] == {"value": 2, "previous": 1}
        assert tiles["median_days_to_done"] == {"value": 2.5, "previous": 10.0}
        assert tiles["open"] == {"value": 1, "projects": 1}

    @pytest.mark.django_db
    def test_overview_splits_done_into_people_and_bots(self, session_client, workspace, items):
        series = insights(session_client, workspace, "overview")["series"]
        assert series["done_bots"][3] == 1  # September 4th
        assert series["done_people"][4] == 1  # September 5th
        assert sum(series["done"]) == 2
        assert sum(series["created"]) == 3
        assert len(series["previous_done"]) == 30

    @pytest.mark.django_db
    def test_weeks_past_a_month(self, session_client, workspace, items):
        data = insights(session_client, workspace, "overview", start="2026-07-03", end="2026-09-30")
        assert data["period"]["bucket"] == "week"
        assert sum(data["series"]["done"]) == 3

    @pytest.mark.django_db
    def test_people_count_for_their_assignees(self, session_client, workspace, items, create_user, create_bot_user):
        members = insights(session_client, workspace, "people")["members"]
        assert [m["id"] for m in members] == [str(create_user.id), str(create_bot_user.id)]
        person, bot = members
        assert (person["is_bot"], person["open"], person["done"], person["median_days_to_done"]) == (False, 1, 1, 3.0)
        assert (bot["is_bot"], bot["open"], bot["done"], bot["median_days_to_done"]) == (True, 0, 1, 2.0)
        assert sum(bot["done_per_bucket"]) == 1

    @pytest.mark.django_db
    def test_work_items_split_by_people_or_bots(self, session_client, workspace, items):
        data = insights(session_client, workspace, "work-items", x_axis="STATE_GROUPS", split_by="PEOPLE_OR_BOTS")
        assert data["total"] == 3
        rows = {row["key"]: row for row in data["data"]}
        assert rows["backlog"]["people"] == 1
        assert (rows["completed"]["people"], rows["completed"]["bots"]) == (1, 1)

    @pytest.mark.django_db
    def test_a_backwards_period_is_refused(self, session_client, workspace, items):
        response = session_client.get(
            f"/api/workspaces/{workspace.slug}/analytics/insights/", {"start": "2026-09-30", "end": "2026-09-01"}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_an_unknown_tab_is_refused(self, session_client, workspace, items):
        response = session_client.get(f"/api/workspaces/{workspace.slug}/analytics/insights/", {"tab": "nope"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""PQL compiler: each field, function and operator against real rows."""

import datetime

import pytest
from django.utils import timezone

from plane.db.models import (
    Cycle,
    CycleIssue,
    Issue,
    IssueAssignee,
    IssueLabel,
    IssueRelation,
    Label,
    Project,
    ProjectMember,
    State,
    User,
)
from plane.utils.pql import PQLError
from plane.utils.pql.compiler import PQLContext, _add_months, _start_of_week, compile_pql


@pytest.fixture
def other_user(db):
    return User.objects.create(email="other@plane.so", username="pql-other", first_name="Other", last_name="User")


@pytest.fixture
def project(db, workspace, create_user, other_user):
    project = Project.objects.create(name="PQL", identifier="PQL", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    ProjectMember.objects.create(project=project, member=other_user, role=15, is_active=True)
    return project


@pytest.fixture
def context(workspace, create_user):
    return PQLContext(workspace_id=workspace.id, user_id=create_user.id, week_start=1)


@pytest.fixture
def items(db, workspace, project, create_user, other_user, context):
    """Four work items:

    alpha  high, started, mine, label bug, overdue, active cycle, parent of beta, blocks gamma, relates to delta
    beta   urgent, backlog, mine and other's, due in 5 days, child of alpha
    gamma  low, completed, unassigned, label feature, due 10 days ago, completed cycle
    delta  none, started, other's, no due date, created 2020-01-01
    """
    states = {
        group: State.objects.create(name=group, group=group, project=project, workspace=workspace)
        for group in ("backlog", "started", "completed")
    }
    today = context.today

    def item(name, priority, group, due, **extra):
        return Issue.objects.create(
            name=name,
            priority=priority,
            state=states[group],
            target_date=due,
            project=project,
            workspace=workspace,
            created_by=create_user,
            **extra,
        )

    alpha = item(
        "alpha", "high", "started", today - datetime.timedelta(days=2), description_html="<p>a needle in here</p>"
    )
    beta = item("beta", "urgent", "backlog", today + datetime.timedelta(days=5), parent=alpha)
    gamma = item("gamma", "low", "completed", today - datetime.timedelta(days=10))
    delta = item("delta", "none", "started", None)
    Issue.objects.filter(pk=delta.pk).update(
        created_at=datetime.datetime(2020, 1, 1, 12, 0, tzinfo=datetime.timezone.utc)
    )
    # save() takes created_by from the request user, which tests do not have
    Issue.objects.filter(project=project).update(created_by=create_user)

    def link(model, issue, **fields):
        model.objects.create(issue=issue, project=project, workspace=workspace, **fields)

    link(IssueAssignee, alpha, assignee=create_user)
    link(IssueAssignee, beta, assignee=create_user)
    link(IssueAssignee, beta, assignee=other_user)
    link(IssueAssignee, delta, assignee=other_user)

    bug = Label.objects.create(name="bug", project=project, workspace=workspace)
    feature = Label.objects.create(name="feature", project=project, workspace=workspace)
    link(IssueLabel, alpha, label=bug)
    link(IssueLabel, gamma, label=feature)

    now = timezone.now()
    active = Cycle.objects.create(
        name="active",
        project=project,
        workspace=workspace,
        owned_by=create_user,
        start_date=now - datetime.timedelta(days=3),
        end_date=now + datetime.timedelta(days=3),
    )
    done = Cycle.objects.create(
        name="done",
        project=project,
        workspace=workspace,
        owned_by=create_user,
        start_date=now - datetime.timedelta(days=30),
        end_date=now - datetime.timedelta(days=20),
    )
    link(CycleIssue, alpha, cycle=active)
    link(CycleIssue, gamma, cycle=done)

    # gamma is blocked by alpha; alpha relates to delta
    link(IssueRelation, gamma, related_issue=alpha, relation_type="blocked_by")
    link(IssueRelation, alpha, related_issue=delta, relation_type="relates_to")

    found = {issue.name: issue for issue in Issue.objects.filter(project=project)}
    return {
        **found,
        "labels": {"bug": bug, "feature": feature},
        "key": {name: f"PQL-{issue.sequence_id}" for name, issue in found.items()},
    }


def names(project, query, context):
    return set(Issue.objects.filter(project=project).filter(compile_pql(query, context)).values_list("name", flat=True))


def error(query, context):
    with pytest.raises(PQLError) as excinfo:
        compile_pql(query, context)
    return excinfo.value


ALL = {"alpha", "beta", "gamma", "delta"}


@pytest.mark.unit
@pytest.mark.django_db
class TestFields:
    @pytest.mark.parametrize(
        "query, expected",
        [
            ('priority = "high"', {"alpha"}),
            ('priority = "HIGH"', {"alpha"}),
            ('priority IN ("high", "urgent")', {"alpha", "beta"}),
            ('priority != "high"', {"beta", "gamma", "delta"}),
            ('priority NOT IN ("high", "none")', {"beta", "gamma"}),
            ('stateGroup = "completed"', {"gamma"}),
            ("stateGroup IN openStates()", {"alpha", "beta", "delta"}),
            ("stateGroup IN closedStates()", {"gamma"}),
            ('title = "ALPHA"', {"alpha"}),
            ('title ~ "lph"', {"alpha"}),
            ('text ~ "needle"', {"alpha"}),
            ("isDraft = false", ALL),
            ("isArchived = true", set()),
            ("dueDate < today()", {"alpha", "gamma"}),
            ("dueDate >= today()", {"beta"}),
            ("dueDate IS NULL", {"delta"}),
            ("dueDate IS NOT NULL", {"alpha", "beta", "gamma"}),
            ("dueDate BETWEEN (daysAgo(3), today())", {"alpha"}),
            ("dueDate BETWEEN daysAgo(11) AND daysAgo(9)", {"gamma"}),
            ("dueDate NOT BETWEEN (daysAgo(3), today())", {"beta", "gamma", "delta"}),
            ('createdAt < "2021-01-01"', {"delta"}),
            ('createdAt = "2020-01-01"', {"delta"}),
            ('createdAt > "2020-01-01T13:00:00+00:00"', {"alpha", "beta", "gamma"}),
            ("createdAt >= daysAgo(1)", {"alpha", "beta", "gamma"}),
        ],
    )
    def test_scalar_fields(self, project, items, context, query, expected):
        assert names(project, query, context) == expected

    def test_assignees(self, project, items, context, other_user):
        assert names(project, "assignee = currentUser()", context) == {"alpha", "beta"}
        assert names(project, f'assignee = currentUser() AND assignee = "{other_user.id}"', context) == {"beta"}
        assert names(project, "assignee != currentUser()", context) == {"gamma", "delta"}
        assert names(project, f'assignee IN (currentUser(), "{other_user.id}")', context) == {"alpha", "beta", "delta"}
        assert names(project, f'assignee IN membersOf("project:{project.id}")', context) == {"alpha", "beta", "delta"}
        assert names(project, "assignee IS EMPTY", context) == {"gamma"}
        assert names(project, "assignee IS NOT NULL", context) == {"alpha", "beta", "delta"}

    def test_labels_and_cycles(self, project, items, context):
        bug = items["labels"]["bug"]
        assert names(project, f'label = "{bug.id}"', context) == {"alpha"}
        assert names(project, f'label != "{bug.id}"', context) == {"beta", "gamma", "delta"}
        assert names(project, "label IS EMPTY", context) == {"beta", "delta"}
        assert names(project, "cycle IN activeCycle()", context) == {"alpha"}
        assert names(project, "cycle IN completedCycles()", context) == {"gamma"}
        assert names(project, "cycle IS EMPTY", context) == {"beta", "delta"}

    def test_state_and_creator(self, project, items, context):
        state_id = items["gamma"].state_id
        assert names(project, f'state = "{state_id}"', context) == {"gamma"}
        assert names(project, "createdBy = currentUser()", context) == ALL
        assert names(project, f'project = "{project.id}"', context) == ALL

    def test_identifier(self, project, items, context):
        key = items["key"]
        assert names(project, f'id = "{key["beta"]}"', context) == {"beta"}
        assert names(project, f'id = "{key["beta"].lower()}"', context) == {"beta"}
        assert names(project, f'id = "{items["beta"].id}"', context) == {"beta"}
        assert names(project, f'id IN ("{key["alpha"]}", "{key["gamma"]}")', context) == {"alpha", "gamma"}
        assert names(project, 'id ~ "PQL-"', context) == ALL


@pytest.mark.unit
@pytest.mark.django_db
class TestFunctions:
    def test_predicates(self, project, items, context):
        assert names(project, "isOverdue()", context) == {"alpha"}
        assert names(project, "hasNoAssignee()", context) == {"gamma"}
        assert names(project, "hasNoLabel()", context) == {"beta", "delta"}
        assert names(project, "isSubWorkItem()", context) == {"beta"}
        assert names(project, "isTopLevel()", context) == {"alpha", "gamma", "delta"}
        assert names(project, "hasChildren()", context) == {"alpha"}
        assert names(project, "hasStartAndDueDates()", context) == set()
        assert names(project, "isEpic()", context) == set()
        assert names(project, "isIntake()", context) == set()

    def test_relations(self, project, items, context):
        key = items["key"]
        assert names(project, f'childOf("{key["alpha"]}")', context) == {"beta"}
        assert names(project, f'parentOf("{key["beta"]}")', context) == {"alpha"}
        assert names(project, f'blockedBy("{key["alpha"]}")', context) == {"gamma"}
        assert names(project, f'blocks("{key["gamma"]}")', context) == {"alpha"}
        assert names(project, f'linkedTo("{key["alpha"]}")', context) == {"delta"}
        assert names(project, f'linkedTo("{key["delta"]}")', context) == {"alpha"}
        assert names(project, f'duplicateOf("{key["alpha"]}")', context) == set()

    def test_relation_target_outside_the_users_projects_does_not_resolve(self, workspace, project, items, other_user):
        stranger = PQLContext(workspace_id=workspace.id, user_id=other_user.id)
        ProjectMember.objects.filter(member=other_user).update(is_active=False)
        assert error(f'childOf("{items["key"]["alpha"]}")', stranger).code == "unknown_work_item"

    def test_week_and_month_boundaries(self, context):
        wednesday = datetime.datetime(2026, 10, 14, 12, 0, tzinfo=datetime.timezone.utc)
        monday_start = PQLContext(workspace_id=None, user_id=None, week_start=1, now=wednesday)
        sunday_start = PQLContext(workspace_id=None, user_id=None, week_start=0, now=wednesday)
        assert _start_of_week(monday_start) == datetime.date(2026, 10, 12)
        assert _start_of_week(sunday_start) == datetime.date(2026, 10, 11)
        assert _add_months(datetime.date(2026, 3, 31), -1) == datetime.date(2026, 2, 28)
        assert _add_months(datetime.date(2026, 11, 15), 3) == datetime.date(2027, 2, 15)


@pytest.mark.unit
@pytest.mark.django_db
class TestBooleanLogic:
    def test_and_binds_tighter_than_or(self, project, items, context):
        # high OR (urgent AND unassigned): beta is urgent but assigned, so only alpha.
        assert names(project, 'priority = "high" OR priority = "urgent" AND hasNoAssignee()', context) == {"alpha"}
        assert names(project, '(priority = "high" OR priority = "urgent") AND hasNoAssignee()', context) == set()

    def test_not(self, project, items, context):
        assert names(project, 'NOT priority = "high"', context) == {"beta", "gamma", "delta"}
        assert names(project, "NOT (isOverdue() OR hasNoAssignee())", context) == {"beta", "delta"}
        assert names(project, "NOT NOT isOverdue()", context) == {"alpha"}

    def test_empty_query_compiles_to_none(self, context):
        assert compile_pql("  ", context) is None


@pytest.mark.unit
@pytest.mark.django_db
class TestErrors:
    @pytest.mark.parametrize(
        "query, code",
        [
            ('colour = "red"', "unknown_field"),
            ('priority = "extreme"', "invalid_choice"),
            ("priority = 3", "invalid_value"),
            ('assignee = "not-a-uuid"', "invalid_id"),
            ('assignee = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90" AND label = today()', "invalid_value"),
            ('dueDate > "yesterday"', "invalid_date"),
            ('title > "a"', "unsupported_operator"),
            ('text = "a"', "unsupported_operator"),
            ("isDraft = 1", "invalid_value"),
            ('cf["3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90"] = 1', "unavailable_field"),
            ('milestone = "x"', "unavailable_field"),
            ("currentUser()", "value_as_condition"),
            ("dueDate < isOverdue()", "predicate_as_value"),
            ("dueDate < yesterday()", "unknown_function"),
            ("frobnicate()", "unknown_function"),
            ("priority()", "field_as_condition"),
            ("dueDate < daysAgo()", "invalid_argument"),
            ('dueDate < daysAgo("7")', "invalid_argument"),
            ("isOverdue(1)", "invalid_argument"),
            ('childOf("PQL-999")', "unknown_work_item"),
            ('assignee IN membersOf("teamspace:3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90")', "unavailable"),
        ],
    )
    def test_error_codes(self, project, items, context, query, code):
        assert error(query, context).code == code

    def test_error_position_points_at_the_bad_value(self, project, items, context):
        query = 'priority = "high" AND stateGroup = "doing"'
        assert query[error(query, context).position :] == '"doing"'

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Compile PQL into a Django ``Q`` over ``Issue``.

Multi-valued fields (assignee, label, cycle, module, mention, subscriber) compile to
``pk__in`` subqueries instead of joins, so the boolean operators keep their meaning:
``assignee = A AND assignee = B`` matches items assigned to both, and
``assignee != A`` also matches unassigned items. ``!=`` and ``NOT IN`` are always the
exact negation of ``=`` and ``IN``, so they match items where the field is empty.
"""

import calendar
import datetime
import re
import uuid
from collections import namedtuple

from django.db.models import CharField, Q
from django.db.models import Value as SQLValue
from django.db.models.functions import Cast, Concat
from django.utils import timezone

from plane.db.models import (
    Cycle,
    CycleIssue,
    IntakeIssue,
    Issue,
    IssueAssignee,
    IssueLabel,
    IssueMention,
    IssueRelation,
    IssueSubscriber,
    ModuleIssue,
    Profile,
    ProjectMember,
    Workspace,
    WorkspaceMember,
)

from .errors import PQLError
from .nodes import And, Call, Comparison, Literal, Not, Or, Predicate, ValueList
from .parser import parse

PRIORITIES = ("urgent", "high", "medium", "low", "none")
STATE_GROUPS = ("backlog", "unstarted", "started", "completed", "cancelled", "triage")
OPEN_STATE_GROUPS = ("backlog", "unstarted", "started")
CLOSED_STATE_GROUPS = ("completed", "cancelled")
ACTIVE_STATE_GROUPS = ("unstarted", "started")

MAX_OFFSET = 100_000

# Kinds of evaluated values
STRING = "text"
NUMBER = "number"
BOOLEAN = "boolean"
DATE = "date"
DATETIME = "datetime"
IDS = "ids"
GROUPS = "state groups"

Evaluated = namedtuple("Evaluated", ["kind", "value", "entity"])

OPERATOR_NAMES = {
    "in": "IN",
    "not_in": "NOT IN",
    "between": "BETWEEN",
    "not_between": "NOT BETWEEN",
    "is_null": "IS NULL",
    "is_not_null": "IS NOT NULL",
    "is_empty": "IS EMPTY",
    "is_not_empty": "IS NOT EMPTY",
}

EQUALITY = ("=", "!=")
SETS = ("in", "not_in")
ORDERING = (">", ">=", "<", "<=")
RANGES = ("between", "not_between")
EMPTINESS = ("is_null", "is_not_null", "is_empty", "is_not_empty")
NEGATED = ("!=", "not_in", "not_between", "is_not_null", "is_not_empty")

_ISSUE_KEY = re.compile(r"^(.+)-(\d+)$")


class PQLContext:
    """What a query runs against: the workspace, the current user and the current time.

    ``today`` and the week boundaries follow the active timezone, which the views set
    from the user's profile, so ``today()`` means the user's today.
    """

    def __init__(self, workspace_id, user_id, week_start=0, now=None):
        self.workspace_id = workspace_id
        self.user_id = user_id
        # Profile.start_of_the_week: 0 is Sunday, 1 Monday, ... 6 Saturday
        self.week_start = week_start or 0
        self.now = now or timezone.now()
        self.today = timezone.localdate(self.now) if timezone.is_aware(self.now) else self.now.date()

    @classmethod
    def for_request(cls, request, workspace_slug):
        workspace_id = Workspace.objects.filter(slug=workspace_slug).values_list("id", flat=True).first()
        week_start = Profile.objects.filter(user_id=request.user.id).values_list("start_of_the_week", flat=True).first()
        return cls(workspace_id=workspace_id, user_id=request.user.id, week_start=week_start)

    def member_project_ids(self):
        return ProjectMember.objects.filter(
            workspace_id=self.workspace_id, member_id=self.user_id, is_active=True
        ).values("project_id")


def compile_pql(text, context):
    """Parse and compile a PQL query. An empty query compiles to ``None``."""
    node = parse(text)
    if node is None:
        return None
    return compile_node(node, context)


def compile_node(node, context):
    if isinstance(node, And):
        q = Q()
        for child in node.children:
            q &= compile_node(child, context)
        return q
    if isinstance(node, Or):
        q = Q()
        for child in node.children:
            q |= compile_node(child, context)
        return q
    if isinstance(node, Not):
        return ~compile_node(node.child, context)
    if isinstance(node, Predicate):
        return _compile_predicate(node.call, context)
    if isinstance(node, Comparison):
        return _compile_comparison(node, context)
    raise PQLError("Unsupported query element", getattr(node, "position", None), "unsupported_node")


# Values


def _add_months(day, months):
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    return day.replace(year=year, month=month, day=min(day.day, calendar.monthrange(year, month)[1]))


def _start_of_week(context):
    python_start = (context.week_start + 6) % 7  # Profile counts from Sunday, Python from Monday
    return context.today - datetime.timedelta(days=(context.today.weekday() - python_start) % 7)


def _offset(call, args):
    if len(args) != 1 or args[0].kind != NUMBER or not isinstance(args[0].value, int) or args[0].value < 0:
        raise PQLError(f"{call.name}() takes one whole number, as in {call.name}(7)", call.position, "invalid_argument")
    if args[0].value > MAX_OFFSET:
        raise PQLError(f"{call.name}() takes at most {MAX_OFFSET}", call.position, "invalid_argument")
    return args[0].value


def _members_of(call, args, context):
    if len(args) != 1 or args[0].kind != STRING or ":" not in args[0].value:
        raise PQLError('membersOf() takes "project:<project id>"', call.position, "invalid_argument")
    scope, _, scope_id = args[0].value.partition(":")
    if scope != "project":
        raise PQLError(
            f'membersOf("{scope}:...") is not available; use "project:<project id>"', call.position, "unavailable"
        )
    return Evaluated(
        IDS,
        ProjectMember.objects.filter(
            workspace_id=context.workspace_id,
            project_id=_uuid(scope_id, call.position, "a project id"),
            is_active=True,
        ).values("member_id"),
        "user",
    )


def _cycles(context, **lookups):
    return Evaluated(IDS, Cycle.objects.filter(workspace_id=context.workspace_id, **lookups).values("id"), "cycle")


# name: (arity or None for custom checks, evaluator(call, args, context))
VALUE_FUNCTIONS = {
    "today": (0, lambda call, args, c: Evaluated(DATE, c.today, None)),
    "now": (0, lambda call, args, c: Evaluated(DATETIME, c.now, None)),
    "startofday": (0, lambda call, args, c: Evaluated(DATE, c.today, None)),
    "endofday": (0, lambda call, args, c: Evaluated(DATE, c.today, None)),
    "startofweek": (0, lambda call, args, c: Evaluated(DATE, _start_of_week(c), None)),
    "endofweek": (0, lambda call, args, c: Evaluated(DATE, _start_of_week(c) + datetime.timedelta(days=6), None)),
    "startofmonth": (0, lambda call, args, c: Evaluated(DATE, c.today.replace(day=1), None)),
    "endofmonth": (
        0,
        lambda call, args, c: Evaluated(
            DATE, c.today.replace(day=calendar.monthrange(c.today.year, c.today.month)[1]), None
        ),
    ),
    "startofyear": (0, lambda call, args, c: Evaluated(DATE, c.today.replace(month=1, day=1), None)),
    "endofyear": (0, lambda call, args, c: Evaluated(DATE, c.today.replace(month=12, day=31), None)),
    "daysago": (
        None,
        lambda call, args, c: Evaluated(DATE, c.today - datetime.timedelta(days=_offset(call, args)), None),
    ),
    "daysfromnow": (
        None,
        lambda call, args, c: Evaluated(DATE, c.today + datetime.timedelta(days=_offset(call, args)), None),
    ),
    "weeksago": (
        None,
        lambda call, args, c: Evaluated(DATE, c.today - datetime.timedelta(weeks=_offset(call, args)), None),
    ),
    "weeksfromnow": (
        None,
        lambda call, args, c: Evaluated(DATE, c.today + datetime.timedelta(weeks=_offset(call, args)), None),
    ),
    "monthsago": (None, lambda call, args, c: Evaluated(DATE, _add_months(c.today, -_offset(call, args)), None)),
    "monthsfromnow": (None, lambda call, args, c: Evaluated(DATE, _add_months(c.today, _offset(call, args)), None)),
    "currentuser": (0, lambda call, args, c: Evaluated(IDS, [str(c.user_id)], "user")),
    "workspacemembers": (
        0,
        lambda call, args, c: Evaluated(
            IDS,
            WorkspaceMember.objects.filter(workspace_id=c.workspace_id, is_active=True).values("member_id"),
            "user",
        ),
    ),
    "membersof": (None, _members_of),
    "activecycle": (0, lambda call, args, c: _cycles(c, start_date__lte=c.now, end_date__gte=c.now)),
    "completedcycles": (0, lambda call, args, c: _cycles(c, end_date__lt=c.now)),
    "upcomingcycles": (0, lambda call, args, c: _cycles(c, start_date__gt=c.now)),
    "openstates": (0, lambda call, args, c: Evaluated(GROUPS, list(OPEN_STATE_GROUPS), None)),
    "closedstates": (0, lambda call, args, c: Evaluated(GROUPS, list(CLOSED_STATE_GROUPS), None)),
    "activestates": (0, lambda call, args, c: Evaluated(GROUPS, list(ACTIVE_STATE_GROUPS), None)),
}


def _evaluate(node, context):
    if isinstance(node, Literal):
        kind = {"string": STRING, "number": NUMBER, "boolean": BOOLEAN}[node.kind]
        return Evaluated(kind, node.value, None)
    if isinstance(node, Call):
        key = node.name.lower()
        if key not in VALUE_FUNCTIONS:
            if key in PREDICATES or key in RELATION_FUNCTIONS:
                raise PQLError(
                    f"{node.name}() is a condition on its own; it cannot be used as a value",
                    node.position,
                    "predicate_as_value",
                )
            raise PQLError(f"Unknown function {node.name}()", node.position, "unknown_function")
        arity, evaluator = VALUE_FUNCTIONS[key]
        if arity is not None and len(node.args) != arity:
            raise PQLError(f"{node.name}() takes no arguments", node.position, "invalid_argument")
        args = [_evaluate(arg, context) for arg in node.args]
        return evaluator(node, args, context)
    raise PQLError("Expected a value", getattr(node, "position", None), "invalid_value")


def _uuid(value, position, description):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError):
        raise PQLError(f'"{value}" is not {description}', position, "invalid_id")


def _parse_date(value, position, field):
    try:
        if len(value) == 10:
            return Evaluated(DATE, datetime.date.fromisoformat(value), None)
        moment = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise PQLError(
            f'{field} takes a date such as "2026-10-14" or a date function such as today(); got "{value}"',
            position,
            "invalid_date",
        )
    if timezone.is_naive(moment):
        moment = timezone.make_aware(moment)
    return Evaluated(DATETIME, moment, None)


# Fields


def _unsupported(comparison):
    operator = OPERATOR_NAMES.get(comparison.operator, comparison.operator)
    return PQLError(
        f"{comparison.field.name} does not support {operator}",
        comparison.position,
        "unsupported_operator",
    )


def _values(node):
    """The value nodes of a comparison: one for = and friends, several for IN lists."""
    if isinstance(node, ValueList):
        return list(node.items)
    return [node]


class _Field:
    operators = ()

    def __init__(self, name):
        self.name = name

    def compile(self, comparison, context):
        if comparison.operator not in self.operators:
            raise _unsupported(comparison)
        q = self.build(comparison, context)
        return ~q if comparison.operator in NEGATED else q

    def build(self, comparison, context):
        raise NotImplementedError


class _ChoiceField(_Field):
    operators = EQUALITY + SETS

    def __init__(self, name, column, choices, function_kind=None):
        super().__init__(name)
        self.column = column
        self.choices = choices
        self.function_kind = function_kind

    def build(self, comparison, context):
        chosen = []
        for node in _values(comparison.value):
            value = _evaluate(node, context)
            if value.kind == STRING:
                normalized = value.value.lower()
                if normalized not in self.choices:
                    raise PQLError(
                        f'"{value.value}" is not a {self.name}; use one of: {", ".join(self.choices)}',
                        node.position,
                        "invalid_choice",
                    )
                chosen.append(normalized)
            elif self.function_kind and value.kind == self.function_kind:
                chosen.extend(value.value)
            else:
                raise PQLError(f"{self.name} takes a quoted {self.name}", node.position, "invalid_value")
        return Q(**{f"{self.column}__in": chosen})


class _BooleanField(_Field):
    operators = EQUALITY

    def __init__(self, name, build_q):
        super().__init__(name)
        self.build_q = build_q

    def build(self, comparison, context):
        value = _evaluate(comparison.value, context)
        if value.kind != BOOLEAN:
            raise PQLError(f"{self.name} takes true or false, unquoted", comparison.value.position, "invalid_value")
        return self.build_q(value.value)


def _string_value(field, node, context):
    value = _evaluate(node, context)
    if value.kind != STRING:
        raise PQLError(f"{field} takes a quoted text value", node.position, "invalid_value")
    return value.value


class _TitleField(_Field):
    operators = EQUALITY + ("~",)

    def build(self, comparison, context):
        value = _string_value(self.name, comparison.value, context)
        if comparison.operator == "~":
            return Q(name__icontains=value)
        return Q(name__iexact=value)


class _TextField(_Field):
    operators = ("~",)

    def build(self, comparison, context):
        value = _string_value(self.name, comparison.value, context)
        return Q(name__icontains=value) | Q(description_stripped__icontains=value)


class _IdentifierField(_Field):
    """``id``: a work item's key such as "WEB-11", or its UUID."""

    operators = EQUALITY + SETS + ("~",)

    def build(self, comparison, context):
        if comparison.operator == "~":
            fragment = _string_value(self.name, comparison.value, context)
            keyed = (
                Issue.all_objects.filter(workspace_id=context.workspace_id)
                .annotate(
                    pql_key=Concat(
                        "project__identifier",
                        SQLValue("-"),
                        Cast("sequence_id", output_field=CharField()),
                        output_field=CharField(),
                    )
                )
                .filter(pql_key__icontains=fragment)
            )
            return Q(pk__in=keyed.values("pk"))
        return _any_of(
            [_issue_key_q(_string_value(self.name, node, context), node.position) for node in _values(comparison.value)]
        )


def _issue_key_q(value, position):
    match = _ISSUE_KEY.match(value.strip())
    if match:
        return Q(project__identifier__iexact=match.group(1), sequence_id=int(match.group(2)))
    return Q(pk=_uuid(value, position, 'a work item key such as "WEB-11" or a work item id'))


class _DateField(_Field):
    operators = EQUALITY + ORDERING + RANGES + EMPTINESS
    lookups = {"=": "", "!=": "", ">": "__gt", ">=": "__gte", "<": "__lt", "<=": "__lte"}

    def __init__(self, name, column, has_time):
        super().__init__(name)
        self.column = column
        self.has_time = has_time

    def moment(self, node, context):
        value = _evaluate(node, context)
        if value.kind == STRING:
            value = _parse_date(value.value, node.position, self.name)
        if value.kind not in (DATE, DATETIME):
            raise PQLError(
                f'{self.name} takes a date such as "2026-10-14" or a date function such as today()',
                node.position,
                "invalid_value",
            )
        return value

    def lookup(self, value, suffix):
        """Compare whole days unless both sides carry a time of day."""
        if value.kind == DATETIME and self.has_time:
            return {f"{self.column}{suffix}": value.value}
        day = timezone.localdate(value.value) if value.kind == DATETIME else value.value
        column = f"{self.column}__date" if self.has_time else self.column
        return {f"{column}{suffix}": day}

    def build(self, comparison, context):
        operator = comparison.operator
        if operator in EMPTINESS:
            return Q(**{f"{self.column}__isnull": True})
        if operator in RANGES:
            low = self.moment(comparison.value.low, context)
            high = self.moment(comparison.value.high, context)
            return Q(**self.lookup(low, "__gte")) & Q(**self.lookup(high, "__lte"))
        return Q(**self.lookup(self.moment(comparison.value, context), self.lookups[operator]))


def _ids(field, entity, comparison, context):
    """Literal UUIDs and id-valued functions (currentUser(), activeCycle(), ...)."""
    literal_ids = []
    subqueries = []
    for node in _values(comparison.value):
        value = _evaluate(node, context)
        if value.kind == STRING:
            literal_ids.append(_uuid(value.value, node.position, f"a valid {entity} id"))
        elif value.kind == IDS and value.entity == entity:
            if isinstance(value.value, list):
                literal_ids.extend(value.value)
            else:
                subqueries.append(value.value)
        else:
            raise PQLError(f"{field} takes a quoted {entity} id", node.position, "invalid_value")
    return literal_ids, subqueries


def _any_of(conditions):
    q = conditions[0]
    for condition in conditions[1:]:
        q |= condition
    return q


def _in_q(column, literal_ids, subqueries):
    conditions = [Q(**{f"{column}__in": subquery}) for subquery in subqueries]
    if literal_ids:
        conditions.insert(0, Q(**{f"{column}__in": literal_ids}))
    return _any_of(conditions)


class _ForeignKeyField(_Field):
    operators = EQUALITY + SETS + EMPTINESS

    def __init__(self, name, column, entity):
        super().__init__(name)
        self.column = column
        self.entity = entity

    def build(self, comparison, context):
        if comparison.operator in EMPTINESS:
            return Q(**{f"{self.column}__isnull": True})
        return _in_q(self.column, *_ids(self.name, self.entity, comparison, context))


class _ThroughField(_Field):
    """A multi-valued field stored in a link table (assignees, labels, cycles, ...)."""

    operators = EQUALITY + SETS + EMPTINESS

    def __init__(self, name, model, column, entity):
        super().__init__(name)
        self.model = model
        self.column = column
        self.entity = entity

    def links(self, **lookups):
        return self.model.objects.filter(deleted_at__isnull=True, **lookups).values("issue_id")

    def build(self, comparison, context):
        if comparison.operator in EMPTINESS:
            return ~Q(pk__in=self.links())
        literal_ids, subqueries = _ids(self.name, self.entity, comparison, context)
        return Q(pk__in=self.links().filter(_in_q(self.column, literal_ids, subqueries)))


class _UnavailableField(_Field):
    def __init__(self, name, reason):
        super().__init__(name)
        self.reason = reason

    def compile(self, comparison, context):
        raise PQLError(f"{comparison.field.name} {self.reason}", comparison.position, "unavailable_field")


FIELDS = {
    field.name.lower(): field
    for field in (
        _ChoiceField("priority", "priority", PRIORITIES),
        _ChoiceField("stateGroup", "state__group", STATE_GROUPS, function_kind=GROUPS),
        _BooleanField("isDraft", lambda value: Q(is_draft=value)),
        _BooleanField("isArchived", lambda value: Q(archived_at__isnull=not value)),
        _TitleField("title"),
        _TextField("text"),
        _IdentifierField("id"),
        _DateField("dueDate", "target_date", has_time=False),
        _DateField("startDate", "start_date", has_time=False),
        _DateField("createdAt", "created_at", has_time=True),
        _DateField("updatedAt", "updated_at", has_time=True),
        _DateField("completedAt", "completed_at", has_time=True),
        _ForeignKeyField("state", "state_id", "state"),
        _ForeignKeyField("project", "project_id", "project"),
        _ForeignKeyField("createdBy", "created_by_id", "user"),
        _ForeignKeyField("type", "type_id", "work item type"),
        _ThroughField("assignee", IssueAssignee, "assignee_id", "user"),
        _ThroughField("label", IssueLabel, "label_id", "label"),
        _ThroughField("cycle", CycleIssue, "cycle_id", "cycle"),
        _ThroughField("module", ModuleIssue, "module_id", "module"),
        _ThroughField("mention", IssueMention, "mention_id", "user"),
        _ThroughField("subscriber", IssueSubscriber, "subscriber_id", "user"),
        _UnavailableField("cf", "(custom properties) is not available yet"),
        _UnavailableField("milestone", "is not available in this Plane"),
        _UnavailableField("teamspaceProject", "is not available yet"),
    )
}


def _compile_comparison(comparison, context):
    field = FIELDS.get(comparison.field.name.lower())
    if field is None:
        raise PQLError(
            f"Unknown field '{comparison.field.name}'. Fields: {', '.join(sorted(FIELD_NAMES))}",
            comparison.field.position,
            "unknown_field",
        )
    return field.compile(comparison, context)


FIELD_NAMES = [field.name for field in FIELDS.values() if not isinstance(field, _UnavailableField)]


# Standalone functions


def _children_of_any():
    return Issue.objects.filter(parent_id__isnull=False).values("parent_id")


PREDICATES = {
    "isoverdue": lambda c: Q(target_date__lt=c.today, state__group__in=OPEN_STATE_GROUPS),
    "hasnoassignee": lambda c: ~Q(pk__in=IssueAssignee.objects.filter(deleted_at__isnull=True).values("issue_id")),
    "hasnolabel": lambda c: ~Q(pk__in=IssueLabel.objects.filter(deleted_at__isnull=True).values("issue_id")),
    "istoplevel": lambda c: Q(parent_id__isnull=True),
    "issubworkitem": lambda c: Q(parent_id__isnull=False),
    "isepic": lambda c: Q(type__is_epic=True),
    "haschildren": lambda c: Q(pk__in=_children_of_any()),
    "hasstartandduedates": lambda c: Q(start_date__isnull=False, target_date__isnull=False),
    "isdraft": lambda c: Q(is_draft=True),
    "isarchived": lambda c: Q(archived_at__isnull=False),
    "isintake": lambda c: Q(pk__in=IntakeIssue.objects.filter(deleted_at__isnull=True).values("issue_id")),
}


def _relations(**lookups):
    return IssueRelation.objects.filter(deleted_at__isnull=True, **lookups)


# An IssueRelation(issue=A, related_issue=B, relation_type="blocked_by") means A is blocked by B.
RELATION_FUNCTIONS = {
    "childof": lambda target: Q(parent_id=target),
    "parentof": lambda target: Q(pk__in=Issue.objects.filter(pk=target).values("parent_id")),
    "blockedby": lambda target: Q(
        pk__in=_relations(related_issue_id=target, relation_type="blocked_by").values("issue_id")
    ),
    "blocks": lambda target: Q(
        pk__in=_relations(issue_id=target, relation_type="blocked_by").values("related_issue_id")
    ),
    "linkedto": lambda target: Q(
        pk__in=_relations(issue_id=target, relation_type="relates_to").values("related_issue_id")
    )
    | Q(pk__in=_relations(related_issue_id=target, relation_type="relates_to").values("issue_id")),
    "duplicateof": lambda target: Q(
        pk__in=_relations(issue_id=target, relation_type="duplicate").values("related_issue_id")
    )
    | Q(pk__in=_relations(related_issue_id=target, relation_type="duplicate").values("issue_id")),
}


def _resolve_issue(call, context):
    if len(call.args) != 1:
        raise PQLError(
            f'{call.name}() takes one work item key, as in {call.name}("WEB-5")', call.position, "invalid_argument"
        )
    value = _evaluate(call.args[0], context)
    if value.kind != STRING:
        raise PQLError(f'{call.name}() takes a quoted work item key such as "WEB-5"', call.position, "invalid_argument")
    # Only items in projects the user belongs to resolve, so the query cannot probe others.
    candidates = Issue.objects.filter(workspace_id=context.workspace_id, project_id__in=context.member_project_ids())
    target = candidates.filter(_issue_key_q(value.value, call.args[0].position)).values_list("id", flat=True).first()
    if target is None:
        raise PQLError(f'No work item "{value.value}" found', call.args[0].position, "unknown_work_item")
    return target


def _compile_predicate(call, context):
    key = call.name.lower()
    if key in PREDICATES:
        if call.args:
            raise PQLError(f"{call.name}() takes no arguments", call.position, "invalid_argument")
        return PREDICATES[key](context)
    if key in RELATION_FUNCTIONS:
        return RELATION_FUNCTIONS[key](_resolve_issue(call, context))
    if key in VALUE_FUNCTIONS:
        raise PQLError(
            f"{call.name}() is a value; compare a field with it, as in assignee = {call.name}()",
            call.position,
            "value_as_condition",
        )
    if key in FIELDS:
        raise PQLError(
            f"{call.name} is a field; compare it with a value, as in {call.name} = ...",
            call.position,
            "field_as_condition",
        )
    raise PQLError(f"Unknown function {call.name}()", call.position, "unknown_function")

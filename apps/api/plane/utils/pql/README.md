# PQL, the Plane Query Language

PQL filters work items with one line of text:

```
priority IN ("high", "urgent") AND assignee = currentUser() AND stateGroup IN openStates()
```

The syntax follows Plane's public PQL reference. This package parses it (`parser.py`, no Django dependency) and
compiles it into a Django `Q` over `Issue` (`compiler.py`). `backend.py` applies the `pql` query parameter.

## Where it works

| Endpoint | How |
|---|---|
| Public API `GET /api/v1/workspaces/<slug>/projects/<project_id>/work-items/` (and `/issues/`) | `?pql=...` |
| Public API `GET /api/v1/workspaces/<slug>/work-items/`: every project the caller belongs to | `?pql=...` |
| Public API `GET /api/v1/workspaces/<slug>/projects/<project_id>/archived-work-items/` | `?pql=...` |
| Public API `GET /api/v1/workspaces/<slug>/work-items/count/` | `?pql=...&group_by=...&sub_group_by=...` |
| App work item lists: project, cycle, module, archived, workspace views, profile | `?pql=...`, through `PQLFilterBackend`; combines with `filters` by AND |

A query that does not parse or compile returns 400:

```json
{"pql": {"message": "Expected a value, found 'high'. Quote text values, as in \"high\"", "code": "unquoted_value", "position": 11}}
```

`position` is the 0-based character offset the error points at.

## Syntax

Keywords are case-insensitive. Precedence is `NOT` over `AND` over `OR`; parentheses override it. Text values are
quoted with `"` or `'`; `\"` escapes a quote. Numbers and `true`/`false` are bare.

| Operator | Example |
|---|---|
| `=` `!=` | `priority = "high"` |
| `>` `>=` `<` `<=` | `dueDate < today()` |
| `~` (contains, case-insensitive) | `title ~ "capex"` |
| `IN (...)` `NOT IN (...)` | `stateGroup NOT IN ("completed", "cancelled")` |
| `IN function()` | `cycle IN activeCycle()` |
| `IS NULL` `IS NOT NULL` `IS EMPTY` `IS NOT EMPTY` | `label IS EMPTY` |
| `BETWEEN a AND b`, `BETWEEN (a, b)`, `NOT BETWEEN` | `dueDate BETWEEN (daysAgo(7), today())` |

Limits: 50 conditions, 32 levels of nesting, 4,000 characters.

## Fields

| Field | Values | Operators |
|---|---|---|
| `priority` | `"urgent"` `"high"` `"medium"` `"low"` `"none"` (levels; each matches every priority at that level), or the name of one of the workspace's priorities such as `"Blocker"` | `=` `!=` `IN` `NOT IN` |
| `stateGroup` | `"backlog"` `"unstarted"` `"started"` `"completed"` `"cancelled"` `"triage"` (categories), the name of one of the workspace's state groups such as `"Review"`, or a state group function | `=` `!=` `IN` `NOT IN` |
| `state`, `project`, `type` | id | `=` `!=` `IN` `NOT IN` `IS [NOT] NULL/EMPTY` |
| `createdBy` | user id or a user function | same |
| `assignee`, `mention`, `subscriber` | user id or a user function | same |
| `label`, `module` | id | same |
| `cycle` | id or a cycle function | same |
| `title` | text | `=` (case-insensitive) `!=` `~` |
| `text` | text, searched in title and description | `~` |
| `id` | work item key such as `"WEB-11"`, or its id | `=` `!=` `IN` `NOT IN` `~` |
| `dueDate`, `startDate` | `"YYYY-MM-DD"` or a date function | `=` `!=` `>` `>=` `<` `<=` `BETWEEN` `IS [NOT] NULL` |
| `createdAt`, `updatedAt`, `completedAt` | date, ISO date-time, or a date function | same |
| `isDraft`, `isArchived` | `true` `false` | `=` `!=` |
| `cf["<property id or name>"]` | a custom property, by its type: text, URL and email take quoted text (`=` ignores case, `~` contains); numbers unquoted; dates as for `dueDate`; checkboxes `true` `false`; options an option's name or id; members a user id or a user function; work items an id | text: `=` `!=` `IN` `NOT IN` `~`; number: those and `>` `>=` `<` `<=` `BETWEEN`; date: `=` `!=` `>` `>=` `<` `<=` `BETWEEN`; checkbox: `=` `!=`; option, member, work item: `=` `!=` `IN` `NOT IN`; all: `IS [NOT] NULL/EMPTY` |

Not available yet: `teamspaceProject` (teamspaces). `milestone` is not part of this Plane.

## Functions

Values:

- Dates: `today()`, `now()`, `startOfDay()`, `endOfDay()`, `startOfWeek()`, `endOfWeek()`, `startOfMonth()`,
  `endOfMonth()`, `startOfYear()`, `endOfYear()`, `daysAgo(n)`, `daysFromNow(n)`, `weeksAgo(n)`,
  `weeksFromNow(n)`, `monthsAgo(n)`, `monthsFromNow(n)`. No date arithmetic (`today() - 7`).
- Users: `currentUser()`, `membersOf("project:<project id>")`, `workspaceMembers()`.
- Cycles: `activeCycle()`, `completedCycles()`, `upcomingCycles()`.
- State groups: `openStates()` (backlog, unstarted, started), `closedStates()` (completed, cancelled),
  `activeStates()` (unstarted, started).

Conditions on their own:

- `isOverdue()`, `hasNoAssignee()`, `hasNoLabel()`, `isTopLevel()`, `isSubWorkItem()`, `isEpic()`, `hasChildren()`,
  `hasStartAndDueDates()`, `isDraft()`, `isArchived()`, `isIntake()`.
- Relations, given a key such as `"WEB-5"` or an id: `childOf()` (its sub-items), `parentOf()` (its parent),
  `linkedTo()` (relates to, both directions), `blockedBy()` (items it blocks), `blocks()` (items blocking it),
  `duplicateOf()` (both directions). Only items in projects the user belongs to resolve.

## Semantics

- `!=`, `NOT IN` and `NOT BETWEEN` are the exact negation of `=`, `IN` and `BETWEEN`, so they also match items
  where the field is empty: `assignee != currentUser()` includes unassigned items.
- Multi-valued fields compile to subqueries, so `assignee = A AND assignee = B` means "assigned to both".
- A date compares whole days in the user's timezone; `createdAt = "2026-10-14"` matches the whole day. Only an
  ISO date-time or `now()` against a date-time field compares the time of day.
- Week functions follow the user's "start of the week" preference.

## Conformance corpus

`conformance/parse.json` lists queries with their expected syntax tree (`to_dict()` form, without positions) and
broken queries with their error code and position. The Python tests run it; the TypeScript parser for the browser
will run the same file.

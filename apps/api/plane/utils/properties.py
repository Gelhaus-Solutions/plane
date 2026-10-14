# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Custom property values (D39): what a caller sends, checked and turned into rows, and rows turned back."""

import uuid
from datetime import datetime, time, timezone as dt_timezone
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.core.validators import EmailValidator, URLValidator
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from plane.db.models import (
    Issue,
    PropertyType,
    RelationType,
    WorkItemProperty,
    WorkItemPropertyOption,
    WorkItemPropertyValue,
    WorkspaceMember,
)

COLUMN = {
    PropertyType.TEXT: "value_text",
    PropertyType.URL: "value_text",
    PropertyType.EMAIL: "value_text",
    PropertyType.DECIMAL: "value_decimal",
    PropertyType.DATETIME: "value_datetime",
    PropertyType.BOOLEAN: "value_boolean",
    PropertyType.OPTION: "value_option_id",
}
RELATION_COLUMN = {RelationType.USER: "value_user_id", RelationType.ISSUE: "value_issue_id"}


class PropertyValueError(ValueError):
    """A value the property cannot take; the message is safe to show."""


def column(prop):
    if prop.property_type == PropertyType.RELATION:
        return RELATION_COLUMN[prop.relation_type]
    return COLUMN[prop.property_type]


def find_property(workspace_id, ident):
    """A property named by its id, its name or its display name."""
    rows = WorkItemProperty.objects.filter(workspace_id=workspace_id)
    try:
        return rows.filter(pk=uuid.UUID(str(ident))).first()
    except ValueError:
        return rows.filter(Q(name__iexact=str(ident)) | Q(display_name__iexact=str(ident))).first()


def _uuid(value, what):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise PropertyValueError(f"{value!r} is not {what} id")


def _one(prop, value, workspace_id):
    """One value of the property's type, as the column holds it."""
    kind = prop.property_type
    if kind in (PropertyType.TEXT, PropertyType.URL, PropertyType.EMAIL):
        if not isinstance(value, str):
            raise PropertyValueError(f"{prop.display_name} takes text")
        try:
            if kind == PropertyType.URL:
                URLValidator(schemes=["http", "https"])(value)
            if kind == PropertyType.EMAIL:
                EmailValidator()(value)
        except ValidationError:
            raise PropertyValueError(f"{value!r} is not a valid {kind.lower()}")
        return value
    if kind == PropertyType.DECIMAL:
        if isinstance(value, bool):
            raise PropertyValueError(f"{prop.display_name} takes a number")
        try:
            return Decimal(str(value))
        except InvalidOperation:
            raise PropertyValueError(f"{prop.display_name} takes a number")
    if kind == PropertyType.BOOLEAN:
        if not isinstance(value, bool):
            raise PropertyValueError(f"{prop.display_name} takes true or false")
        return value
    if kind == PropertyType.DATETIME:
        moment = parse_datetime(str(value).replace(" ", "T")) if isinstance(value, str) else None
        if moment is None and isinstance(value, str) and parse_date(value):
            moment = datetime.combine(parse_date(value), time())
        if moment is None:
            raise PropertyValueError(f"{prop.display_name} takes a date, YYYY-MM-DD or YYYY-MM-DD HH:MM:SS")
        return moment if timezone.is_aware(moment) else timezone.make_aware(moment, dt_timezone.utc)
    if kind == PropertyType.OPTION:
        options = WorkItemPropertyOption.objects.filter(property=prop)
        try:
            option = options.filter(pk=uuid.UUID(str(value))).first()
        except ValueError:
            option = options.filter(name__iexact=str(value)).first()
        if option is None:
            names = ", ".join(options.values_list("name", flat=True))
            raise PropertyValueError(f"{value!r} is not an option of {prop.display_name}; the options are: {names}")
        return option.id
    if prop.relation_type == RelationType.USER:
        user_id = _uuid(value, "a member")
        if not WorkspaceMember.objects.filter(workspace_id=workspace_id, member_id=user_id, is_active=True).exists():
            raise PropertyValueError(f"{value} is not a member of this workspace")
        return user_id
    issue_id = _uuid(value, "a work item")
    if not Issue.issue_objects.filter(workspace_id=workspace_id, pk=issue_id).exists():
        raise PropertyValueError(f"{value} is not a work item of this workspace")
    return issue_id


def parse_values(prop, value, workspace_id):
    """Column values for what the caller sent: a value, a list of them, or null or [] to clear."""
    if not prop.is_active:
        raise PropertyValueError(f"{prop.display_name} is switched off")
    values = value if isinstance(value, list) else ([] if value is None or value == "" else [value])
    if len(values) > 1 and not prop.is_multi:
        raise PropertyValueError(f"{prop.display_name} takes one value")
    return [_one(prop, item, workspace_id) for item in values]


def set_values(issue, prop, value):
    """Replace the property's values on the work item; returns them as read back."""
    parsed = parse_values(prop, value, issue.workspace_id)
    field = column(prop)
    with transaction.atomic():
        WorkItemPropertyValue.objects.filter(issue=issue, property=prop).delete()
        WorkItemPropertyValue.objects.bulk_create(
            [
                WorkItemPropertyValue(workspace_id=issue.workspace_id, issue=issue, property=prop, **{field: item})
                for item in parsed
            ]
        )
    return read_value(prop, WorkItemPropertyValue.objects.filter(issue=issue, property=prop))


def _show(prop, row):
    raw = getattr(row, column(prop))
    if raw is None:
        return None
    if prop.property_type == PropertyType.DECIMAL:
        return int(raw) if raw == raw.to_integral_value() else float(raw)
    if prop.property_type == PropertyType.DATETIME:
        moment = raw.astimezone(dt_timezone.utc)
        return moment.date().isoformat() if moment.time() == time() else moment.isoformat()
    if isinstance(raw, uuid.UUID):
        return str(raw)
    return raw


def read_value(prop, rows):
    """A property's value on one work item: a single value, a list for a multi-value property, or null."""
    shown = [value for value in (_show(prop, row) for row in rows) if value is not None]
    if prop.is_multi:
        return shown
    return shown[0] if shown else None


def read_values(issue):
    """Every active property of the work item's workspace with its value on the item, keyed by property id."""
    props = WorkItemProperty.objects.filter(workspace_id=issue.workspace_id, is_active=True)
    rows = {}
    for row in WorkItemPropertyValue.objects.filter(issue=issue):
        rows.setdefault(row.property_id, []).append(row)
    return {
        str(prop.id): {
            "name": prop.display_name,
            "type": prop.property_type,
            "value": read_value(prop, rows.get(prop.id, [])),
        }
        for prop in props
    }

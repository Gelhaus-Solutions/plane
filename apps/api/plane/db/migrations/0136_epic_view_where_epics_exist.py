# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The Epics switch (D45) starts on for the projects that already have an epic and off for the others.

Kept apart from 0135, which adds the column: a data change in the same migration as schema changes on that table
fails on PostgreSQL ("pending trigger events").
"""

from django.db import migrations


def epics_where_they_exist(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    Issue = apps.get_model("db", "Issue")
    # historical models carry no custom managers, so the base manager it is
    with_epics = (
        Issue._base_manager.filter(type__is_epic=True, deleted_at__isnull=True)
        .values_list("project_id", flat=True)
        .distinct()
    )
    Project._base_manager.exclude(pk__in=with_epics).update(epic_view=False)


def back(apps, schema_editor):
    apps.get_model("db", "Project")._base_manager.update(epic_view=True)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0135_project_feature_settings"),
    ]

    operations = [migrations.RunPython(epics_where_they_exist, back)]

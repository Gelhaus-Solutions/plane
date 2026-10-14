# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Turns work items labelled `epic` into epics of the Epic type (E11).

Before E11, an epic was a parent work item with the `epic` label. This makes each one an epic, takes its first
assignee as the lead, and puts it in the wave named by its module when the module is called like "W1 Priorities".
Sizes can be given per name prefix: --size E01=S --size E07=L. The label stays; nothing is removed.

    python manage.py convert_labelled_epics --workspace gelhaus-solutions --project PLANE --dry-run
"""

# Python imports
import re

# Django imports
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

# Module imports
from plane.db.models import EpicDetail, EpicSize, EpicWave, Issue, Label, ModuleIssue, Project
from plane.utils.epics import make_epic

WAVE_MODULE = re.compile(r"^(W\d+)\s+(.+)$")


class Command(BaseCommand):
    help = "Turn work items labelled `epic` into epics of the Epic type"

    def add_arguments(self, parser):
        parser.add_argument("--workspace", required=True, help="Workspace slug")
        parser.add_argument("--project", help="Project identifier; every project of the workspace when left out")
        parser.add_argument("--label", default="epic", help="The label that marks an epic (any case)")
        parser.add_argument("--size", action="append", default=[], help="NAME_PREFIX=SIZE, for example E07=L")
        parser.add_argument("--dry-run", action="store_true", help="Report what would change, change nothing")

    def handle(self, *args, **options):
        sizes = {}
        for pair in options["size"]:
            prefix, _, size = pair.partition("=")
            if not prefix or size not in EpicSize.values:
                raise CommandError(f"--size {pair}: expected NAME_PREFIX=SIZE with SIZE one of {EpicSize.values}")
            sizes[prefix.strip()] = size

        projects = Project.objects.filter(workspace__slug=options["workspace"], archived_at__isnull=True)
        if options["project"]:
            projects = projects.filter(identifier__iexact=options["project"])
        if not projects.exists():
            raise CommandError("No such workspace or project")

        with transaction.atomic():
            for project in projects.order_by("identifier"):
                self.convert_project(project, options["label"], sizes, options["dry_run"])
            if options["dry_run"]:
                transaction.set_rollback(True)
                self.stdout.write("Dry run: nothing was changed.")

    def convert_project(self, project, label_name, sizes, dry_run):
        labels = Label.objects.filter(project=project, name__iexact=label_name)
        items = (
            Issue.issue_objects.filter(project=project, labels__in=labels)
            .distinct()
            .select_related("type")
            .order_by("sequence_id")
        )
        if not items:
            return
        for item in items:
            first_assignee = item.assignees.order_by("issue_assignee__created_at").values_list("id", flat=True).first()
            was_epic = bool(item.type_id and item.type.is_epic)
            had_lead = EpicDetail.objects.filter(epic=item, lead__isnull=False).exists()
            detail = make_epic(item, lead_id=first_assignee)
            changes = [] if was_epic else ["type"]
            if not had_lead and detail.lead_id:
                changes.append("lead")

            wave = self.wave_for(item, project)
            if wave and not detail.wave_id:
                detail.wave = wave
                changes.append(f"wave {wave.code}")
            size = next((s for prefix, s in sizes.items() if item.name.startswith(f"{prefix} ")), None)
            if size and detail.size != size:
                detail.size = size
                changes.append(f"size {size}")
            detail.save()
            verb = "would change" if dry_run else "changed"
            summary = f"{verb} {', '.join(changes)}" if changes else "unchanged"
            self.stdout.write(f"{project.identifier}-{item.sequence_id} {item.name}: {summary}")

    def wave_for(self, item, project):
        names = ModuleIssue.objects.filter(issue=item, module__deleted_at__isnull=True).values_list(
            "module__name", flat=True
        )
        for name in names:
            match = WAVE_MODULE.match(name.strip())
            if not match:
                continue
            code, theme = match.groups()
            wave = EpicWave.objects.filter(project=project, code__iexact=code).first()
            if wave is None:
                wave = EpicWave.objects.create(
                    project=project, code=code, name=theme.strip(), sort_order=float(code[1:]) * 10000
                )
            return wave
        return None

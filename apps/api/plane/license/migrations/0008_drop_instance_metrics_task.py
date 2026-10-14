# Upstream's instance metrics push is gone (D41). Beat runs on the database scheduler, which adds the entries of
# beat_schedule but never removes one, so the stored row would keep sending a task no worker knows.

from django.db import migrations
from django.utils import timezone

METRICS_TASK = "plane.license.bgtasks.telemetry_metrics.push_instance_metrics"


def drop_metrics_task(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTasks = apps.get_model("django_celery_beat", "PeriodicTasks")
    deleted, _ = PeriodicTask.objects.filter(task=METRICS_TASK).delete()
    if deleted:
        # A running beat reloads its schedule when this stamp moves
        PeriodicTasks.objects.update_or_create(ident=1, defaults={"last_update": timezone.now()})


class Migration(migrations.Migration):
    dependencies = [
        ("license", "0007_instance_drop_upstream_licensing"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(drop_metrics_task, migrations.RunPython.noop)]

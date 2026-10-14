# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

from .base import BaseModel


class EmailDelivery(BaseModel):
    """One mail Plane tried to send, so failures are visible in God mode.

    Only metadata is kept, never the body: mails carry sign-in codes, reset links and
    invitation tokens. A subject that would carry a secret is stored redacted.
    """

    class Status(models.TextChoices):
        SENDING = "sending", "Sending"
        RETRYING = "retrying", "Retrying"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    kind = models.CharField(max_length=64)
    recipient = models.CharField(max_length=320)
    subject = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.SENDING)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    # The Celery task id, the same across retries of one mail
    task_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)

    class Meta:
        verbose_name = "Email Delivery"
        verbose_name_plural = "Email Deliveries"
        db_table = "email_deliveries"
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["status", "created_at"], name="email_delivery_status_idx")]

    def __str__(self):
        return f"{self.kind} to {self.recipient}: {self.status}"

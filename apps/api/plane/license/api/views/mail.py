# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""God mode: what mail went out, what failed and why."""

from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.db.models import EmailDelivery
from plane.utils.mail import mail_settings

from .base import BaseAPIView

PAGE_SIZE = 100


class InstanceEmailDeliveryEndpoint(BaseAPIView):
    def get(self, request):
        deliveries = EmailDelivery.objects.all()
        status_filter = request.GET.get("status")
        if status_filter:
            deliveries = deliveries.filter(status=status_filter)
        kind = request.GET.get("kind")
        if kind:
            deliveries = deliveries.filter(kind=kind)

        since = timezone.now() - timedelta(hours=24)
        last_day = dict(
            EmailDelivery.objects.filter(created_at__gte=since)
            .order_by()
            .values_list("status")
            .annotate(count=Count("id"))
        )
        settings = mail_settings()
        return Response(
            {
                "configured": bool(settings.host),
                "sender": settings.sender,
                "last_24_hours": {choice: last_day.get(choice, 0) for choice in EmailDelivery.Status.values},
                "results": list(
                    deliveries.values(
                        "id",
                        "kind",
                        "recipient",
                        "subject",
                        "status",
                        "attempts",
                        "last_error",
                        "sent_at",
                        "created_at",
                    )[:PAGE_SIZE]
                ),
            },
            status=status.HTTP_200_OK,
        )

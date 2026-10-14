# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.template.loader import render_to_string

# Third party imports
from celery import shared_task

# Module imports
from plane.db.models import User
from plane.utils.exception_logger import log_exception
from plane.utils.mail import MAIL_TASK, TransientMailError, send_mail


@shared_task(**MAIL_TASK)
def user_activation_email(self, current_site, user_id):
    try:
        # Send email to user when account is activated
        user = User.objects.get(id=user_id)
        subject = f"{user.first_name or user.display_name or user.email} has been activated on Plane"

        context = {"email": str(user.email), "profile_url": current_site + "/profile"}

        # Send email to user
        html_content = render_to_string("emails/user/user_activation.html", context)
        send_mail("user_activated", user.email, subject, html_content, task=self)
        return
    except TransientMailError:
        raise
    except Exception as e:
        log_exception(e)
        return

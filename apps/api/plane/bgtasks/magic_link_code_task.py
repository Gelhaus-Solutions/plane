# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from celery import shared_task

# Django imports
from django.template.loader import render_to_string

# Module imports
from plane.utils.exception_logger import log_exception
from plane.utils.mail import MAIL_TASK, TransientMailError, send_mail


@shared_task(**MAIL_TASK)
def magic_link(self, email, key, token):
    try:
        # Send the mail
        subject = f"Your unique Plane login code is {token}"
        context = {"code": token, "email": email}

        html_content = render_to_string("emails/auth/magic_signin.html", context)
        # The code is a secret: the delivery log keeps the subject without it
        send_mail("magic_code", email, subject, html_content, task=self, log_subject="Your unique Plane login code")
        return
    except TransientMailError:
        raise
    except Exception as e:
        log_exception(e)
        return

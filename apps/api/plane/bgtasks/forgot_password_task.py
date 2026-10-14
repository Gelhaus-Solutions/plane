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
def forgot_password(self, first_name, email, uidb64, token, current_site):
    try:
        relative_link = f"/accounts/reset-password/?uidb64={uidb64}&token={token}&email={email}"
        abs_url = str(current_site) + relative_link

        subject = "A new password to your Plane account has been requested"

        context = {
            "first_name": first_name,
            "forgot_password_url": abs_url,
            "email": email,
        }

        html_content = render_to_string("emails/auth/forgot_password.html", context)
        send_mail("password_reset", email, subject, html_content, task=self)
        return
    except TransientMailError:
        raise
    except Exception as e:
        log_exception(e)
        return

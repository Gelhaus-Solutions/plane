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
def send_email_update_magic_code(self, email, token):
    try:
        # Send the mail
        subject = "Verify your new email address"
        context = {"code": token, "email": email}

        html_content = render_to_string("emails/auth/magic_signin.html", context)
        send_mail("email_change_code", email, subject, html_content, task=self)
        return
    except TransientMailError:
        raise
    except Exception as e:
        log_exception(e)
        return


@shared_task(**MAIL_TASK)
def send_email_update_confirmation(self, email):
    """
    Send a confirmation email to the user after their email address has been successfully updated.

    Args:
        email: The new email address that was successfully updated
    """
    try:
        # Send the confirmation email
        subject = "Plane email address successfully updated"
        context = {"email": email}

        html_content = render_to_string("emails/user/email_updated.html", context)
        send_mail("email_changed", email, subject, html_content, task=self)
        return
    except TransientMailError:
        raise
    except Exception as e:
        log_exception(e)
        return

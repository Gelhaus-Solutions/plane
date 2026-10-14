# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from celery import shared_task

# Django imports
from django.template.loader import render_to_string

# Module imports
from plane.db.models import ProjectMember, User
from plane.utils.exception_logger import log_exception
from plane.utils.mail import MAIL_TASK, TransientMailError, send_mail


@shared_task(**MAIL_TASK)
def project_add_user_email(self, current_site, project_member_id, invitor_id):
    try:
        # Get the invitor
        invitor = User.objects.get(pk=invitor_id)
        inviter_first_name = invitor.first_name
        # Get the project member
        project_member = ProjectMember.objects.get(pk=project_member_id)
        # Bots have no mailbox
        if project_member.member.is_bot:
            return
        # Get the project member details
        project_name = project_member.project.name
        workspace_name = project_member.workspace.name
        member_email = project_member.member.email
        project_url = f"{current_site}/{project_member.workspace.slug}/projects/{project_member.project_id}/issues"
        # set the context
        context = {
            "project_name": project_name,
            "workspace_name": workspace_name,
            "email": member_email,
            "inviter_first_name": inviter_first_name,
            "project_url": project_url,
        }

        # Set the subject
        subject = "You have been invited to a Plane project"

        # Render the email template
        html_content = render_to_string("emails/notifications/project_addition.html", context)
        send_mail("project_addition", member_email, subject, html_content, task=self)
        return
    except TransientMailError:
        raise
    except Exception as e:
        log_exception(e)
        return

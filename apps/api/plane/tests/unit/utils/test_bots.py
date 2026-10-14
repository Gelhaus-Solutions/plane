# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Bot accounts: lifecycle, project membership, tokens, and silence in notifications."""

import json
import uuid

import pytest

from plane.bgtasks.notification_task import notifications
from plane.db.models import (
    APIToken,
    BotTypeEnum,
    Issue,
    IssueAssignee,
    IssueSubscriber,
    Notification,
    Project,
    ProjectMember,
    ProjectUserProperty,
    State,
    User,
    Workspace,
    WorkspaceBot,
    WorkspaceMember,
)
from plane.utils import bots
from plane.utils.bots import BotError


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Bots", identifier="BOT", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def bot(db, workspace, create_user):
    return bots.create_bot(workspace, "Release Bot", created_by=create_user, description="Ships releases")


@pytest.mark.unit
@pytest.mark.django_db
class TestCreateBot:
    def test_bot_is_a_workspace_member_that_cannot_sign_in_or_receive_mail(self, workspace, bot, create_user):
        user = bot.user
        assert user.is_bot and user.bot_type == BotTypeEnum.USER
        assert user.display_name == "Release Bot"
        assert user.email.endswith(f"@{workspace.slug}.bots.invalid")
        assert not user.has_usable_password()
        assert bot.created_by_id == create_user.id
        assert bot.description == "Ships releases"
        member = WorkspaceMember.objects.get(workspace=workspace, member=user)
        assert (member.role, member.is_active) == (15, True)

    @pytest.mark.parametrize("name, role", [("", 15), ("   ", 15), ("x" * 256, 15), ("Bot", 10)])
    def test_invalid_input(self, workspace, name, role):
        with pytest.raises(BotError):
            bots.create_bot(workspace, name, role=role)
        assert not WorkspaceBot.objects.exists()

    def test_system_bot_is_made_once_as_admin(self, workspace):
        first = bots.system_bot(workspace)
        assert bots.system_bot(workspace).id == first.id
        assert first.user.bot_type == BotTypeEnum.SYSTEM
        assert WorkspaceMember.objects.get(workspace=workspace, member=first.user).role == 20


@pytest.mark.unit
@pytest.mark.django_db
class TestProjects:
    def test_add_and_remove(self, project, bot):
        member = bots.add_to_project(bot, project, 15)
        assert (member.role, member.is_active) == (15, True)
        assert ProjectUserProperty.objects.filter(project=project, user=bot.user).exists()

        bots.remove_from_project(bot, project)
        assert not ProjectMember.objects.get(pk=member.pk).is_active

        again = bots.add_to_project(bot, project, 5)
        assert (again.pk, again.role, again.is_active) == (member.pk, 5, True)

    def test_project_role_cannot_exceed_workspace_role(self, project, bot):
        with pytest.raises(BotError):
            bots.add_to_project(bot, project, 20)

    def test_project_in_another_workspace_is_refused(self, bot, create_user):
        other = Workspace.objects.create(name="Other", slug="other-ws", owner=create_user)
        foreign = Project.objects.create(name="Foreign", identifier="FOR", workspace=other, created_by=create_user)
        with pytest.raises(BotError):
            bots.add_to_project(bot, foreign, 15)


@pytest.mark.unit
@pytest.mark.django_db
class TestLifecycle:
    def test_switch_off_and_on(self, workspace, bot):
        bots.set_active(bot, False)
        bot.user.refresh_from_db()
        assert not bot.user.is_active
        assert not WorkspaceMember.objects.get(workspace=workspace, member=bot.user).is_active

        bots.set_active(bot, True)
        bot.user.refresh_from_db()
        assert bot.user.is_active
        assert WorkspaceMember.objects.get(workspace=workspace, member=bot.user).is_active

    def test_delete_keeps_the_user_but_revokes_everything(self, project, bot):
        bots.add_to_project(bot, project, 15)
        token = bots.issue_token(bot, label="ci")
        bots.delete_bot(bot)

        assert not WorkspaceBot.objects.filter(pk=bot.pk).exists()
        assert User.objects.filter(pk=bot.user_id, is_active=False).exists()
        assert not APIToken.objects.get(pk=token.pk).is_active
        assert not ProjectMember.objects.get(project=project, member=bot.user).is_active


@pytest.mark.unit
@pytest.mark.django_db
class TestTokens:
    def test_issue_token(self, workspace, bot, settings):
        token = bots.issue_token(bot, label="ci", access="read")
        assert token.user_id == bot.user_id
        assert token.user_type == 1
        assert token.workspace_id == workspace.id
        assert token.access == "read"
        assert token.allowed_rate_limit == settings.API_KEY_RATE_LIMIT
        assert token.token.startswith("plane_api_")

    def test_bad_access_is_refused(self, bot):
        with pytest.raises(BotError):
            bots.issue_token(bot, access="admin")

    def test_rotate_keeps_settings_and_kills_the_old_secret(self, bot):
        old = bots.issue_token(bot, label="ci", access="read", allowed_rate_limit="500/hour")
        new = bots.rotate_token(old)
        old.refresh_from_db()
        assert not old.is_active
        assert new.is_active and new.token != old.token
        assert (new.label, new.access, new.allowed_rate_limit, new.user_id) == ("ci", "read", "500/hour", bot.user_id)


@pytest.mark.unit
@pytest.mark.django_db
class TestNotifications:
    def test_a_bot_on_an_item_neither_gets_notified_nor_blocks_people(self, workspace, project, bot, create_user):
        """Bots have no notification preferences; before bots were left out, one bot subscriber
        made the task fail, so nobody on the item heard about the change."""
        watcher = User.objects.create(email="watcher@plane.so", username="watcher", first_name="Watcher")
        ProjectMember.objects.create(project=project, member=watcher, role=15, is_active=True)
        bots.add_to_project(bot, project, 15)
        state = State.objects.create(name="Todo", group="unstarted", project=project, workspace=workspace)
        issue = Issue.objects.create(name="Ship it", state=state, project=project, workspace=workspace)
        for person in (watcher, bot.user):
            IssueSubscriber.objects.create(issue=issue, subscriber=person, project=project, workspace=workspace)
        IssueAssignee.objects.create(issue=issue, assignee=bot.user, project=project, workspace=workspace)

        activity = {
            "id": str(uuid.uuid4()),
            "verb": "updated",
            "field": "priority",
            "old_value": "low",
            "new_value": "high",
            "actor_id": str(create_user.id),
            "issue_comment": None,
            "comment": "changed the priority to high",
            "issue_detail": {"id": str(issue.id)},
            "created_at": "2026-10-14T12:00:00Z",
        }
        notifications(
            type="issue.activity.updated",
            issue_id=str(issue.id),
            project_id=str(project.id),
            actor_id=str(create_user.id),
            subscriber=False,
            issue_activities_created=json.dumps([activity]),
            requested_data=json.dumps({"priority": "high"}),
            current_instance=json.dumps({"priority": "low"}),
        )

        assert Notification.objects.filter(receiver=watcher).exists()
        assert not Notification.objects.filter(receiver=bot.user).exists()

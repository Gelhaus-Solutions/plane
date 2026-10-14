# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace settings for bots, and bots acting through their tokens on the public API."""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import APIToken, Issue, Project, ProjectMember, State, User, WorkspaceMember
from plane.utils import bots


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Bots", identifier="BOT", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    State.objects.create(name="Todo", group="unstarted", default=True, project=project, workspace=workspace)
    return project


@pytest.fixture
def member_client(db, workspace):
    """A plain workspace member, not an admin."""
    user = User.objects.create(email="member@plane.so", username="plain-member", first_name="Plain")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def bots_url(workspace, *parts):
    return "/".join([f"/api/workspaces/{workspace.slug}/bots", *[str(part) for part in parts]]) + "/"


def create(client, workspace, project, **extra):
    payload = {"name": "Release Bot", "description": "Ships", "projects": [{"project_id": str(project.id)}], **extra}
    response = client.post(bots_url(workspace), payload, format="json")
    assert response.status_code == status.HTTP_201_CREATED, response.data
    return response.data


@pytest.mark.contract
class TestWorkspaceBotSettings:
    @pytest.mark.django_db
    def test_admin_creates_a_bot_in_a_project(self, session_client, workspace, project):
        data = create(session_client, workspace, project)

        assert data["name"] == "Release Bot"
        assert data["bot_type"] == "USER"
        assert data["role"] == 15
        assert data["user"]["is_bot"] is True
        assert [entry["project_id"] for entry in data["projects"]] == [str(project.id)]

    @pytest.mark.django_db
    def test_members_can_list_but_not_create(self, session_client, member_client, workspace, project):
        create(session_client, workspace, project)
        bots.system_bot(workspace)

        listed = member_client.get(bots_url(workspace))
        assert listed.status_code == status.HTTP_200_OK
        assert [bot["name"] for bot in listed.data] == ["Release Bot"]  # the system bot is not listed

        refused = member_client.post(bots_url(workspace), {"name": "Mine"}, format="json")
        assert refused.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_invalid_create(self, session_client, workspace, project):
        assert session_client.post(bots_url(workspace), {"name": ""}, format="json").status_code == 400
        response = session_client.post(
            bots_url(workspace), {"name": "X", "projects": [{"project_id": str(workspace.id)}]}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_update_and_switch_off(self, session_client, workspace, project):
        bot = create(session_client, workspace, project)

        response = session_client.patch(
            bots_url(workspace, bot["id"]), {"name": "Deploy Bot", "role": 20, "is_active": False}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        assert (response.data["name"], response.data["role"], response.data["is_active"]) == ("Deploy Bot", 20, False)

    @pytest.mark.django_db
    def test_project_membership(self, session_client, workspace, project, create_user):
        bot = create(session_client, workspace, project, projects=[])
        other = Project.objects.create(name="Other", identifier="OTH", workspace=workspace, created_by=create_user)

        added = session_client.post(
            bots_url(workspace, bot["id"], "projects"), {"project_id": str(other.id), "role": 5}, format="json"
        )
        assert added.status_code == status.HTTP_200_OK, added.data
        assert added.data["projects"][0]["role"] == 5

        removed = session_client.delete(bots_url(workspace, bot["id"], "projects", other.id))
        assert removed.status_code == status.HTTP_204_NO_CONTENT
        assert not ProjectMember.objects.get(project=other, member_id=bot["user"]["id"]).is_active

    @pytest.mark.django_db
    def test_bot_shows_in_project_members(self, session_client, workspace, project):
        bot = create(session_client, workspace, project)
        bots.add_to_project(bots.system_bot(workspace), project, 15)

        response = session_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/members/")
        assert response.status_code == status.HTTP_200_OK
        members = {str(entry["member"]) for entry in response.data}
        assert str(bot["user"]["id"]) in members
        assert str(bots.system_bot(workspace).user_id) not in members

    @pytest.mark.django_db
    def test_delete(self, session_client, workspace, project):
        bot = create(session_client, workspace, project)
        assert session_client.delete(bots_url(workspace, bot["id"])).status_code == status.HTTP_204_NO_CONTENT
        assert session_client.get(bots_url(workspace, bot["id"])).status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.contract
class TestBotTokens:
    def issue(self, client, workspace, bot, **payload):
        response = client.post(bots_url(workspace, bot["id"], "tokens"), payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data

    @pytest.mark.django_db
    def test_secret_is_shown_once(self, session_client, workspace, project):
        bot = create(session_client, workspace, project)
        token = self.issue(session_client, workspace, bot, label="ci", allowed_rate_limit="300/min")
        assert token["token"].startswith("plane_api_")
        assert token["allowed_rate_limit"] == "300/min"

        listed = session_client.get(bots_url(workspace, bot["id"], "tokens"))
        assert listed.status_code == status.HTTP_200_OK
        assert [entry["label"] for entry in listed.data] == ["ci"]
        assert "token" not in listed.data[0]

    @pytest.mark.django_db
    def test_bad_rate_limit_is_refused(self, session_client, workspace, project):
        bot = create(session_client, workspace, project)
        response = session_client.post(
            bots_url(workspace, bot["id"], "tokens"), {"allowed_rate_limit": "lots"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_bot_token_acts_as_the_bot_on_the_public_api(self, session_client, workspace, project):
        bot = create(session_client, workspace, project)
        token = self.issue(session_client, workspace, bot)
        client = APIClient()
        client.credentials(HTTP_X_API_KEY=token["token"])

        response = client.post(
            f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/",
            {"name": "Made by a bot"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert str(Issue.objects.get(name="Made by a bot").created_by_id) == str(bot["user"]["id"])

    @pytest.mark.django_db
    def test_read_token_cannot_write(self, session_client, workspace, project):
        bot = create(session_client, workspace, project)
        token = self.issue(session_client, workspace, bot, access="read")
        client = APIClient()
        client.credentials(HTTP_X_API_KEY=token["token"])
        url = f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/"

        assert client.get(url).status_code == status.HTTP_200_OK
        assert client.post(url, {"name": "Nope"}, format="json").status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_rotate_and_revoke(self, session_client, workspace, project):
        bot = create(session_client, workspace, project)
        old = self.issue(session_client, workspace, bot, label="ci")
        url = f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/"

        rotated = session_client.post(bots_url(workspace, bot["id"], "tokens", old["id"], "rotate"))
        assert rotated.status_code == status.HTTP_201_CREATED, rotated.data
        assert rotated.data["token"] != old["token"]

        client = APIClient()
        client.credentials(HTTP_X_API_KEY=old["token"])
        assert client.get(url).status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        client.credentials(HTTP_X_API_KEY=rotated.data["token"])
        assert client.get(url).status_code == status.HTTP_200_OK

        revoked = session_client.delete(bots_url(workspace, bot["id"], "tokens", rotated.data["id"]))
        assert revoked.status_code == status.HTTP_204_NO_CONTENT
        assert not APIToken.objects.get(pk=rotated.data["id"]).is_active
        assert client.get(url).status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    @pytest.mark.django_db
    def test_switched_off_bot_cannot_use_its_token(self, session_client, workspace, project):
        bot = create(session_client, workspace, project)
        token = self.issue(session_client, workspace, bot)
        session_client.patch(bots_url(workspace, bot["id"]), {"is_active": False}, format="json")

        client = APIClient()
        client.credentials(HTTP_X_API_KEY=token["token"])
        response = client.get(f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/")
        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

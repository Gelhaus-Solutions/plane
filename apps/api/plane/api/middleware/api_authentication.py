# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone
from django.db.models import Q

# Third party imports
from rest_framework import authentication
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.permissions import SAFE_METHODS

# Module imports
from plane.db.models import AgentSession, APIToken
from plane.utils.agent_sessions import touch


class APIKeyAuthentication(authentication.BaseAuthentication):
    """
    Authentication with an API Key
    """

    www_authenticate_realm = "api"
    media_type = "application/json"
    auth_header_name = "X-Api-Key"

    def get_api_token(self, request):
        return request.headers.get(self.auth_header_name)

    def validate_api_token(self, token):
        api_token = self.get_valid_token(token)
        return (api_token.user, api_token.token)

    def get_valid_token(self, token):
        try:
            api_token = APIToken.objects.select_related("agent_session").get(
                Q(Q(expired_at__gt=timezone.now()) | Q(expired_at__isnull=True)),
                token=token,
                is_active=True,
                user__is_active=True,
            )
        except APIToken.DoesNotExist:
            raise AuthenticationFailed("Given API token is not valid")

        # save api token last used
        api_token.last_used = timezone.now()
        api_token.save(update_fields=["last_used"])
        return api_token

    def authenticate(self, request):
        token = self.get_api_token(request=request)
        if not token:
            return None

        # Validate the API token
        api_token = self.get_valid_token(token)
        if api_token.access == "read" and request.method not in SAFE_METHODS:
            raise PermissionDenied("This API token is read-only")
        # The rate limiter reads a bot token's own limit from here
        request.api_token = api_token
        # A session token attributes the request to its agent session; models and the activity task read it
        # from the Django request through crum
        session = api_token.agent_session
        if session is not None:
            if session.status == AgentSession.Status.ENDED:
                raise AuthenticationFailed("This agent session has ended")
            touch(session)
        request.agent_session = session
        getattr(request, "_request", request).agent_session = session
        return api_token.user, api_token.token

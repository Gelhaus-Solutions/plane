# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import filters
from rest_framework.exceptions import ValidationError

from .compiler import PQLContext, compile_pql
from .errors import PQLError


class PQLQueryError(ValidationError):
    """A 400 whose body keeps the error's position as a number, for editors to point at."""

    def __init__(self, error):
        super().__init__(error.message, code=error.code)
        self.detail = {"pql": error.as_dict()}


def apply_pql(queryset, text, context):
    """Filter a work item queryset by a PQL query; a bad query raises a 400 with its position."""
    try:
        q = compile_pql(text, context)
    except PQLError as error:
        raise PQLQueryError(error)
    return queryset if q is None else queryset.filter(q)


class PQLFilterBackend(filters.BaseFilterBackend):
    """Applies the ``pql`` query parameter to work item list endpoints.

    Sits next to ComplexFilterBackend: both may be given, and they combine with AND.
    """

    query_param = "pql"

    def filter_queryset(self, request, queryset, view):
        text = request.query_params.get(self.query_param)
        if not text or not text.strip():
            return queryset
        context = PQLContext.for_request(request, view.kwargs.get("slug"))
        return apply_pql(queryset, text, context)

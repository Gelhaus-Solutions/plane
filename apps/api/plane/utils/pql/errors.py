# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.


class PQLError(Exception):
    """A PQL query that cannot be parsed or compiled.

    ``position`` is the 0-based character offset in the query the error points at,
    so an editor can underline it. ``code`` is a stable machine-readable reason.
    """

    def __init__(self, message, position=None, code="invalid_query"):
        super().__init__(message)
        self.message = message
        self.position = position
        self.code = code

    def as_dict(self):
        return {"message": self.message, "code": self.code, "position": self.position}

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""MCP served by Plane itself (E05): Streamable HTTP, stateless JSON responses.

Tool names and argument shapes are the interface agents already use (D6). Every tool runs as calls to the
public API, in-process and as the caller, so permissions, PQL, rate limits and agent session attribution are
exactly those of ``/api/v1``.
"""

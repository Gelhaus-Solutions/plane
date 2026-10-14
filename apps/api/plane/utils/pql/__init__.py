# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# PQL, the Plane Query Language. The parser has no Django dependency; the compiler
# (plane.utils.pql.compiler) and the DRF filter backend (plane.utils.pql.backend)
# are imported from their modules so this package stays importable on its own.

from .errors import PQLError
from .parser import MAX_CONDITIONS, MAX_DEPTH, parse

__all__ = ["PQLError", "parse", "MAX_CONDITIONS", "MAX_DEPTH"]

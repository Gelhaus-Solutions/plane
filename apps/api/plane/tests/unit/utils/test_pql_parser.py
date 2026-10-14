# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""PQL parser: the shared conformance corpus plus the parser's limits."""

import json
import pathlib

import pytest

import plane.utils.pql
from plane.utils.pql import MAX_CONDITIONS, MAX_DEPTH, PQLError, parse

CORPUS = json.loads((pathlib.Path(plane.utils.pql.__file__).parent / "conformance" / "parse.json").read_text())


def _error(query):
    with pytest.raises(PQLError) as excinfo:
        parse(query)
    return excinfo.value


@pytest.mark.unit
class TestConformanceCorpus:
    @pytest.mark.parametrize("case", CORPUS["valid"], ids=[case["query"] for case in CORPUS["valid"]])
    def test_valid_query_parses_to_expected_tree(self, case):
        assert parse(case["query"]).to_dict() == case["tree"]

    @pytest.mark.parametrize("case", CORPUS["errors"], ids=[case["query"] for case in CORPUS["errors"]])
    def test_broken_query_reports_code_and_position(self, case):
        error = _error(case["query"])
        assert (error.code, error.position) == (case["code"], case["position"])

    @pytest.mark.parametrize("query", CORPUS["empty"])
    def test_empty_query_parses_to_none(self, query):
        assert parse(query) is None


@pytest.mark.unit
class TestParserRules:
    def test_keywords_are_case_insensitive(self):
        assert (
            parse('a = 1 and not b = 2 or c in ("x")').to_dict() == parse('a = 1 AND NOT b = 2 OR c IN ("x")').to_dict()
        )

    def test_condition_limit(self):
        at_limit = " AND ".join(['priority = "high"'] * MAX_CONDITIONS)
        assert parse(at_limit) is not None
        assert _error(at_limit + ' AND priority = "low"').code == "too_many_conditions"

    def test_nesting_limit(self):
        depth = MAX_DEPTH + 5
        assert _error("(" * depth + 'priority = "high"' + ")" * depth).code == "too_deep"

    def test_negation_chain_limit(self):
        assert _error("NOT " * (MAX_DEPTH + 5) + "isDraft()").code == "too_deep"

    def test_length_limit(self):
        assert _error('title ~ "' + "x" * 5000 + '"').code == "query_too_long"

    def test_error_position_points_at_the_offending_token(self):
        query = 'priority = "high" AND stateGroup = started'
        error = _error(query)
        assert query[error.position :] == "started"

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Recursive-descent parser for PQL.

Grammar (keywords are case-insensitive; precedence NOT > AND > OR)::

    query      := or_expr EOF
    or_expr    := and_expr ("OR" and_expr)*
    and_expr   := not_expr ("AND" not_expr)*
    not_expr   := "NOT" not_expr | primary
    primary    := "(" or_expr ")" | call | condition
    condition  := field ( OP value
                        | ["NOT"] "IN" (list | call)
                        | "IS" ["NOT"] ("NULL" | "EMPTY")
                        | ["NOT"] "BETWEEN" (value "AND" value | "(" value "," value ")") )
    field      := IDENT | "cf" "[" STRING "]"
    list       := "(" value ("," value)* ")"
    value      := STRING | NUMBER | "true" | "false" | call
    call       := IDENT "(" [value ("," value)*] ")"
    OP         := "=" | "!=" | ">" | ">=" | "<" | "<=" | "~"
"""

from . import lexer
from .errors import PQLError
from .nodes import And, Call, Comparison, Field, Literal, Not, Or, Predicate, Range, ValueList

MAX_CONDITIONS = 50
MAX_DEPTH = 32

KEYWORDS = frozenset({"AND", "OR", "NOT", "IN", "IS", "NULL", "EMPTY", "BETWEEN", "TRUE", "FALSE"})


def parse(text):
    """Parse a PQL query into a syntax tree. An empty query parses to ``None``."""
    if text is None or not text.strip():
        return None
    return _Parser(text).parse()


class _Parser:
    def __init__(self, text):
        self.tokens = lexer.tokenize(text)
        self.index = 0
        self.conditions = 0

    # Token helpers

    def peek(self, offset=0):
        return self.tokens[min(self.index + offset, len(self.tokens) - 1)]

    def advance(self):
        token = self.tokens[self.index]
        if token.kind != lexer.EOF:
            self.index += 1
        return token

    def is_keyword(self, token, word):
        return token.kind == lexer.IDENT and token.value.upper() == word

    def accept_keyword(self, word):
        if self.is_keyword(self.peek(), word):
            return self.advance()
        return None

    def expect(self, kind, description):
        token = self.peek()
        if token.kind != kind:
            raise PQLError(f"Expected {description}, found {_describe(token)}", token.position, "unexpected_token")
        return self.advance()

    def count_condition(self, position):
        self.conditions += 1
        if self.conditions > MAX_CONDITIONS:
            raise PQLError(
                f"A query can have at most {MAX_CONDITIONS} conditions",
                position,
                "too_many_conditions",
            )

    # Grammar

    def parse(self):
        node = self.parse_or(1)
        token = self.peek()
        if token.kind != lexer.EOF:
            if token.kind == lexer.RPAREN:
                raise PQLError("This closing parenthesis has no opening one", token.position, "unbalanced_parenthesis")
            raise PQLError(
                f"Expected AND, OR or the end of the query, found {_describe(token)}",
                token.position,
                "unexpected_token",
            )
        return node

    def parse_or(self, depth):
        if depth > MAX_DEPTH:
            raise PQLError(f"The query is nested deeper than {MAX_DEPTH} levels", self.peek().position, "too_deep")
        position = self.peek().position
        children = [self.parse_and(depth)]
        while self.accept_keyword("OR"):
            children.append(self.parse_and(depth))
        return children[0] if len(children) == 1 else Or(tuple(_flatten(children, Or)), position)

    def parse_and(self, depth):
        position = self.peek().position
        children = [self.parse_not(depth)]
        while self.accept_keyword("AND"):
            children.append(self.parse_not(depth))
        return children[0] if len(children) == 1 else And(tuple(_flatten(children, And)), position)

    def parse_not(self, depth):
        token = self.peek()
        if self.accept_keyword("NOT"):
            if depth + 1 > MAX_DEPTH:
                raise PQLError(f"The query is nested deeper than {MAX_DEPTH} levels", token.position, "too_deep")
            return Not(self.parse_not(depth + 1), token.position)
        return self.parse_primary(depth)

    def parse_primary(self, depth):
        token = self.peek()
        if token.kind == lexer.LPAREN:
            self.advance()
            if self.peek().kind == lexer.RPAREN:
                raise PQLError("Empty parentheses", token.position, "empty_group")
            node = self.parse_or(depth + 1)
            closing = self.peek()
            if closing.kind != lexer.RPAREN:
                raise PQLError(
                    f"Expected ')' to close the '(' at position {token.position}, found {_describe(closing)}",
                    closing.position,
                    "unbalanced_parenthesis",
                )
            self.advance()
            return node
        if token.kind == lexer.IDENT and token.value.upper() not in KEYWORDS:
            if self.peek(1).kind == lexer.LPAREN:
                call = self.parse_call()
                self.count_condition(token.position)
                return Predicate(call, token.position)
            return self.parse_condition()
        if token.kind == lexer.EOF:
            raise PQLError("The query ends where a condition was expected", token.position, "unexpected_end")
        raise PQLError(f"Expected a field or a function, found {_describe(token)}", token.position, "unexpected_token")

    def parse_field(self):
        token = self.advance()
        if token.value.lower() == "cf" and self.peek().kind == lexer.LBRACKET:
            self.advance()
            property_id = self.expect(lexer.STRING, 'a quoted property id, as in cf["<property id>"]')
            self.expect(lexer.RBRACKET, "']'")
            return Field("cf", property_id.value, token.position)
        return Field(token.value, None, token.position)

    def parse_condition(self):
        field = self.parse_field()
        self.count_condition(field.position)
        token = self.peek()

        if token.kind == lexer.OP:
            self.advance()
            return Comparison(field, token.value, self.parse_value(), field.position)

        if self.accept_keyword("NOT"):
            if self.accept_keyword("IN"):
                return Comparison(field, "not_in", self.parse_set(), field.position)
            if self.accept_keyword("BETWEEN"):
                return Comparison(field, "not_between", self.parse_range(), field.position)
            after = self.peek()
            raise PQLError(
                f"Expected IN or BETWEEN after NOT, found {_describe(after)}", after.position, "unexpected_token"
            )

        if self.accept_keyword("IN"):
            return Comparison(field, "in", self.parse_set(), field.position)

        if self.accept_keyword("BETWEEN"):
            return Comparison(field, "between", self.parse_range(), field.position)

        if self.accept_keyword("IS"):
            negated = self.accept_keyword("NOT") is not None
            if self.accept_keyword("NULL"):
                return Comparison(field, "is_not_null" if negated else "is_null", None, field.position)
            if self.accept_keyword("EMPTY"):
                return Comparison(field, "is_not_empty" if negated else "is_empty", None, field.position)
            after = self.peek()
            raise PQLError(
                f"Expected NULL or EMPTY after IS, found {_describe(after)}", after.position, "unexpected_token"
            )

        if token.kind == lexer.EOF:
            raise PQLError(f"'{field.name}' needs an operator and a value", token.position, "unexpected_end")
        raise PQLError(
            f"Expected an operator after '{field.name}', found {_describe(token)}",
            token.position,
            "unexpected_token",
        )

    def parse_set(self):
        token = self.peek()
        if token.kind == lexer.LPAREN:
            self.advance()
            if self.peek().kind == lexer.RPAREN:
                raise PQLError("IN needs at least one value", token.position, "empty_list")
            items = [self.parse_value()]
            while self.peek().kind == lexer.COMMA:
                self.advance()
                items.append(self.parse_value())
            self.expect(lexer.RPAREN, "',' or ')'")
            return ValueList(tuple(items), token.position)
        if token.kind == lexer.IDENT and self.peek(1).kind == lexer.LPAREN:
            return self.parse_call()
        raise PQLError(
            f"Expected a list in parentheses or a function after IN, found {_describe(token)}",
            token.position,
            "unexpected_token",
        )

    def parse_range(self):
        token = self.peek()
        if token.kind == lexer.LPAREN:
            self.advance()
            low = self.parse_value()
            self.expect(lexer.COMMA, "',' between the two bounds")
            high = self.parse_value()
            self.expect(lexer.RPAREN, "')'")
            return Range(low, high, token.position)
        low = self.parse_value()
        if not self.accept_keyword("AND"):
            after = self.peek()
            raise PQLError(
                f"Expected AND between the two bounds, found {_describe(after)}", after.position, "unexpected_token"
            )
        high = self.parse_value()
        return Range(low, high, token.position)

    def parse_value(self):
        token = self.peek()
        if token.kind == lexer.STRING:
            self.advance()
            return Literal(token.value, "string", token.position)
        if token.kind == lexer.NUMBER:
            self.advance()
            return Literal(token.value, "number", token.position)
        if token.kind == lexer.IDENT:
            upper = token.value.upper()
            if upper in ("TRUE", "FALSE"):
                self.advance()
                return Literal(upper == "TRUE", "boolean", token.position)
            if upper == "NULL":
                raise PQLError(
                    "Use IS NULL or IS NOT NULL to test for an empty value", token.position, "null_comparison"
                )
            if self.peek(1).kind == lexer.LPAREN and upper not in KEYWORDS:
                return self.parse_call()
            raise PQLError(
                f"Expected a value, found '{token.value}'. Quote text values, as in \"{token.value}\"",
                token.position,
                "unquoted_value",
            )
        if token.kind == lexer.EOF:
            raise PQLError("The query ends where a value was expected", token.position, "unexpected_end")
        raise PQLError(f"Expected a value, found {_describe(token)}", token.position, "unexpected_token")

    def parse_call(self):
        name = self.advance()
        self.expect(lexer.LPAREN, "'('")
        args = []
        if self.peek().kind != lexer.RPAREN:
            args.append(self.parse_value())
            while self.peek().kind == lexer.COMMA:
                self.advance()
                args.append(self.parse_value())
        self.expect(lexer.RPAREN, f"')' to close {name.value}(")
        return Call(name.value, tuple(args), name.position)


def _flatten(children, node_type):
    for child in children:
        if isinstance(child, node_type):
            yield from child.children
        else:
            yield child


def _describe(token):
    if token.kind == lexer.EOF:
        return "the end of the query"
    if token.kind == lexer.STRING:
        return f"the text {token.text}"
    return f"'{token.text}'"

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from collections import namedtuple

from .errors import PQLError

MAX_QUERY_LENGTH = 4000

STRING = "string"
NUMBER = "number"
IDENT = "ident"
OP = "op"
LPAREN = "lparen"
RPAREN = "rparen"
COMMA = "comma"
LBRACKET = "lbracket"
RBRACKET = "rbracket"
EOF = "eof"

Token = namedtuple("Token", ["kind", "value", "position", "text"])

_DIGITS = "0123456789"
_IDENT_START = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_"
_IDENT_BODY = _IDENT_START + _DIGITS
_ESCAPES = {"n": "\n", "t": "\t", "\\": "\\", '"': '"', "'": "'"}
_SINGLE = {"(": LPAREN, ")": RPAREN, ",": COMMA, "[": LBRACKET, "]": RBRACKET}


def tokenize(text):
    """Split a PQL query into tokens. Keywords come out as IDENT tokens."""
    if len(text) > MAX_QUERY_LENGTH:
        raise PQLError(f"The query is longer than {MAX_QUERY_LENGTH} characters", 0, "query_too_long")

    tokens = []
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c.isspace():
            i += 1
            continue
        start = i

        if c in "\"'":
            i += 1
            chars = []
            while True:
                if i >= n:
                    raise PQLError("This string is never closed", start, "unterminated_string")
                ch = text[i]
                if ch == "\\" and i + 1 < n:
                    chars.append(_ESCAPES.get(text[i + 1], text[i + 1]))
                    i += 2
                    continue
                if ch == c:
                    i += 1
                    break
                chars.append(ch)
                i += 1
            tokens.append(Token(STRING, "".join(chars), start, text[start:i]))
            continue

        if c in _DIGITS or (c == "-" and i + 1 < n and text[i + 1] in _DIGITS):
            i += 1
            while i < n and text[i] in _DIGITS:
                i += 1
            if i + 1 < n and text[i] == "." and text[i + 1] in _DIGITS:
                i += 1
                while i < n and text[i] in _DIGITS:
                    i += 1
                value = float(text[start:i])
            else:
                value = int(text[start:i])
            tokens.append(Token(NUMBER, value, start, text[start:i]))
            continue

        if c in _IDENT_START:
            while i < n and text[i] in _IDENT_BODY:
                i += 1
            tokens.append(Token(IDENT, text[start:i], start, text[start:i]))
            continue

        pair = text[i : i + 2]
        if pair in ("!=", ">=", "<="):
            tokens.append(Token(OP, pair, start, pair))
            i += 2
            continue
        if c in "=<>~":
            tokens.append(Token(OP, c, start, c))
            i += 1
            continue
        if c in _SINGLE:
            tokens.append(Token(_SINGLE[c], c, start, c))
            i += 1
            continue

        raise PQLError(f"Unexpected character '{c}'", start, "unexpected_character")

    tokens.append(Token(EOF, None, n, ""))
    return tokens

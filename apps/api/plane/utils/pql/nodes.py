# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The PQL syntax tree.

``to_dict()`` gives the canonical form the conformance corpus is written in. It
leaves out positions, which only matter for error messages.
"""

from collections import namedtuple


class Field(namedtuple("Field", ["name", "property_id", "position"])):
    def to_dict(self):
        if self.property_id is not None:
            return {"type": "field", "name": self.name, "property": self.property_id}
        return {"type": "field", "name": self.name}


class Literal(namedtuple("Literal", ["value", "kind", "position"])):
    def to_dict(self):
        return {"type": "literal", "kind": self.kind, "value": self.value}


class Call(namedtuple("Call", ["name", "args", "position"])):
    def to_dict(self):
        return {"type": "call", "name": self.name, "args": [arg.to_dict() for arg in self.args]}


class ValueList(namedtuple("ValueList", ["items", "position"])):
    def to_dict(self):
        return {"type": "list", "items": [item.to_dict() for item in self.items]}


class Range(namedtuple("Range", ["low", "high", "position"])):
    def to_dict(self):
        return {"type": "range", "low": self.low.to_dict(), "high": self.high.to_dict()}


class Comparison(namedtuple("Comparison", ["field", "operator", "value", "position"])):
    def to_dict(self):
        result = {"type": "comparison", "field": self.field.to_dict(), "operator": self.operator}
        if self.value is not None:
            result["value"] = self.value.to_dict()
        return result


class Predicate(namedtuple("Predicate", ["call", "position"])):
    def to_dict(self):
        return {"type": "predicate", "call": self.call.to_dict()}


class And(namedtuple("And", ["children", "position"])):
    def to_dict(self):
        return {"type": "and", "children": [child.to_dict() for child in self.children]}


class Or(namedtuple("Or", ["children", "position"])):
    def to_dict(self):
        return {"type": "or", "children": [child.to_dict() for child in self.children]}


class Not(namedtuple("Not", ["child", "position"])):
    def to_dict(self):
        return {"type": "not", "child": self.child.to_dict()}

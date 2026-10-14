# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
"""Tests for plane-mcp-bridge. Run: python3 -m unittest discover -s tools/mcp-bridge"""

import importlib.machinery
import importlib.util
import io
import json
import os
import tempfile
import unittest
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
_loader = importlib.machinery.SourceFileLoader("plane_mcp_bridge", os.path.join(HERE, "plane-mcp-bridge"))
_spec = importlib.util.spec_from_loader(_loader.name, _loader)
bridge = importlib.util.module_from_spec(_spec)
_loader.exec_module(bridge)


class Response:
    def __init__(self, status, body):
        self.status = status
        self._body = b"" if body is None else json.dumps(body).encode()

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakePlane:
    """Answers like Plane: registration, heartbeat, end and /mcp. ``mcp`` decides each /mcp answer."""

    def __init__(self, register_status=201, mcp=None):
        self.calls = []
        self.register_status = register_status
        self.registrations = 0
        self.mcp = mcp or (lambda auth, body: (200, {"jsonrpc": "2.0", "id": body.get("id"), "result": {}}))

    def __call__(self, req, timeout=None):
        body = json.loads(req.data) if req.data else None
        auth = req.get_header("Authorization") or req.get_header("X-api-key")
        self.calls.append((req.get_method(), req.full_url, auth, body))
        url = req.full_url
        if url.endswith("/agent-sessions/"):
            self.registrations += 1
            if self.register_status != 201:
                return self.fail(req, self.register_status, {"error": "nope"})
            return Response(201, {"id": "s1", "token": "session-%d" % self.registrations, "name": "plane@abc"})
        if "/heartbeat/" in url or url.endswith("/end/"):
            return Response(200, {"status": "live"})
        status, answer = self.mcp(auth, body)
        if status >= 400:
            return self.fail(req, status, answer)
        return Response(status, answer)

    @staticmethod
    def fail(req, status, body):
        raise urllib.error.HTTPError(req.full_url, status, "x", {}, io.BytesIO(json.dumps(body).encode()))


def run(fake, lines):
    out = io.StringIO()
    plane = bridge.Plane("https://plane.test/", "ws", "bot-key", opener=fake)
    bridge.Bridge(plane, {"harness": "claude-code", "external_id": "abc"}, out=out).run(
        io.StringIO("".join(json.dumps(line) + "\n" for line in lines))
    )
    return [json.loads(x) for x in out.getvalue().splitlines()]


class IdentityTest(unittest.TestCase):
    def test_claude_code(self):
        env = {
            "CLAUDE_CODE_SESSION_ID": "6995b6f5-28a7",
            "CLAUDE_PROJECT_DIR": HERE,
            "AI_AGENT": "claude-code_2-1-296_harness",
        }
        who = bridge.identity(env)
        self.assertEqual(
            (who["harness"], who["external_id"], who["primary_dir"]), ("claude-code", "6995b6f5-28a7", HERE)
        )
        self.assertEqual(who["harness_version"], "2.1.296")
        self.assertTrue(who["host"])

    def test_elsewhere(self):
        who = bridge.identity({}, cwd="/tmp")
        self.assertEqual(who["harness"], "other")
        self.assertIn("-pid-", who["external_id"])

    def test_key_from_file(self):
        with tempfile.NamedTemporaryFile("w", delete=False) as handle:
            handle.write("plane_api_x\n")
        self.addCleanup(os.remove, handle.name)
        self.assertEqual(bridge.read_key({"PLANE_BOT_KEY_FILE": handle.name}), "plane_api_x")
        self.assertEqual(bridge.read_key({"PLANE_BOT_KEY": " k "}), "k")


class BridgeTest(unittest.TestCase):
    def test_registers_forwards_with_the_session_token_and_ends(self):
        fake = FakePlane(
            mcp=lambda auth, body: (202, None)
            if "id" not in body
            else (200, {"jsonrpc": "2.0", "id": body["id"], "result": {"ok": 1}})
        )
        out = run(
            fake,
            [
                {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
                {"jsonrpc": "2.0", "method": "notifications/initialized"},
            ],
        )
        self.assertEqual(out, [{"jsonrpc": "2.0", "id": 1, "result": {"ok": 1}}])
        register, *mcp_calls, end = fake.calls
        self.assertEqual(
            (register[1], register[2]), ("https://plane.test/api/v1/workspaces/ws/agent-sessions/", "bot-key")
        )
        self.assertTrue(
            all(
                call[1] == "https://plane.test/mcp?workspace=ws" and call[2] == "Bearer session-1" for call in mcp_calls
            )
        )
        self.assertEqual(
            (end[1], end[2], end[3]),
            ("https://plane.test/api/v1/workspaces/ws/agent-sessions/s1/end/", "session-1", {"reason": "exit"}),
        )

    def test_a_dead_session_token_registers_again(self):
        def mcp(auth, body):
            if auth == "Bearer session-1":
                return 401, {"detail": "ended"}
            return 200, {"jsonrpc": "2.0", "id": body["id"], "result": {}}

        fake = FakePlane(mcp=mcp)
        out = run(fake, [{"jsonrpc": "2.0", "id": 7, "method": "ping"}])
        self.assertEqual(out, [{"jsonrpc": "2.0", "id": 7, "result": {}}])
        self.assertEqual(fake.registrations, 2)

    def test_without_a_session_it_acts_as_the_bot(self):
        fake = FakePlane(register_status=403)
        run(fake, [{"jsonrpc": "2.0", "id": 1, "method": "ping"}])
        self.assertEqual(fake.calls[1][2], "Bearer bot-key")
        self.assertFalse(any(call[1].endswith("/end/") for call in fake.calls))

    def test_a_failure_still_answers_the_request(self):
        fake = FakePlane(mcp=lambda auth, body: (502, {"detail": "bad gateway"}))
        out = run(
            fake, [{"jsonrpc": "2.0", "id": 3, "method": "tools/list"}, {"jsonrpc": "2.0", "method": "notifications/x"}]
        )
        self.assertEqual(out, [{"jsonrpc": "2.0", "id": 3, "error": {"code": -32603, "message": "Plane answered 502"}}])

    def test_json_rpc_errors_from_plane_pass_through(self):
        fake = FakePlane(
            mcp=lambda auth, body: (
                400,
                {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}},
            )
        )
        out = run(fake, [{"jsonrpc": "2.0", "id": 4, "method": "ping"}])
        self.assertEqual(out[0]["error"]["code"], -32700)

    def test_garbage_on_stdin(self):
        out = io.StringIO()
        plane = bridge.Plane("https://plane.test", "ws", "k", opener=FakePlane())
        bridge.Bridge(plane, {"harness": "other", "external_id": "x"}, out=out).run(io.StringIO("not json\n"))
        self.assertEqual(json.loads(out.getvalue())["error"]["code"], -32700)


if __name__ == "__main__":
    unittest.main()

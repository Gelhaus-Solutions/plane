# plane-mcp-bridge

Connects an agent harness's stdio MCP client to Plane's `/mcp` as one agent session (roadmap E28). The harness
starts it as its `plane` MCP server; it registers a session with the harness bot's key and forwards every MCP
message to `/mcp` with the session's own token, so every write in Plane names the session that made it. It beats
every five minutes and ends the session when the harness closes its input. If registration fails, it acts as the bot
itself, so the tools keep working.

Standard-library Python 3.9 or later; nothing to install.

## Claude Code

Create the harness bot (one per harness, for example "Claude") in the workspace, add it to the projects it works in,
issue it a key, and store the key in a file only you can read, such as `~/.config/plane/claude-bot-key`. Then point
the `plane` MCP server at the bridge:

```json
"plane": {
  "type": "stdio",
  "command": "python3",
  "args": ["/path/to/plane/tools/mcp-bridge/plane-mcp-bridge"],
  "env": {
    "PLANE_BASE_URL": "https://plane.example.com",
    "PLANE_WORKSPACE": "your-workspace",
    "PLANE_BOT_KEY_FILE": "~/.config/plane/claude-bot-key"
  }
}
```

Claude Code gives the bridge `CLAUDE_CODE_SESSION_ID`, `CLAUDE_PROJECT_DIR` and `AI_AGENT`, so the session is
registered with its id, its project directory, the host and git branch, and the Claude Code version. A resumed
session reopens the same record.

## Tests

```
python3 -m unittest discover -s tools/mcp-bridge
```

Nothing runs them in CI.

---
name: brain-visualizer
description: Render an interactive inline Brain Visualizer Generative UI widget in the chat stream and open the full Antigravity Brain Visualizer side-pane UI extension. Use whenever the user types /brain-visualizer, asks to inspect or visualize a conversation's brain transcript, token usage, tool call timeline, subagent hierarchy, or AI trajectory analysis.
license: Apache-2.0
---

# Antigravity Brain Visualizer Skill

When the user invokes `/brain-visualizer` or asks to visualize an Antigravity conversation's brain transcript, token metrics, tool calls, or trajectory analysis, provide **both**:
1. An **inline Generative UI widget** (`<agent-embed>`) directly in the chat stream showing a 3-tab interactive summary ("Overview & Tokens", "Timeline & Sequences", "AI Analysis").
2. A **one-click sidecar pill** (`[Brain Visualizer](sidecar://agy-brain-viz/visualizer/)`) to open the full dockable Brain Visualizer panel in the Antigravity side pane.

---

## Step 1: Identify the Target Conversation ID

- By default, use the current session's `Conversation ID` from `<user_information>`.
- If the user specified a particular conversation ID or asked to search for a recent session, use that conversation ID (you can list conversations via `GET /api/brain/conversations` on the backend port).

---

## Step 2: Fetch the Self-Contained Generative UI Widget HTML

The Brain Visualizer Micronaut backend exposes a dedicated endpoint that generates a self-contained `/generative_ui` HTML document for any conversation:

```
GET http://127.0.0.1:<PORT>/api/brain/conversations/<CONVERSATION_ID>/widget
```

### Discovering `<PORT>` (or running a one-shot query)

Run a quick shell command to fetch the widget HTML from the active sidecar backend (or spawn the bundled native binary ephemerally if the sidecar panel has not been opened yet in this session):

```bash
CONV_ID="<CONVERSATION_ID>"
OUT_FILE="<appDataDir>/brain/<CURRENT_CONVERSATION_ID>/scratch/widget.html"
mkdir -p "$(dirname "$OUT_FILE")"

PORT_FILE="$HOME/.gemini/config/plugins/agy-brain-viz/sidecars/visualizer/.backend_port"
BIN_FILE="$HOME/.gemini/config/plugins/agy-brain-viz/sidecars/visualizer/bin/agy-brain-viz"

if [ ! -f "$BIN_FILE" ] && [ -f "./sidecars/visualizer/bin/agy-brain-viz" ]; then
  BIN_FILE="./sidecars/visualizer/bin/agy-brain-viz"
fi

FETCHED=0
if [ -f "$PORT_FILE" ]; then
  PORT=$(cat "$PORT_FILE" | tr -d '[:space:]')
  if curl -sf "http://127.0.0.1:${PORT}/api/brain/conversations/${CONV_ID}/widget" -o "$OUT_FILE"; then
    FETCHED=1
  fi
fi

if [ "$FETCHED" -eq 0 ]; then
  if [ ! -x "$BIN_FILE" ]; then
    echo "ERROR: Brain Visualizer native binary not found at $BIN_FILE" >&2
    exit 1
  fi
  TEMP_PORT=18942
  "$BIN_FILE" -Dmicronaut.server.port=$TEMP_PORT >/dev/null 2>&1 &
  BG_PID=$!
  trap "kill $BG_PID 2>/dev/null || true" EXIT
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:${TEMP_PORT}/api/brain/conversations/${CONV_ID}/widget" -o "$OUT_FILE"; then
      FETCHED=1
      break
    fi
    sleep 0.2
  done
  kill $BG_PID 2>/dev/null || true
fi

if [ "$FETCHED" -eq 0 ]; then
  echo "ERROR: Failed to fetch widget HTML for conversation $CONV_ID" >&2
  exit 1
fi
```

---

## Step 3: Write the Artifact & Embed Inline + Sidecar Pill

1. Read the generated HTML from `<appDataDir>/brain/<CURRENT_CONVERSATION_ID>/scratch/widget.html` (or write it directly) into the artifact directory at:
   `<appDataDir>/brain/<CURRENT_CONVERSATION_ID>/brain-widget.html`
   using `write_to_file` with:
   - `ArtifactMetadata.UserFacing: true`
   - `ArtifactMetadata.RequestFeedback: false`
   - `ArtifactMetadata.Summary`: `"Interactive Brain Visualizer overview widget for conversation <CONVERSATION_ID>"`

2. In your response to the user, embed the interactive widget and the sidecar navigation pill:

```markdown
<agent-embed src="file:///<appDataDir>/brain/<CURRENT_CONVERSATION_ID>/brain-widget.html"></agent-embed>

Open the full interactive timeline, subagent graph, and AI Session Assistant in the side panel: [Brain Visualizer](sidecar://agy-brain-viz/visualizer/)
```

> [!IMPORTANT]
> - Never use `[Brain Visualizer](file:///...)` for the sidecar link; always use the `sidecar://agy-brain-viz/visualizer/` scheme so Antigravity renders the native side-pane toggle pill.
> - Keep the prose around the widget concise — the widget itself displays the metrics, token distribution, step sequence, and AI analysis.

<p align="center">
  <img src="logo.png" alt="Antigravity Brain Visualizer Logo" width="800"/>
</p>

# Antigravity Brain Visualizer

<p align="center">
  <img src="screenshot.png" alt="Antigravity Brain Visualizer Screenshot" width="800"/>
</p>

## What is this project?
The Antigravity Brain Visualizer is a dedicated companion tool for developers working with Antigravity AI agents. Antigravity agents construct complex reasoning chains, dispatch background tasks, spawn subagents, generate persistent artifacts, take workspace snapshots, and execute system commands over long-running sessions. The agent records all of these interactions in detailed JSONL transcript files, Git snapshot repositories, and artifact metadata inside the agent's "brain" directory. 

This visualizer parses those raw brain directories and renders them in a scannable and interactive web interface, allowing developers to inspect the agent's exact decision-making process, token economics, generated artifacts, and code snapshot diffs.

## How it works
The visualizer automatically scans your local filesystem for agent session brains across supported Antigravity flavors (`antigravity-cli`, `antigravity-ide`, `jetski`). When you select a conversation session from the sidebar, the application parses the JSONL steps and organizes the execution flow into interactive sequences, artifact collections, snapshot Git histories, and subagent communications. 

Additionally, it leverages Google's Gemini LLMs (`gemini-3.8-flash`) to automatically generate comprehensive executive summaries of long conversations—distilling thousands of lines of transcript into the core user intent, execution flow, tool actions, detected issues, recommendations, and the final outcome of the session.

> [!NOTE]
> **Filesystem Modifications:** When you generate an AI summary for a session, the visualizer caches the result by creating a `summary.json` file and a `short_title.txt` file directly inside that specific agent's `.gemini/brain` directory. This prevents redundant LLM calls and speeds up future loads.

### Key Features

**Session Management**
*   **Multi-Flavor Brain Discovery**: Scans and loads agent sessions across `.gemini/antigravity`, `.gemini/antigravity-cli`, `.gemini/antigravity-ide`, and `.gemini/jetski`.
*   **Search & Filtering**: Includes instant text search to find sessions by query, and flavor selector dropdowns.
*   **Sorting & Refreshing**: Toggle controls to sort sessions chronologically and a refresh button to detect newly spawned sessions.
*   **Session Metadata**: Hovering over a session displays an overview popover containing metadata such as step counts, timestamps, and session IDs.
*   **Adjustable Layout**: The sidebar features a drag handle to resize its width, a toggle button, and a global keyboard shortcut (`Cmd+B` / `Ctrl+B`) to collapse or expand it.

**Token & Cost Estimation**
*   **Heuristic Token Estimation**: Since Antigravity brain transcripts do not record native token counters, the visualizer calculates estimated token consumption using standard LLM character heuristics (~4 characters per token for text, JSON, and code) partitioned into:
    *   **Input Tokens**: User queries, system prompt contexts, and tool execution outputs.
    *   **Thinking Tokens**: Internal Gemini reasoning chains captured in `step.thinking`.
    *   **Output Tokens**: Model responses (`PLANNER_RESPONSE`, `MESSAGE`) and serialized tool call arguments.
*   **Interactive Token Breakdown**: An expandable distribution chart in the stats panel displaying the proportional split between Input (cyan), Thinking (purple), and Output (green) tokens.
*   **Estimated Financial Cost**: Projects overall session costs based on Gemini 3.8 Flash pricing tiers ($0.10 / 1M input tokens, $0.40 / 1M output & thinking tokens).
*   **Backend Chunking Estimation**: In `AnalysisController`, uses LangChain4j's `TokenCountEstimator` (`GoogleGenAiTokenCountEstimator`) to calculate precise token counts, ensuring multi-turn transcripts are safely divided into token-bounded chunks prior to LLM analysis.

**Tabbed Session Inspection**
*   **📜 Transcript Tab**: The full chronological sequence of user requests, model reasoning, tool invocations, and system actions.
*   **📦 Artifacts & Snapshots Tab**: Dedicated explorer for agent-generated Markdown artifacts (with metadata chips for summary, user feedback requests, and visibility) alongside a full Git commit history of workspace snapshots taken during the session.
*   **💬 Subagent Messages Tab**: Dedicated panel displaying inter-agent messaging and delegation payloads (`send_message`), showing sender, recipient, and formatted conversation context.

**Integrated Snapshot Diff Viewer**
*   **Git Diff Inspection**: Inspect exact file changes, line additions, and deletions captured in agent snapshot commits.
*   **Side-by-Side & Unified Modes**: Toggle between **Split (Side-by-Side)** and **Unified (Line-by-Line)** diff views with a single click.

**Timeline & Navigation**
*   **Proportional Timeline**: Displays a visual bar representing the elapsed wall-clock duration of the session, mapping active sequences and idle gaps proportionally.
*   **Viewport Tracking**: A translucent indicator moves across the timeline to highlight the exact time span of the transcript steps currently visible on the screen.
*   **Interactive Scrubbing**: Clicking the timeline auto-scrolls the transcript to the corresponding chronological point.
*   **Duration Metrics**: Hovering over timeline segments displays start/end timestamps and elapsed durations.

**Transcript Rendering & Formatting**
*   **Sequence Grouping**: Raw JSONL steps are grouped into collapsible sequences triggered by user inputs, displaying the calculated wall-clock duration of each sequence.
*   **XML Prompt Unwrapping**: Automatically unwraps agent prompt-framing tags (`<original_task>`, `<task>`, `<context>`) in user queries so Markdown headings, lists, and bold text render cleanly without CommonMark raw-HTML blocking.
*   **Step Formatting**: Steps are formatted as individual UI cards depending on their actor (User, Model, Tool, System), with syntax highlighting for code and tool outputs.

**Content Filtering & Search**
*   **Step Filtering**: Toggles to show or hide specific step types (User Queries, Tool Calls, Errors, Model Responses). Empty sequence containers are automatically hidden when filters are applied.
*   **In-Transcript Search**: A find-in-page text search utility to navigate through text matches within the active transcript.

**AI Summarization & Interactive Assistant**
*   **Gemini 3.8 Flash Integration**: Powered by Google's `gemini-3.8-flash` via LangChain4j for fast, high-quality session analysis with strict schema enforcement via Jackson.
*   **Session Summaries**: Recursively chunks, analyzes, and consolidates transcripts to produce executive summaries, key decisions, issues encountered, and actionable recommendations.
*   **Interactive Session Assistant**: A sliding right drawer (`Cmd+K` / `Ctrl+K`) to chat with an AI assistant about the active session, specific step failures, or sequence execution details.
*   **Contextual Triggers & Scope Chips**: Click `💬 Ask Chat` on sequence headers, error step cards, or the summary section to automatically pin focused context chips (`📍 Context: Sequence #3`).
*   **Agent Skill Generator**: Generates custom agent guardrails/skills strictly adhering to the [Agent Skills Specification](https://agentskills.io/specification) with YAML frontmatter and one-click `📋 Copy Skill Template` buttons.
*   **Chat History Management**: Includes a `🗑️ Clear` button to clear drawer history, with automatic resets when switching between sessions.

**Keyboard Shortcuts**
*   `Cmd+B` / `Ctrl+B`: Toggle left session selection sidebar (show / hide).
*   `Cmd+Shift+A` / `Ctrl+Shift+A`: Collapse or expand the Conversation Analysis panel.
*   `Cmd+K` / `Ctrl+K`: Open or close the Session Assistant chat drawer.

## Technology Stack & Implementation
This project prioritizes a lightweight, high-performance, and maintainable architecture:

- **Backend**: Built with [Micronaut](https://micronaut.io/) (Java). It serves the frontend static assets and provides native REST APIs to securely read and parse local filesystem transcripts, Git snapshot repos, and artifact files.
- **AI Integration**: Powered by [LangChain4j](https://github.com/langchain4j/langchain4j) connecting directly to [Google Gemini models](https://docs.langchain4j.dev/integrations/language-models/google-genai/) (`gemini-3.8-flash`). It uses chunking and recursive consolidation for session summarization, alongside contextual session Q&A and skill generation.
- **Diff Viewer**: Integrated with [diff2html](https://diff2html.xyz/) custom-styled with dark-mode overrides, synchronized sticky gutters, and split/unified toggling.
- **Frontend**: A zero-build Vanilla JavaScript, HTML, and CSS single-page application. It avoids heavy framework overhead, relying instead on standard browser DOM APIs, customized CSS grid/flexbox layouts, and minimal dependencies (`marked.js` and `highlight.js`) for Markdown rendering and code syntax highlighting.

## Installation

The easiest way to install and use the Antigravity Brain Visualizer is to download the pre-compiled native executable for your operating system.

1. Navigate to the [Releases](https://github.com/glaforge/antigravity-brain-visualizer/releases) section of this repository.
2. Download the appropriate `.zip` asset for your OS (macOS, Linux, or Windows).
3. Unzip the downloaded file.
4. Make the extracted file executable if necessary (e.g., `chmod +x agy-brain-viz`).
5. Run it directly from your terminal.
6. Open your web browser and navigate to [http://localhost:8080](http://localhost:8080) to view the interface.

Alternatively, you can clone this repository and run or build it locally from source.

## Running the Application (from Sources)

To run the application locally, you must provide your Gemini API key:

```bash
export GEMINI_API_KEY="your-api-key-here"
./gradlew run
```

Once the server starts, open your web browser and navigate to [http://localhost:8080](http://localhost:8080) to interact with the visualizer.

## Configuration & Customization

The visualizer can be configured using environment variables, system properties, or command-line flags.

| Setting | Environment Variable | System Property / Flag | Default Value | Description |
|---|---|---|---|---|
| **API Key** | `GEMINI_API_KEY` | `-Dgemini.api.key` | *None (Required)* | Your Google Gemini API key. |
| **Server Port** | `MICRONAUT_SERVER_PORT` | `-Dmicronaut.server.port` / `--micronaut.server.port` | `8080` | HTTP port for the web interface. |
| **Gemini Model** | `GEMINI_MODEL` | `-Dgemini.model` / `--gemini.model` | `gemini-3.8-flash` | Gemini model used for session analysis & chat assistant. |
| **Verbose Debug Logging** | `GEMINI_DEBUG` / `GEMINI_VERBOSE` | `-Dgemini.debug` / `--gemini.debug` | `false` | Enable detailed LLM request & response prompt logging. |

### Configuration Examples

**Via Environment Variables:**
```bash
export GEMINI_API_KEY="your-api-key-here"
export MICRONAUT_SERVER_PORT=9090
export GEMINI_MODEL="gemini-3.8-flash"
./gradlew run
```

**Via Native Executable or System Properties:**
```bash
export GEMINI_API_KEY="your-api-key-here"
./agy-brain-viz -Dmicronaut.server.port=9090 -Dgemini.model=gemini-3.8-flash
```

**Via Command-Line Arguments:**
```bash
./agy-brain-viz --micronaut.server.port=9090 --gemini.model=gemini-3.8-flash
```

## Building a Native Executable

Because this project is built with Micronaut, you can compile it into a highly-optimized, standalone native executable using GraalVM. 

1. Ensure you have [GraalVM](https://www.graalvm.org/) installed and set up as your active Java environment.
2. Run the native compilation task:

```bash
./gradlew nativeCompile
```

This generates a native executable in the `build/native/nativeCompile/` directory. You can run it directly:

```bash
export GEMINI_API_KEY="your-api-key-here"
./build/native/nativeCompile/agy-brain-viz
```

*(Note: Start-up times will be practically instantaneous compared to the standard JVM version).*

## License
This project is licensed under the Apache 2.0 License. See the [LICENSE](../LICENSE) file for details.

## Disclaimer
This is not an officially supported Google product.

# ClawLink Visual GUI

A commercial-grade web interface for the ClawLink agent management system. Built with modern dark theme aesthetics inspired by Linear, Cursor AI, and TRAE editor.

## Features

- **Solo Mode**: One-on-one conversations with individual agents
- **Group Mode**: Multi-agent topic-based discussions with @mention support
- **Teaching Controls**: Configure teaching mode, strictness level, and export memory
- **Score Tracking**: Real-time SVG gauge, rubric breakdown, iteration counter
- **File Locks**: View and manage file locks across agents
- **Memory Browser**: Search and browse agent memories
- **Pairing System**: Connect agents via pairing codes (XXXX-XXXX format)
- **Queue Indicator**: Visual feedback when messages are queued
- **WebSocket**: Real-time messaging with auto-reconnect

## Quick Start

### Prerequisites

- Python 3.10+
- A running ClawLink Router (default: `http://localhost:8420`)

### Install

```bash
pip install aiohttp
```

Or using the project file:

```bash
pip install .
```

### Run

```bash
python server.py
```

The GUI will be available at `http://localhost:8421`.

### Configuration

| Environment Variable | Default                  | Description            |
|----------------------|--------------------------|------------------------|
| `ROUTER_URL`         | `http://localhost:8420`  | ClawLink Router URL    |
| `PORT`               | `8421`                   | GUI server port        |

## Architecture

```
visual-clawlink/
  server.py              # aiohttp server (static files + API/WS proxy)
  pyproject.toml         # Python project metadata
  templates/
    index.html           # Main HTML template
  static/
    css/
      style.css          # Dark theme stylesheet
    js/
      app.js             # Application logic (OOP, modular classes)
```

### JavaScript Classes

| Class                  | Responsibility                                      |
|------------------------|-----------------------------------------------------|
| `RouterAPI`            | REST calls to router via /api/ proxy                |
| `WSManager`            | WebSocket with auto-reconnect and event emitter     |
| `ChatRenderer`         | Message rendering, bubbles, score cards, queue       |
| `ConversationManager`  | Multi-conversation state, tab reordering             |
| `AgentPanel`           | Left sidebar conversation tabs                       |
| `GroupChatManager`     | Group topics, @mention autocomplete, filtering       |
| `ScoringPanel`         | SVG gauge, rubric bars, iteration display            |
| `FileLockViewer`       | Lock list and release controls                       |
| `StrictnessControl`    | Range slider with debounced save                     |
| `PairingDialog`        | Modal with auto-formatted code input                 |
| `App`                  | Main controller, event wiring, lifecycle             |

## Usage

1. Start the ClawLink Router
2. Start this GUI server
3. Open `http://localhost:8421` in your browser
4. Click "New Conversation" and enter an agent pairing code
5. Start chatting, teaching, and scoring

## License

Part of the ClawLink project.

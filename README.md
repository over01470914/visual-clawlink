# visual-clawlink

Standalone Web GUI for end users on local PC, connecting to ClawLink Router.

## Deployment Role

Use this module when you need a browser-based control panel for:

1. agent pairing and list view
2. solo/group chat interaction
3. strictness and score visibility
4. queue and lock observation

## Independent Runtime Contract

This GUI has one required external dependency: Router endpoint.

- Input dependency: `ROUTER_URL`
- Local service port: `PORT` (default `8421`)
- No router IP is hardcoded in source
- Browser only talks to this GUI service; GUI proxies to Router

## Install

```bash
cd visual-clawlink
pip install -e .
```

## Run

```bash
python server.py
```

Open `http://localhost:8421`.

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `ROUTER_URL` | `http://localhost:8420` | Router base URL |
| `PORT` | `8421` | GUI listen port |

Example:

```bash
ROUTER_URL=http://10.0.0.12:8420 PORT=8421 python server.py
```

## Runtime Topology

```text
Browser -> visual-clawlink (8421) -> Router (configured by ROUTER_URL)
```

## Routes In This Service

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | serve UI page |
| * | `/api/{path:.*}` | proxy HTTP requests to Router |
| GET | `/ws/{path:.*}` | proxy WebSocket requests to Router |
| GET | `/static/*` | static assets |

## Extracted Essentials From Global Docs

### UI-to-System Topology

```text
User -> Browser UI -> visual-clawlink proxy -> Router -> Agent nodes
```

### Real-Time Event Expectations

The GUI should be prepared to render these categories of router events:

- agent online/offline updates
- session lifecycle updates
- new message and queue updates
- score/strictness updates
- lock acquisition/release updates

### Group Mention Behavior

In group chat, only mentioned agents are expected to respond immediately; other agents may ignore unless addressed.

## Anti-Hardcoding Checklist

- Never hardcode router host in frontend code.
- Change backend target only through `ROUTER_URL`.
- Keep GUI port configurable for local conflicts.

## License

Part of ClawLink project (MIT).

---

## 中文说明

visual-clawlink 是面向终端用户的独立 Web 可视化界面，通常部署在用户 PC 上，并连接 ClawLink Router。

### 组件职责

用于提供：

1. Agent 配对与列表展示
2. 单聊 / 群聊交互
3. strictness 与评分可视化
4. 队列与锁状态观察

### 独立运行契约

本 GUI 只依赖一个外部输入：Router 地址。

- 依赖项：`ROUTER_URL`
- 本地端口：`PORT`（默认 `8421`）
- 源码中不写死 Router IP
- 浏览器只连接 GUI，GUI 负责代理到 Router

### 安装

```bash
cd visual-clawlink
pip install -e .
```

### 运行

```bash
python server.py
```

访问：`http://localhost:8421`

### 配置

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `ROUTER_URL` | `http://localhost:8420` | Router 地址 |
| `PORT` | `8421` | GUI 监听端口 |

示例：

```bash
ROUTER_URL=http://10.0.0.12:8420 PORT=8421 python server.py
```

### 从全局 docs 提炼的界面交互要点

#### 系统拓扑

```text
用户 -> 浏览器界面 -> visual-clawlink 代理 -> Router -> 各 Agent 节点
```

#### 实时事件渲染要求

GUI 需要覆盖以下事件类型：

- Agent 上下线
- Session 生命周期变化
- 消息与队列更新
- 评分和 strictness 更新
- 文件锁加锁/解锁更新

#### 群聊 @mention 规则

群聊中，被 @ 的 Agent 应优先响应；未被 @ 的 Agent 可以不立即响应。

### 防硬编码清单

- 前端和服务端均不写死 Router 地址。
- 仅通过 `ROUTER_URL` 改变后端目标。
- GUI 端口可配置，避免本机冲突。

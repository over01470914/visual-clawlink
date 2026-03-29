"""ClawLink Visual GUI Server - aiohttp-based web server with proxy to Router."""

import os
import asyncio
import logging
from urllib.parse import unquote
import aiohttp
from aiohttp import web, WSMsgType

DEFAULT_ROUTER_URL = os.environ.get("ROUTER_URL", "http://localhost:8420")
PORT = int(os.environ.get("PORT", "8421"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, "visual-backend.log")

LOGGER = logging.getLogger("clawlink.visual")
if not LOGGER.handlers:
    LOGGER.setLevel(logging.INFO)
    _fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
    _fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    LOGGER.addHandler(_fh)


async def index_handler(request: web.Request) -> web.Response:
    """Serve the main index.html template."""
    path = os.path.join(BASE_DIR, "templates", "index.html")
    return web.FileResponse(path)


async def api_proxy(request: web.Request) -> web.Response:
    """Proxy all /api/* requests to the Router backend."""
    # Strip /api prefix and forward
    path = request.match_info.get("path", "")
    router_url = request.app["router_url"]
    target = f"{router_url}/{path}"
    if request.query_string:
        target += f"?{request.query_string}"

    timeout = aiohttp.ClientTimeout(total=30)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            method = request.method.lower()
            headers = {}
            ct = request.content_type
            if ct:
                headers["Content-Type"] = ct

            body = await request.read() if request.can_read_body else None

            async with session.request(
                method, target, data=body, headers=headers
            ) as resp:
                response_body = await resp.read()
                return web.Response(
                    status=resp.status,
                    body=response_body,
                    content_type=resp.content_type,
                    headers={"Access-Control-Allow-Origin": "*"},
                )
    except aiohttp.ClientError as exc:
        LOGGER.warning("API proxy failed: %s %s -> %s (%s)", request.method, request.path_qs, target, exc)
        return web.json_response(
            {"error": "router_unavailable", "detail": str(exc)}, status=502
        )


async def ws_proxy(request: web.Request) -> web.WebSocketResponse:
    """Proxy WebSocket connections to the Router backend."""
    ws_client = web.WebSocketResponse()
    await ws_client.prepare(request)

    path = request.match_info.get("path", "")
    router_url = request.app["router_url"]
    target = f"{router_url.replace('http', 'ws')}/{path}"
    if request.query_string:
        target += f"?{request.query_string}"

    timeout = aiohttp.ClientTimeout(total=None)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.ws_connect(target) as ws_backend:

                async def forward_client_to_backend():
                    async for msg in ws_client:
                        if msg.type == WSMsgType.TEXT:
                            await ws_backend.send_str(msg.data)
                        elif msg.type == WSMsgType.BINARY:
                            await ws_backend.send_bytes(msg.data)
                        elif msg.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                            break

                async def forward_backend_to_client():
                    async for msg in ws_backend:
                        if msg.type == WSMsgType.TEXT:
                            await ws_client.send_str(msg.data)
                        elif msg.type == WSMsgType.BINARY:
                            await ws_client.send_bytes(msg.data)
                        elif msg.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                            break

                await asyncio.gather(
                    forward_client_to_backend(),
                    forward_backend_to_client(),
                    return_exceptions=True,
                )
    except (aiohttp.ClientError, OSError):
        pass
    finally:
        if not ws_client.closed:
            await ws_client.close()

    return ws_client


async def get_router_config(request: web.Request) -> web.Response:
    return web.json_response({"router_url": request.app["router_url"]})


async def set_router_config(request: web.Request) -> web.Response:
    data = await request.json()
    router_url = (data.get("router_url") or "").strip().rstrip("/")
    if not router_url or not (router_url.startswith("http://") or router_url.startswith("https://")):
        return web.json_response({"error": "invalid_router_url"}, status=400)
    request.app["router_url"] = router_url
    LOGGER.info("Router URL updated to %s", router_url)
    return web.json_response({"status": "ok", "router_url": router_url})


async def probe_health(request: web.Request) -> web.Response:
    target = unquote((request.query.get("target") or "").strip()).rstrip("/")
    if not target or not (target.startswith("http://") or target.startswith("https://")):
        return web.json_response({"ok": False, "error": "invalid_target"}, status=400)

    timeout = aiohttp.ClientTimeout(total=8)
    health_url = f"{target}/health"
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(health_url) as resp:
                body = await resp.text()
                payload = None
                if "application/json" in (resp.content_type or ""):
                    try:
                        payload = await resp.json()
                    except Exception:
                        payload = None
                return web.json_response(
                    {
                        "ok": 200 <= resp.status < 300,
                        "status": resp.status,
                        "target": target,
                        "health_url": health_url,
                        "payload": payload,
                        "body": body[:200],
                    }
                )
    except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as exc:
        LOGGER.warning("Health probe failed for %s: %s", health_url, exc)
        return web.json_response(
            {
                "ok": False,
                "status": 0,
                "target": target,
                "health_url": health_url,
                "error": str(exc),
            },
            status=200,
        )


def _tail_lines(path: str, limit: int) -> list[str]:
    if not os.path.exists(path) or limit <= 0:
        return []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = [line.rstrip("\n") for line in f.readlines()]
            return lines[-limit:]
    except OSError:
        return []


async def get_logs(request: web.Request) -> web.Response:
    raw_limit = request.query.get("limit", "300")
    try:
        limit = max(50, min(int(raw_limit), 1200))
    except ValueError:
        limit = 300

    workspace_root = os.path.dirname(BASE_DIR)
    candidates = [
        ("visual-backend", LOG_FILE),
        ("visual-test", os.path.join(workspace_root, "visual_test.log")),
    ]

    active_files = [(name, path) for name, path in candidates if os.path.exists(path)]
    if not active_files:
        return web.json_response({"ok": True, "logs": [], "sources": []})

    per_file = max(20, limit // max(1, len(active_files)))
    merged = []
    for source, path in active_files:
        lines = _tail_lines(path, per_file)
        merged.extend([f"[{source}] {line}" for line in lines])

    return web.json_response(
        {
            "ok": True,
            "sources": [name for name, _ in active_files],
            "logs": merged[-limit:],
        }
    )


def create_app() -> web.Application:
    """Create and configure the aiohttp application."""
    app = web.Application()
    app["router_url"] = DEFAULT_ROUTER_URL.rstrip("/")
    LOGGER.info("Visual backend initialized. Router target: %s", app["router_url"])

    # Routes
    app.router.add_get("/", index_handler)
    app.router.add_get("/config/router", get_router_config)
    app.router.add_post("/config/router", set_router_config)
    app.router.add_get("/probe/health", probe_health)
    app.router.add_get("/logs", get_logs)
    app.router.add_route("*", "/api/{path:.*}", api_proxy)
    app.router.add_get("/ws/{path:.*}", ws_proxy)

    # Static files
    app.router.add_static(
        "/static", os.path.join(BASE_DIR, "static"), show_index=False
    )

    return app


if __name__ == "__main__":
    app = create_app()
    print(f"ClawLink Visual GUI running at http://localhost:{PORT}")
    print(f"Proxying API to {app['router_url']}")
    web.run_app(app, host="0.0.0.0", port=PORT)

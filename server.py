"""ClawLink Visual GUI Server - aiohttp-based web server with proxy to Router."""

import os
import asyncio
import aiohttp
from aiohttp import web, WSMsgType

ROUTER_URL = os.environ.get("ROUTER_URL", "http://localhost:8420")
PORT = int(os.environ.get("PORT", "8421"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


async def index_handler(request: web.Request) -> web.Response:
    """Serve the main index.html template."""
    path = os.path.join(BASE_DIR, "templates", "index.html")
    return web.FileResponse(path)


async def api_proxy(request: web.Request) -> web.Response:
    """Proxy all /api/* requests to the Router backend."""
    # Strip /api prefix and forward
    path = request.match_info.get("path", "")
    target = f"{ROUTER_URL}/{path}"
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
        return web.json_response(
            {"error": "router_unavailable", "detail": str(exc)}, status=502
        )


async def ws_proxy(request: web.Request) -> web.WebSocketResponse:
    """Proxy WebSocket connections to the Router backend."""
    ws_client = web.WebSocketResponse()
    await ws_client.prepare(request)

    path = request.match_info.get("path", "")
    target = f"{ROUTER_URL.replace('http', 'ws')}/{path}"
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


def create_app() -> web.Application:
    """Create and configure the aiohttp application."""
    app = web.Application()

    # Routes
    app.router.add_get("/", index_handler)
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
    print(f"Proxying API to {ROUTER_URL}")
    web.run_app(app, host="0.0.0.0", port=PORT)

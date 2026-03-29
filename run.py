"""ClawLink Visual GUI - One-click entry point for running the web interface."""

import logging
import os
import socket
import subprocess
import sys
from urllib.error import URLError
from urllib.request import urlopen

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

DEFAULT_PORT = 8421
DEFAULT_ROUTER_URL = "http://localhost:8420"


def _is_port_open(host: str, port: int) -> bool:
    """Check whether a TCP port is already in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1.0)
        return sock.connect_ex((host, port)) == 0


def _check_existing_gui(host: str, port: int) -> bool:
    """Return True if the port appears to host a running visual-clawlink instance."""
    try:
        with urlopen(f"http://{host}:{port}/", timeout=2) as response:
            content = response.read().decode("utf-8", errors="replace")
    except (URLError, TimeoutError, OSError):
        return False

    # A rough heuristic: the GUI index page contains this title
    return "ClawLink" in content


def _find_listener_pid(port: int) -> int | None:
    """Find the PID that is listening on the given port."""
    if os.name == "nt":
        try:
            result = subprocess.run(
                ["netstat", "-ano", "-p", "TCP"],
                capture_output=True,
                text=True,
                check=True,
            )
        except subprocess.SubprocessError:
            return None

        token = f":{port}"
        for line in result.stdout.splitlines():
            parts = line.split()
            if len(parts) < 5:
                continue
            local_addr = parts[1]
            state = parts[3].upper()
            pid_text = parts[4]
            if local_addr.endswith(token) and state == "LISTENING" and pid_text.isdigit():
                return int(pid_text)
        return None

    # POSIX
    try:
        result = subprocess.run(
            ["lsof", "-i", f"TCP:{port}", "-sTCP:LISTEN", "-t"],
            capture_output=True,
            text=True,
            check=True,
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return None

    pid_text = result.stdout.strip().splitlines()
    if not pid_text:
        return None
    if pid_text[0].isdigit():
        return int(pid_text[0])
    return None


def _terminate_process(pid: int) -> None:
    """Terminate a process by PID (cross-platform)."""
    current_pid = os.getpid()
    if pid == current_pid:
        logger.error("Refusing to terminate current process (pid=%s).", pid)
        raise SystemExit(1)

    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                capture_output=True,
                text=True,
                check=True,
            )
        except subprocess.CalledProcessError as exc:
            logger.error("Failed to terminate process %s: %s", pid, exc.stderr.strip())
            raise SystemExit(1) from exc
        return

    try:
        os.kill(pid, 15)
    except OSError as exc:
        logger.error("Failed to terminate process %s: %s", pid, exc)
        raise SystemExit(1) from exc


def _handle_port_in_use(port: int) -> None:
    """Handle the case where the desired port is already occupied."""
    if _check_existing_gui("127.0.0.1", port):
        answer = (
            input(
                f"ClawLink Visual GUI is already running at http://127.0.0.1:{port}. "
                f"Restart it? [y/N]: "
            )
            .strip()
            .lower()
        )
        if answer != "y":
            logger.info("Startup cancelled by user.")
            raise SystemExit(0)

        pid = _find_listener_pid(port)
        if pid is None:
            logger.error("Could not resolve the process ID listening on port %s.", port)
            raise SystemExit(1)

        _terminate_process(pid)
        logger.info("Stopped process %s on port %s. Starting a new instance...", pid, port)
        return

    logger.error(
        "Port %s is already in use by another service. "
        "Stop the existing process or set PORT to another value.",
        port,
    )
    raise SystemExit(1)


def _ensure_dependencies() -> None:
    """Auto-install missing dependencies defined in pyproject.toml."""
    try:
        import aiohttp  # noqa: F401
        return
    except ModuleNotFoundError:
        pass

    logger.info("Dependency 'aiohttp' not found. Installing dependencies automatically...")
    project_dir = os.path.dirname(os.path.abspath(__file__))

    # Strategy 1: editable install from pyproject.toml (gets all declared deps)
    installed = False
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-e", project_dir],
            check=True,
        )
        installed = True
    except subprocess.CalledProcessError:
        logger.warning("Editable install failed. Falling back to direct dependency install...")

    # Strategy 2: direct pip install as fallback
    if not installed:
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "aiohttp>=3.9.0"],
                check=True,
            )
            installed = True
        except subprocess.CalledProcessError:
            pass

    if not installed:
        logger.error(
            "Failed to install dependencies automatically. Please run manually:\n"
            "  pip install aiohttp"
        )
        raise SystemExit(1)

    logger.info("Dependencies installed successfully.")


def main() -> None:
    """Entry point: validate environment, then start the GUI server."""

    # --- Auto-install dependencies if missing --------------------------------
    _ensure_dependencies()
    from aiohttp import web

    # --- Resolve configuration -----------------------------------------------
    router_url = os.getenv("ROUTER_URL", DEFAULT_ROUTER_URL)
    port = int(os.getenv("PORT", str(DEFAULT_PORT)))

    # --- Port conflict detection ---------------------------------------------
    if _is_port_open("127.0.0.1", port):
        _handle_port_in_use(port)

    # --- Import the app from server.py (same package directory) --------------
    # Ensure the visual-clawlink directory is on sys.path so that `import server`
    # resolves to the correct module regardless of where python is invoked from.
    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    # Set env vars so server.py picks them up via os.environ
    os.environ["ROUTER_URL"] = router_url
    os.environ["PORT"] = str(port)

    import server  # noqa: E402  (visual-clawlink/server.py)

    app = server.create_app()

    print(f"ClawLink Visual GUI running at http://localhost:{port}")
    print(f"Proxying API to {router_url}")

    try:
        web.run_app(app, host="0.0.0.0", port=port, print=None)
    except OSError as exc:
        # On Windows, errno 10048 == WSAEADDRINUSE
        if getattr(exc, "winerror", None) == 10048 or getattr(exc, "errno", None) == 10048:
            _handle_port_in_use(port)
            # Re-exec ourselves after killing the old process
            os.execv(sys.executable, [sys.executable, *sys.argv])
        raise


if __name__ == "__main__":
    main()

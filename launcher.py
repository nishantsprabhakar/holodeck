"""Desktop entry point: runs the Wrexlyn HoloDeck server on localhost and shows it in
a native window (WebView2 on Windows, WebKit on macOS). Where no native web
view is available (e.g. Linux), it opens the default browser instead and
exits once the page has been closed for a while."""
import faulthandler
import json
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser

from version import APP_NAME

PREFERRED_PORT = 8600
BROWSER_IDLE_EXIT = 180  # seconds without a page heartbeat before exiting


def resource_dir():
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def data_dir():
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    elif sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    path = os.path.join(base, "WrexlynHoloDeck")
    os.makedirs(path, exist_ok=True)
    return path


def existing_instance(port):
    """True if a HoloDeck server is already answering on this port."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1.5) as r:
            return json.load(r).get("app") == "holodeck"
    except Exception:
        return False


def pick_port():
    for port in (PREFERRED_PORT, 0):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return s.getsockname()[1]
            except OSError:
                continue
    raise RuntimeError("no free port")


def show_window(url):
    """Native window; returns False if no web view backend is usable."""
    if os.environ.get("HOLODECK_BROWSER") == "1" or "--browser" in sys.argv:
        return False
    try:
        import webview
    except Exception:
        return False
    try:
        webview.settings["ALLOW_DOWNLOADS"] = True
        webview.create_window(APP_NAME, url, width=1360, height=860, min_size=(900, 600),
                              background_color="#03050a", text_select=False)
        # A persistent profile in our data folder: the default private mode
        # creates a temp profile per launch and fails to delete it on exit.
        webview.start(private_mode=False, storage_path=os.path.join(data_dir(), "webview"))
        return True
    except Exception as e:
        print(f"native window unavailable ({e}); falling back to browser", file=sys.stderr)
        return False


def main():
    data = data_dir()
    if getattr(sys, "frozen", False) and (sys.stdout is None or sys.stderr is None):
        # Windowed builds have no console; uvicorn logs to these streams.
        log = open(os.path.join(data, "holodeck.log"), "a", buffering=1, encoding="utf-8")
        sys.stdout = sys.stdout or log
        sys.stderr = sys.stderr or log

    if os.environ.get("HOLODECK_DEBUG"):
        # Periodic all-thread stack dumps to the log, for diagnosing hangs.
        faulthandler.dump_traceback_later(20, repeat=True, file=sys.stderr)

    if existing_instance(PREFERRED_PORT):
        url = f"http://127.0.0.1:{PREFERRED_PORT}/"
        if not show_window(url):
            webbrowser.open(url)
        return

    os.environ.setdefault("HOLODECK_STATIC_DIR", os.path.join(resource_dir(), "static"))
    os.environ.setdefault("HOLODECK_DATA_DIR", data)

    import uvicorn
    import server

    port = pick_port()
    srv = uvicorn.Server(uvicorn.Config(server.app, host="127.0.0.1", port=port,
                                        log_level="warning", access_log=False))
    thread = threading.Thread(target=srv.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 30
    while not srv.started:
        if not thread.is_alive() or time.monotonic() > deadline:
            raise SystemExit(f"{APP_NAME} server failed to start")
        time.sleep(0.05)

    url = f"http://127.0.0.1:{port}/"
    if not show_window(url):
        webbrowser.open(url)
        started = time.monotonic()
        while True:
            time.sleep(5)
            seen = server.last_heartbeat
            idle = time.monotonic() - (seen if seen is not None else started)
            if idle > BROWSER_IDLE_EXIT and not server.is_busy():
                break
    srv.should_exit = True
    thread.join(timeout=10)


if __name__ == "__main__":
    main()

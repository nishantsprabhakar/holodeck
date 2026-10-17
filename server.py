import base64
import hashlib
import html
import json
import os
import queue
import re
import shutil
import threading
import time
import uuid
from urllib.parse import quote

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from parser import parse_pptx
import renderer

from version import __version__

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# The desktop launcher points these elsewhere: the UI ships read-only inside
# the app bundle, while renders and uploads go to a per-user data folder.
STATIC_DIR = os.environ.get("HOLODECK_STATIC_DIR") or os.path.join(BASE_DIR, "static")
DATA_DIR = os.environ.get("HOLODECK_DATA_DIR")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads") if DATA_DIR else os.path.join(BASE_DIR, "uploads")
ASSETS_ROOT = os.path.join(DATA_DIR, "assets") if DATA_DIR else os.path.join(STATIC_DIR, "assets")
RENDER_WIDTH = int(os.environ.get("HOLODECK_RENDER_WIDTH", "1920"))
# Bump when renderer output changes so cached decks are re-rendered.
RENDER_VERSION = "raster-2"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(ASSETS_ROOT, exist_ok=True)

app = FastAPI(title="Holo-Deck PPTX Converter", version=__version__)
last_heartbeat = None  # monotonic time of the last open page's ping; read by the launcher


@app.middleware("http")
async def revalidate_app_shell(request, call_next):
    # The player's HTML/JS/CSS change between versions; make browsers
    # revalidate them so a stale cached app.js never talks to a newer API.
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.endswith((".html", ".js", ".css")):
        response.headers["Cache-Control"] = "no-cache"
    return response

jobs = {}
jobs_by_deck = {}
jobs_lock = threading.Lock()
work_queue = queue.Queue()


def _deck_json_path(deck_id):
    return os.path.join(ASSETS_ROOT, deck_id, "deck.json")


def _update(job_id, **fields):
    with jobs_lock:
        jobs[job_id].update(fields)


def _convert(job_id, deck_id, upload_path, filename):
    assets_dir = os.path.join(ASSETS_ROOT, deck_id)
    shutil.rmtree(assets_dir, ignore_errors=True)
    os.makedirs(assets_dir, exist_ok=True)
    _update(job_id, status="running", message="ESTABLISHING UPLINK...")
    progress = lambda frac, msg: _update(job_id, progress=round(frac, 4), message=msg)
    try:
        try:
            try:
                data = renderer.render_presentation(upload_path, assets_dir, width=RENDER_WIDTH, progress=progress)
            except renderer.PowerPointUnavailable:
                raise
            except Exception:
                # A COM session can drop mid-render (e.g. someone closes
                # PowerPoint); one clean retry recovers from that.
                _update(job_id, message="RE-ESTABLISHING RENDER CORE...")
                data = renderer.render_presentation(upload_path, assets_dir, width=RENDER_WIDTH, progress=progress)
        except renderer.PowerPointUnavailable:
            # No PowerPoint on this host: fall back to the approximate
            # python-pptx reconstruction.
            _update(job_id, message="DECODING VECTOR GEOMETRY...")
            data = parse_pptx(upload_path, assets_dir, deck_id)
            data["mode"] = "vector"
        data.update({"deckId": deck_id, "assetBase": f"/assets/{deck_id}/", "filename": filename})
        tmp = _deck_json_path(deck_id) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp, _deck_json_path(deck_id))
        _update(job_id, status="done", progress=1.0, message="SYNTHESIS COMPLETE.", result=data)
    except Exception as e:
        shutil.rmtree(assets_dir, ignore_errors=True)
        _update(job_id, status="error", error=f"Failed to convert presentation: {e}")
    finally:
        try:
            os.remove(upload_path)
        except OSError:
            pass
        with jobs_lock:
            jobs_by_deck.pop(deck_id, None)


def _worker():
    # PowerPoint automation is single-instance and not thread-safe, so all
    # conversions run serially on this one thread.
    while True:
        job_id, deck_id, upload_path, filename = work_queue.get()
        _convert(job_id, deck_id, upload_path, filename)


threading.Thread(target=_worker, daemon=True).start()


@app.post("/api/convert")
async def api_convert(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Please upload a .pptx file")

    upload_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4().hex}.pptx")
    digest = hashlib.sha256(RENDER_VERSION.encode())
    with open(upload_path, "wb") as f:
        while chunk := await file.read(1 << 20):
            digest.update(chunk)
            f.write(chunk)
    deck_id = digest.hexdigest()[:16]

    cached = _deck_json_path(deck_id)
    if os.path.exists(cached):
        os.remove(upload_path)
        with open(cached, encoding="utf-8") as f:
            data = json.load(f)
        data["filename"] = file.filename
        return JSONResponse({"jobId": None, "status": "done", "progress": 1.0, "result": data})

    with jobs_lock:
        existing = jobs_by_deck.get(deck_id)
        if existing:
            os.remove(upload_path)
            return JSONResponse({"jobId": existing, **{k: v for k, v in jobs[existing].items() if k != "result"}})
        job_id = uuid.uuid4().hex
        jobs[job_id] = {"status": "queued", "progress": 0.0, "message": "QUEUED FOR RENDER CORE..."}
        jobs_by_deck[deck_id] = job_id
    work_queue.put((job_id, deck_id, upload_path, file.filename))
    return JSONResponse({"jobId": job_id, "status": "queued", "progress": 0.0})


MIME_BY_EXT = {".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
               ".png": "image/png", ".gif": "image/gif", ".bmp": "image/bmp",
               ".svg": "image/svg+xml", ".tif": "image/tiff", ".tiff": "image/tiff"}


def _data_uri(assets_dir, name, cache):
    if name in cache:
        return cache[name]
    path = os.path.join(assets_dir, os.path.basename(name))
    mime = MIME_BY_EXT.get(os.path.splitext(name)[1].lower(), "application/octet-stream")
    with open(path, "rb") as f:
        cache[name] = f"data:{mime};base64," + base64.b64encode(f.read()).decode("ascii")
    return cache[name]


@app.get("/api/export/{deck_id}")
async def api_export(deck_id: str):
    """A single self-contained .html file: player, styles, animations and
    every slide asset inlined, so it plays offline with no server."""
    if not re.fullmatch(r"[0-9a-f]{16}", deck_id) or not os.path.exists(_deck_json_path(deck_id)):
        raise HTTPException(status_code=404, detail="Unknown presentation")
    assets_dir = os.path.join(ASSETS_ROOT, deck_id)
    with open(_deck_json_path(deck_id), encoding="utf-8") as f:
        deck = json.load(f)

    cache = {}
    for slide in deck["slides"]:
        if deck.get("mode") == "raster":
            slide["base"] = _data_uri(assets_dir, slide["base"], cache)
            slide["thumb"] = _data_uri(assets_dir, slide["thumb"], cache)
            for layer in slide["layers"]:
                layer["src"] = _data_uri(assets_dir, layer["src"], cache)
        else:
            for el in slide.get("elements", []):
                if el.get("type") == "image" and el.get("src"):
                    el["src"] = _data_uri(assets_dir, el["src"], cache)
    deck["assetBase"] = ""
    deck.pop("deckId", None)

    def read(name):
        with open(os.path.join(STATIC_DIR, name), encoding="utf-8") as f:
            return f.read()

    title = deck.get("filename") or "presentation.pptx"
    # Escape "</" so slide text can never terminate the inline <script>.
    deck_js = json.dumps(deck).replace("</", "<\\/")
    page = read("index.html")
    page = re.sub(r"<title>.*?</title>", lambda m: f"<title>{html.escape(title)} // HOLO-DECK</title>", page, count=1)
    page = page.replace('<link rel="stylesheet" href="style.css" />', f"<style>\n{read('style.css')}\n</style>", 1)
    page = page.replace('<script src="app.js"></script>',
                        f"<script>window.HOLODECK_DECK = {deck_js};</script>\n<script>{read('app.js')}</script>", 1)

    stem = os.path.splitext(title)[0]
    ascii_name = re.sub(r"[^A-Za-z0-9._ -]+", "_", stem).strip() or "presentation"
    disposition = f"attachment; filename=\"{ascii_name}.html\"; filename*=UTF-8''{quote(stem)}.html"
    return Response(content=page, media_type="text/html; charset=utf-8",
                    headers={"Content-Disposition": disposition})


@app.get("/api/health")
async def api_health():
    return {"app": "holodeck", "version": __version__,
            "renderer": "powerpoint" if renderer.powerpoint_available() else "approximate"}


@app.post("/api/heartbeat")
async def api_heartbeat():
    global last_heartbeat
    last_heartbeat = time.monotonic()
    return {"ok": True}


def is_busy():
    with jobs_lock:
        return any(j["status"] in ("queued", "running") for j in jobs.values())


@app.get("/api/jobs/{job_id}")
async def api_job(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Unknown job")
        return JSONResponse(dict(job))


app.mount("/assets", StaticFiles(directory=ASSETS_ROOT), name="assets")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

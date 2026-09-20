import os
import shutil
import uuid

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from parser import parse_pptx

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
ASSETS_ROOT = os.path.join(STATIC_DIR, "assets")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(ASSETS_ROOT, exist_ok=True)

app = FastAPI(title="Holo-Deck PPTX Converter")


@app.post("/api/parse")
async def api_parse(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".pptx",)):
        raise HTTPException(status_code=400, detail="Please upload a .pptx file")

    session_id = uuid.uuid4().hex[:12]
    upload_path = os.path.join(UPLOAD_DIR, f"{session_id}.pptx")
    with open(upload_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    assets_dir = os.path.join(ASSETS_ROOT, session_id)
    try:
        data = parse_pptx(upload_path, assets_dir, session_id)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse PPTX: {e}")
    finally:
        try:
            os.remove(upload_path)
        except OSError:
            pass

    data["sessionId"] = session_id
    data["assetBase"] = f"/assets/{session_id}/"
    data["filename"] = file.filename
    return JSONResponse(data)


app.mount("/assets", StaticFiles(directory=ASSETS_ROOT), name="assets")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

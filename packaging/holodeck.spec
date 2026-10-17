# PyInstaller spec for Holo-Deck — one spec for Windows, macOS and Linux.
# Build from the repo root:  pyinstaller --noconfirm packaging/holodeck.spec
import os
import sys

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))
sys.path.insert(0, ROOT)
from version import __version__  # noqa: E402

ICONS = os.path.join(SPECPATH, "icons")
IS_WIN, IS_MAC = sys.platform == "win32", sys.platform == "darwin"

# Only the app shell — never static/assets (locally cached renders).
datas = [(os.path.join(ROOT, "static", name), "static")
         for name in ("index.html", "app.js", "style.css")]
datas += collect_data_files("pptx")  # python-pptx's default template XML

hiddenimports = collect_submodules("uvicorn") + ["python_multipart", "multipart"]
excludes = ["tkinter", "matplotlib", "scipy", "pandas", "IPython", "PyQt5", "PyQt6", "PySide2", "PySide6"]
if IS_WIN:
    hiddenimports += ["win32com.client", "pythoncom", "pywintypes", "winreg"]
if not (IS_WIN or IS_MAC):
    # Linux opens the system browser instead of an embedded web view.
    excludes += ["webview"]

a = Analysis(
    [os.path.join(ROOT, "launcher.py")],
    pathex=[ROOT],
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=excludes,
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="HoloDeck",
    console=False,
    icon=os.path.join(ICONS, "holodeck.ico" if IS_WIN else "holodeck.icns" if IS_MAC else "holodeck.png"),
    version=None,
)
coll = COLLECT(exe, a.binaries, a.datas, name="HoloDeck")

if IS_MAC:
    app = BUNDLE(
        coll,
        name="Holo-Deck.app",
        icon=os.path.join(ICONS, "holodeck.icns"),
        bundle_identifier="com.skegen.holodeck",
        version=__version__,
        info_plist={
            "CFBundleDisplayName": "Holo-Deck",
            "CFBundleShortVersionString": __version__,
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "11.0",
        },
    )

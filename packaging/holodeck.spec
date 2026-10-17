# PyInstaller spec for Wrexlyn HoloDeck — one spec for Windows, macOS and Linux.
# Build from the repo root:  pyinstaller --noconfirm packaging/holodeck.spec
import os
import sys

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))
sys.path.insert(0, ROOT)
from version import APP_NAME, AUTHOR, COPYRIGHT, __version__  # noqa: E402

ICONS = os.path.join(SPECPATH, "icons")
IS_WIN, IS_MAC = sys.platform == "win32", sys.platform == "darwin"

# Only the app shell — never static/assets (locally cached renders).
datas = [(os.path.join(ROOT, "static", name), "static")
         for name in ("index.html", "app.js", "style.css")]
datas += collect_data_files("pptx")  # python-pptx's default template XML
datas += [(os.path.join(ROOT, "LICENSE.txt"), ".")]

version_info = None
if IS_WIN:
    # Shown in the .exe's Properties > Details tab.
    from PyInstaller.utils.win32.versioninfo import (
        FixedFileInfo, StringFileInfo, StringStruct, StringTable, VarFileInfo, VarStruct, VSVersionInfo)
    nums = tuple(int(x) for x in __version__.split(".")) + (0,)
    version_info = VSVersionInfo(
        ffi=FixedFileInfo(filevers=nums, prodvers=nums),
        kids=[
            StringFileInfo([StringTable("040904B0", [
                StringStruct("CompanyName", AUTHOR),
                StringStruct("FileDescription", APP_NAME),
                StringStruct("FileVersion", __version__),
                StringStruct("InternalName", "WrexlynHoloDeck"),
                StringStruct("LegalCopyright", COPYRIGHT),
                StringStruct("OriginalFilename", "WrexlynHoloDeck.exe"),
                StringStruct("ProductName", APP_NAME),
                StringStruct("ProductVersion", __version__),
            ])]),
            VarFileInfo([VarStruct("Translation", [1033, 1200])]),
        ],
    )

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
    name="WrexlynHoloDeck",
    console=False,
    icon=os.path.join(ICONS, "holodeck.ico" if IS_WIN else "holodeck.icns" if IS_MAC else "holodeck.png"),
    version=version_info,
)
coll = COLLECT(exe, a.binaries, a.datas, name="WrexlynHoloDeck")

if IS_MAC:
    app = BUNDLE(
        coll,
        name="Wrexlyn HoloDeck.app",
        icon=os.path.join(ICONS, "holodeck.icns"),
        bundle_identifier="com.wrexlyn.holodeck",
        version=__version__,
        info_plist={
            "CFBundleDisplayName": APP_NAME,
            "CFBundleName": APP_NAME,
            "NSHumanReadableCopyright": COPYRIGHT,
            "CFBundleShortVersionString": __version__,
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "11.0",
        },
    )

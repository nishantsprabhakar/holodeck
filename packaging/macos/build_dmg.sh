#!/usr/bin/env bash
# Packages the PyInstaller .app into a drag-to-Applications disk image.
# Run from the repo root after:  pyinstaller --noconfirm packaging/holodeck.spec
set -euo pipefail

VERSION=$(python -c "from version import __version__; print(__version__)")
ARCH=$(uname -m)
APP="dist/Wrexlyn HoloDeck.app"
OUT_DIR="installers"
DMG="$OUT_DIR/WrexlynHoloDeck-$VERSION-macos-$ARCH.dmg"

[ -d "$APP" ] || { echo "missing $APP — run PyInstaller first" >&2; exit 1; }
mkdir -p "$OUT_DIR"

# Ad-hoc signature so the bundle's code signature is internally consistent
# (required on Apple Silicon). A Developer ID signature + notarization would
# be needed to avoid the Gatekeeper prompt on first launch.
codesign --force --deep --sign - "$APP"

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
cp LICENSE.txt "$STAGE/LICENSE and Disclaimer.txt"

rm -f "$DMG"
hdiutil create -volname "Wrexlyn HoloDeck $VERSION" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
echo "built $DMG"

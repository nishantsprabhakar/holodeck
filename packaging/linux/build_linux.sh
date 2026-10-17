#!/usr/bin/env bash
# Builds a portable AppImage and a Debian/Ubuntu .deb from the PyInstaller
# output. Run from the repo root after:  pyinstaller --noconfirm packaging/holodeck.spec
set -euo pipefail

VERSION=$(python -c "from version import __version__; print(__version__)")
ARCH=$(uname -m)                                   # x86_64 / aarch64
DEB_ARCH=$([ "$ARCH" = "x86_64" ] && echo amd64 || echo arm64)
BUNDLE="dist/WrexlynHoloDeck"
OUT_DIR="installers"
APP_ID="wrexlyn-holodeck"

[ -d "$BUNDLE" ] || { echo "missing $BUNDLE — run PyInstaller first" >&2; exit 1; }
mkdir -p "$OUT_DIR"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# ---- AppImage --------------------------------------------------------------
APPDIR="$WORK/AppDir"
mkdir -p "$APPDIR/usr/lib/$APP_ID"
cp -R "$BUNDLE/." "$APPDIR/usr/lib/$APP_ID/"
cp LICENSE.txt "$APPDIR/usr/lib/$APP_ID/"
cat > "$APPDIR/AppRun" <<EOF
#!/bin/sh
HERE="\$(dirname "\$(readlink -f "\$0")")"
exec "\$HERE/usr/lib/$APP_ID/WrexlynHoloDeck" "\$@"
EOF
chmod +x "$APPDIR/AppRun"
cp "packaging/linux/$APP_ID.desktop" "$APPDIR/"
cp packaging/icons/holodeck.png "$APPDIR/$APP_ID.png"

TOOL="$WORK/appimagetool"
curl -fsSL -o "$TOOL" "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-$ARCH.AppImage"
chmod +x "$TOOL"
# --appimage-extract-and-run: CI runners usually lack FUSE.
ARCH="$ARCH" "$TOOL" --appimage-extract-and-run "$APPDIR" "$OUT_DIR/WrexlynHoloDeck-$VERSION-linux-$ARCH.AppImage"

# ---- .deb ------------------------------------------------------------------
PKG="$WORK/deb"
mkdir -p "$PKG/DEBIAN" "$PKG/opt/$APP_ID" "$PKG/usr/bin" \
         "$PKG/usr/share/applications" "$PKG/usr/share/icons/hicolor/512x512/apps" \
         "$PKG/usr/share/doc/$APP_ID"
cp -R "$BUNDLE/." "$PKG/opt/$APP_ID/"
ln -s "/opt/$APP_ID/WrexlynHoloDeck" "$PKG/usr/bin/$APP_ID"
cp "packaging/linux/$APP_ID.desktop" "$PKG/usr/share/applications/"
python -c "from PIL import Image; Image.open('packaging/icons/holodeck.png').resize((512, 512)).save('$PKG/usr/share/icons/hicolor/512x512/apps/$APP_ID.png')"
cp LICENSE.txt "$PKG/usr/share/doc/$APP_ID/copyright"
cat > "$PKG/DEBIAN/control" <<EOF
Package: $APP_ID
Version: $VERSION
Section: graphics
Priority: optional
Architecture: $DEB_ARCH
Maintainer: Nishant Prabhakar
Depends: xdg-utils
Description: Wrexlyn HoloDeck - PowerPoint to animated web presentations
 Converts .pptx decks into animated, high-tech web presentations and exports
 them as standalone HTML files.
 Copyright (c) 2026 Nishant Prabhakar. All rights reserved. Provided "as is",
 without warranty of any kind; see /usr/share/doc/$APP_ID/copyright.
EOF
dpkg-deb --root-owner-group --build "$PKG" "$OUT_DIR/${APP_ID}_${VERSION}_${DEB_ARCH}.deb"
echo "built:"; ls -la "$OUT_DIR"

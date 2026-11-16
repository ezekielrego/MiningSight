# TunnelSight application icon

`tunnelsight-app-icon.svg` is the editable white-canvas wrapper around the
unchanged existing logo. `tunnelsight-app-icon.png` is an opaque 1024 × 1024
master for application icons, including a later Android launcher update.

The desktop taskbar/shortcut and installer icons derive from this same master.
Rebuild with `node tools/build-app-icons.cjs` (ImageMagick `convert` required).
The website favicon and existing Android APK are not changed by that command.

# TunnelSight Desktop 1.1.0

Windows 10/11 x64 installer for Ezekiel Rego's TunnelSight workstation. The
desktop shell loads the existing HTTPS website; it does not fork its models,
accounts, storage or reconstruction providers. Local tools are isolated from
the hosted page. The web app continues to work independently.

Version 1.1.0 is available as `TunnelSight-Setup-1.1.0.exe`, with a matching
`.exe.sha256` checksum. It adds wireless phone connections, simpler controls,
and a white-background app icon. The reusable 1024px icon for later mobile
builds is in [`assets/branding`](../assets/branding/).

## Use

1. Download `TunnelSight-Setup-1.1.0.exe` from
   <https://tunnelsight.applications.co.zw/desktop/>.
   Install for your user, choose a folder, and launch TunnelSight.
2. Click **Sign in with browser**. Use Google in your normal browser and approve
   this desktop connection. The app receives a separate, one-time handoff to a
   new session; your existing browser session is not replaced.
3. Open **Local streaming**. Connect an Android phone over USB or use the local
   network instructions below. For USB, enable **Developer options → USB
   debugging**, connect a data-capable cable, and accept its RSA authorization.
   Refresh devices, select the phone, and choose **Open mirror**. scrcpy and
   FFmpeg are bundled; there is no terminal setup.
4. Refresh windows, select the desired mirror or other open window, and check
   the default local preview. Enter your existing TunnelSight email, choose
   landscape or original orientation, and click **Start stream**.
5. Open Live in Workspace, select/create a project, and capture images or record
   there. The existing website Live viewer can watch the same account's stream.

The email routes the stream; it is not account authentication. Only the selected
window is published. Keep it visible and unminimized. Audio is omitted. Phone
interaction happens in scrcpy on the laptop, not through the remote website.
Preview is local; publishing needs laptop internet and the existing RTMP relay.
The app retries interrupted publishing ten times, then presents the error.
720p/25fps is the default; 480p reduces bandwidth. The local preview preserves
the window's orientation; the publishing orientation controls the web picture.

### Android local-network pairing and connection

For Android 11+ devices that support **Wireless debugging**:

1. Put the phone and PC on the same Wi-Fi or a routable LAN. Both endpoints must
   be reachable; guest/client isolation and firewall rules can block ADB.
2. On the phone, enable **Developer options → Wireless debugging**, then open
   **Pair device with pairing code**. Keep the dialog open.
3. In TunnelSight, enter that dialog's **pairing IP:port** and **6-digit pairing
   code**, then choose **Pair**. The pairing code is held only in memory and is
   not saved to preferences, logs, or cloud storage.
4. Return to the phone's main **Wireless debugging** screen. Use its separate
   **IP address & port** with **Connect**. The connection port differs from the
   pairing port; do not reuse the pairing endpoint. Recheck it if it changes.
5. Refresh devices, select the connected phone, and choose **Open mirror**.
   Refresh windows, select its scrcpy window, check the preview, and start the
   stream as usual.

For older phones with an ADB network port already enabled, enter that IP:port
and use **Connect** only. TunnelSight does not automatically enable insecure
ADB TCP/IP mode. **Disconnect** targets only the selected network phone; it
does not issue a global disconnect or kill the shared ADB server.

### Preview and layout in 1.1.0

The release uses a compact 48px desktop app navigation bar, text or outlined
buttons, and plain sections without filled cards or framed badges. The base
background and actual viewer/preview surface are preserved. The static download
page follows the same visual preference.

Local preview remains useful and enabled by default when choosing a source.
The 1.1.0 publishing change pauses the duplicate Electron preview capture while
FFmpeg publishes the selected window. This aims to reduce mouse flicker;
Windows GDI capture may still show cursor flicker, so a complete Windows fix
is not claimed. Use the project's live viewer to inspect the published feed.

### Local and cloud behavior

The phone mirror and preview are local. Online models, projects, cloud storage,
Google login and AI providers still need internet. This does not replace or
repair the separate Android DJI SDK app. A working DJI GO display can be shared
through an authorized local scrcpy mirror where device support permits it.

**Stop** ends publishing. Closing TunnelSight stops its own mirror/encoder
processes and timers, leaving independently launched mirrors and the shared ADB
server alone. No Windows service or startup task is installed. Uninstall using
Windows Settings → Apps. Local preferences remain for reinstalls; **Help & setup
→ Clear local app data** clears desktop browser storage and preferences without
deleting cloud projects. Revoke USB debugging authorization or forget the paired
computer in Wireless debugging on the phone if desired.

This release is unsigned; Windows can show an unknown-publisher prompt. It is
an actual NSIS installer, not an APK or a link renamed to `.exe`.

## Build

Use Node 22.12+ and npm. This project has its own lockfile and dependencies;
the website's package and runtime dependencies are unchanged.

```sh
cd desktop
npm ci
node node_modules/electron/install.js
npm run prepare:tools
npm test
npm run dist:win
```

`prepare:tools` verifies SHA-256 before unpacking official, version-pinned
scrcpy and FFmpeg archives. On Linux it needs `unzip`; on Windows it uses
PowerShell's archive support. Icons and installer artwork are already supplied.
The installer is built using NSIS 3 (`makensis` on Linux, `makensis.exe` on
Windows; set `MAKENSIS` to its full path if needed). Its branded install and
uninstall wizard is in `installer.nsi`. The uninstaller is generated at install
time, so Linux builds do not need to run a Windows installer under Wine. No
native application compiler or watch process is required.

With the desktop package version set to 1.1.0, the output is
`release/TunnelSight-Setup-1.1.0.exe`. Generated executables, runtime tool bundles,
build output and dependencies are excluded from Git. Publish the
installer, checksum and an optional latest-name alias to the server's downloads
directory. The release page lives in `public/desktop/`.

`bridge.test.cjs` tests real process lifecycle logic with mocked Windows child
processes: source/credential validation, first-frame readiness, no-frame timeout,
retry cancellation, serial selection and cleanup. These mocked checks do not
validate native Windows USB or Wi-Fi behavior. Android 11+ pairing, the separate
Connect endpoint, mirroring, reconnecting, and disconnecting only the selected
phone still require a real Windows PC and phone on a reachable local network.
Also check an already-enabled older ADB network endpoint, preview/publishing
transitions and cursor behavior, installation, and uninstall on Windows. Native
Windows Wi-Fi validation remains pending; this documentation update does not
claim a successful hardware test.

The hosted page has no Node integration or native preload. Only the local shell
can call the allowlisted IPC actions. Remote navigation stays on TunnelSight;
external HTTPS links open in the system browser. Google handoff secrets expire
after five minutes, are separate for approval/polling, and are consumed once.

The isolated auth integration check can be run from the repository root with
`node tools/test-desktop-auth.mjs`. It builds a temporary server and SQLite
fixture, checks approval, token delivery and independent logout, and cleans up
its own child process and files. It does not access production accounts.

See `THIRD-PARTY-NOTICES.txt` and the licenses beside bundled tools. The app
ships unmodified third-party binaries, along with build/source locations.

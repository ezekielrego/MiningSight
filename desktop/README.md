# TunnelSight Desktop

Windows 10/11 x64 installer for Ezekiel Rego's TunnelSight workstation. The
desktop shell loads the existing HTTPS website; it does not fork its models,
accounts, storage or reconstruction providers. Local tools are isolated from
the hosted page. The web app continues to work independently.

## Use

1. Download the installer from <https://tunnelsight.applications.co.zw/desktop/>.
   Install for your user, choose a folder, and launch TunnelSight.
2. Click **Sign in with browser**. Use Google in your normal browser and approve
   this desktop connection. The app receives a separate, one-time handoff to a
   new session; your existing browser session is not replaced.
3. Open **Local streaming**. Connect an Android phone over USB, enable USB
   debugging, and accept its RSA authorization. Refresh devices and open the
   phone mirror. scrcpy and FFmpeg are bundled; there is no terminal setup.
4. Refresh windows, select the desired mirror or other open window, and check
   the local preview. Enter your existing TunnelSight email, choose landscape
   or original orientation, and click **Start stream**.
5. Open Live in Workspace, select/create a project, and capture images or record
   there. The existing website Live viewer can watch the same account's stream.

The email routes the stream; it is not account authentication. Only the selected
window is published. Keep it visible and unminimized. Audio is omitted. Phone
interaction happens in scrcpy on the laptop, not through the remote website.
Preview is local; publishing needs laptop internet and the existing RTMP relay.
The app retries interrupted publishing ten times, then presents the error.
720p/25fps is the default; 480p reduces bandwidth. The local preview preserves
the window's orientation; the publishing orientation controls the web picture.

The phone mirror and preview are local. Online models, projects, cloud storage,
Google login and AI providers still need internet. This does not replace or
repair the separate Android DJI SDK app. A working DJI GO display can be shared
through an authorized local scrcpy mirror where device support permits it.

**Stop** ends publishing. Closing TunnelSight stops its own mirror/encoder
processes and timers, leaving independently launched mirrors and the shared ADB
server alone. No Windows service or startup task is installed. Uninstall using
Windows Settings → Apps. Local preferences remain for reinstalls; **Help & setup
→ Clear local app data** clears desktop browser storage and preferences without
deleting cloud projects. Revoke USB debugging authorization on the phone if desired.

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

Output: `release/TunnelSight-Setup-1.0.0.exe`. Generated executables, runtime
tool bundles, build output and dependencies are excluded from Git. Publish the
installer, checksum and an optional latest-name alias to the server's downloads
directory. The release page lives in `public/desktop/`.

`bridge.test.cjs` tests real process lifecycle logic with mocked Windows child
processes: source/credential validation, first-frame readiness, no-frame timeout,
retry cancellation, serial selection and cleanup. Native Windows USB, capture,
installation and uninstall should also be checked on a real Windows machine.

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

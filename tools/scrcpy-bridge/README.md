# TunnelSight laptop screen bridge

Windows script for publishing the full phone display to TunnelSight's existing RTMP relay. The laptop supplies internet. Version 1.4 uses Scrcpy's standalone phone video channel by default, independent of the desktop mirror window. Minimize, cover, move or resize the local Scrcpy mirror without changing the web feed. The phone must stay connected and authorized for USB debugging. Website visitors receive video; phone control stays in your local Scrcpy mirror. Audio is not captured.

## Setup

The bridge sends a fixed 1280x720 landscape stream. Portrait phone video rotates 90 degrees clockwise before encoding; landscape video is preserved. The website fits the entire stream inside its own resizable viewer. Recordings and captured frames use the source video dimensions, independent of the web panel's size. This rotates the picture; the phone app's layout does not reflow.

To rotate a portrait capture the other way, add `-PortraitRotation cclock`. To keep the original picture orientation, add `-StreamOrientation Original`. Output remains 1280x720 with its aspect ratio preserved; portrait mode may therefore have side padding.

Install current scrcpy and an FFmpeg Windows build with `gdigrab` and `libx264`. For example, in a new PowerShell terminal after installation:

```powershell
winget install --id Genymobile.scrcpy -e
winget install --id Gyan.FFmpeg -e
scrcpy --version
ffmpeg -version
```

Connect the phone by USB, enable USB debugging, and accept the phone's authorization prompt. The laptop needs internet independently of the phone's DJI Wi-Fi.

The bridge asks only for your TunnelSight account email. It automatically contacts the server, prepares your laptop stream, and retrieves the connection settings. No Android bridge app or copied RTMP URL is required. Your laptop needs internet access.

Run the downloaded script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-TunnelSightStream.ps1
```

Enter your email when prompted. The bridge finds your authorized phone through ADB and opens a separate video channel using the Scrcpy server bundled with your installation. If multiple phones are connected, choose the device number. Your local Scrcpy mirror can already be running. The sender does not depend on its window dimensions or visibility. Connection diagnostics are limited to one message every 30 seconds.

The script sends a 720p/30fps H.264 stream with one-second keyframes. Sign in to TunnelSight with the same email, open the live radio button, choose a project, and use the existing capture/record controls. Closing the selected window or pressing Ctrl+C stops publishing. An existing window stays open when the script stops. Network failures retry in the background. The email is a destination label, not proof of account ownership.

To provide the email directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-TunnelSightStream.ps1 -Email "you@example.com"
```

The phone remains interactive in the Scrcpy desktop window. The website provides video playback, frame capture, and recording; remote control from a browser is not provided by this script.

To capture an arbitrary computer window instead, opt in explicitly. This legacy mode depends on the window being visible; it cannot guarantee capture of a minimized window:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-TunnelSightStream.ps1 -CaptureSource Window
```

To skip the window picker using a known title:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-TunnelSightStream.ps1 -UseExistingWindow -WindowTitle "TECNO BG6m"
```

To launch a new Scrcpy mirror before selecting a window:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-TunnelSightStream.ps1 -StartScrcpy
```

If an older FFmpeg build does not recognize `hwnd=`, update it with `winget upgrade --id Gyan.FFmpeg -e` and reopen PowerShell.

In default Phone mode, laptop window changes have no effect on the stream. Window mode may include padding or desktop occlusion and can stop updating when minimized. Protected phone content may appear black. The direct phone channel requires a laptop/phone check; the Linux web server cannot exercise Windows USB and screen capture.

References: [Scrcpy standalone server](https://github.com/Genymobile/scrcpy/blob/master/doc/develop.md#standalone-server), [scrcpy window options](https://github.com/Genymobile/scrcpy/blob/master/doc/window.md), [FFmpeg gdigrab](https://ffmpeg.org/ffmpeg-devices.html#gdigrab).

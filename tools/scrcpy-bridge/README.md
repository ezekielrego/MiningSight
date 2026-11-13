# TunnelSight laptop screen bridge

Windows script for publishing a selected Scrcpy window to TunnelSight's existing RTMP relay. Version 1.5 defaults to the tested window-picker mode, with a lighter 720p/25fps encoder, approximately 1.2 Mbps target bitrate, a short encoder buffer, and keyframes roughly every half second. Keep the selected window visible and unminimized. The laptop supplies internet; phone control stays in Scrcpy. Audio is not captured.

## Setup

The bridge sends a fixed 1280x720 landscape stream. Portrait video rotates 90 degrees clockwise before encoding; landscape video is preserved. The website fits the entire stream inside its own resizable viewer. Recordings and captured frames use the source video dimensions. This rotates the picture; the phone app's layout does not reflow. The relay uses low-latency HLS parts, and the player returns close to live after stalls. Use Go live to catch up manually. Pausing deliberately suspends automatic catch-up.

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

Enter your email, then choose the Scrcpy window from the numbered list. Your mirror should already be open. Connection diagnostics are limited to one message every 30 seconds.

Sign in to TunnelSight with the same email, open the live radio button, choose a project, and use the capture/record controls. Closing the selected window or pressing Ctrl+C stops publishing. An existing window stays open when the script stops. Network failures retry in the background. The email is a destination label, not proof of account ownership.

To provide the email directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-TunnelSightStream.ps1 -Email "you@example.com"
```

The phone remains interactive in the Scrcpy desktop window. The website provides video playback, frame capture, and recording; remote control from a browser is not provided by this script.

Window selection is the default. You can also select it explicitly:

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

The optional `-CaptureSource Phone` channel is experimental and failed to provide usable video on the current phone; use Window mode. Window capture may include padding or desktop occlusion and can stop updating when minimized. Protected phone content may appear black. The Linux web server cannot exercise Windows USB and desktop capture.

References: [Scrcpy standalone server](https://github.com/Genymobile/scrcpy/blob/master/doc/develop.md#standalone-server), [scrcpy window options](https://github.com/Genymobile/scrcpy/blob/master/doc/window.md), [FFmpeg gdigrab](https://ffmpeg.org/ffmpeg-devices.html#gdigrab).

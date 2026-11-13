# TunnelSight laptop screen bridge

Windows script for publishing a scrcpy phone window to TunnelSight's existing RTMP relay. The laptop supplies internet, and scrcpy supplies phone display and local mouse/keyboard control. Website visitors receive video; this does not add remote control in the browser. Audio is not captured.

## Setup

Install current scrcpy and an FFmpeg Windows build with `gdigrab` and `libx264`. For example, in a new PowerShell terminal after installation:

```powershell
winget install --id Genymobile.scrcpy -e
winget install --id Gyan.FFmpeg -e
scrcpy --version
ffmpeg -version
```

Connect the phone by USB, enable USB debugging, and accept the phone's authorization prompt. The laptop needs internet independently of the phone's DJI Wi-Fi.

Link the Android bridge app to your TunnelSight account email. In its DJI settings, copy the RTMP publish URL. Stop the Android stream before starting the laptop publisher: both use the same account's stream slot. Keep that URL private.

Run the downloaded script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-TunnelSightStream.ps1
```

Paste the RTMP URL at its hidden prompt. It launches scrcpy, waits for its window, then sends a 720p/30fps H.264 stream with one-second keyframes. Sign in to TunnelSight with the linked email, open the live radio button, choose a project, and use the existing capture/record controls. Closing scrcpy or pressing Ctrl+C stops the bridge. Network failures retry in the background.

To use a scrcpy window already running, provide its exact title:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-TunnelSightStream.ps1 -UseExistingWindow -WindowTitle "TECNO BG6m"
```

Keep scrcpy visible and avoid resizing, minimizing, or changing orientation during a session. Restart the bridge after changing orientation. Window capture may include padding or desktop occlusion; protected phone content can appear black. This Windows capture path requires a laptop/phone test; it cannot be tested on the Linux web server.

References: [scrcpy window options](https://github.com/Genymobile/scrcpy/blob/master/doc/window.md), [FFmpeg gdigrab](https://ffmpeg.org/ffmpeg-devices.html#gdigrab).

# TunnelSight Scrcpy Bridge 1.2 - Windows 10/11, PowerShell 5.1+.
[CmdletBinding()]
param(
    [string]$WindowTitle,
    [switch]$UseExistingWindow,
    [switch]$StartScrcpy,
    [string]$Serial,
    [string]$Email
)
$ErrorActionPreference = 'Stop'
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
if ($WindowTitle -match '["\r\n]') { throw 'Window title cannot contain quotes or newlines.' }
if ($Serial -and $Serial -notmatch '^[a-zA-Z0-9_.:\-]+$') { throw 'Invalid device serial.' }
Write-Host 'TunnelSight Scrcpy Bridge v1.2'
Write-Host 'Your laptop mirrors the phone and sends its screen to your TunnelSight account.'
if (-not $Email) { $Email = Read-Host 'TunnelSight account email' }
$Email = $Email.Trim().ToLowerInvariant()
if ($Email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw 'Enter your TunnelSight account email.' }
$settingsDirectory = Join-Path $env:LOCALAPPDATA 'TunnelSight'
New-Item -ItemType Directory -Path $settingsDirectory -Force | Out-Null
$deviceFile = Join-Path $settingsDirectory 'scrcpy-device-id.txt'
if (Test-Path $deviceFile) { $deviceId = (Get-Content $deviceFile -Raw).Trim() }
else {
    $deviceId = [Guid]::NewGuid().ToString('N')
    Set-Content -Path $deviceFile -Value $deviceId -Encoding ASCII
}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Write-Host 'Connecting to TunnelSight...'
try {
    $link = Invoke-RestMethod -Uri 'https://tunnelsight.applications.co.zw/api/bridge/scrcpy/link' -Method Post -ContentType 'application/json' -Body (@{ email = $Email; deviceId = $deviceId } | ConvertTo-Json) -TimeoutSec 30
} catch { throw 'Could not link to TunnelSight. Check your laptop internet connection and try again.' }
if (-not $link.success -or -not $link.publishUrl) { throw 'TunnelSight did not return a stream connection.' }
$publishUrl = $link.publishUrl
$uri = $null
if (-not [Uri]::TryCreate($publishUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('rtmp','rtmps')) {
    throw 'Enter a valid RTMP or RTMPS publish URL.'
}
if ($publishUrl -match '["\r\n]') { throw 'Invalid publish URL.' }
Add-Type @'
using System;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class TunnelSightWindow {
  public class Item { public IntPtr Handle; public string Title; public string ProcessName; }
  private delegate bool EnumProc(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindow(string className, string windowName);
  public static Item[] List() {
    var windows = new List<Item>();
    EnumWindows(delegate(IntPtr handle, IntPtr parameter) {
      if (!IsWindowVisible(handle) || IsIconic(handle)) return true;
      var title = new StringBuilder(1024);
      GetWindowText(handle, title, title.Capacity);
      if (title.Length == 0) return true;
      uint processId;
      GetWindowThreadProcessId(handle, out processId);
      string processName = "window";
      try { processName = Process.GetProcessById((int)processId).ProcessName; } catch {}
      windows.Add(new Item { Handle = handle, Title = title.ToString(), ProcessName = processName });
      return true;
    }, IntPtr.Zero);
    return windows.ToArray();
  }
}
'@
$mirror = $null
try {
    if ($StartScrcpy) {
        if ($UseExistingWindow) { throw 'Choose StartScrcpy or UseExistingWindow, not both.' }
        $scrcpy = (Get-Command scrcpy -ErrorAction Stop).Source
        $mirrorArgs = @('--window-title=TunnelSight-Phone', '--max-size=1280', '--max-fps=30', '--video-bit-rate=4M', '--no-audio', '--window-width=960', '--window-height=540')
        if ($Serial) { $mirrorArgs += @('--serial', $Serial) }
        $mirror = Start-Process -FilePath $scrcpy -ArgumentList $mirrorArgs -PassThru
        Start-Sleep -Seconds 2
    }
    $windowHandle = [IntPtr]::Zero
    if ($WindowTitle) {
        $windowHandle = [TunnelSightWindow]::FindWindow($null, $WindowTitle)
        if ($windowHandle -eq [IntPtr]::Zero) { Write-Host 'That title was not found. Select an open window below.' }
    }
    while ($windowHandle -eq [IntPtr]::Zero) {
        $windows = @([TunnelSightWindow]::List() | Sort-Object @{ Expression = { if ($_.ProcessName -match 'scrcpy') { 0 } else { 1 } } }, Title)
        Write-Host ''
        Write-Host 'Select a window to stream (Scrcpy appears first). Restore minimized windows before choosing.'
        for ($index = 0; $index -lt $windows.Count; $index++) {
            Write-Host ('  {0}. {1} [{2}]' -f ($index + 1), $windows[$index].Title, $windows[$index].ProcessName)
        }
        $choice = Read-Host 'Window number, R to refresh, or Q to cancel'
        if ($choice -match '^[Qq]$') { return }
        if ($choice -match '^[Rr]$') { continue }
        $selectedIndex = 0
        if (-not [int]::TryParse($choice, [ref]$selectedIndex) -or $selectedIndex -lt 1 -or $selectedIndex -gt $windows.Count) {
            Write-Host 'Enter one of the window numbers shown above.'
            continue
        }
        $selected = $windows[$selectedIndex - 1]
        if (-not [TunnelSightWindow]::IsWindow($selected.Handle)) { Write-Host 'That window closed. Choose another.'; continue }
        $windowHandle = $selected.Handle
        $WindowTitle = $selected.Title
    }
    Write-Host "Selected: $WindowTitle"
    # Use the actual window identity so changes to its title do not stop capture.
    $captureInput = 'hwnd=0x' + $windowHandle.ToInt64().ToString('X')
    $streamArgs = @('-hide_banner', '-loglevel', 'warning', '-nostdin',
        '-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '0', '-i', $captureInput,
        '-an', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
        '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p',
        '-b:v', '2000k', '-maxrate', '2500k', '-bufsize', '2000k', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0',
        '-rw_timeout', '10000000', '-f', 'flv', '-flvflags', 'no_duration_filesize', $publishUrl)
    Write-Host "Streaming to $Email. On TunnelSight, sign in with this email, open Live, and choose a project."
    Write-Host 'Keep the selected window visible. Press Ctrl+C to stop streaming. Your existing window stays open.'
    # Network failures restart FFmpeg while scrcpy remains open. Credentials are redacted.
    $ErrorActionPreference = 'Continue'
    while ([TunnelSightWindow]::IsWindow($windowHandle)) {
        & $ffmpeg @streamArgs 2>&1 | ForEach-Object {
            $line = $_.ToString().Replace($publishUrl, '[publish URL]')
            $line = $line -replace '(?i)(pass=)[^&\s]+', '$1[hidden]'
            Write-Host $line
        }
        if (-not [TunnelSightWindow]::IsWindow($windowHandle)) { break }
        Write-Host 'Publisher stopped. Retrying in 3 seconds; check internet and keep the phone connected.'
        Start-Sleep -Seconds 3
    }
} finally {
    if ($mirror -and -not $mirror.HasExited) { Stop-Process -Id $mirror.Id -ErrorAction SilentlyContinue }
    $publishUrl = $null
}

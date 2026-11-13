# TunnelSight Scrcpy Bridge 1.5 - Windows 10/11, PowerShell 5.1+.
[CmdletBinding()]
param(
    [string]$WindowTitle,
    [switch]$UseExistingWindow,
    [switch]$StartScrcpy,
    [string]$Serial,
    [string]$Email,
    [ValidateSet('Phone', 'Window')]
    [string]$CaptureSource = 'Window',
    [ValidateSet('Landscape', 'Original')]
    [string]$StreamOrientation = 'Landscape',
    [ValidateSet('clock', 'cclock')]
    [string]$PortraitRotation = 'clock'
)
$ErrorActionPreference = 'Stop'
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
if ($WindowTitle -match '["\r\n]') { throw 'Window title cannot contain quotes or newlines.' }
if ($Serial -and $Serial -notmatch '^[a-zA-Z0-9_.:\-]+$') { throw 'Invalid device serial.' }
if ($UseExistingWindow -or $WindowTitle) { $CaptureSource = 'Window' }
Write-Host 'TunnelSight Scrcpy Bridge v1.5 - low delay window capture'
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
if ($CaptureSource -eq 'Window') { Add-Type @'
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
}
$mirror = $null
$phoneCaptureProcess = $null
$adb = $null
$adbPort = $null
$remoteServer = $null
try {
    if ($StartScrcpy) {
        if ($UseExistingWindow) { throw 'Choose StartScrcpy or UseExistingWindow, not both.' }
        $scrcpy = (Get-Command scrcpy -ErrorAction Stop).Source
        $mirrorArgs = @('--window-title=TunnelSight-Phone', '--max-size=1280', '--max-fps=30', '--video-bit-rate=4M', '--no-audio', '--window-width=960', '--window-height=540')
        if ($Serial) { $mirrorArgs += @('--serial', $Serial) }
        $mirror = Start-Process -FilePath $scrcpy -ArgumentList $mirrorArgs -PassThru
        Start-Sleep -Seconds 2
    }
    if ($CaptureSource -eq 'Phone') {
        $scrcpy = (Get-Command scrcpy -ErrorAction Stop).Source
        $scrcpyItem = Get-Item $scrcpy
        if ($scrcpyItem.Target) {
            $target = @($scrcpyItem.Target)[0]
            if (Test-Path $target) { $scrcpy = (Resolve-Path $target).Path }
        }
        $serverCandidates = @()
        if ($env:SCRCPY_SERVER_PATH) { $serverCandidates += $env:SCRCPY_SERVER_PATH }
        $serverCandidates += (Join-Path (Split-Path $scrcpy) 'scrcpy-server')
        $packageRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
        if (Test-Path $packageRoot) {
            foreach ($package in Get-ChildItem $packageRoot -Directory -Filter 'Genymobile.scrcpy*') {
                $serverCandidates += @(Get-ChildItem $package.FullName -Recurse -File -Filter 'scrcpy-server' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
            }
        }
        $serverFile = $serverCandidates | Where-Object { Test-Path $_ -PathType Leaf } | Select-Object -First 1
        if (-not $serverFile) { throw 'Cannot find scrcpy-server beside scrcpy.exe. Install the full Scrcpy package, or set SCRCPY_SERVER_PATH to its bundled scrcpy-server file.' }
        $bundledScrcpy = Join-Path (Split-Path $serverFile) 'scrcpy.exe'
        if (Test-Path $bundledScrcpy) { $scrcpy = $bundledScrcpy }
        $versionText = (& $scrcpy --version 2>$null) -join "`n"
        $version = [regex]::Match($versionText, 'scrcpy\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)').Groups[1].Value
        if (-not $version) { throw 'Could not identify the installed Scrcpy version.' }
        $bundledAdb = Join-Path (Split-Path $serverFile) 'adb.exe'
        if (Test-Path $bundledAdb) { $adb = $bundledAdb }
        else { $adb = (Get-Command adb -ErrorAction Stop).Source }
        if (-not $Serial) {
            $devices = @(& $adb devices | Where-Object { $_ -match '^\S+\s+device\s*$' } | ForEach-Object { ($_ -split '\s+')[0] })
            if ($devices.Count -eq 0) { throw 'No authorized phone found. Connect USB, enable USB debugging, and accept the authorization prompt on the phone.' }
            if ($devices.Count -eq 1) { $Serial = $devices[0] }
            else {
                for ($i = 0; $i -lt $devices.Count; $i++) { Write-Host ('  {0}. {1}' -f ($i + 1), $devices[$i]) }
                $deviceChoice = 0
                $answer = Read-Host 'Choose the phone number to stream'
                if (-not [int]::TryParse($answer, [ref]$deviceChoice) -or $deviceChoice -lt 1 -or $deviceChoice -gt $devices.Count) { throw 'Choose a valid connected phone number.' }
                $Serial = $devices[$deviceChoice - 1]
            }
        }
        if ($Serial -notmatch '^[a-zA-Z0-9_.:\-]+$') { throw 'Invalid phone identifier.' }
        $sessionId = (Get-Random -Minimum 268435456 -Maximum 1879048191).ToString('x8')
        $remoteServer = "/data/local/tmp/tunnelsight-$sessionId.jar"
        & $adb -s $Serial push $serverFile $remoteServer | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not prepare screen capture on the phone.' }
        $adbPort = ((& $adb -s $Serial forward tcp:0 "localabstract:scrcpy_$sessionId") -join '').Trim()
        if ($LASTEXITCODE -ne 0 -or $adbPort -notmatch '^\d{1,5}$') { throw 'Could not connect the laptop to the phone video channel.' }
        $phoneServerArgs = @('-s', $Serial, 'shell', "CLASSPATH=$remoteServer", 'app_process', '/', 'com.genymobile.scrcpy.Server', $version,
            "scid=$sessionId", 'tunnel_forward=true', 'audio=false', 'control=false', 'cleanup=false', 'raw_stream=true', 'video_codec=h264',
            'max_size=1280', 'max_fps=30', 'video_bit_rate=4000000', 'log_level=warn')
        $inputArgs = @('-fflags', '+genpts', '-use_wallclock_as_timestamps', '1', '-thread_queue_size', '512', '-f', 'h264', '-i', "tcp://127.0.0.1:${adbPort}?timeout=15000000")
        Write-Host 'Capturing the full phone display directly. Resizing or minimizing the laptop mirror will not change the web feed.'
    } else {
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
    $inputArgs = @('-thread_queue_size', '8', '-f', 'gdigrab', '-framerate', '25', '-draw_mouse', '0', '-i', $captureInput)
    Write-Host 'Capturing the selected window. Keep it visible and unminimized.'
    }
    # Rotate portrait captures before encoding so the website, recordings and
    # captured reconstruction frames all receive the same landscape picture.
    # Already-landscape windows pass through without being rotated.
    $videoFilter = 'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1'
    if ($StreamOrientation -eq 'Landscape') {
        $videoFilter = "transpose=dir=${PortraitRotation}:passthrough=landscape,$videoFilter"
        Write-Host 'Web feed: landscape 1280x720. Portrait windows rotate sideways; existing landscape windows remain upright.'
    }
    $streamArgs = @('-hide_banner', '-loglevel', 'warning', '-nostdin') + $inputArgs + @(
        '-an', '-vf', $videoFilter,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p',
        '-b:v', '1200k', '-maxrate', '1500k', '-bufsize', '300k', '-bf', '0', '-g', '12', '-keyint_min', '12', '-sc_threshold', '0',
        '-r', '25', '-flush_packets', '1', '-rw_timeout', '10000000', '-f', 'flv', '-flvflags', 'no_duration_filesize', $publishUrl)
    Write-Host "Streaming to $Email. On TunnelSight, sign in with this email, open Live, and choose a project."
    Write-Host 'Press Ctrl+C to stop streaming. Your existing Scrcpy window stays open.'
    # Network failures restart FFmpeg while scrcpy remains open. Credentials are redacted.
    $ErrorActionPreference = 'Continue'
    $lastDiagnosticAt = [DateTime]::MinValue
    while ($CaptureSource -eq 'Phone' -or [TunnelSightWindow]::IsWindow($windowHandle)) {
        if ($CaptureSource -eq 'Phone') {
            if ($phoneCaptureProcess -and -not $phoneCaptureProcess.HasExited) { Stop-Process -Id $phoneCaptureProcess.Id -ErrorAction SilentlyContinue }
            $phoneCaptureProcess = Start-Process -FilePath $adb -ArgumentList $phoneServerArgs -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $settingsDirectory 'scrcpy-capture.log') -RedirectStandardError (Join-Path $settingsDirectory 'scrcpy-capture-error.log')
            Start-Sleep -Milliseconds 1000
        }
        & $ffmpeg @streamArgs 2>&1 | ForEach-Object {
            $line = $_.ToString().Replace($publishUrl, '[publish URL]')
            $line = $line -replace '(?i)(pass=)[^&\s]+', '$1[hidden]'
            if (([DateTime]::UtcNow - $lastDiagnosticAt).TotalSeconds -ge 30) { Write-Host $line; $lastDiagnosticAt = [DateTime]::UtcNow }
        }
        if ($CaptureSource -eq 'Window' -and -not [TunnelSightWindow]::IsWindow($windowHandle)) { break }
        if (([DateTime]::UtcNow - $lastDiagnosticAt).TotalSeconds -ge 30) { Write-Host 'Connection interrupted. Retrying automatically; check internet and USB.'; $lastDiagnosticAt = [DateTime]::UtcNow }
        Start-Sleep -Seconds 3
    }
} finally {
    if ($phoneCaptureProcess -and -not $phoneCaptureProcess.HasExited) { Stop-Process -Id $phoneCaptureProcess.Id -ErrorAction SilentlyContinue }
    if ($adb -and $adbPort) { & $adb -s $Serial forward --remove "tcp:$adbPort" 2>$null | Out-Null }
    if ($adb -and $remoteServer) { & $adb -s $Serial shell rm $remoteServer 2>$null | Out-Null }
    if ($mirror -and -not $mirror.HasExited) { Stop-Process -Id $mirror.Id -ErrorAction SilentlyContinue }
    $publishUrl = $null
}

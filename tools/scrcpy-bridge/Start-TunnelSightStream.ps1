# Windows 10/11, PowerShell 5.1+. Requires scrcpy and FFmpeg in PATH.
[CmdletBinding()]
param(
    [string]$WindowTitle = 'TunnelSight Phone',
    [switch]$UseExistingWindow,
    [string]$Serial
)
$ErrorActionPreference = 'Stop'
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
if ($WindowTitle -match '["\r\n]') { throw 'Window title cannot contain quotes or newlines.' }
if ($Serial -and $Serial -notmatch '^[a-zA-Z0-9_.:\-]+$') { throw 'Invalid device serial.' }
Write-Host 'Copy the RTMP publish URL from the linked Android bridge DJI settings.'
Write-Host 'Stop publishing in the Android bridge first. Watch on the website using the same linked account.'
$secret = Read-Host 'RTMP publish URL (hidden)' -AsSecureString
$publishUrl = [System.Net.NetworkCredential]::new('', $secret).Password
$uri = $null
if (-not [Uri]::TryCreate($publishUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('rtmp','rtmps')) {
    throw 'Enter a valid RTMP or RTMPS publish URL.'
}
if ($publishUrl -match '["\r\n]') { throw 'Invalid publish URL.' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class TunnelSightWindow {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindow(string className, string windowName);
}
'@
$mirror = $null
try {
    if (-not $UseExistingWindow) {
        $scrcpy = (Get-Command scrcpy -ErrorAction Stop).Source
        $mirrorArgs = @("--window-title=`"$WindowTitle`"", '--max-size=1280', '--max-fps=30', '--video-bit-rate=4M', '--no-audio', '--window-width=960', '--window-height=540', '--no-window-aspect-ratio-lock')
        if ($Serial) { $mirrorArgs += @('--serial', $Serial) }
        $mirror = Start-Process -FilePath $scrcpy -ArgumentList $mirrorArgs -PassThru
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([TunnelSightWindow]::FindWindow($null, $WindowTitle) -eq [IntPtr]::Zero) {
        if ($mirror -and $mirror.HasExited) { throw 'scrcpy exited. Check USB debugging, device authorization, and your scrcpy version.' }
        if ([DateTime]::UtcNow -gt $deadline) { throw "No scrcpy window named '$WindowTitle' found within 30 seconds." }
        Start-Sleep -Milliseconds 250
    }
    $streamArgs = @('-hide_banner', '-loglevel', 'warning', '-nostdin',
        '-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '0', '-i', "title=$WindowTitle",
        '-an', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
        '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p',
        '-b:v', '2000k', '-maxrate', '2500k', '-bufsize', '2000k', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0',
        '-rw_timeout', '10000000', '-f', 'flv', '-flvflags', 'no_duration_filesize', $publishUrl)
    Write-Host 'Publishing scrcpy video. Keep its window visible and at a fixed size. Press Ctrl+C to stop.'
    # Network failures restart FFmpeg while scrcpy remains open. Credentials are redacted.
    $ErrorActionPreference = 'Continue'
    while ([TunnelSightWindow]::FindWindow($null, $WindowTitle) -ne [IntPtr]::Zero) {
        & $ffmpeg @streamArgs 2>&1 | ForEach-Object {
            $line = $_.ToString().Replace($publishUrl, '[publish URL]')
            $line = $line -replace '(?i)(pass=)[^&\s]+', '$1[hidden]'
            Write-Host $line
        }
        if ([TunnelSightWindow]::FindWindow($null, $WindowTitle) -eq [IntPtr]::Zero) { break }
        Write-Host 'Publisher stopped. Retrying in 3 seconds; check internet and keep the phone connected.'
        Start-Sleep -Seconds 3
    }
} finally {
    if ($mirror -and -not $mirror.HasExited) { Stop-Process -Id $mirror.Id -ErrorAction SilentlyContinue }
    $publishUrl = $null
    $secret.Dispose()
}

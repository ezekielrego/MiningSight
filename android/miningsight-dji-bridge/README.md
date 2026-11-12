# MiningSight DJI Bridge

This is the lightweight Android field transmitter for a DJI Phantom 3 Standard. The Android phone stays connected to the DJI controller, the DJI Mobile SDK receives the aircraft video, and the app publishes that feed to an RTMP endpoint. MiningSight remains the browser viewer and reconstruction workspace.

## Current status

- Android project builds with the command-line SDK and Gradle; Android Studio is not required.
- Uses DJI Mobile SDK 4.18 and `LiveStreamManager`.
- Version 1.0.2 has a collapsible source drawer, a full-screen phone-camera preview with floating start/stop/switch controls, automatic preview retry after permission and surface creation, and temporary diagnostic log sync.
- Version 1.0.2 links the bridge to a TunnelSight account email. The server creates the device-specific RTMP publish path; the web account with the same email resolves its HLS playback path automatically.
- Version 1.0.4 uses RootEncoder's stream API with an Android SurfaceView for phone preview, avoiding the GL preview failure seen on some handsets. Link the account again after upgrading so the app receives the authenticated RTMP URL.
- A real DJI App Key is required at build time and must not be committed.
- Bridge version 0.6.0 adds a user-triggered DJI connection attempt, suppresses duplicate scans, and reports when the SDK declines to start the connection.
- Bridge version 0.7.0 automatically syncs its temporary diagnostics to the private TunnelSight log inbox every 10 seconds while open. The inbox expires logs after 48 hours and is visible in TunnelSight with the project-owner account.
- Version 0.8.0 permits controller connection when Android hides the SSID but Wi-Fi is connected, fixes null camera-feed cleanup, requests location permissions together, and prefers a validated internet network for log uploads. SDK registration runs in the background with progress and timeout diagnostics.
- Version 0.9.0 follows DJI’s current sample sequence: after registration succeeds, it immediately starts the Wi-Fi product connection, explicitly disables Bluetooth-only mode, and keeps the manual button as a retry.
- The app has not been flight-tested from this server; that requires the Phantom, controller, Android phone, and a network-accessible ingest endpoint.

## Build

The server toolchain uses `/home/ezekiel/android-sdk`, JDK 21, and the Gradle wrapper in this directory:

```bash
export ANDROID_SDK_ROOT=/home/ezekiel/android-sdk
export ANDROID_HOME=/home/ezekiel/android-sdk
export PATH="$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

./gradlew assembleDebug -PDJI_APP_KEY="$DJI_APP_KEY" -PBRIDGE_LOG_TOKEN="$BRIDGE_LOG_TOKEN"
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`. Set `DJI_APP_KEY` only in the shell or a local secret manager; do not put it in Git.

## Field flow

1. Complete DJI's one-time aircraft activation in DJI GO.
2. Power on the remote controller and aircraft; wait for the controller link indicator to become solid green.
3. Connect the Android phone to the controller's `PHANTOM3_…` Wi-Fi.
4. Force-stop DJI GO and other DJI camera apps before testing the bridge. Keep only the bridge app connected during a test; use a second device to view TunnelSight.
5. Open the bridge app, tap **Connect / retry DJI**, and wait for its local camera preview before starting the RTMP stream.
6. Open the bridge drawer with `☰`, enter the same email used for TunnelSight, and tap **Link stream account**. Switch to **DJI Bridge** or **Phone Camera**, wait for the local preview, and tap the floating start control. The matching signed-in TunnelSight account resolves the stream in the live viewer.

The Phantom 3 Standard uses the controller's Wi-Fi connection rather than the USB accessory flow used by newer DJI products. Keep mobile data available while connected to the controller Wi-Fi so the bridge can reach the VPS. Browser playback is available through the signed-in live viewer and the HLS relay at `https://tunnelsight.applications.co.zw/dji/live/index.m3u8`.

## Security and production work remaining

- Use an authenticated, short-lived publish credential; never publish with an open RTMP path.
- Put browser playback behind HTTPS and a read credential or signed session.
- Run the transmitter as a foreground service when the app needs to keep streaming while the screen is not visible.
- Add a server-side stream-health endpoint so the website can show live, reconnecting, and offline states.
- Test the complete path on the actual controller, mobile network, VPS, and browser before relying on it for a flight.

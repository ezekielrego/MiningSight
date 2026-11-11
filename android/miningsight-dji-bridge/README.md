# MiningSight DJI Bridge

This is the lightweight Android field transmitter for a DJI Phantom 3 Standard. The Android phone stays connected to the DJI controller, the DJI Mobile SDK receives the aircraft video, and the app publishes that feed to an RTMP endpoint. MiningSight remains the browser viewer and reconstruction workspace.

## Current status

- Android project builds with the command-line SDK and Gradle; Android Studio is not required.
- Uses DJI Mobile SDK 4.18 and `LiveStreamManager`.
- The app has a small foreground screen for entering an RTMP publish URL and starting or stopping the stream.
- A real DJI App Key is required at build time and must not be committed.
- The app has not been flight-tested from this server; that requires the Phantom, controller, Android phone, and a network-accessible ingest endpoint.

## Build

The server toolchain uses `/home/ezekiel/android-sdk`, JDK 21, and the Gradle wrapper in this directory:

```bash
export ANDROID_SDK_ROOT=/home/ezekiel/android-sdk
export ANDROID_HOME=/home/ezekiel/android-sdk
export PATH="$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

./gradlew assembleDebug -PDJI_APP_KEY="$DJI_APP_KEY"
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`. Set `DJI_APP_KEY` only in the shell or a local secret manager; do not put it in Git.

## Field flow

1. Activate the aircraft and complete DJI's first-run requirements in DJI GO.
2. Connect the Android phone to the Phantom 3 Standard controller's Wi-Fi.
3. Give the app the protected RTMP publish URL issued by the MiningSight stream service.
4. Start the stream and open MiningSight in a browser to view the live feed and capture frames.

The Phantom 3 Standard uses the controller's Wi-Fi connection rather than the USB accessory flow used by newer DJI products. The VPS must expose a secured ingest endpoint and a browser-friendly HLS or WebRTC playback endpoint before field use.

## Security and production work remaining

- Use an authenticated, short-lived publish credential; never publish with an open RTMP path.
- Put browser playback behind HTTPS and a read credential or signed session.
- Run the transmitter as a foreground service when the app needs to keep streaming while the screen is not visible.
- Add a server-side stream-health endpoint so the website can show live, reconnecting, and offline states.
- Test the complete path on the actual controller, mobile network, VPS, and browser before relying on it for a flight.

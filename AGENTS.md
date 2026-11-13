# TunnelSight project workflow

## Assisted reconstruction requests

When Ezekiel says "reconstruct new request", "it's queued", "its queued",
"reconstruction queued", or equivalent wording about a new reconstruction,
treat it as an instruction to start building the saved request. Do not merely
acknowledge the queue or ask for permission to begin.

1. Locate the running application's configured data directory. Reconstruction
   requests are stored under `reconstruction-jobs/<owner-hash>/<request-id>/`.
   Use the active server configuration; do not assume a checkout's data path.
2. Identify Ezekiel's account using account metadata, then inspect only that
   owner's requests. Select the newest pending assisted request by `createdAt`.
   If the user names a request or scene, use that exact request instead. Do not
   pick another user's upload, a completed request, or an older scene silently.
3. Read `request.json` and any `result.json`. Inspect the actual saved reference
   image visually, along with all supplied map images, map geometry, measurements,
   scene name, commands, exclusions, and operation mode. Do not substitute sample
   images or use a stock tunnel as the result.
4. Build the requested detailed MiningSight-compatible scene from those inputs.
   Preserve separate selectable parts, orbit/walk navigation, the matching
   editable map, and the private account scope. Honour explicit inclusions and
   exclusions. Treat an automatically drafted straight map as an illustrative
   placeholder, not observed tunnel geometry or genuine survey data. Record
   unknown dimensions and hidden geometry as assumptions.
5. Verify the actual geometry and loading flow, deploy the required changes, and
   make the named result available to its owner. Do not publish a private request
   as a public sample without an explicit instruction.
6. Mark the exact saved request completed only after its result is ready. Use
   `tools/complete-reconstruction.mjs` with the configured archive directory and
   a supported result containing `presetId` or `data.procedural3DParams`. Preserve
   the original input and actual processing source (`assisted`). Do not pretend
   the work was executed by Gemini or mark unfinished work completed.
7. Tell the user the scene name/request ID and how to refresh and load the result
   in the website. If no matching pending request or readable reference exists,
   state that clearly and request the missing input; do not fabricate a result.

These phrases trigger work when the user sends a message. They do not establish
an unattended background worker or automatic monitoring between messages.


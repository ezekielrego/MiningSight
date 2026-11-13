# Reconstruction handoff

Use the top navigation **Reconstruct** shortcut. In MiningSight Compatible Reconstruction attach the reference and map, enter measurements and instructions, then select **Save & queue assisted reconstruction**. The same inputs are also archived before Gemini attempts, including attempts that fail because of missing keys.

Requests are private to the signed-in user. Each stores the exact generation payload, including image data URLs, map image/text/geometry, selected segment, dimensions, offset, scene and commands, in `data/reconstruction-jobs/<owner-hash>/<request-id>/request.json` relative to the production working directory (or the parent of `MININGSIGHT_PROJECTS_DIR`). Each request is limited to 25 MB, and each owner archive to 100 MB. Requests persist until the operator archives them; this is separate from project asset storage.

Tell Codex the saved request ID, or ask it to inspect the latest pending/failed request for your account. There is no automatic Codex background worker. The operator reads request.json, decodes its image/map data URLs for inspection, implements the requested geometry, verifies it, registers it as a scene preset and deploys it. Do not mark a request complete until an actual deliverable exists.

Publish an assisted result with a JSON file containing `presetId` for a deployed preset, or `data.procedural3DParams` and `data.reconstructionPlan` for a compatible parameter result. Then run:

```bash
node tools/complete-reconstruction.mjs /home/tunnelsight.applications.co.zw/public_html/data/reconstruction-jobs REQUEST_UUID /path/to/result.json
```

For custom presets, add the deployed preset ID to the panel's supported completed-result IDs as part of that implementation. On the website choose **Refresh results**, then **Load completed reconstruction**. Preset results open the model directly; parameter results open the existing preview and Apply button. Completion is identified as Assisted, and never attributed to Gemini. The user can also return to completed Gemini results in this list.

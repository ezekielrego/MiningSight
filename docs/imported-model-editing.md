# Imported model editing and guided AI proposals

Load a saved local project, then explicitly open its model asset. The viewer still starts empty on page load. Imported models now register their original hierarchy in Objects, with stable IDs based on asset ID and child index paths. Expand the hierarchy and select a group or mesh part; duplicate names remain separate targets.

Imported models open framed in Orbit by default, including models with an authored camera. The authored camera still seeds the optional Walk view; select Walk explicitly to use it.

Use Display for Textured Shading, Shading with Lines, Wireframe Mesh or Point Cloud Vertices. Points displays the mesh vertices, rather than generating a new surveyed point cloud. Click a surface to select its part in orbit or walk navigation. Use the visibility dots to hide a part, Delete to remove it from the edited scene, or Coord. in Attributes to change its local transform. In Orbit, Move/Rotate/Scale with Shift-drag also edits the selection. The coordinate panel edits local object transforms in Orbit and camera location in Walk. Mesh editing here operates on existing parts/groups; it does not cut individual vertices or faces or remesh geometry.

Undo/Redo restores scene changes. Save project stores the edited hierarchy, visibility and transforms. Reopening the saved project and explicitly selecting the asset restores those edits. Removing a root hides it so the original hierarchy remains recoverable. Removing a nested part hides its original Three.js node and excludes it from the saved hierarchy; undo restores it. Geometry and the original uploaded file are never overwritten. Existing saved projects receive their hierarchy when their model is next opened.

## Guided editing

With a local model open, use AI Survey → Guided model editing. Enter guidance identifying the targets and desired change, then Generate edit proposal. This is an explicit provider request using the existing Gemini API Keys settings. It sends the guidance and part metadata (IDs, names, hierarchy, visibility and local transforms), without uploading the mesh or textures. Missing credentials and provider errors are reported; no fabricated proposal is substituted.

An ambiguous request may return a clarification question. A valid proposal opens Review guided model edits. Preview is temporary and does not enter saved project data. Apply confirmed edits is enabled after preview; it validates the current asset, parts, locked ancestors, operations and transforms again, checks that the scene has not changed, and creates one undo step. Cancel restores the pre-preview view. Save project persists confirmed changes. A proposal never writes a project on the server itself.

## Future AI connections

Export part context downloads the current asset's metadata and units. A future provider should produce the same JSON contract below. Its response can be pasted under Review a proposal from another AI connection, either as the proposal object or wrapped in `modelEditProposal`. Every connection must pass through the shared validation and human review flow; provider output must not call `setObjects`, save a project, or execute arbitrary code directly.

```json
{
  "version": 1,
  "assetId": "asset_example",
  "guidance": "Hide the identified ceiling panel to inspect its supports.",
  "operations": [
    { "type": "hide", "targetId": "imported:asset_example/0/0/4" }
  ]
}
```

Allowed operations are `hide`, `show`, `remove` and `transform`. A transform includes one or more complete `position`, `rotation` or `scale` vectors with numeric `x`, `y`, `z`. Values are absolute and local to the parent: positions in centimetres, rotations in Euler XYZ degrees, scales as ratios. Use exact exported IDs, never guessed names. Respect inherited locks and request clarification when a target or requested change is uncertain. The limits are 500 operations per proposal, finite coordinates within ±1e9, and absolute scale components between 0.0001 and 10000.

The authenticated endpoint is `POST /api/reconstruction/ai/model-edit-proposal`, with `{ projectId, assetId, guidance, objects: context.parts }`. The `/api/ai/model-edit-proposal` alias supports the production proxy rewrite. It verifies project ownership and asset membership, validates the supplied unsaved part context and provider output, then returns `{ success: true, modelEditProposal }` or `{ success: true, clarification }`. This endpoint supports local project model assets. It does not edit external embedded world viewers.

Validation:

```bash
node tools/imported-model-editing.test.mjs
node tools/model-edit-api.test.mjs
npm run lint
npm run build
```

The API test creates an isolated database and mocked provider. It makes no external AI requests and does not touch production projects.

# Public project viewing

Projects are private by default. Publishing a project allows anyone, including signed-out visitors, to read its scene, tours, map, notes and project assets. Public entries appear under **Public projects · no sign-in required** in Objects. Owner-only project endpoints continue to require authentication.

A direct link uses `/?publicProject=PROJECT_ID`. Opening that link automatically loads the project's first model or linked world asset, falling back to an image or video for media-only projects. Ordinary visits to `/` still start with an empty viewer. The project chooser also offers the built-in local scenes without requiring sign-in. Imported models open framed in Orbit; Walk remains an explicit choice. Visitors may inspect parts and change the local view; saving over the original project, uploading to it, or requesting AI edits to it is unavailable in the public view.

Owner-authenticated `PUT /api/ai/projects/:projectId/public` with `{ "public": true }` publishes a project; `{ "public": false }` revokes public access. The production proxy maps `/api/reconstruction/ai/…` to `/api/ai/…`. Public visibility lives in the `public_projects` table and survives normal project saves. New assets added to a published project are public as part of that project. Revocation blocks subsequent project and asset requests; downloaded copies cannot be recalled.

Anonymous APIs:

- `GET /api/ai/public/projects`
- `GET /api/ai/public/projects/:projectId`
- `GET /api/ai/public/projects/:projectId/assets/:assetId`

The asset route checks project publication and exact asset membership on every request, supports byte ranges, and does not use account tokens in its URLs. Public metadata uses an explicit scene-field allowlist and does not return saved private asset URLs, account metadata, provider settings or raw reconstruction inputs. Public responses use `Cache-Control: no-store` so revocation takes effect on subsequent requests.

Run `node tools/public-projects.test.mjs` to verify default privacy, owner-only publication, anonymous reads/ranges, removal of private metadata, cross-project isolation, write protection and revocation using an isolated database.

## Linked viewers

An owner can attach a named public Marble or other viewer link using `POST /api/ai/projects/:projectId/linked-assets` with `{ "name": "Marble preview", "url": "https://…", "provider": "worldlabs" }`. Provider is optional (`worldlabs`, `gemini`, `gomera`). The existing public URL validator rejects private addresses and non-HTTP protocols. Links are stored as `world` assets, require no model upload or API key, and do not consume file storage quota. Reconnecting the same URL updates its name without creating duplicates. Public project responses preserve the remote URL and use the same separate-origin embedded viewer as account-connected links. Publication does not change permissions at the external provider.

## Workspace controls

Minimize panels is the final top-right control, immediately after Lock Workspace. Locking prevents dock splitter resizing, panel collapsing/expanding, layout switching/resetting and dragging viewer overlays. Tabs and scene navigation remain usable; Minimize and Restore/Escape remain available. The lock setting is retained in this browser. Unlock restores layout editing.

With a built frontend preview running, `node tools/workspace-ui.test.cjs` checks these controls, local scene selection, Orbit defaults for an authored-camera GLB, and anonymous Marble embedding using mocked project APIs. Install `playwright-core` or set `MININGSIGHT_PLAYWRIGHT_MODULE` to its module path; `CHROME_EXECUTABLE` and `REVIEW_BASE` can override the browser and preview URL.

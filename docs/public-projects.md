# Public project viewing

Projects are private by default. Publishing a project allows anyone, including signed-out visitors, to read its scene, tours, map, notes and project assets. Public entries appear under **Public projects · no sign-in required** in Objects. Owner-only project endpoints continue to require authentication.

A direct link uses `/?publicProject=PROJECT_ID`. Opening that link automatically loads the project's first model asset. Ordinary visits to `/` still start with an empty viewer. Visitors may inspect parts and change the local view; saving over the original project, uploading to it, or requesting AI edits to it is unavailable in the public view.

Owner-authenticated `PUT /api/ai/projects/:projectId/public` with `{ "public": true }` publishes a project; `{ "public": false }` revokes public access. The production proxy maps `/api/reconstruction/ai/…` to `/api/ai/…`. Public visibility lives in the `public_projects` table and survives normal project saves. New assets added to a published project are public as part of that project. Revocation blocks subsequent project and asset requests; downloaded copies cannot be recalled.

Anonymous APIs:

- `GET /api/ai/public/projects`
- `GET /api/ai/public/projects/:projectId`
- `GET /api/ai/public/projects/:projectId/assets/:assetId`

The asset route checks project publication and exact asset membership on every request, supports byte ranges, and does not use account tokens in its URLs. Public metadata uses an explicit scene-field allowlist and does not return saved private asset URLs, account metadata, provider settings or raw reconstruction inputs. Public responses use `Cache-Control: no-store` so revocation takes effect on subsequent requests.

Run `node tools/public-projects.test.mjs` to verify default privacy, owner-only publication, anonymous reads/ranges, removal of private metadata, cross-project isolation, write protection and revocation using an isolated database.

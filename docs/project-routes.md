# Project and repository URLs

Legacy documentation repositories retain their short project URLs. With the
`-openapi` suffix configured, `/acme/aurora` addresses `acme/aurora-openapi`.

Configured repositories without that suffix use `/repos/{owner}/{repository}`.
For example, `/repos/acme/aurora` addresses exactly `acme/aurora`. The `repos`
prefix is reserved for repository routes.

An owner named `repos` always uses the explicit form, including for suffixed
repositories: `repos/aurora-openapi` opens at `/repos/repos/aurora-openapi`.
Existing `/repos/aurora/...` legacy links for that owner must be updated. They
cannot be guessed safely because they overlap the new repository namespace.
Incomplete repository URLs, such as `/repos/aurora`, produce a not-found page.

Both repositories can appear in the project list at the same time. They have
separate project IDs and base paths, even when their names or display names match.
Navigation and preview comments use the project's `path` field. API clients should
also use this field when creating portal links rather than reconstructing a URL
from `owner` and `name`.

The details endpoint supports explicit repository resolution through
`GET /api/projects/{owner}/{repository}?repository=true`. Without this flag it uses
the legacy suffixed repository name. There is no fallback between these modes:
missing repositories produce a not-found result, and exact repository requests
still require the usual configuration-file or suffix opt-in.

Old suffixless links that previously opened configured repositories without the
suffix must be updated to the `/repos/` form. Legacy documentation links are
unchanged except for the reserved owner described above. The project-list cache
uses a new key so previously hidden colliding repositories are rediscovered after
deployment.

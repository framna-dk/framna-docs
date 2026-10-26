# Database discovery list

The `project_discovery_repositories` table supplements automatic repository discovery.
Use it when a repository has its project configuration file but GitHub code search has
not indexed it yet. Entries are candidates: each user must still have GitHub access,
and repositories must meet the existing suffix or configuration-file opt-in rule.
Public repositories are included only for the user's own account or organizations,
matching automatic discovery. Hidden repositories remain excluded.
Candidates already found automatically are skipped; the remaining candidates are
checked in batches of at most four concurrent GitHub requests.

Users can open **+ Add project → Existing project** to see the discovery rules and
fast-track a repository by entering its GitHub URL or `owner/repository`. The server
checks their access and the repository's configuration before adding it to the list.
Fast-track discovery is available only for repositories without the configured name
suffix; suffixed repositories use automatic discovery. This uses GitHub's canonical
repository name and the same case-sensitive suffix rule as automatic discovery.
The project then appears in the sidebar and opens immediately. **Create a new
project** is a separate tab for creating a repository from the template.

Configured repositories open at `/repos/{owner}/{repository}`. This keeps them
distinct from legacy suffixed documentation repositories, even if both share the
same project name. See [project routes](project-routes.md) for the URL conventions.

For an existing installation, apply the migration to the application's PostgreSQL
database before deploying this change:

```sh
psql -v ON_ERROR_STOP=1 -f migrations/001-project-discovery-repositories.sql
```

Fresh installations create the table through `create-tables.sql`.

Set `NEXTAUTH_URL` to the application's public URL. Fast-track submissions validate
the browser's Origin against this configured URL, including behind a reverse proxy
where the internal server URL differs.

Operators can also add a candidate directly by its GitHub owner and repository name:

```sql
INSERT INTO project_discovery_repositories (owner, name)
VALUES ('acme', 'aurora')
ON CONFLICT (owner, name) DO NOTHING;
```

Remove a candidate with:

```sql
DELETE FROM project_discovery_repositories
WHERE owner = 'acme' AND name = 'aurora';
```

Refresh the project list after editing the table. The existing per-user cache remains
in effect until refresh (`GET /api/projects?refresh=true`). Removing a candidate stops
manual discovery; a repository found through automatic discovery remains listed.

Candidates that are missing or inaccessible to the user are skipped. Authentication,
rate-limit, database, and other service errors still surface instead of producing an
incomplete result that could be cached as a successful refresh.

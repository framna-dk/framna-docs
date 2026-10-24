# Database discovery list

The `project_discovery_repositories` table supplements automatic repository discovery.
Use it when a repository has its project configuration file but GitHub code search has
not indexed it yet. Entries are candidates: each user must still have GitHub access,
and repositories must meet the existing suffix or configuration-file opt-in rule.
Public repositories are included only for the user's own account or organizations,
matching automatic discovery. Hidden repositories remain excluded.

For an existing installation, apply the migration to the application's PostgreSQL
database before deploying this change:

```sh
psql -v ON_ERROR_STOP=1 -f migrations/001-project-discovery-repositories.sql
```

Fresh installations create the table through `create-tables.sql`.

Add a candidate by its GitHub owner and repository name:

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

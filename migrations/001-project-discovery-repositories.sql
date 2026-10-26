CREATE TABLE IF NOT EXISTS project_discovery_repositories
(
  owner TEXT NOT NULL,
  name TEXT NOT NULL,

  PRIMARY KEY (owner, name)
);

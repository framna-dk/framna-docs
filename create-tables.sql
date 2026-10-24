CREATE TABLE accounts
(
  id SERIAL,
  "userId" INTEGER NOT NULL,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT,

  PRIMARY KEY (id)
);

CREATE TABLE sessions
(
  id SERIAL,
  "userId" INTEGER NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL,

  PRIMARY KEY (id)
);

CREATE TABLE users
(
  id SERIAL,
  name VARCHAR(255),
  email VARCHAR(255),
  "emailVerified" TIMESTAMPTZ,
  image TEXT,

  PRIMARY KEY (id)
);

CREATE TABLE oauth_tokens
(
  user_id VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  access_token VARCHAR(255) NOT NULL,
  refresh_token VARCHAR(255) NOT NULL,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  
  PRIMARY KEY (user_id, provider)
);

CREATE TABLE project_discovery_repositories
(
  owner TEXT NOT NULL,
  name TEXT NOT NULL,

  PRIMARY KEY (owner, name)
);

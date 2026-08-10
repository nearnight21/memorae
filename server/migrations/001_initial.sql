CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  login_name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled_at TIMESTAMPTZ NULL,
  CONSTRAINT accounts_login_name_length CHECK (char_length(login_name) BETWEEN 3 AND 200)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX sessions_active_account_idx ON sessions (account_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE vault_envelopes (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE RESTRICT,
  crypto_version SMALLINT NOT NULL CHECK (crypto_version = 1),
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE memory_ciphers (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  memory_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  crypto_version SMALLINT NOT NULL CHECK (crypto_version = 1),
  deleted BOOLEAN NOT NULL,
  payload_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, memory_id),
  CONSTRAINT memory_ciphers_memory_id_length CHECK (char_length(memory_id) BETWEEN 1 AND 200)
);

CREATE INDEX memory_ciphers_account_memory_idx ON memory_ciphers (account_id, memory_id);

CREATE TABLE photo_ciphers (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  photo_id TEXT NOT NULL,
  crypto_version SMALLINT NOT NULL CHECK (crypto_version = 1),
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, photo_id),
  CONSTRAINT photo_ciphers_photo_id_length CHECK (char_length(photo_id) BETWEEN 1 AND 200)
);

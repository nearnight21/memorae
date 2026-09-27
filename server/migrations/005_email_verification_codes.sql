CREATE TABLE email_verification_codes (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT email_verification_email_length CHECK (char_length(email) BETWEEN 3 AND 190)
);

CREATE INDEX email_verification_codes_lookup_idx
  ON email_verification_codes (email, created_at DESC)
  WHERE consumed_at IS NULL;

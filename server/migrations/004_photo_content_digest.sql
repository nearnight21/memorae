ALTER TABLE photo_ciphers
  ADD COLUMN content_sha256 TEXT NULL,
  ADD CONSTRAINT photo_ciphers_content_sha256 CHECK (
    content_sha256 ~ '^[0-9a-f]{64}$' OR content_sha256 IS NULL
  );

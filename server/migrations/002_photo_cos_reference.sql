ALTER TABLE photo_ciphers
  ALTER COLUMN payload_json DROP NOT NULL,
  ADD COLUMN storage_kind TEXT NULL,
  ADD COLUMN object_key TEXT NULL,
  ADD COLUMN photo_kind TEXT NULL,
  ADD COLUMN metadata_json JSONB NULL,
  ADD CONSTRAINT photo_ciphers_storage_kind CHECK (storage_kind IN ('cos') OR storage_kind IS NULL),
  ADD CONSTRAINT photo_ciphers_storage_shape CHECK (
    (storage_kind IS NULL AND payload_json IS NOT NULL)
    OR (
      storage_kind = 'cos'
      AND payload_json IS NULL
      AND object_key IS NOT NULL
      AND photo_kind IN ('original', 'thumbnail')
      AND metadata_json IS NOT NULL
    )
  );

CREATE UNIQUE INDEX photo_ciphers_object_key_unique ON photo_ciphers (object_key)
  WHERE object_key IS NOT NULL;

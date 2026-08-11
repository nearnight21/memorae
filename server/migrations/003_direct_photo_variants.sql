ALTER TABLE photo_ciphers
  DROP CONSTRAINT photo_ciphers_storage_shape,
  DROP CONSTRAINT photo_ciphers_pkey,
  ADD COLUMN transfer_status TEXT NULL,
  ADD COLUMN upload_id UUID NULL,
  ADD COLUMN content_length BIGINT NULL,
  ADD COLUMN object_etag TEXT NULL,
  ADD COLUMN upload_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN completed_at TIMESTAMPTZ NULL;

UPDATE photo_ciphers
SET photo_kind = payload_json->>'kind'
WHERE photo_kind IS NULL;

UPDATE photo_ciphers
SET transfer_status = 'ready'
WHERE storage_kind = 'cos';

ALTER TABLE photo_ciphers
  ALTER COLUMN photo_kind SET NOT NULL,
  ADD PRIMARY KEY (account_id, photo_id, photo_kind),
  ADD CONSTRAINT photo_ciphers_photo_kind CHECK (
    photo_kind IN ('thumbnail', 'preview', 'original')
  ),
  ADD CONSTRAINT photo_ciphers_transfer_status CHECK (
    transfer_status IN ('pending', 'ready') OR transfer_status IS NULL
  ),
  ADD CONSTRAINT photo_ciphers_content_length CHECK (
    content_length > 0 OR content_length IS NULL
  ),
  ADD CONSTRAINT photo_ciphers_storage_shape CHECK (
    (
      storage_kind IS NULL
      AND payload_json IS NOT NULL
      AND object_key IS NULL
      AND metadata_json IS NULL
      AND transfer_status IS NULL
      AND upload_id IS NULL
      AND content_length IS NULL
      AND object_etag IS NULL
      AND upload_expires_at IS NULL
      AND completed_at IS NULL
    )
    OR (
      storage_kind = 'cos'
      AND payload_json IS NULL
      AND object_key IS NOT NULL
      AND metadata_json IS NOT NULL
      AND (
        (
          transfer_status = 'pending'
          AND upload_id IS NOT NULL
          AND content_length IS NOT NULL
          AND object_etag IS NULL
          AND upload_expires_at IS NOT NULL
          AND completed_at IS NULL
        )
        OR (
          transfer_status = 'ready'
          AND upload_expires_at IS NULL
        )
      )
    )
  );

CREATE INDEX photo_ciphers_expired_upload_idx
  ON photo_ciphers (upload_expires_at)
  WHERE transfer_status = 'pending';

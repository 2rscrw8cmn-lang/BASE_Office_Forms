-- 0003 is already applied. Correct its recorded schema metadata forward only.
UPDATE app_meta SET schema_version = 3 WHERE id = 1;

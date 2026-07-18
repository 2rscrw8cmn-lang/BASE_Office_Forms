CREATE TABLE IF NOT EXISTS app_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL
);

INSERT OR REPLACE INTO app_meta (id, schema_version) VALUES (1, 1);

import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "public/index.html",
  "public/app-shell.js",
  "public/app-routing.js",
  "public/app-shell.css",
  "public/library.html",
  "public/home.js",
  "public/global-search.js",
  "public/builder.html",
  "public/studio.js",
  "public/engine.js",
  "public/pdf-export.js",
  "public/vendor/pdf-lib.min.js",
  "public/vendor/tabulator/tabulator_esm.min.js",
  "public/vendor/tabulator/tabulator.min.css",
  "public/library-api.js",
  "public/form-generator.html",
  "public/viewer.html",
  "public/assets/base-logo.svg",
  "functions/api/[[path]].ts",
  "functions/api/v2/[[path]].ts",
  "schemas/renderer-definition.v1.schema.json",
  "migrations/0001_shared_library.sql",
  "migrations/0002_schema_marker.sql",
];

await Promise.all(requiredFiles.map((file) => access(file)));
JSON.parse(
  await readFile("schemas/renderer-definition.v1.schema.json", "utf8"),
);

console.log("BASE Pages assets and schema are build-ready");

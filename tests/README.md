# Tests

`npm test` runs every `*.test.mts` file here and prints one line per file.

They cover the parts of ProptMate that are plain logic and where a quiet mistake would matter most: the evidence check, the damp
and mould safety rules, the draft maintenance list, quick room entry, the retrying AI call, and the upload and photo-address guards.
They use only the project's own code, with no database and no network, so they run in a minute or two.

Run them before you push a change to anything in `lib/`. If one fails, the line says which file; run it on its own with
`npx tsx@4.23.15 tests/<name>.test.mts` to see exactly which check failed.

These files end in `.mts` and the folder is excluded in `tsconfig.json`, so the website build never type-checks them.

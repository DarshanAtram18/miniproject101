# Pre-improvement rollback

Two recovery artifacts were captured before the 20 August 2026 improvement work. They are stored locally in `.codex-undo/` and are intentionally excluded from Git and Docker images because the database dump and source snapshot may contain credentials or personal data.

| Artifact | Size | SHA-256 |
|---|---:|---|
| `profinsights-before-2026-08-20.zip` | 99,460 bytes | `539F999DAC0A81844B4D1F84652A4C5EBBD98473E21521E16A69B4078EE65E99` |
| `profinsights-db-before-2026-08-20.dump` | 10,659,869 bytes | `FA9F5EB9A3D7BDC45DE8A52960B3F73A78D0ED03D22D5117E3FB7BA219C5B862` |

The ZIP contains the pre-change server, client, schema/configuration, helper scripts, and `.env`. It was assembled from multiple source roots, so some client paths and duplicate root filenames are represented as archive entries without a common enclosing project directory. **Do not blindly expand it over the current workspace.** Restoration must map server and client entries deliberately in a temporary directory. The PostgreSQL file is a custom-format `pg_dump` suitable for `pg_restore`.

## Preferred undo request

Ask Codex: **“undo all the changes from this improvement.”** The restoration should be treated as a destructive operation and performed only after the exact workspace and database targets are verified. Codex should:

1. Stop the application so no writes occur during recovery.
2. Verify both artifact hashes shown above.
3. Create a fresh safety backup of the current code and database, so the undo itself is reversible.
4. Restore source files from the ZIP into a temporary directory, apply the correct server/client path mapping, then replace only files covered by the snapshot.
5. Restore the dump into a new empty PostgreSQL database or a verified target database.
6. Point the application at the restored database, start it, and verify login plus the pre-change activity count.
7. Report exactly what was restored and retain the newer safety backup until acceptance.

## Manual database recovery outline

Use this only with a database administrator. Substitute explicit database names and verify the target before any drop/replacement. Never restore over the sole copy of a database.

```powershell
Get-FileHash .codex-undo\profinsights-db-before-2026-08-20.dump -Algorithm SHA256
createdb --host=<host> --port=<port> --username=<user> profinsights_rollback
pg_restore --host=<host> --port=<port> --username=<user> --dbname=profinsights_rollback --no-owner --no-privileges .codex-undo\profinsights-db-before-2026-08-20.dump
```

Validate the restored database independently before changing application configuration. A custom-format restore into a non-empty database can conflict with existing objects and is not the recommended recovery path.

## Recovery limitations and care points

- The source ZIP contains the original `.env`; treat it as a secret and do not upload or commit it.
- The database dump may include faculty information and binary evidence; restrict access and encrypt off-device copies.
- Source restoration alone is not a full undo because the improvement includes additive database migration changes.
- Database restoration alone can make the newer application incompatible with the older schema.
- Docker volume deletion, recursive workspace deletion, and overwrite-in-place database restore are not safe first steps.
- After a successful rollback, rotate any credentials that may have been copied during recovery.


# SpeakUp AI account authentication

The app supports optional email/password accounts. Anonymous learning remains available, and creating an account on the same browser keeps that browser's current learning owner ID so existing progress can be retained.

## Required production configuration

Set `AUTH_SECRET` to a cryptographically random secret with at least 32 characters before deploying. For example, generate one with:

```sh
openssl rand -base64 48
```

Do not commit the generated secret. The local development fallback is not suitable for production.

The account migration is applied automatically by the existing SQLite migration runner. Passwords are stored as scrypt hashes with per-account random salts. Session cookies are HTTP-only, SameSite=Lax, Secure in production, signed, and expire after seven days.

This feature uses the existing SQLite persistence model. Production deployments must use persistent storage for `SQLITE_DATABASE_PATH`; ephemeral serverless filesystems will not retain accounts or learning progress across restarts.

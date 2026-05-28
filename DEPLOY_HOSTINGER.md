# Hostinger Git Deploy Notes

Hostinger deploys this repository as a monorepo into `public_html`. The Laravel backend lives in `public_html/backend`, so the repository-root `.htaccess` routes browser/API requests into `backend/public`.

## Routing

- `/api/...` is rewritten to `backend/public/...`, then Laravel's `backend/public/.htaccess` sends the request to `backend/public/index.php`.
- Direct browser access to `backend/.env`, `backend/storage`, `backend/vendor`, `backend/database`, `backend/routes`, `backend/app`, and mobile project folders is blocked.
- Static assets inside `backend/public` remain available.

## Required Commands After Deploy

Run from Hostinger terminal:

```bash
cd public_html/backend
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan optimize:clear
php artisan route:clear
php artisan config:clear
```

If Composer is unavailable, verify `public_html/backend/vendor` exists. If it does not, run Composer in Hostinger terminal or upload a production `vendor` directory built from the backend `composer.lock`.

## Hydration `client_uuid` Migration

The hydration idempotency change requires this migration:

```text
backend/database/migrations/2026_05_28_000001_add_client_uuid_to_hydration_entries_table.php
```

Preferred:

```bash
cd public_html/backend
php artisan migrate --force
```

If Artisan migration cannot be run, use phpMyAdmin:

```sql
ALTER TABLE hydration_entries
ADD COLUMN client_uuid VARCHAR(255) NULL AFTER user_id;

CREATE UNIQUE INDEX hydration_entries_user_client_uuid_unique
ON hydration_entries (user_id, client_uuid);
```

Skip the SQL if `client_uuid` and `hydration_entries_user_client_uuid_unique` already exist.

## API Smoke Tests

After Git redeploy and backend commands, test:

```text
https://yellow-yak-708036.hostingersite.com/api
https://yellow-yak-708036.hostingersite.com/api/login
https://yellow-yak-708036.hostingersite.com/api/hydration
```

Expected: Laravel JSON, Laravel validation, auth, method, or route response.

Not expected: Hostinger HTML `This Page Does Not Exist`.

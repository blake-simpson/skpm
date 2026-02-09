# Vercel, DNS, and GCS Setup

## Domain and Subdomain Mapping
- `skpm.dev`: Next.js homepage in `apps/registry`.
- `api.skpm.dev`: Same Next.js deployment, used for API routes (`/api/health`, `/api/publish`).
- `registry.skpm.dev`: Public-read GCS bucket endpoint for registry metadata and tarballs.
- `www.skpm.dev`: DNS redirect to `skpm.dev`.

## Vercel Project Setup
1. Create a Vercel project from this repo.
2. Set Root Directory to `apps/registry`.
3. Build Command: `npm run build`.
4. Output: default Next.js output.
5. Add domains:
- `skpm.dev`
- `api.skpm.dev`
- `www.skpm.dev` (redirect to `skpm.dev`)

## Required Environment Variables
- `SKPM_PUBLISH_TOKEN`: Shared bearer token required by `/api/publish`.
- `SKPM_GCS_BUCKET`: Bucket name used for registry writes.
- `SKPM_GCS_CREDENTIALS_JSON` (optional): Raw service account JSON for write access.
- `GOOGLE_APPLICATION_CREDENTIALS` (alternative): Path to service account credentials file.

## API and Auth Behavior
- `/api/health` is public and returns `{ "ok": true }`.
- `/api/publish` requires `Authorization: Bearer <token>` and multipart data:
- `metadata`: JSON with `name`, `version`, `manifest`, `integrity`, `tarball`
- `tarball`: `.tgz` archive bytes

## GCS Bucket Configuration
1. Create bucket for registry artifacts.
2. Enable public read access for object GET operations.
3. Restrict write access to service account used by Vercel API runtime.
4. Serve bucket at `registry.skpm.dev` via DNS + HTTPS.

Expected object layout:
- `index.json`
- `packages/<name>/index.json`
- `tarballs/<name>/<version>.tgz`

## DNS Notes
- `skpm.dev` and `api.skpm.dev` should both point to Vercel.
- `registry.skpm.dev` should point to GCS static endpoint/CNAME target.
- `www.skpm.dev` should issue permanent redirect to `https://skpm.dev`.

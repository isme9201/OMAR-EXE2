# Avenmedia — Next.js + Tauri

An **Arabic-first, RTL production command desk** for photography and media studios. The interface has been rebuilt as a multi-page Next.js and Tailwind workspace and packaged in a Tauri 2 desktop wrapper.

## What is implemented

The product contains route navigation for the studio overview, calendar, clients and bookings, production board, finance, equipment, team chat, secure upload room, and settings. Team chat, client upload links, and upload-room history use Supabase-backed data and a Cloudinary Edge Function; configure and deploy the backend components below before live use.

The visual system is described in [`ideas.md`](./ideas.md). It applies the requested UI/UX Pro Max guidance through an **Editorial Atelier** direction: Archive Green, warm paper surfaces, copper exception states, Arabic typography, contact-sheet markers, archival sheets, and a custom aperture-and-ledger mark.

## Start the web workspace

```bash
pnpm install
pnpm dev
```

The app runs as a static Next.js export. The dedicated routes are:

| Workspace | Route |
|---|---|
| Studio overview | `/` |
| Calendar | `/calendar` |
| Clients & bookings | `/clients` |
| Production board | `/production` |
| Finance | `/finance` |
| Equipment | `/equipment` |
| Team chat | `/team` |
| Secure upload room | `/uploads` |
| Settings | `/settings` |

## Validate the static export

```bash
pnpm build
```

This writes the fully static application to `out/`, which is the source bundled into Tauri.

## Tauri desktop build

```bash
pnpm tauri build
```

The native configuration lives in `src-tauri/`. See [`TAURI_BUILD.md`](./TAURI_BUILD.md) for host and cross-target commands.

## Release artifacts

Run **GitHub Actions → Build Avenmedia → Run workflow** on the existing source branch to create a draft prerelease with the Windows x64 executable and NSIS installer, Apple Silicon and Intel macOS DMGs, Linux amd64 and ARM64 DEB/AppImage packages, `Avenmedia-Web.zip`, and `Avenmedia-Project-Source.zip`.

The standalone Windows executable expects the Microsoft Edge WebView2 Runtime; the NSIS installer includes its offline installer. The macOS packages are ad-hoc signed until Apple Developer signing/notarization secrets are configured. Windows binaries are unsigned until an authorized code-signing certificate is configured.

Before deploying chat, ensure `supabase/migrations/20260920_avenmedia_collaboration.sql` is already applied, then apply `supabase/migrations/20261017_avenmedia_chat_enterprise.sql` and `supabase/migrations/20261017_avenmedia_chat_privilege_hardening.sql`; deploy the updated `cloudinary-upload` Edge Function with the required Supabase and Cloudinary secrets. The workflow builds and packages these source files but does not apply migrations or modify production data.

## Security and integrations

WhatsApp, NAS, accounting, and other external integrations still require their own credentials and server-side authorization before live operation. Do not embed service-role keys or Cloudinary secrets in this desktop bundle.

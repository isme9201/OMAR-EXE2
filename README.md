# PhotoMedia ERP — Next.js + Tauri

An **Arabic-first, RTL production command desk** for photography and media studios. The interface has been rebuilt as a multi-page Next.js and Tailwind workspace and packaged in a Tauri 2 desktop wrapper.

## What is implemented

The product contains working route navigation for the studio overview, calendar, clients and bookings, production board, finance, equipment, team chat, secure upload room, and settings. Key interactions are functional in the front end: opening action dialogs, generating/copying a secure-link placeholder, moving production tasks forward, sending team messages, filtering clients, switching the theme, and checking equipment back in.

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
NODE_ENV=production pnpm build
```

This writes the fully static application to `out/`, which is the source bundled into Tauri.

## Tauri desktop build

```bash
NODE_ENV=production pnpm tauri build
```

The native configuration lives in `src-tauri/`. See [`TAURI_BUILD.md`](./TAURI_BUILD.md) for host and cross-target commands.

> The delivered Windows executable is an x64 GNU cross-compiled Tauri binary. It was validated as a `PE32+` Windows executable in the build environment. Run it on Windows 10/11 with the Microsoft Edge WebView2 Runtime available; most current Windows installations already provide it. Use a Windows signing/notarization workflow before distributing internally.

## Security and integrations

This package provides the functional front-end and native wrapper only. The production Supabase, Cloudinary, WhatsApp, NAS, accounting, RBAC, and audit integrations from the earlier architecture need to be connected with real environment credentials and server-side authorization before live operation. Do not embed service-role keys or Cloudinary secrets in this desktop bundle.

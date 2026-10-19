# Avenmedia QA / UX release audit

## Release scope

Branch: `release/aven-production-branding`

The release was checked with:

- `pnpm install --frozen-lockfile`
- `pnpm exec tsc --noEmit`
- `pnpm test` — 1 test passed
- `pnpm build` — 17 static routes generated

## UX improvements included

1. Fixed the `/settings` route so the settings link is generated instead of returning a missing page.
2. Added a responsive mobile navigation treatment so the desktop rail no longer forces a 250px column on small screens.
3. Added `Ctrl+K` / `Cmd+K` to focus the quick request search.
4. Added `Escape` to release quick-search focus.
5. Added a floating “back to top” control for long operational pages.
6. Added visible focus rings for keyboard and accessibility navigation.
7. Added reduced-motion support for users who prefer less animation.
8. Added `Ctrl+S` / `Cmd+S` to save portfolio editor changes.
9. Added an unsaved-changes warning before closing the portfolio editor.
10. Added safe image validation, filename sanitization, and a 25MB editor image limit.
11. Added safe customer-upload validation for image/video types and a 500MB limit.
12. Added `try/finally` handling to customer uploads and portfolio saves so loading states cannot get stuck.
13. Added explicit revision-save error feedback instead of silently claiming a complete save.
14. Added `aria-current`, labels, titles, and status roles to important navigation and feedback controls.
15. Removed Next production build settings that ignored TypeScript errors.

## Functional areas inspected

- Overview and dashboard navigation
- Customer request management
- Production tasks
- Finance and reports
- Equipment
- Team chat and collaboration
- Upload room and secure customer upload
- Operations center
- Settings route
- Portfolio editor and public portfolio
- Tauri Windows and macOS bundle configuration
- Supabase browser/service-role boundary scan

## Remaining external prerequisites

A real end-to-end authenticated test still needs a valid team account and a test Supabase project with seeded records. The source-level and build-level checks pass, but no responsible release process should claim that live database clicking was tested without those credentials.

Official signing requires real credentials and certificates:

- macOS: Apple Developer ID Application certificate, Apple Developer Team ID, Apple ID/app-specific password, and notarization access. Store them as GitHub Actions secrets (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`).
- Windows: an Authenticode code-signing certificate and protected signing service/certificate password. The cross-compiled Windows artifact can be built unsigned, but it must be signed on an authorized Windows signing runner before broad delivery.

Never commit certificates, private keys, Supabase service-role keys, Cloudinary secrets, or passwords to this repository.

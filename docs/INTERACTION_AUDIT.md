# PhotoMedia ERP interaction audit

The web and Tauri applications share the same Next.js bundle, so the desktop surface inherits the web interaction implementation rather than maintaining a second divergent UI.

| Surface | Controls audited | Final behavior |
|---|---|---|
| Global navigation | Sidebar links, portfolio editor, settings, logo, public portfolio | Native route navigation; authenticated clicks are recorded in `studio_action_events`. |
| Dashboard | Booking, secure upload link, notifications, theme, profile, calendar/project links, task actions | Dialogs and route links work; semantic actions and every button/link are audited to Supabase. |
| Calendar | Day/week/month switcher and add booking | View state switches immediately; booking is logged as a draft action. |
| Clients | Search, client file links, new booking | Search is local and responsive; client navigation and booking are functional/audited. |
| Production | Task advancement and board focus | Task progress changes locally and records a semantic event; board focus toggles. |
| Finance | Claims navigation and new invoice | Claims route and invoice draft action are functional/audited. |
| Equipment | QR scan and return action | QR action is audited; equipment return updates state and records the event. |
| Team | Channel creation/opening and message send | Channel actions and team messages are audited; message state updates immediately. |
| Uploads | Secure client link and internal upload | Both actions open working flows; secure-link actions are persisted. |
| Portfolio editor | Breakpoints, selection, drag, text/image controls, upload, duplicate/delete, undo/redo, save/discard, publish, public preview | Editor controls are role-gated, revision-backed, and audited; preview routes to `/portfolio`; public route reads only published Supabase content. |

## Persistence contract

Portfolio content, responsive frames, revisions, publication state, team roles, media metadata, and action events use Supabase. Media bytes are stored in the private `portfolio-media` bucket. The browser bundle uses only the public Supabase URL and anon key; service-role credentials are not embedded.

## Validation

The final route load test follows redirects, requests all primary pages, and issues a concurrent sample against `/`, `/portfolio`, and `/portfolio-editor`. Production Next.js export, focused Supabase credential test, Windows Tauri build, and Linux Tauri packages were run after the final interaction changes.

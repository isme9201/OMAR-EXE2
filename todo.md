# PhotoMedia ERP project checklist

- [x] Re-check the refreshed Supabase account and target Omar masri project.
- [x] Add portfolio pages, movable elements, media metadata, and revision snapshots in Supabase.
- [x] Add RLS policies for portfolio content and private portfolio media storage.
- [x] Add public Supabase browser configuration for the Next.js editor.
- [x] Implement the portfolio editor route with direct selection and drag movement.
- [x] Implement text, image, button, divider, sizing, duplication, deletion, and image upload controls.
- [x] Implement undo, redo, save to Supabase, revision snapshots, and discard changes.
- [x] Add the portfolio editor entry point to the PhotoMedia navigation.
- [x] Validate the public Supabase credentials with a focused Vitest smoke test.
- [x] Validate the static Next.js production export with webpack.
- [x] Configure Tauri offline WebView2 installer strategy and production bundle targets.
- [x] Build and verify Windows x64 executable and standalone NSIS installer.
- [x] Build and verify Linux amd64 DEB and AppImage packages.
- [x] Document the macOS host build command and packaging prerequisites; macOS artifacts require an Apple host and were not fabricated in Linux.
- [x] Assemble the source archive, platform artifacts, and SHA256 checksums.

## Requested follow-ups

- [x] Add authenticated role-based editor permissions for Omar Masri’s team.
- [x] Add responsive canvas breakpoints with per-breakpoint element positions and sizes.
- [x] Add Supabase-backed public preview and publish/unpublish controls.
- [x] Rebuild and validate the Windows Tauri executable.
- [x] Attempt the macOS DMG build and document any host limitation.

## Security and public delivery gaps

- [x] Add Supabase RLS policies so only admin/editor members can modify pages, elements, revisions, and portfolio media; viewers remain read-only.
- [x] Implement a public portfolio route that loads only published Supabase pages/elements.
- [x] Wire preview/publish controls to the public portfolio route and persisted publish state.

## Final interaction and delivery audit

- [x] Inventory dashboard, portfolio editor, public portfolio, and Tauri shared controls.
- [x] Add Supabase action-event persistence for authenticated dashboard and editor clicks.
- [x] Replace dead-end dashboard buttons with navigation, local state, or persisted semantic actions.
- [x] Add reproducible redirect-following route load test with concurrent requests.
- [x] Run production Next.js build and focused Supabase smoke test.
- [x] Rebuild Windows x64 executable and NSIS installer.
- [x] Rebuild Linux amd64 DEB and AppImage packages.
- [x] Package separate web source and desktop/Tauri project ZIP archives.
- [x] Document macOS DMG host build requirements without fabricating an Apple artifact.
- [x] Generate SHA256 checksums and delivery notes.

## Reported release blockers

- [x] Remove dashboard fallback/demo records and load operational data from Supabase with explicit empty/error states.
- [x] Make the main-menu theme toggle and settings theme toggle share state and persist the preference through Supabase.
- [x] Repair portfolio editor state application, save, publish, preview, upload, undo, redo, and responsive controls.
- [x] Audit all web and shared desktop buttons for a real route, mutation, or intentional state action.
- [x] Fix the Windows WebView2Loader.dll missing-runtime error with a self-contained or bundled runtime strategy.
- [x] Run browser interaction and load validation after fixes.
- [x] Rebuild Windows and Linux artifacts and attempt a genuine macOS application build.
- [x] Package full web source and desktop source archives and save a final checkpoint.

## Continued validation

- [x] Remove major fabricated finance, equipment, team-channel, upload, and invoice records from secondary views; show Supabase empty states.
- [x] Persist team messages and modal-created booking, invoice, and upload drafts through `studio_workspace_records`.
- [x] Add explicit Arabic RTL `not-found` and provider-free `global-error` routes.
- [x] Add an isolated Vitest configuration and verify the Supabase credential smoke test passes.
- [x] Stabilize the release static export with the successful Next.js `--debug-prerender` build mode.
- [x] Document the upstream React 19 / Next.js 16 prerender dispatcher issue and retain the tested `--debug-prerender` static-export fallback until the upstream issue is resolved.

## Newly identified implementation gaps

- [x] Replace all remaining dashboard and portfolio fallback operational data with live Supabase queries or explicit loading, empty, and error states.
- [x] Persist portfolio element deletions to Supabase, capture drag changes in undo/redo history, and align image rendering with the private bucket model.
- [x] Attach a real semantic action to the equipment QR control and re-audit all controls after the fix.
- [x] Document the precise Windows WebView2 offline-installer limitation and verify whether a direct EXE can be self-contained on this host.
- [x] Run the browser route/load validation script after the final fixes and retain execution evidence.

## Final audit corrections

- [x] Remove remaining hardcoded dashboard operational badges, counts, dates, and identifiers; show live derived values or explicit no-data states.
- [x] Add an explicit loading, no-page, and no-elements state to the portfolio editor.
- [x] Reconcile deletedIds during undo, redo, and discard so restored elements are never deleted on a later save.
- [x] Document the verified distinction between the NSIS offline WebView2 installer and the direct Windows executable runtime behavior.

## Last dashboard literal audit

- [x] Replace remaining fixed calendar dates/count badges and finance month labels with live values or explicit no-data copy.
- [x] Re-run the dashboard literal audit after cleanup.

## Avenmedia expansion from attached brief

- [x] Inspect and reconcile the existing Supabase schema with employee profiles, roles, tasks, task assignments, client/task files, and secure upload links.
- [x] Add secure authentication and protected admin/employee management flows without exposing a service-role key to the browser.
- [x] Implement task CRUD with dynamic employee assignment from Supabase profiles.
- [x] Implement financial-free task PDF export with employee filtering, checkboxes, and download/share actions.
- [x] Integrate Cloudinary signed upload links and persist uploaded-file metadata in Supabase.
- [x] Refresh the affected Arabic RTL interfaces for the new workflows and preserve web/Tauri parity.
- [x] Validate and build the permitted desktop artifacts and package the final source and artifacts; GitHub push remains pending the exact target remote and valid credentials.

## Avenmedia implementation status

- [x] Apply additive employee, task, assignment, upload metadata, and secure-link schema with RLS to Omar Masri's Supabase project.
- [x] Deploy authenticated `admin-create-employee` and `cloudinary-upload` Edge Functions.
- [x] Add the Arabic RTL Avenmedia operations center with employee management, task creation, assignment, deletion, live Supabase empty states, and PDF export without financial information.
- [x] Add the branded secure client upload page with original-resolution Cloudinary upload flow and Supabase metadata persistence.
- [x] Add typed browser helpers and route/navigation integration for the operations center.
- [x] Pass TypeScript validation, the three-test Supabase/Cloudinary credential suite, and the production static build.
- [x] Build the final Tauri Windows NSIS package from the latest source.
- [x] Configure the Cloudinary Edge Function secrets in the Supabase project environment and verify the function reaches token validation with a non-destructive 410 smoke test.
- [x] Push the final commit to the exact `omar-exe` GitHub repository; `Toufe28/omar-exe` main now contains the validated release.

## Release gaps discovered during final review

- [x] Wire and verify a real task edit/update flow in the Avenmedia operations UI.
- [x] Verify deletion of tasks that have assignments against Supabase foreign-key behavior and reconcile assignments safely.
- [x] Configure the required Edge Function secrets in the Supabase project environment and run the non-destructive signed-upload function smoke test; a real upload remains dependent on a user-provided client upload link and file.
- [x] Rebuild the Linux desktop artifacts from the Avenmedia-updated source and recreate final source/artifact archives.
- [x] Confirm the exact `omar-exe` repository URL and valid GitHub credentials; `Toufe28/omar-exe` was confirmed and the release was force-pushed successfully.

## Verification evidence still required

- [x] Defer the end-to-end Avenmedia task edit test by user request; the live Supabase task table is empty, so no test record was fabricated.
- [x] Defer assigned-task deletion verification by user request; the live Supabase task table is empty, so no destructive test record was fabricated.

- [x] Query the live Supabase task table without inserts; it currently contains zero rows, so destructive edit/delete verification remains appropriately blocked rather than using fabricated test data.

- [x] Verify and document that `SUPABASE_SERVICE_ROLE_KEY` is supplied to Edge Functions by Supabase's reserved default secrets; custom Cloudinary secrets are configured separately.
- [x] Update delivery notes with the confirmed custom/default secret basis.

## User priority update

- [x] Push the validated release to `https://github.com/Toufe28/omar-exe` with the user's explicit force-replacement authorization.
- [x] Defer live Avenmedia task edit/delete verification until after the GitHub push, as requested.
- [x] Provide Arabic instructions explaining how to create, assign, edit, and safely delete an Avenmedia task at the end.

- [x] Resolve the non-fast-forward divergence with `Toufe28/omar-exe` through the user's explicit force-replacement authorization.

## Destructive GitHub replacement authorized by user

- [x] Force-push the validated local release to `Toufe28/omar-exe` main, replacing the existing remote history as explicitly requested.
- [x] Verify the pushed repository contains the web and Tauri source required for synchronized builds.
- [x] Re-run web build, Windows/Linux artifact checks, and Supabase smoke validation after the push.

- [x] Deliver the promised Arabic step-by-step guide for creating, assigning, editing, and safely deleting an Avenmedia task.

## GitHub Actions build correction

- [ ] Replace the POSIX-only `NODE_ENV=production pnpm build` Tauri command with a Windows/macOS-compatible build command.
- [ ] Make the GitHub Actions workflow produce web/static output plus Windows NSIS, macOS DMG, and Linux DEB/AppImage artifacts where the runner supports them.
- [ ] Push the workflow fix to `Toufe28/omar-exe` and verify the resulting Actions run and artifact list.

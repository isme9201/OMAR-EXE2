# Avenmedia — Tauri production builds

## Standalone Windows configuration

`src-tauri/tauri.conf.json` uses Tauri 2's supported standalone WebView2 installer strategy:

```json
{
  "bundle": {
    "targets": ["nsis", "dmg", "deb", "appimage"],
    "windows": {
      "webviewInstallMode": {
        "type": "offlineInstaller"
      }
    }
  }
}
```

`offlineInstaller` embeds the full WebView2 runtime installer into the NSIS package. It is the independent option for machines that may not have WebView2 installed or may not have network access. It produces a larger Windows installer than `embedBootstrapper`, but it avoids a runtime download during installation. Tauri still uses the machine WebView2 provider after installation; the bundled runtime installer supplies it during setup.

For a smaller package that can download during installation, replace `windows.webviewInstallMode` with `{ "type": "embedBootstrapper" }`. For deterministic fixed-runtime behavior, use `{ "type": "fixedRuntime", "path": "./Microsoft.WebView2.FixedVersionRuntime.<version>.x64/" }` and ship the matching fixed runtime directory.

## Production build commands

From the project root, use the platform-specific command below.

Windows NSIS installer on a Windows host:

```powershell
$env:NODE_ENV = "production"
pnpm install --frozen-lockfile
pnpm build
pnpm tauri build --bundles nsis
```

Linux packages on a Linux host:

```bash
NODE_ENV=production pnpm install --frozen-lockfile \
  && pnpm build \
  && pnpm tauri build --bundles deb,appimage
```

macOS DMG on a macOS host with Xcode Command Line Tools:

```bash
NODE_ENV=production pnpm install --frozen-lockfile \
  && pnpm build \
  && pnpm tauri build --bundles dmg
```

Artifacts are written under `src-tauri/target/release/bundle/`. A production release should also be code-signed: Authenticode for Windows, Developer ID plus notarization for macOS, and a package-signing/repository strategy for Linux. The current Linux sandbox cannot produce a valid Apple `.app` or `.dmg` because Apple SDK, codesigning, and notarization are host requirements; the source is macOS-ready and the exact host command is included above.

## Operational note

The editor reads and writes portfolio pages, movable elements, responsive frame variants, revision snapshots, team roles, and portfolio media through the selected Supabase project. The public Supabase URL and anon/publishable key are injected at build time; no service-role key belongs in the desktop bundle. Authenticated users must be granted the policies documented in the Supabase migration files.

Arabic step-by-step instructions for building Apple Silicon, Intel, and Universal macOS DMGs locally are in [BUILD_MAC_AR.md](BUILD_MAC_AR.md).

Reference: [Tauri Windows Installer documentation](https://v2.tauri.app/distribute/windows-installer/).

## Direct executable limitation

The direct `avenmedia-erp.exe` is the application binary only; it is not a fixed-runtime WebView2 distribution and does not replace the Windows WebView2 provider. The verified no-network installation path is the NSIS package produced with `offlineInstaller`, which embeds the WebView2 runtime installer and provisions the provider during setup. A truly fixed-runtime direct distribution requires a tested `fixedRuntime` directory and matching host validation; that path has not been claimed or fabricated in this Linux environment.

# ALWIS — GitHub Actions

## Workflows

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| check.yml | Push to main, PR, manual | Build and test once; publish studio-static-<SHA> and test receipts. |
| publish-ftp.yml | Manual on main | Check license and version first, reuse exact successful CI package, create GitHub Release, then deploy that package via FTP. |
| publish-server.yml | Successful FTP workflow or manual | Verify source artifact and licensing; publish multi-architecture GHCR image using Buildx cache. |
| publish-wiki.yml | Documentation paths, manual | Publish documentation independently. |
| native-distribution.yml | Manual | Verify native manifest and licensing before release. |

Important: a green CI means the code passed tests, not that redistribution rights are cleared. provenance/release-licensing-status.json must say ready with no blockers before any FTP, Docker or native distribution. Do not bypass this gate.

## Release procedure

1. Bump package.json and package-lock.json to a new version; commit and push main.
2. Wait for successful CI on that exact SHA, which retains the static package for 14 days.
3. Run publish-ftp.yml on main with version=vX.Y.Z-preview.N matching the package version.
4. Verify the release, live FTP release.json and subsequent Docker run.

## Caches and validation

- npm ci always enforces the lock; setup-node caches npm downloads.
- Editor engines are cached by their lock hash and still checksum-verified.
- Chromium and Firefox downloads are cached; real browser tests still execute.
- Docker uses a scoped GHA Buildx layer cache for AMD64 and ARM64.
- Publishing reuses the exact verified CI artifact rather than rebuilding.

## Failure meanings

- CI error: test or build issue; inspect retained receipts.
- Preflight error: licensing or version issue; no distribution occurs.
- Missing CI artifact: rerun CI on the exact SHA, never substitute another build.
- Release error: FTP does not run; inspect validation and release permissions.
- FTP error: check deployment verification and retained previous-site artifact.
- Docker error: check source SHA, static checksums and GHCR permissions.

Historical, non-executing workflow templates were removed from the current tree; see Git history if needed.

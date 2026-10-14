# Agent Development Guide

## Hard fork

This repository is the Gelhaus Solutions hard fork of `makeplane/plane`, split on 2026-10-14 at upstream `4605f0078` (package version 1.4.2). Code no longer moves between upstream and this fork in either direction:

- Never add an upstream remote, and never fetch, merge, rebase onto or cherry-pick from `makeplane/plane`, or port an upstream change by reading its diff. A fix this fork needs is written here, for this codebase.
- Never open an issue, pull request or discussion on a `makeplane` repository, and never push to one. `gh` is pinned to this repository (`gh repo set-default`); still pass `--repo Gelhaus-Solutions/plane` in anything scripted.
- `@makeplane/propel` is upstream's published npm package, frozen at the version pinned in `pnpm-workspace.yaml`. Bumping it imports upstream code, so ask the operator first; if a primitive has to change, vendor the package into `packages/` instead. Add no other `makeplane` dependency (npm package, GitHub Action, Helm chart, image).
- The trunk is `main`; pull requests target `main`.
- `.github/workflows/build-images.yml` is the only workflow: it builds the images into `ghcr.io/gelhaus-solutions/plane-*` (`:<branch>` on every push; `:<version>` and `:stable` on a published release). Nothing in CI runs tests, lint or type checks, so run them yourself.
- No telemetry leaves an instance unless `OTLP_ENDPOINT` is set (`apps/api/plane/utils/otlp_endpoints.py`). Do not reintroduce a default collector or any call home to `plane.so`; the update check reads this repository's releases.
- The product is still called Plane. Upstream issue and PR numbers in existing comments (`makeplane/plane#4639`) refer to upstream's tracker and stay as history.

## Commands

- `pnpm dev` - Start all dev servers (web:3000, admin:3001)
- `pnpm build` - Build all packages and apps
- `pnpm check` - Run all checks (format, lint, types)
- `pnpm check:lint` - OxLint across all packages
- `pnpm check:types` - TypeScript type checking
- `pnpm fix` - Auto-fix format and lint issues
- `pnpm turbo run <command> --filter=<package>` - Target specific package/app

## Code Style

- **Imports**: Use `workspace:*` for internal packages, `catalog:` for external deps
- **TypeScript**: Strict mode enabled, all files must be typed
- **Formatting**: oxfmt, run `pnpm fix:format`
- **Linting**: OxLint with shared `.oxlintrc.json` config
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Error Handling**: Use try-catch with proper error types, log errors appropriately
- **State Management**: MobX stores in `packages/shared-state`, reactive patterns
- **Testing**: All features require unit tests, use existing test framework per package
- **Components**: Primitives come from the published `@makeplane/propel` npm package (`@makeplane/propel/components/*`, `elements/*`, `icons`); composite/Plane-specific components live in `@plane/blocks` (`packages/blocks`, subpath imports only, e.g. `@plane/blocks/toast`)

## Backend dependencies (uv)

`apps/api` dependencies are managed with [uv](https://docs.astral.sh/uv/): declared in `apps/api/pyproject.toml`, pinned in `apps/api/uv.lock` (commit both). Groups: `dev` and `test` (installed by default; they use `psycopg-binary`), `production` (gunicorn + the source-built `psycopg-c`; production image and migration-check only). Lint config lives in `apps/api/ruff.toml`.

- uv must be exactly the `required-version` in `apps/api/pyproject.toml` (`uv self update <version>`); bump it together with the uv image in both Dockerfiles
- Set up a local env: `cd apps/api && uv sync`
- Inside the dev/test containers, always pass `--inexact` (`uv sync --inexact`): uv targets the image's system Python there, and an exact sync would uninstall pip
- Add/upgrade a dependency: `uv add <pkg>==<version>` (or `--group test`/`--group dev`), or edit `pyproject.toml` and run `uv lock`
- Run tools: `uv run python manage.py ...`, `uv run ruff check .`

## Backend tests (Docker)

The Django/pytest suite for `apps/api` runs in an isolated stack defined by `docker-compose-test.yml` at the repo root.

Prereq (once): `./setup.sh`, which generates `apps/api/.env` from `.env.example`.

- Full suite: `docker compose -f docker-compose-test.yml up --build --abort-on-container-exit --exit-code-from api-tests`
- Subset: `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest -m unit`
- Teardown: `docker compose -f docker-compose-test.yml down -v`

See `apps/api/tests/RUNNING_TESTS.md` for the full walkthrough and troubleshooting; see `apps/api/tests/TESTING_GUIDE.md` for test conventions and fixtures.

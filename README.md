# Plane, Gelhaus Solutions fork

This repository is a **hard fork** of [Plane](https://github.com/makeplane/plane), the open-source project management tool by Plane Software, Inc. It split from upstream on 2026-10-14 at upstream commit [`4605f0078`](https://github.com/makeplane/plane/commit/4605f0078fdcf7016cea646ea50c4b825efd9fac) (package version 1.4.2) and is developed independently from that point on.

- Upstream changes are not merged, rebased or cherry-picked into this fork.
- Changes made here are not contributed back to upstream.
- Plane Software, Inc. does not maintain, support or endorse this fork. Do not report problems with it to them.

Plane and the Plane logo are trademarks of Plane Software, Inc.

## How this fork differs from upstream

- **No telemetry by default.** Upstream reports instance metrics to `telemetry.plane.so`. Here nothing is exported unless `OTLP_ENDPOINT` points at a collector you run.
- **Own releases and images.** The update check, the self-host installers and the images use this repository: `ghcr.io/gelhaus-solutions/plane-*` instead of Docker Hub's `makeplane/*`.
- **No upstream changelog.** The in-app "What's new" panel no longer embeds upstream's changelog, and the help menus no longer send bug reports to upstream's issue tracker.

## Images

`.github/workflows/build-images.yml` builds and pushes:

| Image | Contents |
| --- | --- |
| `ghcr.io/gelhaus-solutions/plane-frontend` | web app |
| `ghcr.io/gelhaus-solutions/plane-space` | public spaces |
| `ghcr.io/gelhaus-solutions/plane-admin` | instance admin (god mode) |
| `ghcr.io/gelhaus-solutions/plane-live` | live collaboration server |
| `ghcr.io/gelhaus-solutions/plane-backend` | API, worker, beat worker, migrator |
| `ghcr.io/gelhaus-solutions/plane-proxy` | Caddy proxy |
| `ghcr.io/gelhaus-solutions/plane-aio-community` | all-in-one image (releases, or on request) |

Tags:

- `:<branch>` on every push, with a slash turned into a dash (`main`, `feat/web-12-x` becomes `feat-web-12-x`). Branch builds are `linux/amd64` only.
- `:<version>` and `:stable` when a release is published (`:stable` is skipped for prereleases). Releases are built for `linux/amd64` and `linux/arm64`.

To cut a release, publish a GitHub release with a semver tag:

```bash
gh release create v1.4.3 --repo Gelhaus-Solutions/plane --target main --generate-notes
```

The workflow then builds the images and attaches the self-host files (`setup.sh`, `swarm.sh`, `docker-compose.yml`, `variables.env`, the restore scripts) to the release.

## Self-hosting

With Docker Compose, once at least one release exists:

```bash
mkdir plane-selfhost && cd plane-selfhost
curl -fsSL -o setup.sh https://github.com/Gelhaus-Solutions/plane/releases/latest/download/setup.sh
chmod +x setup.sh
./setup.sh
```

- Docker Compose and Swarm: [deployments/cli/community/README.md](deployments/cli/community/README.md)
- All-in-one container: [deployments/aio/community/README.md](deployments/aio/community/README.md)
- Kubernetes: [deployments/kubernetes/community/README.md](deployments/kubernetes/community/README.md)

Upstream's [self-hosting documentation](https://developers.plane.so/self-hosting/overview) still describes configuration accurately for the shared code, but its install commands fetch upstream's images, not this fork's.

## Local development

```bash
./setup.sh                                      # writes the .env files
docker compose -f docker-compose-local.yml up   # Postgres, Valkey, RabbitMQ, MinIO, API
pnpm install && pnpm dev                        # web on :3000, admin on :3001
```

Then register the instance admin at http://localhost:3001/god-mode/ and sign in at http://localhost:3000. More in [CONTRIBUTING.md](CONTRIBUTING.md); the commands, code style and backend test setup are in [AGENTS.md](AGENTS.md).

## Security

Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md).

## License

[GNU AGPL v3](LICENSE.txt) only. The upstream code is Copyright (c) 2023-present Plane Software, Inc. and contributors; the changes made in this fork are released under the same license.

If you run a modified version of this software for users over a network, section 13 of the AGPL requires you to offer those users its source code. The GitHub link in the app's navigation points at this repository.

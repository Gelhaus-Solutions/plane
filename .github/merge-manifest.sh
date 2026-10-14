#!/usr/bin/env bash
#
# Stitches the per-architecture digests that build-images.yml pushed into one
# multi-arch manifest, applies the tags, and checks the result advertises every
# expected platform.
#
#   IMAGE               required, e.g. ghcr.io/gelhaus-solutions/plane-frontend
#   TAGS                required, comma-separated, e.g. v1.5.0,stable
#   EXPECTED_PLATFORMS  optional, comma-separated, e.g. linux/amd64,linux/arm64
#   SOURCE_URL          optional, recorded as org.opencontainers.image.source
#
# Digests are read from $RUNNER_TEMP/digests, one empty file per digest named
# after it without the sha256: prefix.
set -euo pipefail

: "${IMAGE:?IMAGE is required}"
: "${TAGS:?TAGS is required}"
EXPECTED_PLATFORMS="${EXPECTED_PLATFORMS:-}"
SOURCE_URL="${SOURCE_URL:-}"
DIGEST_DIR="${RUNNER_TEMP:?RUNNER_TEMP is required}/digests"

sources=()
if [ -d "$DIGEST_DIR" ]; then
  for f in "$DIGEST_DIR"/*; do
    [ -e "$f" ] || continue
    sources+=("${IMAGE}@sha256:$(basename "$f")")
  done
fi
if [ ${#sources[@]} -eq 0 ]; then
  echo "No digests found for ${IMAGE}: its build legs failed or were skipped." >&2
  exit 1
fi

tag_args=()
IFS=',' read -r -a tags <<<"$TAGS"
for t in "${tags[@]}"; do
  tag_args+=(-t "${IMAGE}:${t}")
done

annotation_args=()
if [ -n "$SOURCE_URL" ]; then
  annotation_args+=(--annotation "index:org.opencontainers.image.source=${SOURCE_URL}")
fi

echo "Merging ${#sources[@]} digest(s) into ${#tags[@]} tag(s):"
printf '  source: %s\n' "${sources[@]}"
printf '  tag:    %s\n' "${tags[@]}"
docker buildx imagetools create "${annotation_args[@]}" "${tag_args[@]}" "${sources[@]}"

# A merge that produced a single-platform index still exits 0, so assert the
# platform set rather than trusting the exit code.
inspected=$(docker buildx imagetools inspect "${IMAGE}:${tags[0]}")
echo "$inspected"
[ -n "$EXPECTED_PLATFORMS" ] || exit 0

missing=0
IFS=',' read -r -a expected <<<"$EXPECTED_PLATFORMS"
for p in "${expected[@]}"; do
  if ! grep -Eq "^[[:space:]]*Platform:[[:space:]]+${p}[[:space:]]*$" <<<"$inspected"; then
    echo "${IMAGE}:${tags[0]} is missing platform ${p}" >&2
    missing=1
  fi
done
[ "$missing" -eq 0 ] || exit 1
echo "Verified ${IMAGE}:${tags[0]} advertises ${EXPECTED_PLATFORMS}"

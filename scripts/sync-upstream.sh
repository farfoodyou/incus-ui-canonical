#!/bin/bash
# Merge upstream/main into a scratch branch, verify the build, then fast-forward main.
#
#   scripts/sync-upstream.sh            # merge + build, stop before touching main
#   scripts/sync-upstream.sh --apply    # also fast-forward main (and push)
#
# Conflicts should only appear in the files listed in FORK.md ("Current hook surface").
set -euo pipefail

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1
cd "$(git rev-parse --show-toplevel)"

HOOK_FILES=(
  src/index.tsx
  src/components/Navigation.tsx
  src/pages/instances/InstanceDetail.tsx
  src/pages/instances/InstanceTerminal.tsx
  src/util/instanceTerminal.tsx
  src/api/instances.tsx
  src/types/terminal.d.ts
  tsconfig.json
  package.json
  yarn.lock
)

git fetch upstream
BRANCH="sync/upstream-$(date +%Y%m%d-%H%M)"
git switch -c "$BRANCH" main

echo "==> merging upstream/main into $BRANCH"
if ! git merge --no-edit upstream/main; then
  echo
  echo "Conflicts:"
  git diff --name-only --diff-filter=U | sed 's/^/  - /'
  echo
  echo "Expected only: ${HOOK_FILES[*]}"
  echo "Resolve them, then re-run: git merge --continue && $0 --apply"
  exit 1
fi

echo "==> building (this is the real check)"
yarn install --frozen-lockfile
yarn build

if [ "$APPLY" = "1" ]; then
  git switch main
  git merge --ff-only "$BRANCH"
  git push origin main
  echo "==> main updated and pushed"
else
  echo
  echo "Build OK. Merge into main with:"
  echo "  git switch main && git merge --ff-only $BRANCH && git push origin main"
fi

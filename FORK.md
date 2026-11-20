# Fork strategy — a stronger UI that stays rebaseable

This fork adds features on top of `zabbly/incus-ui-canonical` (which itself tracks
`canonical/lxd-ui`). The goal is to ship a noticeably better UI **without** turning every
upstream sync into a merge war.

## TL;DR rules

1. **New features live in new files** (`src/fork/**`). Upstream files are touched only at
   explicitly listed hook points (see below), a few lines each.
2. **Never reformat, never rename** upstream files. Prettier/ESLint only on files you add.
3. **Sync with `git merge`, not `git rebase`.** With a long-lived divergence, merges keep
   conflicts local to the files you actually touched and keep history honest.
4. **LXD→Incus renaming happens at build time** (`patches/ui-canonical-renames.sed`), never
   in the tree — that is also what Incus packaging does.
5. Keep `git rerere.enabled=true` so repeated conflict resolutions are remembered.

## Why merge instead of rebase

| | rebase (replay your commits) | merge (upstream into yours) |
|---|---|---|
| History | linear, pretty | honest, shows sync points |
| Conflict scope | every commit replayed individually | only where both sides changed |
| Long divergence | increasingly painful | stays flat |
| Risk | rewriting published commits (force pushes) | none |

Rule of thumb: rebase while the delta is small (≤ ~10 commits), switch to merge once it is a
real product. This fork is at that point.

## Current hook surface (the only upstream files we edit)

| Upstream file | What we add | Anchor |
|---|---|---|
| `src/index.tsx` | `import "./i18n";` | first import |
| `src/components/Navigation.tsx` | `LanguageSelector` entry + `t()` on menu labels | above the Settings item |
| `src/pages/instances/InstanceDetail.tsx` | render `InstanceTerminalTabs` instead of `InstanceTerminal` | Terminal tabpanel |
| `src/pages/instances/InstanceTerminal.tsx` | `session` / `command` props | component props |
| `src/util/instanceTerminal.tsx` | `getTmuxPayload()` | end of file (appended) |
| `src/api/instances.tsx` | `command: string[]` support | exec request body |
| `src/types/terminal.d.ts` | `command: string | string[]` | type |
| `src/i18n/**`, `src/components/LanguageSelector.tsx`, `src/pages/instances/InstanceTerminalTabs.tsx` | new files, no conflict risk | — |
| `package.json`, `yarn.lock`, `tsconfig.json` | deps (`i18next`, `react-i18next`), `resolveJsonModule`, `i18n` path | — |

Anything new should prefer adding a row to the "new files" line instead of a new hook.

## Component overrides instead of edits

When a feature needs a different behaviour inside an upstream component, do not fork the
component in place. Copy it into `src/fork/components/<Name>.tsx`, adjust it there, and
register it in one override map consulted by a single hook line:

```tsx
// src/fork/overrides.tsx
export const overrides = {
  InstanceTerminal: () => import("./components/InstanceTerminalTabs"),
} as const;
```

This keeps the diff to upstream at "one lookup line per extended component", and gives you
freedom to rewrite the copy completely.

## Sync procedure (monthly, or when upstream cuts a release)

```bash
git fetch upstream
git switch -c sync/upstream-$(date +%Y%m) main
git merge upstream/main            # resolve only the files in the hook table above
yarn install && yarn build         # must pass before merging the sync branch
git switch main && git merge --ff-only sync/upstream-$(date +%Y%m)
git push origin main
```

`scripts/sync-upstream.sh` does the same and aborts on conflicts without touching `main`.

Enable once per clone:

```bash
git config rerere.enabled true
git config rerere.autoupdate true
```

## Drift detection

Two cheap guards, both optional but recommended:

- **CI job** (weekly): `git merge --no-commit --no-ff upstream/main` in a scratch branch and
  fail if conflicts include files *not* in the hook table → the hook surface moved, update the
  table before merging.
- **Anchor check** in the sync script: grep for the anchor snippets listed above; a miss means
  upstream reshaped that region.

## Where future features go

| Feature | Type | Touches upstream? |
|---|---|---|
| Extra instance actions (bulk start/stop/delete, mass snapshot) | new page + menu hook | 1 line in Navigation |
| Dashboard with live metrics (aggregated from `/1.0/metrics`) | new route + sidebar entry | 1 line |
| Terminal: shared sessions, tab renaming, keyboard shortcuts | extend `src/fork/terminal/*` | none |
| File explorer: multi-select + upload queue + editor | override map entry | 1 line |
| OCI image management / registry browser | new pages | 1 route line |
| Dark theme / density / font settings | new context + one hook in `Root.tsx` | 1 line |
| Notifications center (warnings + operations merged) | new component + hook | 1 line |

The theme is: **routing, sidebar entries and layout hooks are the only places we modify
upstream**; everything else is additive.

## Release flow

```bash
docs/bin/incus-ui-build-deploy.sh   # fetch upstream → apply feature patch → rename sed → build
```

(On a machine that has this repo checked out; the script in `docs/bin` is the lab-side copy and
runs the synced `src/` tree.)

## What we deliberately do not do

- No rename/refactor sweeps of upstream code (rebase cost, and upstream rejects it by design).
- No "big bang" fork of whole page trees; copy only the component you must change.
- No divergence in `package.json` beyond added dependencies (keeps lockfile conflicts trivial).

## Translation drift

`yarn i18n:check` (also run by `.github/workflows/i18n-sync.yaml` on every push/PR) compares

- every `src/i18n/locales/*.json` against `en.json` — missing and obsolete keys;
- `README.md` / `README.zh-Hans.md` / `README.fr.md` — same number of headings, code blocks,
  images and links (the newest file by mtime is used as the reference and named in the output).

`yarn i18n:fix` fills missing locale keys with the English text and drops keys that no longer
exist upstream. Prose in the translated READMEs still has to be written by hand; the checker
tells you which structural part drifted and which file is the freshest.

## Commit messages

All commit messages are in English; `git config core.hooksPath .githooks` (done by
default in this clone) enables `.githooks/commit-msg`, which rejects CJK characters in
commit metadata. Translations belong in `src/i18n/locales/*.json`.

# Factory repo profile

## Stack

TypeScript (strict), React 18, Vite, TipTap v2 (pinned), Dexie/IndexedDB, Vitest. Electron shell in `desktop/`.
Package manager: npm. No backend.

## Main branch

main

## Setup

- `npm ci --legacy-peer-deps=false` (the user's global npmrc sets legacy-peer-deps, which breaks lockfiles)

## Commands

- test: `npm test` (vitest unit suite)
- test (sync, run all three after touching `folderSync.ts`, either bridge, or `notefile.ts`):
  `npm run test:desktop` and `npm run test:browser`
- lint: none (no linter configured; `npm run typecheck` is the closest check)
- typecheck: `npm run typecheck`
- build: `npm run build` (`tsc --noEmit && vite build`; run before declaring work done)

There is no CI (no `.github/workflows`); the commands above come from `package.json` and `CLAUDE.md`.

## Conventions

- Read `/CLAUDE.md` first: architecture rules (`app` -> `features`/`editor` -> `data` -> `core`), gotchas, traps.
- `README.md` covers product and layout; `docs/design-ink.md` for dark styling; `docs/themes.md` for theme tokens.
- Only `src/data/` imports Dexie. Avoid new dependencies. Theme colors via CSS variables only.
- Comments explain why, not what. Do not create files whose names differ only by case.

## Commits

- Prefix: none; plain imperative title, PR number appended on squash (e.g. "Add Cmd+K link editor (#3)").
  Use `factory/<id>` only if the human asks for a prefix.
- Signed: yes (`commit.gpgsign=true` locally)
- Merge: squash

## Delivery

pr

## Issue tracker

github

## Worktrees

orca. No `.worktreeinclude` or `orca.yaml` exists, so Orca copies no `.env` files and runs no setup: run Setup
(`npm ci`) in each new worktree yourself.

## UI paths

`src/app/`, `src/features/`, `src/editor/`, `src/ui/`, `src/styles/`, `src/themes/`.

## Always escalate

- New dependencies (`package.json`, `package-lock.json`); TipTap or Electron version bumps.
- `desktop/` (Electron main/preload, sandbox and origin handling), packaging/signing config.
- `src/data/folderSync.ts`, `desktop/notebook.cjs`, `src/data/fsaNotebook.ts` (never-clobber sync, data loss risk).
- Dexie schema or storage key changes (`npkn.*` keys, IndexedDB `notes`), which need migrations.
- `src/features/ask/` provider and key handling, private-page filtering (`buildContext`): anything that sends note
  content off-device.
- Any CI config if added later.

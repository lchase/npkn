# CLAUDE.md

Local-first notes app (working title **npkn**). React 18 + TypeScript + Vite, TipTap v2 editor, Dexie/IndexedDB.
No backend. Read `README.md` for the product and layout; this file is the working rules and the traps.

## Commands

```bash
npm run dev         # http://localhost:5173
npm run build       # tsc --noEmit && vite build  (run before declaring work done)
npm run typecheck
```

There is no test suite yet. Verify changes with `npm run build`, then exercise the feature in the browser.
Dev server config for previews is in `.claude/launch.json`.

## Desktop

`desktop/` is an Electron shell and nothing else: `main.cjs` serves `dist/` on a secure custom origin
(`app://npkn`) and opens a window; `preload.cjs` exposes only `window.npknDesktop`. Keep app logic out
of it. The renderer has no Node access (sandbox, context isolation). Ollama accepts `app://` origins by
default, so Ask works without CORS changes.

- Run: `npm run desktop`. Package: `npm run desktop:pack` (unsigned; signing/notarization is not set up).
- **Electron install gotcha:** npm 12 skips install scripts, and Electron's extractor silently fails on
  Node 26. `desktop/setup.cjs` (run by the desktop scripts) falls back to unzipping the cached download.
- Desktop storage is separate from the browser's (different origin and profile). `app.setName('npkn')`
  keeps dev and packaged builds on one data folder, `~/Library/Application Support/npkn`.
- To verify without a screen: launch with `--remote-debugging-port=PORT` and drive it over CDP.
- Chosen over Tauri for fidelity as "just a wrapper" (blob downloads, file inputs, webview parity) and
  fast iteration. Revisit if binary size (~260 MB) matters; the app code is shell-agnostic.

## Storage model

IndexedDB is the working copy the UI reads and writes (through `data/pages.ts`). An optional **notebook
folder** of `.md` files is the durable, portable copy, kept in step by `data/folderSync.ts`. The engine
talks to a `NotebookBridge` (`data/desktop.d.ts`) with two implementations: Electron (`desktop/notebook.cjs`,
Node fs, real watching) and the browser (`data/browserNotebook.ts` + `fsaNotebook.ts`, File System
Access API, polling).

- File format and path rules live in `core/notefile.ts` (pure, unit-tested). `folderSync.ts` is the only
  caller of a bridge. Both bridges validate every path the same way (relative, inside the root, no hidden
  segments, markdown only); keep `desktop/notebook.cjs` and `data/fsaNotebook.ts` behaviourally identical.
- **Browser mode traps:** permission usually lapses on reload and can only be re-requested from a click
  (status `needs-permission`, `reconnectNotebookFolder`). `showDirectoryPicker` must be called straight
  from the click handler. There is no portable rename, so `move` is copy-then-delete and returns the new
  mtime, which the engine must carry into its `expect` check or the next write is refused as "changed".
  The folder is identified by a generated id (not its name) so saved bookkeeping can't apply to a
  different folder that happens to share a name.
- Identity is the `id:` line in front matter (hidden from the properties UI). A page keeps its file path
  unless its title or parent changes, so hand-made folder layouts aren't undone.
- **Never clobber.** Writes pass `expect` (null = must not exist, number = mtime we last saw); the main
  process refuses if the disk moved on, and the engine re-pulls and merges. Conflict: app wins, disk
  version kept as `*.conflict-<time>.md`. Deletes go to `.trash/`.
- Sync bookkeeping (`db.sync`) lives in the SAME database as the pages so the two can't disagree. Keeping
  it elsewhere once would have trashed every file after a database wipe.
- Sidebar order is alphabetical by title (case-insensitive, natural numbers). The title input commits
  after a pause, otherwise a page jumps around the tree while you type its name.
- Three suites, run all after touching `folderSync.ts`, either bridge, or `notefile.ts`:
  `npm test` (unit), `npm run test:desktop` (real Electron app, real disk; env `NPKN_NOTEBOOK`,
  `NPKN_USER_DATA`), `npm run test:browser` (the same scenarios in browser mode over an OPFS directory,
  using `NPKN_NO_NOTEBOOK=1` to hide the desktop bridge, plus a permission-lapse scenario). They have
  caught real bugs, including a conflict loop and a resurrected Welcome page.

## Architecture rules

Dependencies point inward: `app` → `features`/`editor` → `data` → `core`.

- `src/core/`: pure logic and types. No React, no Dexie. (`markdown.ts` uses `DOMParser`/TipTap's `generateJSON` for import and `bundle.ts#download` touches the DOM; keep new code here pure.)
- `src/data/`: the only code that imports Dexie (`db.ts`). Everything else reads and writes pages through `data/pages.ts`. Don't import `db` from UI code.
- `src/editor/extensions.ts` is the single document schema. Add nodes/marks there so the editor and markdown import stay in sync.
- `src/features/<name>/` is self-contained. Features don't import each other, except the sidebar showing the Ask avatar via `features/ask/store`.
- Chat backends implement `features/ask/provider.ts` (Ollama, Anthropic, OpenAI-compatible; registry in `providers.ts`, selection and keys in `config.ts`). Don't call a vendor from components. `store.send` resolves the active provider itself.
- No backend exists. If one is ever needed, add `server/` beside `src/` and implement `data/pages.ts` against it.

## Conventions

- Strict TypeScript. Avoid adding dependencies; the current set is small on purpose (`yaml`, `marked`, `lowlight`, TipTap, Dexie).
- Styling: plain CSS in `src/styles/<area>.css`, ordered in `styles/index.css`. All colors/fonts come from theme tokens (CSS variables); never hardcode a color that should follow the theme. Adding a token: default in `styles/base.css` `:root`, add to `themes/builtin/paper.json` and `ink.json`, document in `docs/themes.md`.
- Default dark theme (`ink.json`) follows `docs/design-ink.md` (Tactile Ink & Fiber): terracotta accent, warm charcoal surface stack, hairline borders, tonal layering over shadows. Check it before changing dark styling. Plus Jakarta Sans / JetBrains Mono are named first in the font stacks but not bundled; they apply only if installed, otherwise the system stack is used.
- Themes are inert JSON data. Don't add anything to the format that executes code or loads URLs.
- Comments explain why, not what. Match the surrounding density.

## Gotchas (each of these already cost time)

- **macOS is case-insensitive.** `FrontMatter.tsx` next to `frontmatter.ts` broke module resolution. Don't create files whose names differ only by case/extension.
- **TipTap is pinned to v2.** v3 has a different API; don't bump casually.
- **Editor input rules only fire on single typed characters.** When testing in the browser, type one character per action; inserting a whole string at once skips `[] `, `@work `, ``` ```ts ```.
- **Chips resolve dates at entry time.** `@fri` stores the ISO date that Friday was when typed, plus the raw word.
- **Welcome page is overwritten** when `WELCOME_VERSION` in `data/seed.ts` is bumped, including any edits. It's a style-guide fixture, not user content. Bump it when `data/welcome.ts` changes.
- **Front matter is stored as raw YAML text** (`Page.frontmatter`), parsed on demand. Keep unknown keys; OKF requires consumers to preserve them. Only `type` is required by the format; the UI nudges but never blocks.
- **Ollama `think: false`** is sent deliberately; thinking models are far too slow for note Q&A otherwise.
- **Chat state is module-level** (`features/ask/store.ts`), not component state, so replies keep streaming when you leave the Ask view and the sidebar avatar can reflect mood. Don't move it into a component.
- **Theme scheme attribute.** `applyTheme` sets `data-theme` and `data-scheme` (light/dark) on `<html>`. Use `:root[data-scheme='dark']` for dark-only tweaks (e.g. character shadows); never infer dark from `prefers-color-scheme` since users can force a theme.
- **Never sort the sidebar by `updatedAt`.** It reshuffled the tree whenever a page was opened. Order is alphabetical now. The editor also only saves when something changed (dirty flag), because an untouched save bumps updatedAt, which sync reads as an edit.
- **Browser storage keys** use the `npkn.` prefix (`npkn.theme`, `npkn.ask`, `npkn.welcome`, `npkn.customThemes`, `npkn.character`, `npkn.look`, `npkn.characterColors`, `npkn.collapsed`, `npkn.ai`, `npkn.width`, `npkn.todoGroup`); IndexedDB database name is `notes`. A rename must migrate these.
- Dexie `update(id, {x: undefined})` clears the field; that's how removing front matter works.

## Links between pages

- **In the app** an internal link is an ordinary Link mark with `href="npkn:<page id>"` (`core/links.ts`); ids survive renames and moves. Typing `[[` opens the picker (`editor/pageLinks.ts`); `[[Title]]` of an existing page converts on the closing brackets. Click navigates (Alt-click bypasses); a missing target gets `.link-broken`. "Linked from" lists `backlinks()`.
- **In files** the `npkn:` scheme never appears: `fileLinkMapper(selfPath, pathOf)` writes a relative `.md` path, so other tools see plain links. Bundle export and single-page export use the same mapper.
- **Import/sync** resolves relative links back to ids with `resolveRelativeLinks` only after every id is known (post-pass in `folderSync.pull`, and in App's import path). Unresolvable links stay as written and resolve on a later pass when the target appears.
- **Rename-safe:** `flush()` rewrites a non-dirty page when its own path or a link target's path moved (`linkShift`).
- **Tradeoff:** a deleted target leaves a dangling relative link in the file until that page is next edited.
- **Test trap:** link clicks need real mouse events; synthetic `.click()` skips ProseMirror's handler.
- **e2e trap:** do waiting in Node, never with in-page timers; the occluded test window throttles them to ~1s, which breaks the conflict race (scenario I). And a conflict test must really change the disk file (a no-op `replace` produces no conflict).

## Characters (avatars)

`features/ask/characters/`: every character is a *preset* of one renderer, `Dot.tsx` (a soft coloured shape whose only face is two pill eyes). A preset is `{ id, color, shape, eyes, gloss }`; shapes are paths in `Shape`. Shared behaviour (cursor tracking, random blink, mouth visemes) is in `useAvatar.ts`; motion and depth styling is in `styles/characters.css`. Three looks: `flat`, `soft` (default: extruded base, gradient, gloss), `plush` (fuzzy felt via SVG turbulence; auto-downgraded to soft at icon size). Preview all moods and looks via Ask > Character.

Users can recolor any character from the gallery (overrides in `npkn.characterColors`, validated as `#rrggbb`); `Dot.tsx#eyeColor` flips eyes/mouth to dark on light colors so any pick stays readable.

To add one: add a `ShapeKind` + path in `Shape`, then a preset in `PRESETS`. Shapes are deliberately original silhouettes, not copies of any existing mascot set.

Traps: (1) don't put an SVG `transform="rotate(a cx cy)"` on an element that also has CSS `transform-box`/`transform-origin`; the origin gets applied twice and the element flies off. Rotate a wrapper `<g>` instead (see `Eye`). (2) The folder is `characters/`, not `avatar/`, because `Avatar` is exported from it and macOS would collide the names.

## Display preferences

Per-person view settings live in `src/ui/display.ts` (page width today), stored under `npkn.*` and applied
as a `data-*` attribute on `<html>` in `main.tsx` before first paint. They are not part of a theme (themes
are shareable data) and not part of a notebook (they differ per device). Width is the CSS variable
`--page-width`, read by `.page` and `.todos`; Ask and Settings keep their own fixed widths.

## App icon

Generated, not hand-edited: `npm run icons` runs `scripts/make-icons.cjs` under Electron and rewrites
`public/*` (web) and `desktop/icon.{svg,png,icns}`. The design lives in that script only.

- The mark is a note, deliberately not the character: the product is notes and knowledge, and the agent
  is a feature of it. Keep the app's identity (icon, name, copy) on the notebook.
- Variants matter: a bare mark with no tile for favicons, an ~824px tile on a 1024 canvas with transparent
  margin and shadow for macOS (Apple's grid), a full-bleed square for iOS/PWA, and a maskable one with the
  character inside the central 60% for Android adaptive icons.
- **Trap:** in this Electron build `show: false` and `transparent: true` windows both fail to load
  (`ERR_FAILED`). The script renders each icon on black and on white and recovers alpha from the
  difference (exact, including soft edges and shadows) instead of asking for a transparent capture. It
  also asserts the corner pixel of the app icon is transparent.
- `manifest.webmanifest` still says "npkn". When the app is renamed, update that and `productName`.

## Icons (UI)

Use `src/ui/icons.tsx` (flat SVG, `currentColor`) rather than emoji. Emoji render glossy and multicolour on
macOS, ignore the theme, and differ per platform. New icons go in that file.

## Labels and statuses

- A status is just a label whose registry entry has `kind: status` and a `group` (`todo` | `active` |
  `done`). Behaviour follows the group, never the name. `core/labels.ts` is the single source: defaults,
  parsing, `statusOf`, `labelCss`.
- **Closed** = checkbox ticked OR carries a `done`-group status (`Todo.closed`). Use `closed`, not
  `checked`, for "is this finished" everywhere (badge count, Ask's open-todos list, Todos view).
  Reopening via `setTodoClosed(…, false)` also removes the done label, otherwise it can't be reopened.
- The registry is stored in a normal page, id `labels`, in its `labels:` front matter (only differences
  from the defaults). It syncs, exports and is readable like any page. It is created lazily on first
  customisation (`data/labels.ts`).
- Chip colors come from a generated `<style>` (`labelCss`) keyed on `data-label`, so a color change
  repaints every chip without re-rendering the editor. Names and colors are validated before they reach
  CSS; keep it that way, the front matter can be hand-edited.
- **Chip adjacency:** a chip's `renderText` ends with a space on purpose. TipTap feeds that text to the
  input rules, so without it `@today@doing ` reads as one word and never converts.

## Landing view

The app opens on **Ask** (`App.tsx`). The first-ever launch opens Welcome once instead (`ensureWelcome`
returns its id only when nothing had been seeded). A Welcome refresh after a version bump must not
navigate; it would yank people off their landing page on every update.

## Property hints

The keys the app understands live in one list, `core/propertyKeys.ts` (`KNOWN_KEYS`). It drives the Add
chips, the hover help and the typo detector (`keyHints`: case-insensitive match, then a small edit
distance against known keys only). Add a new meaningful key there, not in the UI. Unknown keys must stay
allowed and unflagged (OKF requires preserving them), so only near-misses of *known* keys get a hint.
`NEW_FRONT` writes its hints as YAML comments; front matter is stored raw so they survive.

## Ask providers

- `kind: 'local' | 'cloud'` is user-facing: the stage badge and Settings say which, and a cloud provider
  sends the question plus retrieved excerpts to a third party. Never send anything before the user has
  chosen a cloud provider and entered a key (`useModels` doesn't even list models without one).
- Keys: header only, never URL or body, never logged. Stored plain in `npkn.ai` (localStorage). Anthropic
  is called directly from the browser with `anthropic-dangerous-direct-browser-access` (their explicit
  opt-in for a user's own key). A shared or bundled key must never go this way; that needs a proxy.
- **Private pages.** `private: true` in front matter marks a page; the flag is inherited by everything
  beneath it (`privateIds` in `core/frontmatter.ts`). `buildContext` filters them out BEFORE chunking,
  retrieval, sources and the open-todos list, and defaults to excluding, so a new caller can't leak by
  forgetting. Only `active.local` (loopback address, not the provider name) passes `includePrivate`.
  Anything new that sends note content anywhere (an MCP tool, export to a hosted service, a new provider
  path) must go through the same filter. `private.test.ts` guards this, including retrieval mode.
- `providers.test.ts` runs both wire formats against a mock streaming server with awkward chunk
  boundaries, a 401 and an in-stream error. It caught a dropped last line in the SSE parser. Real vendor
  endpoints are untested without keys; if a provider breaks, suspect the parser first.
- Storage key `npkn.ask` (old Ollama-only settings) is migrated into `npkn.ai` on first load.

## Choosing a local model (measured)

`src/features/ask/bench/ask.bench.test.ts` runs the real Ask pipeline (real retrieval, real prompt) over
11 questions on the sample notebook (8 factual, 1 overdue, 2 "not in the notes" abstentions) for any
models you name. Skipped unless `BENCH_MODELS` is set:

```bash
BENCH_MODELS=qwen3.5:4b,granite4:3b BENCH_RUNS=2 BENCH_OUT=/tmp/bench.json npx vitest run src/features/ask/bench
```

Findings (Oct 2026, M5 Max, 2 runs each, 22 answers per model, after the fixes below):

| model | size | correct | cited | first token | total |
| --- | --- | --- | --- | --- | --- |
| qwen3.5:4b | 3.3 GB | 22/22 | 17/18 | ~0.4 s | ~1.1 s |
| gemma4:e4b | 6.6 GB | 22/22 | 16/18 | ~0.4 s | ~1.0 s |
| granite4:3b | 2.1 GB | 22/22 | 11/18 | ~0.2 s | ~0.6 s |
| qwen3.8:27b-mlx | 18 GB | 22/22 | 16/18 | ~1.3 s | ~2.8 s |

- Accuracy ceilinged: this question set can't separate them. It separated on **citation habit** (granite
  cites far less) and **speed**. Add harder, multi-hop questions before drawing finer conclusions.
- Two things the benchmark taught us, both fixed: (1) the first scorer only knew "doesn't" as a refusal
  and wrongly failed correct "do not contain…" answers, so check the scorer before blaming a model;
  (2) every larger model said "nothing is overdue" from a flat, unsorted todo list. The prompt now
  groups open todos into Overdue / Due today / Upcoming / No due date, date-sorted, and that fixed all
  four. Don't make a model compare dates when we can do it for it.

## Testing Ask

`data/sample.ts` builds a fictional notebook (16 pages, OKF front matter, dated todos) via the real markdown importer; the sidebar's "Load sample" button loads it, and deleting the "Sample notebook" page removes it. It is deliberately above the ~12k char threshold so it exercises BM25 retrieval, and has traps: a superseded decision, facts buried mid-page, "budget" vs "spend", relative due dates. Keep example questions out of the notes themselves; they match real queries and skew ranking. Retrieval lessons so far: chunk-only BM25 missed answers whose words lived in a neighbouring section and failed on "asked"/"ask" (no stemming), so retrieval now stems and includes the best 3 pages whole. When changing `features/ask/retrieve.ts`, re-run the sample questions against the live model.

## State of the project

- Git repo, branch `main`, remote `origin` = `git@github.com:lchase/npkn.git` (SSH; HTTPS has no stored credentials here). The desktop build output (`release/`), `dist/` and `node_modules` are gitignored.
- Name undecided (candidates discussed: scratchthat, forgetmenote, wrotle, napcrumbs, notle, scrapjot). Don't rename without being asked.
- Longer-term ideas and open questions live in `docs/ideas.md`; add to it rather than here.
- Open ideas, roughly in priority order: Vitest for `core/`; embeddings for Ask; persisted chat history; chip editing; tables/images; sync backend behind `data/pages.ts`.

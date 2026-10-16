# npkn (working title)

A stripped-down, local-first notes app. Think Notion with only the parts that matter:

- **WYSIWYG notes where markdown is just a shortcut.** Type `## `, `- `, `[] `, `` ```ts `` and it formats and the syntax disappears. No raw-markdown editing.
- **Todos are just checkboxes with a category and a date.** Write them anywhere; they roll up into one Todos view grouped Overdue / Today / Upcoming / No date.
- **Statuses.** Any label can be a status in one of three groups: *To do*, *In progress*, *Done*. Built in: `todo`, `doing`, `blocked`, `in-review`, `done`; add your own in Settings. The Todos view can group by status, and a todo tagged with a *Done* status counts as finished.
- **Chips.** `@work` makes a category chip, `@fri` / `@oct-20` / `@2026-12-01` makes a date chip. Hyphens are fine (`@client-acme-q4`).
- **Ask your notes.** A chat (with a choice of animated characters) that answers from what you've written, using a local Ollama model.
- **Links between pages.** Type `[[` to link a page (or create one). Click to follow; each page lists what links to it. Links are stored by page id in the app and written as ordinary relative `.md` links in files, so renames don't break them and other tools can follow them.
- **Open Knowledge Format.** Each page can carry YAML front matter (`type`, `title`, `description`, `tags`, anything else), shown as a muted one-line summary under the title. Export a page or the whole notebook as plain `.md` files.
- **Display preferences.** Settings → Display sets the page width (Standard, Wide, Full) for notes and the Todos list.
- **Themes are JSON.** Paper, Ink, Nord, Gruvbox Light/Dark ship in the box. See [docs/themes.md](docs/themes.md).

Everything is stored in your browser (IndexedDB). There is no server.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm run build` (typecheck + production build), `npm run typecheck`, `npm test`.

### Desktop app

The desktop app is a thin Electron window around the same build (`desktop/`). No app code is
duplicated.

```bash
npm run desktop        # build, then open the desktop app
npm run desktop:dev    # open it against the running dev server (npm run dev in another terminal)
npm run desktop:pack   # produce release/mac-arm64/npkn.app (unsigned)
```

### Notebook folder (desktop app and Chromium browsers)

Notes can be kept as plain `.md` files in a folder you choose (sidebar → **Notebook folder → Choose
folder…**). It works in the desktop app and in Chrome/Edge/Brave/Arc (anything with the File System
Access API); Safari and Firefox don't have it, so they stay on in-browser storage. The files are the durable copy: any tool or agent can read them, and a
sync tool (iCloud, Dropbox, Syncthing) can carry the folder between machines.

- One page per file: `Weekly sync.md` becomes `weekly-sync.md`; sub-pages live in a folder named for
  their parent (`projects/plan.md`). YAML front matter holds `id`, `type`, `title` and anything else
  you add. The `id` is what keeps a page's identity across renames.
- Edit in the app or in any editor; changes flow both ways within a second or two.
- Deleting a page moves its file to `.trash/`. If a page changes in both places at once, the app's
  version wins and the other is kept as `*.conflict-<time>.md` (shown as "(conflict copy)").
- A file you wrote by hand only gains an `id:` line; its formatting is left alone until you edit it in
  the app.
- **Browser specifics:** the browser remembers the folder but usually asks you to re-grant access after
  a reload; the sidebar then shows **Reconnect**. There's no file watching in a browser, so external
  changes are noticed within a few seconds while the tab is open, or immediately when it regains focus.
  The browser stores only a handle to your folder, so clearing site data never touches your files.

Without a folder, notes live in the app's own storage (IndexedDB). To move notes
between the browser and desktop, use **Export bundle** and **Import** (accepts the `.zip`).

### Ask your notes (optional)

Needs [Ollama](https://ollama.com) running locally:

```bash
ollama serve
ollama pull qwen3.5:4b          # small and fast; any chat model works, pick it in Ask or Settings
```

The Ask view lists whatever models Ollama has. Notes never leave your machine.

**Choosing the model** is in **Settings → Ask**:

| Option | Where it runs | What leaves your machine |
| --- | --- | --- |
| Ollama (local) | Your machine | Nothing |
| Anthropic (Claude) | Anthropic's API, your own key | The question and the note excerpts needed to answer it |
| OpenAI-compatible | OpenAI, OpenRouter, LM Studio, … (your key) | Same, to the base URL you configure |

Only retrieved excerpts are sent, never the whole notebook, and nothing is sent until you ask.

**Properties help you as you go:** open a page's properties and the **Add** chips insert the common
keys (`type`, `description`, `tags`, `private`, `status`, `owner`, `date`, `stale_after`), with a
plain-words explanation on hover. A near-miss such as `privat` or `Private` is flagged with a one-click
rename, because a typo on `private` would otherwise silently do nothing. Custom keys are fine and are
never flagged.

**Keeping pages out of cloud models:** add `private: true` to a page's properties (or use **Mark
private** there). The page and everything under it is excluded from what a cloud model sees: its
text, title, properties and todos. It stays searchable and editable, and a model running on this
machine can still use it. "On this machine" is decided by the address (localhost / 127.0.0.1), not by
the provider's name, so an Ollama server on another host counts as remote. API keys
are stored in this browser/app only, in plain text, and go only to their provider as a request header.
A "hosted by npkn" option is shown as *Later*: it needs the backend that doesn't exist yet.

## Layout

```
src/
  main.tsx            entry: applies the theme, mounts <App/>
  app/                shell: navigation, sidebar, page view
desktop/              Electron wrapper: main, preload, notebook (the only disk access), setup, e2e test
  core/               pure logic, no React, no storage
    types.ts            Page, Doc
    dates.ts            date words -> ISO, relative labels
    todos.ts            extract/toggle todos from documents
    frontmatter.ts      OKF front matter parsing helpers
    markdown.ts         Doc <-> Markdown, page <-> .md with front matter
    notefile.ts         page <-> notebook-folder file (id/type/title), path planning, conflict names
    bundle.ts           OKF bundle (zip) export, download helper
    search.ts           sidebar search
  data/               persistence. The ONLY place that touches IndexedDB
    db.ts               Dexie schema (import only from this folder)
    pages.ts            the page store API the app uses
    folderSync.ts       IndexedDB <-> notebook folder sync engine
    fsaNotebook.ts      folder operations on a File System Access handle (browser)
    browserNotebook.ts  remembers the handle, permission re-grant, polling (browser)
    seed.ts, welcome.ts the Welcome / style-guide page
  editor/             TipTap editor and its extensions
    Editor.tsx, extensions.ts (the document schema), chip.ts, CodeBlock.tsx, PageProperties.tsx
  features/
    todos/              Todos view
    ask/                chat: store, providers (Ollama/Anthropic/OpenAI-compatible), config, retrieval, UI
      characters/       animated 'dot' avatars (shape + pill eyes, flat/soft/plush) + gallery
  themes/             theme loader, picker, builtin/*.json
  styles/             CSS split by area; index.css sets the order
docs/themes.md        theme format and token list
```

### Where a backend would go

There isn't one, on purpose. Two seams are in place so adding one later is a swap, not a rewrite:

| Seam | Today | To add a backend |
| --- | --- | --- |
| **Storage**, `src/data/pages.ts` | Dexie / IndexedDB | Reimplement the functions in `pages.ts` against an HTTP or sync API. Callers don't change. |
| **Chat**, `src/features/ask/provider.ts` | Ollama, or a cloud model with the user's own key, called from the browser | Add a `ChatProvider` that calls a hosted proxy, so no key is needed on the client. |

When that day comes, add a top-level `server/` next to `src/` rather than reshaping `src/`.

## How things work

- **Documents** are TipTap/ProseMirror JSON, stored per page. `src/editor/extensions.ts` is the one schema used by the editor and by markdown import.
- **Todos** are not a separate table. They're `taskItem` nodes found by walking every page; checking one in the Todos view writes back to its page.
- **Retrieval for Ask** is BM25 (with light stemming) over note chunks, plus front matter as its own chunk. The 3 best-matching pages are included whole so an answer isn't lost to a neighbouring section. If all notes fit in ~12k characters, everything is sent instead. Open todos are always included. No embeddings yet. **Load sample** in the sidebar adds a fictional notebook for trying it out.
- **Front matter** is stored as the raw YAML string so comments, order and unknown keys round-trip untouched.

## Known gaps / ideas

Longer-term thinking (OKF-native storage, an MCP server, A2A) lives in [docs/ideas.md](docs/ideas.md).

- Tests: `npm test` (Vitest: note file format, path planning, browser folder operations), `npm run test:desktop` and `npm run test:browser` (drive the real app through folder sync in each mode). Still to cover: dates, todos, markdown round-trip, retrieval.
- Browser folder mode needs the File System Access API, so no Safari/Firefox. The real folder-picker dialog and OS-level permission prompts are only exercised by hand.
- Chat history is in memory only.
- Retrieval is keyword-based. Next step is local embeddings (`nomic-embed-text` via Ollama).
- Single device. Sync means a storage backend behind `data/pages.ts`.
- Chips can't be edited after creation; delete and retype.
- Not yet supported in the editor: tables, images, callouts.
- Name is a placeholder. It appears in `package.json` and in `npkn.*` localStorage keys.

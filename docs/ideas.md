# Ideas

Parking lot for things worth discussing later. Nothing here is committed. Newest thinking at the top.

## The big one: a knowledge base, not just a notes app

What makes this different from Notion/Obsidian is that pages are **Open Knowledge Format** concepts
(Markdown + YAML front matter, `type` required, unknown keys preserved) and there is already an
agent in the loop (Ask). That points at positioning this as a **knowledge base that people and agents
share**: you write in a good editor, and any agent can read (and carefully write) the same notebook.

### Making the format the real interface

Today pages are stored as editor JSON with front matter as raw YAML; OKF is an *export*. To be a
credible knowledge base the files should be the contract. Options, roughly cheapest first:

1. **Live folder mirror.** Use the File System Access API to write every page to a chosen folder as
   `.md` + front matter (and read changes back). IndexedDB stays the fast working copy.
2. **Markdown as canonical storage.** Store `.md` text, derive editor JSON on load. Simpler mental
   model, bigger migration, loses nothing that markdown can't express (chips are `@word`).
3. **Hosted bundle.** When sync exists, the server stores the bundle and serves it.

Pairing with OKF's own conventions: `index.md` per folder (progressive disclosure for agents) and a
root `log.md` of changes, newest first. The `okf` Rust crate also knows about `sources`, `generated`,
`verified`, `status` and `stale_after`. Worth using for freshness ("this note is stale") and
provenance ("written by the agent on 2026-10-14, verified by a human").

### Storage optimized for agents (to discuss)

Storage today is shaped for the editor (one JSON doc per page, index rebuilt per question). Agents
want cheap orientation (`description` + `index.md`), stable ids and anchors, structured facts in front
matter, freshness/provenance fields, safe patch-style writes with history, and a persistent
keyword + embedding index. Candidate shapes: **files as truth + derived index**, **database as truth +
file export**, or a **hybrid**. Leaning: files + disposable index locally, hybrid once hosted.
Open: canonical form, page identity (`id` in front matter), where the index lives, versioning,
concurrent writers. Cheap first steps: stable `id`/`updated` on export, fill `description`s, persist
the chunk index.

### MCP server over the notebook

Expose the notebook to external agents (Claude Desktop, IDEs, other tools) through MCP.

Constraint: **a browser tab can't be a server.** So the realistic shapes are:

| Path | Effort | Notes |
| --- | --- | --- |
| A. Export or mirror a folder, point an existing filesystem/markdown MCP server at it | ~0 code | Works the day the folder mirror exists. Read-mostly. |
| B. Small local daemon (`npkn mcp --dir ./notebook`, stdio) | small | Understands front matter: search by `type`/`tags`, list todos, resolve links. Read-only first. |
| C. Hosted MCP endpoint over synced notes | large | Needs auth, per-token scopes, rate limits. Only after sync. |

Candidate tools: `search_notes(query, type?, tags?)`, `get_note(id)`, `list_notes(type?, tag?)`,
`list_todos(due?, category?)`, `create_note(...)`, `append_to_note(id, text)`,
`update_properties(id, patch)`. Candidate resources: each note as `okf://...`, the index.

Writes need guard rails: start append-only or "propose, then a human accepts" (a suggestions inbox),
mark agent-authored content in front matter, and never let a tool delete.

#### Path C in more detail: hosted, configured from Settings

Once there's a hosted backend, MCP and A2A endpoints are mostly configuration, not new architecture.
The notebook owner turns an integration on in Settings and manages access there:

- **Integrations list.** Each entry (an MCP client, an A2A peer, a script) gets its own credential,
  label, created/last-used time, and one-click revoke.
- **Scopes per credential.** `read`, `search`, `propose` (writes land in a suggestions inbox),
  `write`. Optionally limited by `type`, tag, or folder ("work notes only").
- **Auth.** Scoped API tokens first; OAuth for remote MCP clients that expect it. Tokens are hashed
  at rest and shown once.
- **Audit log.** Every read/search/write by an external agent, viewable and exportable.
- **Limits.** Per-credential rate limits and a kill switch for the whole integration.
- **Local daemon stays useful** for people who never want a hosted copy: same tool surface, files on
  disk, no auth needed because it only listens on stdio or localhost.

The tool surface should be identical across all three paths, so a client config can move from the
local daemon to the hosted endpoint by changing one URL.

### A2A: our agent as a peer

Expose Ask as an agent other agents can delegate to ("what did we decide about X?", "capture this
as a note", "summarize this week's todos"), via an A2A agent card describing those skills. MCP gives
a model *tools and data*; A2A lets another *agent* hand a task to ours. Order of operations: MCP
first (clearer value, simpler), A2A once there's something worth delegating and a place to host it.
Check the current spec before designing; both protocols are moving.

### Things that bite once notes are shared

- **Notes are untrusted input.** Anything an external agent reads from the notebook may contain
  instructions (pasted web text, imported files). Consumers must treat note content as data, and our
  own Ask should too.
- **Scoping.** Per-type or per-folder visibility ("work notes yes, journal no"), token scopes.
- **Local-first stays the default.** Nothing leaves the machine unless the user turns it on.

## Product ideas

- **Todo statuses: follow-ups.** Statuses and label colors are built (groups: To do / In progress /
  Done; registry in a `Labels` page). Still open: should *blocked* or *waiting* todos be held out of
  Overdue; a board (kanban) view over the same groups; auto-swapping `doing` to `done` when the box is
  ticked; renaming a label across all notes; hiding the `Labels` page from the page tree.
- **Favorites / pinned pages with manual order.** The tree is alphabetical now; a favorites section
  above it could be hand-ordered (drag and drop) without disturbing the alphabetical tree.

- **Link graph follow-ups.** Links and backlinks are built (`[[` picker, relative links in files).
  Still open: Ask retrieval following links, an MCP `get_links`, link text updating on rename, and
  rewriting dangling links in files when a target is deleted.
- **Type-aware pages.** `type: decision | person | project | runbook` gets a template and appears in
  filtered views; Ask can filter on it before retrieval.
- **Agent capture.** "Save this as a note" from the Ask chat, as a reviewable suggestion.
- **Publish.** Render a bundle (or a subtree) as a static site.
- **Todos from properties.** Pages with `due:` front matter show up in Todos.

## Retrieval and Ask

- Local embeddings (`nomic-embed-text` via Ollama), hybrid with BM25, with front matter `type`/`tags`
  as pre-filters.
- Persist chat history; cite the exact chunk, not just the page.
- Hosted-by-us provider behind a proxy (no key on the client). Bring-your-own-key Anthropic and
  OpenAI-compatible are built; keys are stored in plain text in the browser, so on desktop move them to
  the OS keychain (Electron `safeStorage`).

## Editor and data

- Edit chips after creation; date picker.
- Tables and callouts.
- **Images.** Sources: paste from clipboard (screenshots), drag and drop files, file picker, and image
  URLs (pasted link, or `![](https://...)` in imported markdown).
  - *Storage:* binaries as blobs in IndexedDB keyed by content hash (dedupes repeat pastes), not
    base64 inside the document; the page holds only a reference. Bundle export writes them to
    `assets/` and rewrites to `![alt](assets/<hash>.png)` so the OKF folder stays self-contained.
  - *URL images:* decide between hotlinking (fragile: link rot, tracking, CORS) and fetching a copy
    into the blob store on paste (needs the remote to allow it; a hosted backend can fetch for you).
  - *Size and hygiene:* downscale and re-encode large screenshots on import, strip EXIF/location,
    refuse or sanitize SVG (it can carry script), cap per-image and per-notebook size.
  - *Editor:* TipTap image node with alt text, resize handle, caption; paste/drop handlers.
  - *Agent angle:* an image is invisible to retrieval unless it has text. Store alt text and optionally
    a generated caption/OCR (a local vision model can do it, e.g. via Ollama), index that as a chunk,
    and let Ask cite the image. Same idea for MCP: return the caption plus a fetchable asset URL.
  - *Open:* where captions live (front matter vs sidecar), whether to caption automatically or on
    demand, and sync/storage cost once hosted.
- Vitest for `core/` (dates, todos, markdown round-trip, retrieval). Highest-value cleanup.
- Sync backend behind `data/pages.ts`; conflict model (per-page last-write-wins is probably enough).
- **Multiple notebooks (workspace switcher).** A dropdown at the top of the sidebar. A notebook is a
  hard boundary: its own database, optional folder, search, Ask scope and agent scope. Soft grouping
  ("projects") is just the page tree; don't make one word mean both.
  - *Build shape:* one IndexedDB database per notebook (page schema unchanged), a small localStorage
    registry, and switching reloads the app onto the other database. Desktop keeps a root per
    notebook; in the browser each database already holds its own folder handle.
  - *Why bother:* privacy (a personal notebook on local Ollama, a work one on a cloud model), scoping
    an MCP agent to one notebook, separate sync folders, per-notebook limits in the tiers.
  - *The hard part:* a single rolled-up todo list is the best feature and hard separation breaks it.
    Needs an "All notebooks" todos view that reads every database.
  - *Cheap prep now:* namespace the database name and storage keys by a notebook id (default
    `default`), so adding notebooks later isn't a migration.

## Platforms: desktop and mobile (once there's hosting)

Both depend on sync, so they sit behind the hosted backend. Notes on shape so we don't paint
ourselves into a corner:

- **Web/PWA first.** It's already a single-page app. Add a manifest and service worker and it installs
  and works offline. Caveat to verify: iOS Safari can evict IndexedDB for sites that aren't installed
  or used for a while, so a PWA on iPhone needs the server copy as the real safety net.
- **Desktop wrapper (Electron today, Tauri a candidate).** Buys things a tab can't do: real folder mirroring (the OKF
  folder), a bundled local MCP daemon, talking to local Ollama without CORS fuss, global capture
  hotkey, menu-bar quick note. Same React code.
- **Mobile is capture and recall, not authoring.** Quick note, voice, photo/screenshot, share-sheet
  "send to notes", todos with reminders, and Ask. Heavy editing and the style-guide-level formatting
  matter less. A Capacitor shell around the PWA is the cheap start; native (SwiftUI/Kotlin) only if
  share-sheet, widgets or background sync need it.
- **Reuse.** `core/` is pure TypeScript, so dates, todos, markdown and retrieval carry over to any
  JS shell unchanged. A native rewrite would have to reimplement that, which argues for staying in JS.
- **AI per platform.** Local Ollama doesn't exist on a phone, so mobile Ask means a hosted model or a
  user's own machine/home server. Another reason the `ChatProvider` seam and hosted proxy matter.

## Business model and hosted privacy: local-first, paid sync, encrypted so we can't read it

The shape we keep converging on is Obsidian's: **the app is free and complete on your own machine; a
subscription pays for sync** (and a few conveniences on top). It matches what's built (IndexedDB plus a
plain-file notebook folder), keeps the free tier genuinely useful, and means nobody's notes are held
hostage: stop paying and everything is still on disk as markdown.

If notes are ever hosted with us, they should be **end-to-end encrypted, so that we as operators
cannot read them**. That's a promise worth making and a harder one to keep. What it implies:

- **The server stores ciphertext only.** One encrypted blob per page, addressed by page id (not by
  path or title, which would leak structure). Content, titles, paths, tags and history are all inside the
  encrypted payload. What we can't avoid seeing: sizes, timestamps and the access pattern.
- **Keys never leave the client.** A random notebook key encrypts the pages; that key is wrapped by a
  key derived from the user's passphrase (a memory-hard KDF such as Argon2id). Browser and Electron
  both have WebCrypto. Authentication must not send the passphrase (a separate auth credential or an
  SRP-style exchange).
- **Lose the passphrase, lose the cloud copy.** We can't reset it for you. The local files are
  unaffected, which is the safety net. A printable recovery key is the usual mitigation.
- **Multi-device** means getting the notebook key onto a new device: enter the passphrase, or approve it
  from an already-trusted device. **Sharing** a notebook with another person needs a key exchange, which
  is the hardest part and probably a later phase.
- **Our architecture already leans this way.** Search and Ask retrieval run on the client, and storage
  sits behind `data/pages.ts`, so an `EncryptedRemoteStore` is another implementation of the same seam.
  Per-page objects (rather than one big file) also make sync and conflicts tractable on ciphertext.

**The tension to design around:** the hosted features we sketched elsewhere (an MCP/A2A endpoint, hosted
Ask) need to *read* notes. With end-to-end encryption the server can't. Options:

1. **Keep them client-side.** The local MCP daemon and local Ollama already work and need nothing from
   the server. Sync stays dumb storage. Simplest, strongest promise.
2. **Opt-in "server-readable" notebook.** A clearly labelled mode where the user trades the guarantee
   for hosted agents and hosted AI. Honest, but two products to build and explain.
3. **Delegated access.** The client mints a scoped, time-limited capability that lets a specific agent
   decrypt specific pages. Powerful, and a lot of cryptographic design to get right.

Leaning: **1 first, 2 only if people actually ask**. It also shapes tiers: sync is the paid product;
hosted AI and hosted agent endpoints are separate, explicitly non-private add-ons (or bring your own).

## Packaging and tiers (straw man)

Placeholder structure for discussion, not a pricing proposal. The framing above (free local app, paid
encrypted sync) supersedes the hosted-AI-in-Pro idea in the table: hosted features that must read notes
conflict with end-to-end encryption, so they'd be separate opt-in add-ons. Costs to us come from a few places:
hosting and sync, image/blob storage, history retention, and **AI inference**. Plus a coordination
value that scales with people (sharing, integrations, audit).

| | Free | Pro | Elite / Team |
| --- | --- | --- | --- |
| Where data lives | This device (local-first) | Synced across devices, hosted copy | Same, plus shared notebooks |
| Editor, todos, chips, themes, characters | All | All | All |
| Import/export, OKF bundle | All | All | All |
| Ask | Bring your own: local Ollama or own API key | Hosted allowance per month | Higher allowance, choice of models |
| MCP / A2A | Local daemon only | Hosted endpoint, a few scoped tokens | Many tokens, per-type scopes, audit log |
| Images and history | Local storage only | Quota; version history N days | Larger quota; long or unlimited history |
| Collaboration | | | Shared notebooks, seats, roles, SSO |
| Support | Community | Email | Priority |

Principles worth agreeing on early:

- **Never gate portability.** Export and the open format are the pitch; paywalling them would
  undercut it. Charge for what costs money to run and for coordination, not for getting your notes out.
- **Free is genuinely useful**, not a trial. Local-first means serving a free user costs us almost
  nothing, which makes this unusually sustainable.
- **Meter AI honestly.** Either bring-your-own-key/model (free for us) or a clear monthly allowance
  with a hard limit. Avoid surprise overage.

Open questions for this section are in the list below.

## Look and feel

- Characters: more shapes, optional accessories, "follow theme accent" color mode, randomize.
- Theme editor in-app (the format is already plain JSON).

## Open questions

Everything still undecided, in one place. Answer these before building the related section.

**Format and storage**

- ~~Canonical form~~ Decided: markdown files in a notebook folder are canonical (desktop today); editor JSON is the working copy.
- ~~Page identity~~ Decided: an `id` line in front matter.
- Where does the index live (IndexedDB, local file, server), and who rebuilds it when files change
  outside the app?
- Versioning: per-save snapshots, git, or an operation log? How long is history kept?
- Concurrent writers (a human typing while an agent patches): a version check plus keeping the other
  version as a visible copy is built for app-vs-disk. Is that enough once agents write too, or do we need
  real merging?
- Embeddings: which model, where stored, and where's the privacy line (local only vs API)?
- How do we mark agent-authored content: front matter fields, per-section markers, or both?

**Integrations (MCP / A2A)**

- Read-only first, or ship a constrained write path (append, propose-then-accept) from day one?
- Do we need per-type or per-folder scopes at launch, or are whole-notebook tokens fine?
- MCP before A2A: what would another agent actually delegate to ours that MCP can't already cover?
- How do we make note content safe for downstream agents to read (it is untrusted input)?

**Platforms**

- Is a PWA acceptable on iPhone given storage eviction, or is a server copy mandatory from the start? (Browser folder mode now covers Chromium desktop; Safari and Firefox have no File System Access API, and iOS can't pick a folder at all, so those need a server copy.)
- Desktop wrapper: Electron is built and working. Revisit Tauri for size (~260 MB vs ~10 MB) and a native sidecar for the MCP daemon? Needs plugin-based save dialogs, since blob downloads don't work there.
- Mobile: Capacitor shell around the PWA, or native for share-sheet and widgets?

**Hosted storage and encryption**

- Do we commit to end-to-end encryption from the first hosted version, or is that a later upgrade? (A
  later upgrade means migrating everyone's data, so it's cheaper to start with it.)
- Recovery: passphrase only (we can never help), or a recovery key, or a trusted-device approval flow?
- Hosted agents and hosted AI vs the encryption promise: client-side only, an opt-in server-readable
  mode, or delegated decryption?
- Sharing a notebook between people: is key exchange in scope, or is hosted sync single-user first?
- What do we promise about metadata (sizes, timestamps) that we can't hide?

**Tiers**

- Priced per seat, per notebook, or per user?
- Is hosted AI bundled into Pro or sold separately?
- Is there a self-hosted option, and does it become the Elite story or cannibalize Pro?
- Open-source core with paid hosting, or closed?
- Where does the hosted MCP/A2A endpoint sit? It is probably the strongest reason to pay.

**Images**

- URL images: hotlink or fetch a copy at paste time?
- Captions/OCR: where do they live, and automatic or on demand?

**Product**

- The name (shortlist in Housekeeping).
- Should characters get a "follow theme accent" color mode?
- Should pages with a `due:` front matter field show up in Todos?
- `private: true` is built for Ask. Should it also gate MCP/A2A tools, bundle export, and publishing by default?

## Housekeeping

- Pick a name (shortlist so far: scratchthat, forgetmenote, wrotle, napcrumbs, notle, scrapjot).
  A rename touches `package.json`, the `npkn.*` localStorage keys, `public/manifest.webmanifest`, the
  desktop `productName`/`appId`, and docs. The icon itself is text-free, so it needs no redraw.
- `git init` and a first commit.

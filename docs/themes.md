# Themes

A theme is one JSON file of design tokens. No code, no CSS files, nothing executes.

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "scheme": "dark",
  "author": "you",
  "vars": { "bg": "#101418", "accent": "#ffb454" }
}
```

- **Contribute:** drop the file in `src/themes/builtin/`. It is picked up automatically.
- **Use privately:** sidebar footer, *Import theme…*. Stored in the browser only.
- **Partial is fine.** Missing tokens fall back to Paper (`scheme: "light"`) or Ink (`scheme: "dark"`).
- `id` must be unique, letters/digits/`-`/`_`. Imported values may not contain `url()` or `@import`.

Best way to tune a theme: open the **Welcome** page. It renders every element.

## Tokens

| Token | What it controls |
| --- | --- |
| `bg` | Page / editor background |
| `side` | Sidebar background |
| `text` | Body text |
| `muted` | Secondary text, placeholders, labels |
| `line` | Borders and dividers |
| `accent` | Links, quote bar, date chips, active states |
| `danger` | Overdue, badges, delete |
| `code-bg` | Inline code and code block background |
| `chip-bg-sat`, `chip-bg-l` | Category chip background saturation / lightness. Hue is derived from the name |
| `chip-fg-sat`, `chip-fg-l` | Category chip text saturation / lightness |
| `font-body`, `font-heading`, `font-mono` | Font stacks (system or already-loaded fonts) |
| `radius` | Corner radius for code blocks, inputs |
| `syn-comment` `syn-keyword` `syn-string` `syn-number` `syn-function` `syn-type` `syn-variable` `syn-meta` `syn-punct` | Code syntax colors |

## Adding a token

1. Give it a default in `:root` in `src/styles/base.css`.
2. Add it to `paper.json` and `ink.json`.
3. Add a row above.

---
name: Tactile Ink & Fiber
colors:
  surface: '#121317'
  surface-dim: '#121317'
  surface-bright: '#38393d'
  surface-container-lowest: '#0d0e12'
  surface-container-low: '#1a1b1f'
  surface-container: '#1e1f23'
  surface-container-high: '#292a2e'
  surface-container-highest: '#343439'
  on-surface: '#e3e2e7'
  on-surface-variant: '#dbc1ba'
  inverse-surface: '#e3e2e7'
  inverse-on-surface: '#2f3034'
  outline: '#a38b86'
  outline-variant: '#55423e'
  surface-tint: '#ffb4a1'
  primary: '#ffb4a1'
  on-primary: '#5d1805'
  primary-container: '#e07a5f'
  on-primary-container: '#5b1604'
  inverse-primary: '#9a442d'
  secondary: '#f0bd8b'
  on-secondary: '#482904'
  secondary-container: '#65411a'
  on-secondary-container: '#e1af7e'
  tertiary: '#9fd1b8'
  on-tertiary: '#023826'
  tertiary-container: '#70a18a'
  on-tertiary-container: '#003725'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbd2'
  primary-fixed-dim: '#ffb4a1'
  on-primary-fixed: '#3c0800'
  on-primary-fixed-variant: '#7c2e19'
  secondary-fixed: '#ffdcbd'
  secondary-fixed-dim: '#f0bd8b'
  on-secondary-fixed: '#2c1600'
  on-secondary-fixed-variant: '#623f18'
  tertiary-fixed: '#bbeed4'
  tertiary-fixed-dim: '#9fd1b8'
  on-tertiary-fixed: '#002115'
  on-tertiary-fixed-variant: '#1f4f3c'
  background: '#121317'
  on-background: '#e3e2e7'
  surface-variant: '#343439'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 52px
    letterSpacing: -0.03em
  display-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  code-inline:
    fontFamily: JetBrains Mono
    fontSize: 13.5px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  code-block:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
  space-2xl: 3.5rem
---

## Brand & Style

This design system draws its spirit from the ephemerality of sketches jotted on the back of a paper napkin, elevated through the exacting precision of developer utility software. It serves thinkers, writers, engineers, and architects who view note-taking as a visceral, low-friction extension of thought.

The emotional tone balances quiet contemplation with industrial utility: deliberate, warm, grounded, and unimposing. The aesthetic merges **Tactile Minimalism** with **Instrument-Grade Precision**. Interface chrome recedes completely when writing, yielding to an uninterrupted canvas that feels physical yet frictionless. 

Visual characteristics:
- Dark-mode first, anchored by ink-and-charcoal strata that avoid pure, cold OLED black in favor of warm, fibrous slate.
- A singular burnt terracotta ink accent evokes an artist’s drawing pen or sealing wax, punctuating content without visual noise.
- Hairline structural lines emulate ruled drafting paper and precise tool palettes.
- Monospace notation for markdown primitives meets a balanced, contemporary sans-serif for body content, validating both quick captures and long-form technical prose.

## Colors

The palette is anchored by deep warm charcoal surfaces, mimicking weighted stock paper soaked in black ink. The color hierarchy creates spatial depth through stepped luminosity rather than synthetic drop shadows.

### Core Swatches
- **Primary (`#E07A5F` - Terracotta Ink):** The focal interaction point. Used for active caret positioning, markdown token highlights, primary buttons, and focused states.
- **Secondary (`#D4A373` - Raw Kraft):** Secondary accent for metadata tags, file path breadcrumbs, search result matches, and callout blocks.
- **Tertiary (`#81B29A` - Dried Sage):** Reserved exclusively for semantic confirmations, completed tasks, synced statuses, and diff additions.
- **Neutral Surface Baseline (`#18191D` - Canvas Ground):** The standard background for documents and workspaces.

### Structural Surface Stack
- **Base Canvas:** `#121316` (Deep ink foundation, sidebars, tool trays)
- **Document Surface:** `#18191D` (The napkin canvas, primary note view)
- **Elevated Card / Modal:** `#222328` (Floating command palette, contextual popovers, active card states)
- **Subtle Surface / Hover:** `#2A2C33` (List hovers, keyboard shortcut badges, chip backgrounds)

### Text & Contrast Hierarchy
- **Primary Text:** `#EDEDEE` (Warm off-white, high contrast without optical vibration)
- **Secondary Text:** `#A0A2AA` (Markdown syntax symbols `*`, `#`, `>`, metadata, timestamps)
- **Muted / Disabled:** `#60636C` (Line numbers, empty state guides, gutter markers)
- **Structural Dividers:** `rgba(255, 255, 255, 0.07)` (Subtle interior hairline strokes)
- **Active Border Accent:** `rgba(224, 122, 95, 0.35)` (Focused input and active pane outlines)

## Typography

The typographic engine balances rhythmic reading comfort with technical utility. 

- **Primary Body and Headlines (Plus Jakarta Sans):** Selected for its geometric clarity softened by subtle humanist warmth. At editorial scales, it reads like printed book paper; at interface scales, its legible counters and clean metrics remain crisp on dense screens.
- **Syntactic Labels & Code (JetBrains Mono):** Reserved for technical infrastructure: markdown decorators (`#`, `[]`, `---`), inline code segments, frontmatter, document stats, keyboard shortcuts, and metadata tags. This monospaced presence anchors the tool in modern developer software.

### Markdown Parsing Treatment
In the editor, markdown syntax indicators (such as `## ` for headings or `>` for blockquotes) transition down to `label-sm` or `body-sm` sizes rendered in secondary neutral color (`#60636C`). As the cursor exits the block, the formatting renders cleanly while preserving a faint, low-contrast indicator in the margin for effortless markdown manipulation.

## Layout & Spacing

The spatial architecture balances distraction-free prose focus with multi-column productivity workflows.

### Structure & Column System
- **Desktop (>= 1200px):** 3-pane responsive layout.
  - Left Pane (Navigation/Folders): Collapsible, fixed 240px width.
  - Middle Pane (Note List / Search): Fixed 320px width.
  - Canvas (Editor / Viewer): Fluid width with an internal maximum reading measure of `680px` (`42rem`), centered to prevent excessive line lengths.
- **Tablet (768px – 1199px):** 2-pane mode with collapsible left pane; middle pane overlays or collapses into a floating drawer.
- **Mobile (< 768px):** Single-pane sliding stack. Canvas edge margins pull tight (`margin: 1rem`) to maximize screen area for long-form input.

### Spacing Philosophy
Spacing tokens govern internal content layout without mixing structural gutters. The standard rhythmic multiplier is `8px` (`0.5rem`). Editorial prose employs loose vertical stacking (`space-lg` between blocks, `space-2xl` before level-1 and level-2 headers) to establish calm, airy paper-like cadence. Dense lists, tag arrays, and search results compress using `space-xs` and `space-sm` for high information density.

## Elevation & Depth

This design system avoids steep physical shadows and glowing light sources. Depth is achieved via **Tonal Layering** combined with **Low-Contrast Micro-Borders** and **Subtle Ambient Occlusion**.

### Layering Hierarchy
1. **Recessed Ground (`#121316`):** Canvas surrounding sidebars, structural rails, and empty app gutters.
2. **Editor Plain (`#18191D`):** The main writing surface, optically resting flat above the base.
3. **Floating Controls & Modals (`#222328`):** Quick-switcher command palettes (Raycast-inspired), right-click context menus, and hover previews.

### Shadow Recipe
When an overlay or card must detach from the surface, apply a diffused, tinted ambient shadow:
- `box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.45), 0 2px 6px -1px rgba(0, 0, 0, 0.35);`

### Border Enclosure
Every surface elevation is bounded by a hairline stroke:
- Default: `1px solid rgba(255, 255, 255, 0.07)`
- Active / Floating: `1px solid rgba(255, 255, 255, 0.12)`
This preserves separation across screens without relying on heavy gradients or high-contrast delineation.

## Shapes

The shape system communicates tactile softness without feeling juvenile. Radii reflect hand-cut craft paper cards and hardware edges found in high-end industrial instruments.

### Radii Scale
- **Base Elements (8px / `0.5rem`):** Buttons, inputs, search bars, tag chips, and dropdown line items.
- **Containers & Surfaces (12px - 14px):** Note preview cards, floating toolbars, code block wrappers, and command palettes.
- **Strictly Square (0px):** Structural vertical dividers and full-height canvas splitters.
- **Full Pill (`9999px`):** Status indicator tags, keyboard shortcut badges, and quick-filter pills.

## Components

### Buttons
- **Primary:** Solid background `#E07A5F` with dark ink text `#121316` for maximum punch and legibility. Font weight `600`, radius `8px`, subtle micro-scale tap interaction (`scale: 0.98` on click).
- **Secondary / Ghost:** Transparent background with hairline border `rgba(255, 255, 255, 0.08)` and text `#EDEDEE`. Hovers illuminate background to `#222328`.
- **Icon / Tool Action:** 32x32px squircle, `#A0A2AA` icon stroke, shifting to `#EDEDEE` on hover with a `#222328` fill.

### Chips & Metadata Tags
- Height: 24px.
- Background `#222328`, border `rgba(255, 255, 255, 0.06)`, text `#D4A373` (`label-sm`).
- Tag hash prefix `#` styled in muted `#60636C`. Active/filtering chips apply terracotta accent border `rgba(224, 122, 95, 0.4)`.

### Lists & Note Cards
- Dense list rows on `#121316` ground, padding `12px 14px`.
- Left-side accent line (2px width) tinted with `#E07A5F` for the active selection.
- Preview snippets truncate cleanly after two lines in `body-sm` (`#A0A2AA`).
- Relative timestamp rendered right-aligned in `label-sm` (`#60636C`).

### Checkboxes & Task Lists
- Square with soft corners (`4px` radius), 16x16px bounding box.
- Unchecked: `1.5px` border in `#60636C`, transparent center.
- Checked: `#81B29A` filled background with an ink-dark `#121316` checkmark icon. The adjoining text immediately receives `line-through` and transitions to `#60636C`.

### Input Fields & Search Bars
- Background `#18191D`, border `1px solid rgba(255, 255, 255, 0.08)`.
- Focused state: Border changes to `#E07A5F`, accompanied by a subtle `box-shadow: 0 0 0 1px #E07A5F`.
- Placeholders in `#60636C`. Includes trailing keyboard hint badge (`⌘K` rendered in `label-sm` over a `#222328` pill).

### The Writing Canvas (Editor Block)
- Fluid vertical flow centered on the screen.
- Active line highlight: Optional faint background wash `rgba(255, 255, 255, 0.02)`.
- Blockquote: 3px left border colored with `#D4A373`, indented `space-md`, text italicized in `#EDEDEE`.
- Code blocks: Surface `#121316` with a full bounding border `rgba(255, 255, 255, 0.06)`, radius `10px`, padded with `space-md`, language banner labeled using `label-sm` in `#60636C`.
# M6 Theming Fixes & Widget Polish (Web Notes)

**Date:** 2026-06-23
**Status:** Approved design, pending plan
**Follows:** M6 Task 1 (dark mode) — fixes issues found in live testing.

## Issues (from user testing)

1. **Widget not dark** — `widget.css` defines variables on `:root`, but the widget
   lives in a **closed shadow DOM** where `:root` matches the document `<html>`
   (outside the shadow), so the vars never apply. **Fix:** use `:host`.
2. **No theme switch** — add a manual **Theme: Auto / Light / Dark** control
   (persisted; applied across all surfaces), overriding the OS default.
3. **Widget "Open full app" does nothing** — depends on a background message that
   fails when the content script is orphaned (after an extension reload). **Fix:**
   make `app.html` web-accessible and open it with `window.open` directly.
4. **Bubble should use the official icon** — replace the `📝` emoji with the real
   checklist icon image + a count badge (icon must be web-accessible).

## Decisions

| Topic | Decision |
| --- | --- |
| Widget vars | `:host` (and `:host([data-theme=…])`) instead of `:root`. |
| Theme model | `meta.settings.theme`: `"auto" \| "light" \| "dark"` (default `"auto"`). |
| Theme apply | A `data-theme` attribute on `document.documentElement` (popup/app) and on the widget shadow host; CSS force-selectors override the `prefers-color-scheme` default. |
| Theme control | A **Theme** `<select>` in the full-app toolbar **and** the popup footer. |
| Open-app | `window.open(chrome.runtime.getURL("src/app/app.html"))` (app.html web-accessible); the background `open-app` message handler stays as a harmless fallback. |
| Bubble icon | `<img src=icons/32.png>` + an open-count badge; remove the `📝` emoji and the solid accent bubble background. |

## Theme CSS pattern (popup.css, app.css with `:root`; widget.css with `:host`)

```
:root { /* light defaults */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* dark */ } }
:root[data-theme="dark"] { /* dark */ }
```
- No attribute → OS decides (auto). `data-theme="light"` → media excluded, light defaults win. `data-theme="dark"` → forced dark. (Dark var set appears twice — in the media block and the force block.)
- Widget uses `:host`, `:host(:not([data-theme="light"]))` in the media block, and `:host([data-theme="dark"])`.

## Apply logic

- `applyTheme(theme, el)`: if `theme === "light" || "dark"` set `el.dataset.theme = theme`; else remove the attribute (auto). popup/app use `document.documentElement`; widget uses its shadow **host** element.
- **popup.js / app.js:** read `meta.settings.theme` on load and apply; the Theme select writes `meta.settings.theme` + applies; re-apply on storage-change (so changing it in one surface updates the other).
- **widget.js:** read `meta.settings.theme` on load and on each `reload()` (it already can read meta), applying to the host.

## Manifest

`web_accessible_resources` gains `src/app/app.html` and `icons/32.png` (matches
`<all_urls>`), so the content-script widget can `window.open` the app and display
the icon.

## Widget bubble

`render()` builds the collapsed bubble as: an `<img src=icons/32.png>` (the
official icon) plus a `.count` badge showing the open count; the bubble keeps its
draggable/click behavior. CSS: icon ~40px rounded; badge in the corner (accent bg,
white text, a `--bg` ring to separate it from the icon).

## Non-goals

- No per-page theme; theme is global (one setting).
- No new permissions (web_accessible_resources is not a permission prompt).
- No change to the data model beyond `meta.settings.theme`.

## Testing

- No new pure logic; existing 52-test suite stays green.
- Static: `node --check` on changed JS; manifest JSON valid; CSS has the three
  theme layers per file.
- Manual (deferred): widget goes dark with the OS / the toggle; Theme
  Auto/Light/Dark works in popup + app + widget; "Open full app" opens the app;
  the bubble shows the official icon + count.

## Files

```
manifest.json            # web_accessible_resources += app.html, icons/32.png
src/content/widget.css   # :root -> :host; theme force-selectors; bubble icon/badge styles
src/content/widget.js    # bubble icon img + count badge; open-app via window.open; apply theme to host
src/popup/popup.css      # theme force-selectors
src/popup/popup.html     # Theme select in footer
src/popup/popup.js       # apply theme; Theme select handler
src/app/app.css          # theme force-selectors
src/app/app.html         # Theme select in toolbar
src/app/app.js           # apply theme; Theme select handler
```

## Task split (plan)

1. Widget fixes — manifest WAR, `:host`, bubble official icon + badge, open-app via window.open.
2. Theme toggle — CSS force-selectors (3 files) + `meta.settings.theme` + Theme selects (popup + app) + apply logic (popup/app/widget).

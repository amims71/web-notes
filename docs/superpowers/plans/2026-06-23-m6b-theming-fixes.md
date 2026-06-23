# M6 Theming Fixes & Widget Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the widget's broken dark mode (`:host`), open-app button, and bubble icon; add a manual Theme (Auto/Light/Dark) toggle across all surfaces.

**Architecture:** CSS variables move to `:host` in the widget's shadow DOM; a `data-theme` attribute on `document.documentElement` (popup/app) and the widget host overrides the `prefers-color-scheme` default; `meta.settings.theme` persists the choice. The widget opens the app via `window.open` of a web-accessible `app.html` and shows the official icon image.

**Tech Stack:** Vanilla ES modules + CSS, no build step. Existing 52-test suite stays green.

## Global Constraints

- **No build step**; no new dependencies; **no new permissions** (web_accessible_resources additions are not a permission prompt).
- **CSS plain** (no `<style>` tags). Widget CSS uses `:host` (shadow DOM), not `:root`.
- **Theme dark var sets** (verbatim):
  - popup/app dark: `--indigo: #818cf8; --line: #3a3b40; --muted: #9ca3af; --bg: #1f2024; --fg: #e5e7eb; --chip-bg: #312e81; --chip-ro-bg: #374151; --danger: #f87171; --field-bg: #26272c;`
  - widget dark: `--accent: #818cf8; --bg: #1f2024; --fg: #e5e7eb; --line: #3a3b40; --muted: #9ca3af; --danger: #f87171;`
- **`meta.settings.theme`** ∈ `{"auto","light","dark"}` (default auto). Guard `meta.settings ?? {}`.
- **Comment rule:** only what isn't obvious; no narration.
- **Commit** after each task; existing tests green (`npm test` → 52/52).

---

### Task 1: Widget fixes — `:host`, official-icon bubble, open-app, manifest

**Files:**
- Modify: `manifest.json`
- Modify: `src/content/widget.css`
- Modify: `src/content/widget.js`

Read all three first.

- [ ] **Step 1: Web-accessible resources** — in `manifest.json`, change the `web_accessible_resources` `resources` array to also include `src/app/app.html` and `icons/32.png`:

```json
  "web_accessible_resources": [
    { "resources": ["src/lib/scope.js", "src/lib/model.js", "src/lib/storage.js", "src/content/widget.css", "src/app/app.html", "icons/32.png"], "matches": ["<all_urls>"] }
  ]
```

- [ ] **Step 2: `widget.css` — `:root` → `:host`** — change the base palette line and the dark media block to use `:host` instead of `:root`:
  - Line 1 `:root { … }` → `:host { … }` (same vars).
  - Inside `@media (prefers-color-scheme: dark) { :root { … } }` → `:host { … }`.

- [ ] **Step 3: `widget.css` — bubble icon + badge** — replace the existing `.bubble { … }` rule with:

```css
.bubble { position: relative; cursor: pointer; user-select: none; width: 40px; height: 40px; }
.bubble img { width: 40px; height: 40px; border-radius: 9px; display: block; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
.bubble .count { position: absolute; top: -6px; right: -6px; background: var(--accent); color: #fff; border-radius: 10px; font-size: 10px; line-height: 1; padding: 3px 5px; box-shadow: 0 0 0 2px var(--bg); }
```

- [ ] **Step 4: `widget.js` — bubble uses the official icon** — replace the collapsed-bubble block (the `if (!expanded) { … }` that builds `bubble.textContent = `📝 ${count}``) with:

```js
    if (!expanded) {
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      const img = document.createElement("img");
      img.src = base("icons/32.png");
      img.alt = "Web Notes";
      const badge = document.createElement("span");
      badge.className = "count";
      badge.textContent = String(count);
      bubble.append(img, badge);
      bubble.onclick = () => { expanded = true; render(); };
      makeDraggable(bubble);
      container.append(bubble);
      return;
    }
```

- [ ] **Step 5: `widget.js` — open the app via `window.open`** — change the `more.onclick`:

```js
    more.onclick = () => window.open(base("src/app/app.html"), "_blank");
```

- [ ] **Step 6: Checks**

Run: `node -e "const j=JSON.parse(require('fs').readFileSync('manifest.json','utf8')); const r=j.web_accessible_resources[0].resources; console.log(r.includes('src/app/app.html'), r.includes('icons/32.png'))"`
Expected: `true true`.
Run: `node --check src/content/widget.js`
Expected: exits 0.
Run: `grep -c ":host" src/content/widget.css`
Expected: ≥ 2 (base + dark media).
Run: `grep -c ":root" src/content/widget.css`
Expected: `0`.
Run: `npm test`
Expected: 52/52.

- [ ] **Step 7: Commit**

```bash
git add manifest.json src/content/widget.css src/content/widget.js
git commit -m "fix: widget dark mode (:host), official-icon bubble, and reliable open-app"
```

---

### Task 2: Theme toggle (Auto/Light/Dark) across popup, app, widget

**Files:**
- Modify: `src/popup/popup.css`, `src/app/app.css`, `src/content/widget.css`
- Modify: `src/popup/popup.html`, `src/app/app.html`
- Modify: `src/popup/popup.js`, `src/app/app.js`, `src/content/widget.js`

Read the files first.

- [ ] **Step 1: popup.css force-selectors** — (a) change the existing dark media query selector from `:root` to `:root:not([data-theme="light"])`; (b) append a force-dark block:

```css
:root[data-theme="dark"] { --indigo: #818cf8; --line: #3a3b40; --muted: #9ca3af; --bg: #1f2024; --fg: #e5e7eb; --chip-bg: #312e81; --chip-ro-bg: #374151; --danger: #f87171; --field-bg: #26272c; }
```

- [ ] **Step 2: app.css force-selectors** — same as Step 1 in `src/app/app.css` (media selector → `:root:not([data-theme="light"])`; append the identical `:root[data-theme="dark"] { … }` block).

- [ ] **Step 3: widget.css force-selectors** — (a) change the dark media selector from `:host` to `:host(:not([data-theme="light"]))`; (b) append:

```css
:host([data-theme="dark"]) { --accent: #818cf8; --bg: #1f2024; --fg: #e5e7eb; --line: #3a3b40; --muted: #9ca3af; --danger: #f87171; }
```

- [ ] **Step 4: popup.html Theme select** — in the `<footer>`, add (after the widget toggle label):

```html
      <label class="theme-pick">Theme
        <select id="theme">
          <option value="auto">Auto</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
```

- [ ] **Step 5: app.html Theme select** — in the header, add (e.g. after the Backup label):

```html
      <label>Theme
        <select id="theme">
          <option value="auto">Auto</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
```

- [ ] **Step 6: popup.js — apply + handler** — (a) add `getMeta, setMeta` to the `from "../lib/storage.js"` import. (b) Add the helper near the top-level helpers:

```js
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
```

  (c) At the very start of `load()` (before the active-tab/scope work), apply the saved theme and set the select:

```js
  const meta = await getMeta();
  applyTheme(meta.settings?.theme);
  $("theme").value = meta.settings?.theme ?? "auto";
```

  (d) Wire the handler near the other handlers:

```js
$("theme").onchange = async (e) => {
  const m = await getMeta();
  m.settings = m.settings ?? {};
  m.settings.theme = e.target.value;
  await setMeta(m);
  applyTheme(e.target.value);
};
```

- [ ] **Step 7: app.js — apply + handler** — (a) add the same `applyTheme` helper (uses `document.documentElement`). (b) In `reload()` (which already does `meta = await getMeta()`), after setting the backup select value, add:

```js
  applyTheme(meta.settings?.theme);
  $("theme").value = meta.settings?.theme ?? "auto";
```

  (c) Wire the handler near the other control handlers:

```js
$("theme").onchange = async (e) => {
  meta.settings = meta.settings ?? {};
  meta.settings.theme = e.target.value;
  await setMeta(meta);
  applyTheme(e.target.value);
};
```

- [ ] **Step 8: widget.js — apply theme to the host** — add a helper inside the IIFE (after `placement`):

```js
  function applyTheme(t) {
    if (t === "light" || t === "dark") host.dataset.theme = t;
    else delete host.dataset.theme;
  }
```

  And in `reload()`, read meta and apply before `render()`:

```js
  async function reload() {
    bucket = await getDomain(scope.key);
    const m = await getMeta();
    applyTheme(m.settings?.theme);
    render();
  }
```

  (Also apply once at startup: right after the existing `if (savedMeta.settings?.widgetCorner) …` line, add `applyTheme(savedMeta.settings?.theme);`.)

- [ ] **Step 9: Checks**

Run: `node --check src/popup/popup.js && node --check src/app/app.js && node --check src/content/widget.js`
Expected: all exit 0.
Run: `grep -c 'data-theme="dark"' src/popup/popup.css src/app/app.css` and `grep -c 'data-theme="dark"' src/content/widget.css`
Expected: each file ≥ 1.
Run: `grep -c "function applyTheme" src/popup/popup.js src/app/app.js src/content/widget.js`
Expected: each `1`.
Run: `grep -c 'id="theme"' src/popup/popup.html src/app/app.html`
Expected: each `1`.
Run: `npm test`
Expected: 52/52.

- [ ] **Step 10: Commit**

```bash
git add src/popup/popup.css src/app/app.css src/content/widget.css src/popup/popup.html src/app/app.html src/popup/popup.js src/app/app.js src/content/widget.js
git commit -m "feat: add Auto/Light/Dark theme toggle across popup, app, and widget"
```

---

## Self-Review

**Spec coverage:**
- Widget dark via `:host` → Task 1 Step 2. ✓
- Bubble official icon + count badge → Task 1 Steps 3–4. ✓
- Open-app via `window.open` + web-accessible app.html → Task 1 Steps 1, 5. ✓
- icons/32.png web-accessible (for the bubble img) → Task 1 Step 1. ✓
- Theme toggle (Auto/Light/Dark): CSS force-selectors (3 files), `meta.settings.theme`, selects (popup + app), apply logic (popup/app/widget) → Task 2. ✓
- No new permissions; no data-model change beyond `meta.settings.theme` → confirmed. ✓

**Placeholder scan:** none — every step has complete code or an exact command.

**Type consistency:** `applyTheme(t)` defined per JS file (popup/app on `document.documentElement`; widget on `host`). `meta.settings.theme` written/read consistently as `"auto"|"light"|"dark"`. CSS uses `:root[data-theme="dark"]` (popup/app) and `:host([data-theme="dark"])` (widget), with the media query gated by `:not([data-theme="light"])` so a forced light theme overrides OS-dark. The widget bubble `base("icons/32.png")` matches the new web_accessible entry; `base("src/app/app.html")` matches the app.html entry.

**Note:** the dark var set is duplicated (media block + force-dark block) per file — intentional (CSS can't share a declaration set across selectors without preprocessing). The popup applies theme in `load()` before the non-web early-return so the theme shows even on an empty popup. The widget re-applies theme on each `reload()` (storage-change), so changing the theme in the app updates an open widget after its next reload.

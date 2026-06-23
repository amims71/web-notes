# Widget Indicators (Web Notes)

**Date:** 2026-06-23
**Status:** Approved design, ready to implement
**Builds on:** M1 (links/notes), M3 (due/reminders). Floating widget was intentionally left lightweight in M1–M3; this adds read indicators only.

## Summary

Bring the popup/app **read indicators** to the floating widget's open-item rows:
🔗 (clickable link), 📝 (has notes), and 📅 + relative due label (overdue in red).
**Indicators only — no editing in the widget** (link/notes/due/remind/repeat stay
editable in the popup and full app). No model change, no new permissions, no tests
(the underlying `isHttpUrl`/`dueState` are already unit-tested; this is display
wiring).

## Decision (locked)

- **Indicators only** in the widget. The widget keeps its current behavior: open
  items only, one-way check-off, quick-add, drag, dismiss.

## Implementation (single file + its CSS)

### `src/content/widget.js`

1. Add `isHttpUrl` and `dueState` to the dynamic model import:

```js
  const { makeItem, nextOrder, countOpenItems, isHttpUrl, dueState } = await import(base("src/lib/model.js"));
```

2. Add a local `formatDue` helper (same as popup/app) inside the IIFE:

```js
  function formatDue(ms, now) {
    const diff = ms - now, abs = Math.abs(diff), m = 60000, h = 3600000, d = 86400000;
    const s = abs < h ? Math.max(1, Math.round(abs / m)) + "m" : abs < d ? Math.round(abs / h) + "h" : Math.round(abs / d) + "d";
    return diff < 0 ? "overdue " + s : "in " + s;
  }
```

3. In the open-item row loop, after `row.append(cb, t);` and before `panel.append(row);`, append the indicators:

```js
      if (isHttpUrl(item.url)) {
        const a = document.createElement("a");
        a.className = "flag link";
        a.href = item.url;
        a.target = "_blank";
        a.textContent = "🔗";
        a.title = item.url;
        row.append(a);
      }
      if (item.note) {
        const n = document.createElement("span");
        n.className = "flag";
        n.textContent = "📝";
        n.title = "Has notes";
        row.append(n);
      }
      if (item.due != null) {
        const dueEl = document.createElement("span");
        dueEl.className = "flag due" + (dueState(item, Date.now()) === "overdue" ? " overdue" : "");
        dueEl.textContent = "📅 " + formatDue(item.due, Date.now());
        dueEl.title = new Date(item.due).toLocaleString();
        row.append(dueEl);
      }
```

User text is set via `textContent`/attributes only — no `innerHTML` of user data.

### `src/content/widget.css`

Append (these live inside the widget's closed shadow root):

```css
.flag { font-size: 11px; text-decoration: none; color: inherit; }
.due { color: #6b7280; }
.due.overdue { color: #dc2626; font-weight: 600; }
```

The existing `.row` is `display:flex; gap` with `.row .t { flex: 1 }`, so the flags
sit at the right end of each row.

## Non-goals

- No editing (link/notes/due/remind/repeat) in the widget.
- No inline text edit / delete in the widget.
- No change to open-only filtering, quick-add, drag, dismiss, model, or permissions.

## Testing

- No new unit tests (`isHttpUrl`/`dueState` already covered; this is DOM wiring).
- Static: `node --check src/content/widget.js`; full suite unchanged.
- Manual (deferred): on a domain with items that have links/notes/due, the widget
  rows show 🔗 (opens link) / 📝 / 📅 with overdue in red.

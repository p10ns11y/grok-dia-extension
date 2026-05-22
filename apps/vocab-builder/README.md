# Vocab Builder

Chrome extension: save words while you read, add definitions, and review with spaced repetition (SM-2). Works without Ask Grok.

## Install

```bash
npm install
npm run build:vocab-builder
# or from repo root: npm run build
```

Load unpacked: **`apps/vocab-builder/dist`**

## Use

1. Click the extension icon to open the study page.
2. Right-click a word → **Save to Vocab Builder** (saves word, sentence context, and page URL).
3. **Review** tab: reveal definition → Again / Hard / Good / Easy.
4. **Add word** — manual entry; **Extract from page** — top terms from the active tab (on demand).
5. **Word list** — search and **Edit def** for definitions.

Definitions are manual by default. You can paste them when saving, edit later, or receive them from Ask Grok via **Save to Vocab Builder** (optional link).

## Receive saves from Ask Grok

Only if you use both extensions:

1. Get Ask Grok’s extension ID from `chrome://extensions`.
2. From repo root: `npm run link-extensions -- <ask-grok-extension-id>`
3. Rebuild and reload this extension: `npm run build:vocab-builder`

The default manifest has no `externally_connectable` entry (avoids Chrome warnings). The link script adds your Ask Grok ID when needed.

## Permissions

- `storage`, `activeTab`, `scripting`, `contextMenus`
- No `<all_urls>` content scripts (extract runs only when you click)

## Development

```bash
npm run dev:vocab-builder
```

Data is stored locally in IndexedDB (`VocabStudyDB`).

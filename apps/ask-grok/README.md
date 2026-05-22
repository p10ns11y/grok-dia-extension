# Ask Grok

Chrome extension: ask xAI Grok about selected text or the current page. API key stays in local storage only.

## Install

```bash
npm install
npm run build:ask-grok
# or from repo root: npm run build
```

Load unpacked: **`apps/ask-grok/dist`**

## Use

1. Open extension **Options** → set xAI API key and model.
2. Right-click selected text → **Ask Grok about this**, or open the popup and send a prompt (page excerpt is included automatically).

## Link to Vocab Builder

Optional. Requires [Vocab Builder](../vocab-builder/) installed.

1. Copy this extension’s ID from `chrome://extensions`.
2. From repo root: `npm run link-extensions -- <ask-grok-extension-id>`
3. Run `npm run build:vocab-builder` and reload Vocab Builder.
4. In Ask Grok options, paste the **Vocab Builder** extension ID.
5. After a Grok reply, use **Save to Vocab Builder** in the popup.

## Permissions

- `storage`, `activeTab`, `scripting`, `contextMenus`
- Host: `https://api.x.ai/*`

## Development

```bash
npm run dev:ask-grok
```

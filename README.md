# Grok and Productivity Extensions

**Secure bridge to xAI Grok API for browser queries. No tracking.**

Monorepo with two Chrome extensions for reading and vocabulary practice. Each app is independent; install one or both.

| Extension | Package | Load unpacked from |
|-----------|---------|-------------------|
| [Ask Grok](apps/ask-grok) | `ask-grok` | `apps/ask-grok/dist` |
| [Vocab Builder](apps/vocab-builder) | `vocab-builder` | `apps/vocab-builder/dist` |

The legacy combined build in [`src/`](src/) and [`extension/`](extension/) is deprecated.

## Features (Ask Grok)

- Query xAI Grok AI directly from your browser with page context
- Right-click on selected text to "Ask Grok about this"
- Secure API key storage (local only)
- No data tracking or external logging
- Notifications for quick responses

## Quick start

```bash
npm install
npm run build
```

In Chrome (`chrome://extensions`, Developer mode): **Load unpacked** for each `dist` folder above.

## Usage (Ask Grok)

1. **Configure Settings**: Click the extension icon, then **Options** to select your Grok model and enter your xAI API key
2. **Popup Query**: Click the extension icon, enter a prompt, and optionally include current page content
3. **Context Menu**: Select text on any webpage, right-click, and choose **Ask Grok about this**
4. Responses appear in the popup or as notifications

## Optional: link Ask Grok → Vocab Builder

See [apps/ask-grok/README.md](apps/ask-grok/README.md#link-to-vocab-builder) and run:

```bash
npm run link-extensions -- <ask-grok-extension-id>
```

Then reload Vocab Builder and set the Vocab Builder ID in Ask Grok options.

## Configuration

Choose from available xAI Grok models:

- **Grok Code Fast**: Optimized for coding tasks
- **Grok Beta**: General purpose model

## Permissions

- **Storage**: To save your API key locally
- **Active Tab**: To access content from the current webpage for context
- **Scripting**: To extract page text for queries
- **Context Menus**: To add "Ask Grok" option on selected text
- **Notifications**: To display responses when using context menu

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build both extensions |
| `npm run build:ask-grok` | Build Ask Grok only |
| `npm run build:vocab-builder` | Build Vocab Builder only |
| `npm run dev:ask-grok` | Watch build (Ask Grok) |
| `npm run dev:vocab-builder` | Watch build (Vocab Builder) |
| `npm run link-extensions -- <id>` | Allow Ask Grok to save cards to Vocab Builder |
| `npm run clean` | Remove `dist` folders |

## Dogfooding

[`docs/DOGFOOD.md`](docs/DOGFOOD.md) — two-week personal checklist.

## Screenshots

### Configure API keys and select model

#### Click details

![Extension loaded unpacked](screenshots/extension-loaded-unpacked.png)

#### Click extension options

![Extension detail](screenshots/extension-detail.png)

#### Select model and provide API key

![Extension config page](screenshots/extension-config-page.png)

### Select content and Ask Grok about this

![Grok context menu Q&A](screenshots/grok-context-menu-qa.png)

### Open extension popup and ask anything (with page context)

![Grok popup](screenshots/grok-popup.png)

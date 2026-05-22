#!/usr/bin/env node
/**
 * Patches vocab-builder manifest so ask-grok can send messages.
 * Usage: node scripts/link-extensions.mjs <ask-grok-extension-id>
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const askGrokId = process.argv[2];

if (!askGrokId) {
  console.error('Usage: npm run link-extensions -- <ask-grok-extension-id>');
  console.error('Copy ID from chrome://extensions (Ask Grok, Developer mode on).');
  process.exit(1);
}

function patchManifest(filePath) {
  const manifest = JSON.parse(readFileSync(filePath, 'utf8'));
  manifest.externally_connectable = { ids: [askGrokId] };
  writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n');
}

const srcManifest = resolve(__dirname, '../apps/vocab-builder/src/manifest.json');
patchManifest(srcManifest);

const distManifest = resolve(__dirname, '../apps/vocab-builder/dist/manifest.json');
try {
  patchManifest(distManifest);
  console.log('Updated apps/vocab-builder/dist/manifest.json');
} catch {
  console.log('dist/manifest.json not found — run npm run build:vocab-builder, then re-run link-extensions.');
}

console.log(`Linked Ask Grok (${askGrokId}) → Vocab Builder externally_connectable.`);

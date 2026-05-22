#!/usr/bin/env node
/**
 * Patches vocab-study manifest so grok-bridge can send messages.
 * Usage: node scripts/link-extensions.mjs <grok-bridge-extension-id>
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const grokId = process.argv[2];

if (!grokId) {
  console.error('Usage: npm run link-extensions -- <grok-bridge-extension-id>');
  console.error('Copy ID from chrome://extensions (Grok Bridge, Developer mode on).');
  process.exit(1);
}

function patchManifest(filePath) {
  const manifest = JSON.parse(readFileSync(filePath, 'utf8'));
  manifest.externally_connectable = { ids: [grokId] };
  writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n');
}

const srcManifest = resolve(__dirname, '../apps/vocab-study/src/manifest.json');
patchManifest(srcManifest);

const distManifest = resolve(__dirname, '../apps/vocab-study/dist/manifest.json');
try {
  patchManifest(distManifest);
  console.log('Updated apps/vocab-study/dist/manifest.json');
} catch {
  console.log('dist/manifest.json not found — run npm run build:vocab, then re-run link-extensions.');
}

console.log(`Linked Grok Bridge (${grokId}) → Vocab Study externally_connectable.`);

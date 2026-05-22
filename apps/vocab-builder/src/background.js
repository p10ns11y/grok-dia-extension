import Dexie from 'dexie';
import nlp from 'compromise';

const vocabDB = new Dexie('VocabStudyDB');

// Indexes: only declare each once (&text = unique). Duplicate names caused ConstraintError on open.
vocabDB.version(1).stores({
  words: 'id, &text, pos, freq_rank, next_review, repetitions',
});

let dbOpenPromise = null;

async function openDatabase() {
  try {
    if (vocabDB.isOpen()) return;
    await vocabDB.open();
  } catch (err) {
    const msg = err?.message || String(err);
    const isSchemaError =
      err?.name === 'ConstraintError' ||
      msg.includes('createIndex') ||
      msg.includes('already exists');
    if (isSchemaError) {
      console.warn('VocabStudyDB schema conflict, resetting database:', err);
      await vocabDB.delete();
      await vocabDB.open();
      return;
    }
    console.error('VocabStudyDB open failed:', err);
    throw err;
  }
}

/** Re-open IndexedDB after MV3 service worker restarts (connections do not survive sleep). */
async function ensureDb() {
  if (vocabDB.isOpen()) return;
  if (!dbOpenPromise) {
    dbOpenPromise = openDatabase().finally(() => {
      dbOpenPromise = null;
    });
  }
  await dbOpenPromise;
}

self.addEventListener('unhandledrejection', (event) => {
  console.error('Vocab Builder SW unhandled rejection:', event.reason);
});

self.addEventListener('error', (event) => {
  console.error('Vocab Builder SW error:', event.error ?? event.message);
});

const commonWords = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there',
  'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time',
  'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
  'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
  'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
]);

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'saveWord',
      title: 'Save to Vocab Builder',
      contexts: ['selection'],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
  ensureDb().catch((err) => console.error('DB init on install:', err));
});

chrome.runtime.onStartup.addListener(() => {
  ensureDb().catch((err) => console.error('DB init on startup:', err));
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('study.html') });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'saveWord' && info.selectionText && tab?.id) {
    captureAndSaveWord(tab.id, tab.url || '', info.selectionText);
  }
});

function onMessageListener(request, _sender, sendResponse) {
  (async () => {
    try {
      await ensureDb();
      switch (request.action) {
      case 'saveWord':
        sendResponse({ success: true, word: await saveWord(request) });
        break;
      case 'addWordFromGrok':
        sendResponse({ success: true, word: await saveWord(request) });
        break;
      case 'extractVocab':
        sendResponse({ success: true, added: await extractVocab(request.text) });
        break;
      case 'getVocab': {
        const words = await vocabDB.words.toArray();
        words.sort((a, b) => a.text.localeCompare(b.text));
        sendResponse({ words });
        break;
      }
      case 'getReviewWords':
        sendResponse({ words: await getWordsDueForReview(request.limit || 20) });
        break;
      case 'updateWordReview':
        sendResponse({ success: await updateWordAfterReview(request.wordId, request.quality) });
        break;
      case 'getReviewStats':
        sendResponse({ stats: await getReviewStats() });
        break;
      case 'updateWord':
        sendResponse({ success: await updateWordFields(request.wordId, request.fields) });
        break;
      case 'deleteWord':
        sendResponse({ success: await vocabDB.words.delete(request.wordId) });
        break;
      default:
        sendResponse({ error: 'Unknown action' });
      }
    } catch (err) {
      console.error('Vocab Builder message error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true;
}

chrome.runtime.onMessageExternal.addListener(onMessageListener);
chrome.runtime.onMessage.addListener(onMessageListener);

function normalizeWord(text) {
  const w = text.trim().toLowerCase().replace(/[^a-z'-]/g, '');
  if (w.length < 2 || w.length > 40 || commonWords.has(w)) return null;
  return w;
}

async function captureAndSaveWord(tabId, url, selectionText) {
  await ensureDb();
  let snippet = selectionText.trim();
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (selected) => {
        const body = document.body.innerText || '';
        const idx = body.toLowerCase().indexOf(selected.toLowerCase());
        if (idx === -1) return selected;
        const start = Math.max(0, body.lastIndexOf('.', idx - 80) + 1, body.lastIndexOf('\n', idx - 80) + 1);
        let end = body.indexOf('.', idx + selected.length);
        if (end === -1 || end > idx + 200) end = idx + 200;
        return body.slice(start, end + 1).trim();
      },
      args: [selectionText],
    });
    if (result?.result) snippet = result.result;
  } catch {
    /* keep selection as snippet */
  }

  const word = selectionText.trim().split(/\s+/).find((t) => normalizeWord(t));
  if (!word) {
    console.warn('Vocab Builder: could not save — select a single word');
    return;
  }

  await saveWord({
    text: word,
    source_url: url,
    source_snippet: snippet,
    definition_en: '',
  });
}

async function saveWord({ text, definition_en = '', source_url = '', source_snippet = '', pos = 'Unknown' }) {
  const normalized = normalizeWord(text);
  if (!normalized) throw new Error('Invalid word');

  const existing = await vocabDB.words.where('text').equals(normalized).first();
  const now = new Date().toISOString();

  if (existing) {
    const updates = {
      dates_encountered: [...(existing.dates_encountered || []), now],
    };
    if (definition_en?.trim()) updates.definition_en = definition_en.trim();
    if (source_snippet?.trim()) updates.source_snippet = source_snippet.trim();
    if (source_url?.trim()) updates.source_url = source_url.trim();
    await vocabDB.words.update(existing.id, updates);
    return { ...existing, ...updates };
  }

  const record = {
    id: crypto.randomUUID(),
    text: normalized,
    pos,
    freq_rank: 1,
    dates_encountered: [now],
    ease_factor: 2.5,
    interval: 1,
    repetitions: 0,
    next_review: null,
    last_reviewed: null,
    source_url: source_url || '',
    source_snippet: source_snippet || '',
    definition_en: definition_en?.trim() || '',
  };
  await vocabDB.words.add(record);
  return record;
}

async function extractVocab(text) {
  const limited = (text || '').substring(0, 10000);
  const doc = nlp(limited);
  const terms = doc.json().flatMap((s) => s.terms);
  const wordMap = new Map();

  for (const t of terms) {
    const word = normalizeWord(t.text);
    if (!word) continue;
    const pos = t.tags?.includes('Noun')
      ? 'Noun'
      : t.tags?.includes('Verb')
        ? 'Verb'
        : t.tags?.includes('Adjective')
          ? 'Adjective'
          : t.tags?.includes('Adverb')
            ? 'Adverb'
            : null;
    if (!pos) continue;

    const prev = wordMap.get(word);
    if (prev) {
      prev.count += 1;
    } else {
      wordMap.set(word, { word, pos, count: 1 });
    }
  }

  const ranked = [...wordMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  let added = 0;
  for (const item of ranked) {
    const before = await vocabDB.words.where('text').equals(item.word).count();
    if (before === 0) {
      await saveWord({ text: item.word, pos: item.pos, source_snippet: '', definition_en: '' });
      added += 1;
    }
  }
  return added;
}

function calculateNextReview(word, quality) {
  let { ease_factor, interval, repetitions } = word;
  if (!ease_factor) ease_factor = 2.5;
  if (!interval) interval = 1;
  if (!repetitions) repetitions = 0;

  if (quality >= 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * ease_factor);
    repetitions += 1;
  } else {
    repetitions = 0;
    interval = 1;
  }

  ease_factor = Math.max(1.3, ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return {
    ease_factor: Math.round(ease_factor * 100) / 100,
    interval,
    repetitions,
    next_review: nextReview.toISOString(),
    last_reviewed: new Date().toISOString(),
  };
}

async function getWordsDueForReview(limit = 20) {
  const now = new Date().toISOString();
  const allWords = await vocabDB.words.toArray();

  // IndexedDB rejects null as a key — cannot use .where('next_review').equals(null)
  const newWords = allWords
    .filter((w) => w.next_review == null)
    .sort((a, b) => a.text.localeCompare(b.text));
  const dueWords = allWords
    .filter((w) => w.next_review != null && w.next_review <= now)
    .sort((a, b) => a.next_review.localeCompare(b.next_review));

  const combined = [
    ...newWords.slice(0, Math.ceil(limit / 2)),
    ...dueWords.slice(0, Math.floor(limit / 2)),
  ];

  if (combined.length < limit) {
    const rest = [
      ...newWords.slice(Math.ceil(limit / 2)),
      ...dueWords.slice(Math.floor(limit / 2)),
    ];
    combined.push(...rest.slice(0, limit - combined.length));
  }

  return combined.slice(0, limit);
}

async function updateWordAfterReview(wordId, quality) {
  if (wordId == null || wordId === '') {
    throw new Error('Missing word id for review update');
  }
  const word = await vocabDB.words.get(wordId);
  if (!word) return false;
  await vocabDB.words.update(wordId, calculateNextReview(word, quality));
  return true;
}

async function getReviewStats() {
  const allWords = await vocabDB.words.toArray();
  const now = new Date();
  let newWords = 0;
  let learningWords = 0;
  let matureWords = 0;
  let dueToday = 0;

  for (const word of allWords) {
    if (!word.repetitions) newWords++;
    else if (word.repetitions < 3) learningWords++;
    else matureWords++;
    if (!word.next_review || new Date(word.next_review) <= now) dueToday++;
  }

  return {
    totalWords: allWords.length,
    newWords,
    learningWords,
    matureWords,
    dueToday,
  };
}

async function updateWordFields(wordId, fields) {
  await vocabDB.words.update(wordId, fields);
  return true;
}

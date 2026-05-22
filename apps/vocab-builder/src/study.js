let reviewQueue = [];
let reviewIndex = 0;
let answerRevealed = false;
let allWords = [];

const RETRYABLE_ERRORS = [
  'Receiving end does not exist',
  'Extension context invalidated',
  'message port closed',
];

function send(action, payload = {}, attempt = 0) {
  const maxAttempts = 4;
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...payload }, (response) => {
      const errMsg = chrome.runtime.lastError?.message;
      if (errMsg) {
        const retryable = RETRYABLE_ERRORS.some((s) => errMsg.includes(s));
        if (retryable && attempt < maxAttempts - 1) {
          setTimeout(() => {
            resolve(send(action, payload, attempt + 1));
          }, 120 * (attempt + 1));
          return;
        }
        resolve({ error: errMsg });
        return;
      }
      resolve(response || {});
    });
  });
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const name = tab.dataset.tab;
    document.getElementById('panel-review').classList.toggle('hidden', name !== 'review');
    document.getElementById('panel-add').classList.toggle('hidden', name !== 'add');
    document.getElementById('panel-list').classList.toggle('hidden', name !== 'list');
    if (name === 'list') loadWordList();
  });
});

async function refreshStats() {
  const { stats, error } = await send('getReviewStats');
  if (error) {
    document.getElementById('review-idle-msg').textContent =
      `Database error: ${error}. Reload the page or remove and re-add the extension.`;
    return;
  }
  if (!stats) return;
  document.getElementById('stat-due').textContent = stats.dueToday;
  document.getElementById('stat-total').textContent = stats.totalWords;
  document.getElementById('stat-new').textContent = stats.newWords;
  document.getElementById('stat-learning').textContent = stats.learningWords;

  const idleMsg = document.getElementById('review-idle-msg');
  if (stats.dueToday === 0 && stats.totalWords === 0) {
    idleMsg.textContent = 'No words yet. Right-click text → Save to Vocab Builder, or add a word.';
  } else if (stats.dueToday === 0) {
    idleMsg.textContent = 'Nothing due. Come back later or add more words.';
  } else {
    idleMsg.textContent = `${stats.dueToday} card(s) due for review.`;
  }
}

document.getElementById('start-review').addEventListener('click', startReview);
document.getElementById('review-again').addEventListener('click', startReview);

async function startReview() {
  const { words, error } = await send('getReviewWords', { limit: 30 });
  if (error) {
    alert(error);
    return;
  }
  if (!words?.length) {
    alert('No words due. Add words from reading first.');
    return;
  }

  reviewQueue = words;
  reviewIndex = 0;
  answerRevealed = false;

  document.getElementById('review-idle').classList.add('hidden');
  document.getElementById('review-done').classList.add('hidden');
  document.getElementById('review-active').classList.remove('hidden');
  showCard();
}

function showCard() {
  answerRevealed = false;
  document.getElementById('reveal-row').classList.remove('hidden');
  document.getElementById('grade-row').classList.add('hidden');
  document.getElementById('card-answer-wrap').classList.add('hidden');

  if (reviewIndex >= reviewQueue.length) {
    document.getElementById('review-active').classList.add('hidden');
    document.getElementById('review-done').classList.remove('hidden');
    refreshStats();
    return;
  }

  const word = reviewQueue[reviewIndex];
  document.getElementById('card-word').textContent = word.text;
  document.getElementById('card-snippet').textContent = word.source_snippet
    ? word.source_snippet
    : word.source_url
      ? word.source_url
      : '';
  const def = word.definition_en?.trim() || '(No definition — add one in Word list or when saving)';
  document.getElementById('card-answer').textContent = def;
  document.getElementById('review-progress').textContent =
    `${reviewIndex + 1} / ${reviewQueue.length}`;
}

document.getElementById('reveal-btn').addEventListener('click', () => {
  answerRevealed = true;
  document.getElementById('card-answer-wrap').classList.remove('hidden');
  document.getElementById('reveal-row').classList.add('hidden');
  document.getElementById('grade-row').classList.remove('hidden');
});

document.querySelectorAll('#grade-row [data-quality]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (!answerRevealed) return;
    const quality = parseInt(btn.dataset.quality, 10);
    const word = reviewQueue[reviewIndex];
    const { success, error } = await send('updateWordReview', { wordId: word.id, quality });
    if (!success) {
      alert(error || 'Failed to save review');
      return;
    }
    reviewIndex += 1;
    showCard();
    refreshStats();
  });
});

document.getElementById('add-save').addEventListener('click', async () => {
  const text = document.getElementById('add-word').value;
  const definition_en = document.getElementById('add-definition').value;
  const source_snippet = document.getElementById('add-snippet').value;
  const source_url = document.getElementById('add-url').value;

  const { success, error } = await send('saveWord', {
    text,
    definition_en,
    source_snippet,
    source_url,
  });

  if (!success) {
    alert(error || 'Could not save word');
    return;
  }

  document.getElementById('add-word').value = '';
  document.getElementById('add-definition').value = '';
  document.getElementById('add-snippet').value = '';
  document.getElementById('add-url').value = '';
  await refreshStats();
  alert('Word saved.');
});

document.getElementById('extract-page').addEventListener('click', async () => {
  const status = document.getElementById('extract-status');
  status.textContent = 'Extracting...';

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) {
      status.textContent = 'No active tab.';
      return;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => document.body.innerText.substring(0, 20000),
      },
      async (results) => {
        if (chrome.runtime.lastError || !results?.[0]) {
          status.textContent = 'Could not read page.';
          return;
        }
        const { success, added, error } = await send('extractVocab', {
          text: results[0].result || '',
        });
        if (!success) {
          status.textContent = error || 'Extract failed.';
          return;
        }
        status.textContent = `Added ${added} new word(s). Add definitions in Word list.`;
        await refreshStats();
      }
    );
  });
});

async function loadWordList() {
  const { words, error } = await send('getVocab');
  if (error) {
    document.getElementById('word-list').innerHTML = '';
    return;
  }
  allWords = words || [];
  renderWordList(allWords);
}

function renderWordList(words) {
  const list = document.getElementById('word-list');
  const empty = document.getElementById('list-empty');

  if (!words.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = words
    .map(
      (w) => `
    <li data-id="${w.id}">
      <div class="word-meta">
        <strong>${escapeHtml(w.text)}</strong>
        <small>${escapeHtml(w.definition_en || 'No definition')}</small>
        ${w.source_snippet ? `<small>${escapeHtml(w.source_snippet.slice(0, 120))}${w.source_snippet.length > 120 ? '…' : ''}</small>` : ''}
      </div>
      <button class="btn-secondary btn-edit" data-id="${w.id}">Edit def</button>
    </li>`
    )
    .join('');

  list.querySelectorAll('.btn-edit').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const word = allWords.find((w) => w.id === id);
      const def = prompt('Definition (English):', word?.definition_en || '');
      if (def === null) return;
      await send('updateWord', { wordId: id, fields: { definition_en: def.trim() } });
      await loadWordList();
    });
  });
}

document.getElementById('search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) {
    renderWordList(allWords);
    return;
  }
  renderWordList(allWords.filter((w) => w.text.includes(q) || (w.definition_en || '').toLowerCase().includes(q)));
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Import payload from URL hash (clipboard fallback) */
async function handleImportHash() {
  const hash = location.hash.slice(1);
  if (!hash.startsWith('import=')) return;
  try {
    const json = decodeURIComponent(hash.slice(7));
    const data = JSON.parse(json);
    await send('saveWord', data);
    history.replaceState(null, '', location.pathname);
    alert(`Imported "${data.text}"`);
    await refreshStats();
  } catch {
    /* ignore */
  }
}

handleImportHash();
refreshStats();

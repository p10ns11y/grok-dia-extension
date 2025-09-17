// Vocab Page Script

import * as d3 from 'd3';
import lunr from 'lunr';
import Dexie from 'dexie';

// Initialize Vocab Database (same as background script)
const vocabDB = new Dexie('VocabDB');
vocabDB.version(1).stores({
  words: 'id, text, pos, freq_rank, dates_encountered',
  translations: 'id, word_id, lang, meaning, *sentences',
  relations: 'id, word_id, related_id, type, similarity_percentage'
});

let allWords = [];
let allTranslations = [];
let allRelations = [];
let currentView = 'list';
let searchIndex;
let currentSimulation = null; // Track current simulation for cleanup

document.addEventListener('DOMContentLoaded', () => {
  loadVocab();
});

async function loadVocab() {
  try {
    console.log('Loading vocab from IndexedDB...');
    const words = await vocabDB.words.toArray();
    const translations = await vocabDB.translations.toArray();
    const relations = await vocabDB.relations.toArray();

    console.log('Loaded from DB - words:', words.length, 'translations:', translations.length, 'relations:', relations.length);

    if (words && words.length > 0) {
      allWords = words;
      allTranslations = translations || [];
      allRelations = relations || [];

      // Create Lunr index
      searchIndex = lunr(function() {
        this.field('text');
        this.ref('id');
        allWords.forEach(word => this.add(word));
      });

      displayVocab(allWords);
      if (currentView === 'graph') {
        buildGraph();
      }
    } else {
      document.getElementById('vocab-list').innerHTML = '<li>No vocabulary found. Extract some from pages!</li>';
    }
  } catch (error) {
    console.error('Error loading vocab from DB:', error);
    document.getElementById('vocab-list').innerHTML = '<li>Error loading vocabulary: ' + error.message + '</li>';
  }
}

function displayVocab(words) {
  console.log('Displaying words:', words);
  const list = document.getElementById('vocab-list');
  list.innerHTML = '';
  words.forEach(word => {
    const trans = allTranslations.filter(t => t.word_id === word.id).map(t => `${t.lang}: ${t.meaning}`).join(', ');
    const li = document.createElement('li');
    li.className = 'word-item';
    li.innerHTML = `
      <div>
        <strong>${word.text}</strong> (${word.pos}) - Rank: ${word.freq_rank.toFixed(2)}, Encounters: ${word.dates_encountered ? word.dates_encountered.length : 0}
      </div>
      <div>
        <em>Translations: ${trans || 'None'}</em>
      </div>
    `;
    list.appendChild(li);
  });
}

document.getElementById('search-btn').addEventListener('click', () => {
  const query = document.getElementById('search').value.trim();
  if (query && searchIndex) {
    const results = searchIndex.search(query);
    const filtered = results.map(r => allWords.find(w => w.id === r.ref)).filter(Boolean);
    displayVocab(filtered);
  } else {
    displayVocab(allWords);
  }
});

document.getElementById('refresh-vocab').addEventListener('click', () => {
  loadVocab();
});

document.getElementById('toggle-view').addEventListener('click', () => {
  // Stop current simulation if switching away from graph
  if (currentSimulation && currentView === 'graph') {
    currentSimulation.stop();
    currentSimulation = null;
  }

  currentView = currentView === 'list' ? 'graph' : 'list';
  document.getElementById('vocab-list-view').style.display = currentView === 'list' ? 'block' : 'none';
  document.getElementById('vocab-graph-view').style.display = currentView === 'graph' ? 'block' : 'none';
  document.getElementById('flashcard-view').style.display = 'none';

  if (currentView === 'graph') {
    buildGraph();
  }
});

document.getElementById('start-flashcards').addEventListener('click', () => {
  currentView = 'flashcard';
  document.getElementById('vocab-list-view').style.display = 'none';
  document.getElementById('vocab-graph-view').style.display = 'none';
  document.getElementById('flashcard-view').style.display = 'block';
  startFlashcards();
});

let flashcardIndex = 0;
let flashcards = [];

function startFlashcards() {
  flashcards = allWords.slice(); // Copy
  flashcardIndex = 0;
  showCard();
}

function showCard() {
  if (flashcardIndex < flashcards.length) {
    const word = flashcards[flashcardIndex];
    document.getElementById('flashcard-word').textContent = word.text;
    document.getElementById('flashcard-meaning').textContent = allTranslations.filter(t => t.word_id === word.id).map(t => `${t.lang}: ${t.meaning}`).join(', ') || 'No translation';
    document.getElementById('flashcard-meaning').style.display = 'none';
  } else {
    document.getElementById('flashcard-word').textContent = 'Game Over!';
    document.getElementById('flashcard-meaning').style.display = 'none';
  }
}

document.getElementById('show-meaning').addEventListener('click', () => {
  document.getElementById('flashcard-meaning').style.display = 'block';
});

document.getElementById('next-card').addEventListener('click', () => {
  flashcardIndex++;
  showCard();
});

// Review functionality
let reviewWords = [];
let currentReviewIndex = 0;
let reviewStats = {};

document.getElementById('start-review').addEventListener('click', () => {
  startReview();
});

document.getElementById('review-again').addEventListener('click', () => {
  startReview();
});

// Review button event listeners
document.querySelectorAll('.review-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const quality = parseInt(e.target.dataset.quality);
    submitReview(quality);
  });
});

async function startReview() {
  try {
    // Get review statistics
    const statsResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getReviewStats" }, resolve);
    });

    if (statsResponse.stats) {
      reviewStats = statsResponse.stats;
      updateReviewStatsDisplay();
    }

    // Get words due for review
    const wordsResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getReviewWords", limit: 20 }, resolve);
    });

    if (wordsResponse.words && wordsResponse.words.length > 0) {
      reviewWords = wordsResponse.words;
      currentReviewIndex = 0;
      showReviewCard();
    } else {
      showReviewComplete();
    }

    // Switch to review view
    document.getElementById('vocab-list-view').style.display = 'none';
    document.getElementById('vocab-graph-view').style.display = 'none';
    document.getElementById('flashcard-view').style.display = 'none';
    document.getElementById('review-view').style.display = 'block';

  } catch (error) {
    console.error('Error starting review:', error);
  }
}

function updateReviewStatsDisplay() {
  document.getElementById('review-total').textContent = reviewStats.totalWords || 0;
  document.getElementById('review-new').textContent = reviewStats.newWords || 0;
  document.getElementById('review-due').textContent = reviewStats.dueToday || 0;
  document.getElementById('review-stats').style.display = 'flex';
}

function showReviewCard() {
  if (currentReviewIndex < reviewWords.length) {
    const word = reviewWords[currentReviewIndex];
    document.getElementById('review-word').textContent = word.text;

    // Show translations
    const translations = allTranslations.filter(t => t.word_id === word.id);
    const translationText = translations.map(t => `${t.lang}: ${t.meaning}`).join(' | ') || 'No translations available';
    document.getElementById('review-translations').textContent = translationText;

    document.getElementById('review-card').style.display = 'block';
    document.getElementById('review-complete').style.display = 'none';
  } else {
    showReviewComplete();
  }
}

async function submitReview(quality) {
  if (currentReviewIndex < reviewWords.length) {
    const word = reviewWords[currentReviewIndex];

    try {
      // Update the word in the database with the review result
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: "updateWordReview",
          wordId: word.id,
          quality: quality
        }, resolve);
      });

      currentReviewIndex++;
      showReviewCard();
    } catch (error) {
      console.error('Error submitting review:', error);
    }
  }
}

function showReviewComplete() {
  document.getElementById('review-card').style.display = 'none';
  document.getElementById('review-complete').style.display = 'block';
}

function buildGraph() {
  console.log('Building graph...');
  console.log('allWords:', allWords.length, 'allRelations:', allRelations.length);

  // Stop any existing simulation
  if (currentSimulation) {
    currentSimulation.stop();
    currentSimulation = null;
  }

  const svg = d3.select('#vocab-graph');
  svg.selectAll('*').remove(); // Clear previous

  const width = 800;
  const height = 600;

  // Simple approach: show all words, limit to reasonable number
  const maxNodes = 15;
  const nodes = allWords.slice(0, maxNodes).map((w, i) => ({
    id: w.id,
    text: w.text.length > 12 ? w.text.substring(0, 10) + '...' : w.text,
    pos: w.pos,
    freq: w.freq_rank || 1,
    x: (i % 5) * 150 + 100, // Simple grid layout
    y: Math.floor(i / 5) * 120 + 100
  }));

  console.log('Created nodes:', nodes.length, nodes);

  // Create some basic links if we have relations
  const links = [];
  if (allRelations && allRelations.length > 0) {
    // Simple approach: connect first few related words
    const nodeIds = new Set(nodes.map(n => n.id));
    allRelations.slice(0, 10).forEach(rel => {
      if (nodeIds.has(rel.word_id) && nodeIds.has(rel.related_id)) {
        links.push({
          source: rel.word_id,
          target: rel.related_id,
          type: rel.type,
          strength: 0.5
        });
      }
    });
  }

  console.log('Created links:', links.length, links);

  if (nodes.length === 0) {
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '16px')
      .attr('fill', '#666')
      .text('No vocabulary data to display');
    return;
  }

  // Add a background for visibility
  svg.append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'rgba(255,255,255,0.1)');

  // Simple static layout first - just draw nodes and labels
  console.log('Drawing simple graph layout...');

  // Draw links first (so they appear behind nodes)
  if (links.length > 0) {
    svg.selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('x1', d => {
        const sourceNode = nodes.find(n => n.id === d.source);
        return sourceNode ? sourceNode.x : 0;
      })
      .attr('y1', d => {
        const sourceNode = nodes.find(n => n.id === d.source);
        return sourceNode ? sourceNode.y : 0;
      })
      .attr('x2', d => {
        const targetNode = nodes.find(n => n.id === d.target);
        return targetNode ? targetNode.x : 0;
      })
      .attr('y2', d => {
        const targetNode = nodes.find(n => n.id === d.target);
        return targetNode ? targetNode.y : 0;
      })
      .attr('stroke', d => d.type === 'synonym' ? '#4CAF50' : '#F44336')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6);
  }

  // Draw nodes
  const nodeGroup = svg.selectAll('.node')
    .data(nodes)
    .enter().append('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${d.x}, ${d.y})`);

  // Node circles
  nodeGroup.append('circle')
    .attr('r', d => Math.max(15, Math.min(25, 15 + d.freq * 5)))
    .attr('fill', d => d.pos === 'Noun' ? '#2196F3' : '#FF9800')
    .attr('stroke', '#fff')
    .attr('stroke-width', 3)
    .style('cursor', 'pointer');

  // Node labels
  nodeGroup.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('font-size', '12px')
    .attr('font-weight', '600')
    .attr('fill', '#fff')
    .text(d => d.text);

  console.log('Graph rendered with', nodes.length, 'nodes and', links.length, 'links');
}

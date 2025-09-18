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
      searchIndex = lunr(function () {
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

  // Cycle through views: list -> graph -> list
  if (currentView === 'list') {
    currentView = 'graph';
  } else if (currentView === 'graph') {
    currentView = 'list';
  } else {
    currentView = 'list'; // Default fallback
  }

  updateViewVisibility();
  updateModeIndicator();

  if (currentView === 'graph') {
    buildGraph();
  }
});

document.getElementById('exit-mode').addEventListener('click', () => {
  currentView = 'list';
  updateViewVisibility();
  updateModeIndicator();
});

function updateViewVisibility() {
  document.getElementById('vocab-list-view').style.display = currentView === 'list' ? 'block' : 'none';
  document.getElementById('vocab-graph-view').style.display = currentView === 'graph' ? 'block' : 'none';
  document.getElementById('flashcard-view').style.display = currentView === 'flashcard' ? 'block' : 'none';
  document.getElementById('review-view').style.display = currentView === 'review' ? 'block' : 'none';
}

function updateModeIndicator() {
  const indicator = document.getElementById('mode-indicator');
  const modeText = document.getElementById('current-mode-text');

  if (currentView === 'list') {
    indicator.style.display = 'none';
  } else {
    indicator.style.display = 'block';
    switch (currentView) {
      case 'graph':
        modeText.textContent = '📊 Graph View';
        break;
      case 'flashcard':
        modeText.textContent = '🎴 Flashcard Mode';
        break;
      case 'review':
        modeText.textContent = '📚 Review Mode';
        break;
      default:
        modeText.textContent = 'List View';
    }
  }
}

document.getElementById('start-flashcards').addEventListener('click', () => {
  currentView = 'flashcard';
  updateViewVisibility();
  updateModeIndicator();
  startFlashcards();
});

let flashcardIndex = 0;
let flashcards = [];

function startFlashcards() {
  flashcards = allWords.slice(); // Copy all words
  flashcardIndex = 0;
  updateFlashcardProgress();
  showCard();
}

function showCard() {
  if (flashcardIndex < flashcards.length) {
    const word = flashcards[flashcardIndex];
    document.getElementById('flashcard-word').textContent = word.text;
    const translations = allTranslations.filter(t => t.word_id === word.id);
    const translationText = translations.map(t => `${t.lang}: ${t.meaning}`).join(' | ') || 'No translations available';
    document.getElementById('flashcard-meaning').textContent = translationText;
    document.getElementById('flashcard-meaning').style.display = 'none';
    updateFlashcardProgress();
  } else {
    document.getElementById('flashcard-word').textContent = '🎉 All Done!';
    document.getElementById('flashcard-meaning').textContent = `You've reviewed all ${flashcards.length} words!`;
    document.getElementById('flashcard-meaning').style.display = 'block';
    document.getElementById('flashcard-counter').textContent = `Completed ${flashcards.length} cards`;
  }
}

function updateFlashcardProgress() {
  const counter = document.getElementById('flashcard-counter');
  if (flashcardIndex < flashcards.length) {
    counter.textContent = `${flashcardIndex + 1} / ${flashcards.length}`;
  } else {
    counter.textContent = `Completed ${flashcards.length} cards`;
  }
}

document.getElementById('show-meaning').addEventListener('click', () => {
  document.getElementById('flashcard-meaning').style.display = 'block';
});

document.getElementById('next-card').addEventListener('click', () => {
  if (flashcardIndex < flashcards.length - 1) {
    flashcardIndex++;
    showCard();
  } else {
    flashcardIndex = flashcards.length; // Mark as completed
    showCard();
  }
});

document.getElementById('prev-card').addEventListener('click', () => {
  if (flashcardIndex > 0) {
    flashcardIndex--;
    showCard();
  }
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
    console.log('Starting review session...');

    // Get review statistics with error handling and timeout
    const statsResponse = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.error('getReviewStats: Timeout after 10 seconds');
        resolve({ error: 'Request timeout' });
      }, 10000);

      chrome.runtime.sendMessage({ action: "getReviewStats" }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          console.error('getReviewStats error:', chrome.runtime.lastError.message);
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    });

    console.log('Stats response:', statsResponse);

    if (statsResponse && statsResponse.stats) {
      reviewStats = statsResponse.stats;
      updateReviewStatsDisplay();
    } else {
      console.warn('No stats received, using defaults');
      reviewStats = { totalWords: 0, newWords: 0, dueToday: 0 };
      updateReviewStatsDisplay();
    }

    // Get words due for review with error handling and timeout
    const wordsResponse = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.error('getReviewWords: Timeout after 10 seconds');
        resolve({ error: 'Request timeout' });
      }, 10000);

      chrome.runtime.sendMessage({ action: "getReviewWords", limit: 20 }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          console.error('getReviewWords error:', chrome.runtime.lastError.message);
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    });

    console.log('Words response:', wordsResponse);

    if (wordsResponse && wordsResponse.words && wordsResponse.words.length > 0) {
      reviewWords = wordsResponse.words;
      currentReviewIndex = 0;
      console.log('Starting review with', reviewWords.length, 'words');
      showReviewCard();
    } else {
      console.log('No words due for review, checking if we have any words at all...');

      // Check if we have any words in the database at all
      const vocabCheck = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "getVocab" }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        });
      });

      if (vocabCheck && vocabCheck.words && vocabCheck.words.length > 0) {
        console.log('We have', vocabCheck.words.length, 'words in database, but none due for review');
        showReviewComplete();
      } else {
        console.log('No words in database at all');
        alert('No vocabulary words found. Try extracting some words from web pages first!');
        // Switch back to list view
        currentView = 'list';
        updateViewVisibility();
        updateModeIndicator();
      }
    }

    // Switch to review view
    currentView = 'review';
    updateViewVisibility();
    updateModeIndicator();

  } catch (error) {
    console.error('Error starting review:', error);
    // Show error to user
    alert('Error starting review: ' + error.message);
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
      console.log('Submitting review for word:', word.text, 'quality:', quality);

      // Update the word in the database with the review result
      const response = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.error('updateWordReview: Timeout after 10 seconds');
          resolve({ error: 'Request timeout' });
        }, 10000);

        chrome.runtime.sendMessage({
          action: "updateWordReview",
          wordId: word.id,
          quality: quality
        }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            console.error('updateWordReview error:', chrome.runtime.lastError.message);
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        });
      });

      console.log('Review submission response:', response);

      if (response && response.success) {
        currentReviewIndex++;
        showReviewCard();
      } else {
        console.error('Review submission failed:', response?.error || 'Unknown error');
        alert('Failed to save review. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting review:', error);
      alert('Error submitting review: ' + error.message);
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

  // Get container dimensions for responsive sizing
  const container = document.querySelector('.graph-container');
  const containerRect = container.getBoundingClientRect();
  const width = containerRect.width - 60; // Account for padding
  const height = Math.max(500, containerRect.height - 200); // Minimum height with header space

  console.log('Graph dimensions:', width, 'x', height);

  // Enhanced approach: show all words with better positioning
  const maxNodes = Math.min(20, allWords.length);
  const nodes = allWords.slice(0, maxNodes).map((w, i) => {
    // Create a more organic layout
    const cols = Math.ceil(Math.sqrt(maxNodes));
    const rows = Math.ceil(maxNodes / cols);

    const col = i % cols;
    const row = Math.floor(i / cols);

    // Add some randomness to prevent perfect grid
    const xOffset = (Math.random() - 0.5) * 40;
    const yOffset = (Math.random() - 0.5) * 40;

    return {
      id: w.id,
      text: w.text.length > 12 ? w.text.substring(0, 10) + '...' : w.text,
      pos: w.pos,
      freq: w.freq_rank || 1,
      x: (col + 0.5) * (width / cols) + xOffset,
      y: (row + 0.5) * (height / rows) + yOffset
    };
  });

  console.log('Created nodes:', nodes.length, nodes);

  // Create some basic links if we have relations
  const links = [];
  if (allRelations && allRelations.length > 0) {
    // Simple approach: connect first few related words
    const nodeIds = new Set(nodes.map(n => n.id));
    allRelations.slice(0, 50).forEach(rel => {
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

  // Enhanced background with gradient
  const defs = svg.append('defs');
  const gradient = defs.append('radialGradient')
    .attr('id', 'graph-bg')
    .attr('cx', '50%')
    .attr('cy', '50%')
    .attr('r', '50%');

  gradient.append('stop')
    .attr('offset', '0%')
    .attr('style', 'stop-color:rgba(102, 126, 234, 0.1);stop-opacity:1');

  gradient.append('stop')
    .attr('offset', '100%')
    .attr('style', 'stop-color:rgba(118, 75, 162, 0.05);stop-opacity:1');

  svg.append('rect')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('fill', 'url(#graph-bg)')
    .attr('rx', 12);

  console.log('Drawing enhanced graph layout...');

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
      .attr('stroke-width', d => Math.max(2, Math.min(4, 2 + d.strength)))
      .attr('stroke-opacity', 0.7)
      .attr('stroke-linecap', 'round');
  }

  // Draw nodes with enhanced styling
  const nodeGroup = svg.selectAll('.node')
    .data(nodes)
    .enter().append('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${d.x}, ${d.y})`)
    .style('cursor', 'pointer')
    .on('mouseenter', function(event, d) {
      // Highlight on hover
      d3.select(this).select('circle')
        .transition().duration(200)
        .attr('r', d => Math.max(20, Math.min(35, 20 + d.freq * 8)))
        .attr('stroke-width', 4);
    })
    .on('mouseleave', function(event, d) {
      // Return to normal
      d3.select(this).select('circle')
        .transition().duration(200)
        .attr('r', d => Math.max(18, Math.min(30, 18 + d.freq * 6)))
        .attr('stroke-width', 3);
    });

  // Enhanced node circles with better sizing
  nodeGroup.append('circle')
    .attr('r', d => Math.max(18, Math.min(30, 18 + d.freq * 6)))
    .attr('fill', d => d.pos === 'Noun' ? '#2196F3' : '#FF9800')
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 3)
    .attr('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))');

  // Enhanced node labels with dark text for visibility
  nodeGroup.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('font-size', d => Math.max(11, Math.min(14, 11 + d.freq * 2)))
    .attr('font-weight', '700')
    .attr('fill', '#2d3748') // Dark text for visibility
    .attr('text-shadow', '0 1px 2px rgba(255,255,255,0.8)')
    .text(d => d.text);

  // Add subtle glow effect to important nodes
  nodeGroup.filter(d => d.freq > 0.5).append('circle')
    .attr('r', d => Math.max(22, Math.min(36, 22 + d.freq * 8)))
    .attr('fill', 'none')
    .attr('stroke', d => d.pos === 'Noun' ? 'rgba(33, 150, 243, 0.3)' : 'rgba(255, 152, 0, 0.3)')
    .attr('stroke-width', 1)
    .attr('pointer-events', 'none');

  console.log('Enhanced graph rendered with', nodes.length, 'nodes and', links.length, 'links');
}

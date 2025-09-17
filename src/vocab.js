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

function buildGraph() {
  // Stop any existing simulation
  if (currentSimulation) {
    currentSimulation.stop();
    currentSimulation = null;
  }

  const svg = d3.select('#vocab-graph');
  svg.selectAll('*').remove(); // Clear previous

  const width = 800;
  const height = 600;

  // Limit nodes to prevent performance issues (top 20 most frequent words)
  const topWords = allWords
    .sort((a, b) => b.freq_rank - a.freq_rank)
    .slice(0, 20);

  // Prepare nodes and links (only for top words)
  const nodes = topWords.map(w => ({
    id: w.id,
    text: w.text,
    pos: w.pos,
    freq: w.freq_rank
  }));

  // Filter relations to only include connections between top words
  const nodeIds = new Set(nodes.map(n => n.id));
  const links = allRelations
    .filter(r => nodeIds.has(r.word_id) && nodeIds.has(r.related_id))
    .map(r => ({
      source: r.word_id,
      target: r.related_id,
      type: r.type,
      strength: Math.max(0.1, r.similarity_percentage / 100) // Ensure minimum strength
    }));

  console.log(`Building graph with ${nodes.length} nodes and ${links.length} links`);

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

  // Create force simulation with optimized settings
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links)
      .id(d => d.id)
      .distance(d => d.type === 'synonym' ? Math.max(30, 80 / d.strength) : Math.max(60, 150 / d.strength))
      .strength(0.7)
    )
    .force('charge', d3.forceManyBody().strength(-200).distanceMax(200))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => 15 + d.freq * 5));

  currentSimulation = simulation;

  // Create arrow markers for directed links
  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrow-synonym')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#4CAF50');

  defs.append('marker')
    .attr('id', 'arrow-antonym')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#F44336');

  // Links
  const link = svg.append('g')
    .selectAll('line')
    .data(links)
    .enter().append('line')
    .attr('stroke', d => d.type === 'synonym' ? '#4CAF50' : '#F44336')
    .attr('stroke-width', d => Math.max(1, Math.min(3, d.strength * 2)))
    .attr('stroke-opacity', 0.6)
    .attr('marker-end', d => d.type === 'synonym' ? 'url(#arrow-synonym)' : 'url(#arrow-antonym)');

  // Nodes
  const node = svg.append('g')
    .selectAll('circle')
    .data(nodes)
    .enter().append('circle')
    .attr('r', d => Math.max(8, Math.min(20, 8 + d.freq * 8)))
    .attr('fill', d => d.pos === 'Noun' ? '#2196F3' : '#FF9800')
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  // Labels
  const label = svg.append('g')
    .selectAll('text')
    .data(nodes)
    .enter().append('text')
    .text(d => d.text.length > 10 ? d.text.substring(0, 8) + '...' : d.text)
    .attr('font-size', '11px')
    .attr('font-weight', '500')
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .attr('pointer-events', 'none')
    .attr('dy', -20);

  // Tooltip
  const tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('position', 'absolute')
    .style('visibility', 'hidden')
    .style('background', 'rgba(0, 0, 0, 0.8)')
    .style('color', 'white')
    .style('padding', '8px')
    .style('border-radius', '4px')
    .style('font-size', '12px')
    .style('pointer-events', 'none')
    .style('z-index', '1000');

  // Add hover effects
  node.on('mouseover', function(event, d) {
    tooltip.style('visibility', 'visible')
      .text(`${d.text} (${d.pos}) - Frequency: ${d.freq.toFixed(2)}`);
  })
  .on('mousemove', function(event) {
    tooltip.style('top', (event.pageY - 10) + 'px')
      .style('left', (event.pageX + 10) + 'px');
  })
  .on('mouseout', function() {
    tooltip.style('visibility', 'hidden');
  });

  // Simulation tick handler
  let tickCount = 0;
  simulation.on('tick', () => {
    tickCount++;

    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);

    label
      .attr('x', d => d.x)
      .attr('y', d => d.y);

    // Stop simulation after it stabilizes (around 100 ticks)
    if (tickCount > 100 && simulation.alpha() < 0.01) {
      simulation.stop();
      console.log('Graph simulation stabilized and stopped');
    }
  });

  // Auto-stop after 10 seconds to prevent infinite running
  setTimeout(() => {
    if (simulation.alpha() > 0.01) {
      simulation.stop();
      console.log('Graph simulation auto-stopped after 10 seconds');
    }
  }, 10000);

  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // Cleanup function for when view changes
  window.addEventListener('beforeunload', () => {
    if (currentSimulation) {
      currentSimulation.stop();
    }
    tooltip.remove();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['selectedText'], (result) => {
    if (result.selectedText) {
      document.getElementById('prompt').value = result.selectedText;
      chrome.storage.local.remove('selectedText');
      // Auto-send the query
      document.getElementById('send').click();
    }
  });

  // Tab switching
  document.getElementById('grok-tab').classList.add('active');
  document.getElementById('grok-tab').addEventListener('click', () => switchTab('grok'));
  document.getElementById('vocab-tab').addEventListener('click', () => switchTab('vocab'));
});

function switchTab(tab) {
  document.getElementById('grok-tab').classList.remove('active');
  document.getElementById('vocab-tab').classList.remove('active');
  document.getElementById(tab + '-tab').classList.add('active');
  document.getElementById('grok-section').style.display = tab === 'grok' ? 'block' : 'none';
  document.getElementById('vocab-section').style.display = tab === 'vocab' ? 'block' : 'none';
}

document.getElementById("extract-vocab").addEventListener("click", () => {
  const extractButton = document.getElementById("extract-vocab");
  const graphPlaceholder = document.getElementById("graph-placeholder");

  extractButton.classList.add("loading");
  graphPlaceholder.innerHTML = '🔄 Extracting vocabulary...';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabs[0].id },
        func: () => document.body.innerText.substring(0, 20000)
      },
      (results) => {
        if (chrome.runtime.lastError || !results || !results[0]) {
          extractButton.classList.remove("loading");
          graphPlaceholder.innerHTML = '❌ Error: Could not access page content.';
          return;
        }
        const pageContent = results[0].result || "";
        console.log('Sending content to background, length:', pageContent.length);
        chrome.runtime.sendMessage({ action: "extractVocab", text: pageContent }, (response) => {
          console.log('Background response:', response);
          extractButton.classList.remove("loading");
          graphPlaceholder.innerHTML = '✅ Vocabulary extracted successfully!';
          // Refresh the preview after extraction
          setTimeout(() => loadVocabPreview(), 500);
        });
      }
    );
  });
});

document.getElementById("view-full-vocab").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('vocab.html') });
});

document.getElementById("refresh-preview").addEventListener("click", () => {
  loadVocabPreview();
});

// Load vocabulary preview when vocab tab is opened
document.getElementById('vocab-tab').addEventListener('click', () => {
  loadVocabPreview();
});

async function loadVocabPreview() {
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getVocab" }, resolve);
    });

    if (response && response.words) {
      updateVocabStats(response.words, response.translations, response.relations);
      displayVocabPreview(response.words.slice(0, 5)); // Show top 5 words
      createMiniGraph(response.words.slice(0, 10), response.relations); // Mini graph with top 10
    }
  } catch (error) {
    console.error('Error loading vocab preview:', error);
  }
}

function updateVocabStats(words, translations, relations) {
  const vocabCount = words ? words.length : 0;
  const relationCount = relations ? relations.length : 0;
  const translationCount = translations ? translations.length : 0;

  document.getElementById('vocab-count').textContent = vocabCount;
  document.getElementById('relation-count').textContent = relationCount;
  document.getElementById('translation-count').textContent = translationCount;

  const statsDiv = document.getElementById('vocab-stats');
  if (vocabCount > 0) {
    statsDiv.style.display = 'flex';
  } else {
    statsDiv.style.display = 'none';
  }
}

function displayVocabPreview(words) {
  const vocabItems = document.getElementById('vocab-items');
  const vocabEmpty = document.getElementById('vocab-empty');

  if (!words || words.length === 0) {
    vocabItems.style.display = 'none';
    vocabEmpty.style.display = 'block';
    return;
  }

  vocabItems.style.display = 'block';
  vocabEmpty.style.display = 'none';

  vocabItems.innerHTML = words.map(word => `
    <div class="vocab-item">
      <div>
        <span class="vocab-word">${word.text}</span>
        <span class="vocab-pos">${word.pos}</span>
      </div>
      <span class="vocab-score">${word.freq_rank ? word.freq_rank.toFixed(1) : '0.0'}</span>
    </div>
  `).join('');
}

function createMiniGraph(words, relations) {
  const svg = d3.select('#mini-vocab-graph');
  const placeholder = document.getElementById('graph-placeholder');

  if (!words || words.length === 0) {
    svg.style('display', 'none');
    placeholder.style.display = 'flex';
    return;
  }

  svg.style('display', 'block');
  placeholder.style.display = 'none';

  // Clear previous content
  svg.selectAll('*').remove();

  const width = 300;
  const height = 120;

  // Prepare data for mini graph (simplified)
  const nodes = words.slice(0, 8).map((w, i) => ({
    id: w.id,
    text: w.text.length > 8 ? w.text.substring(0, 6) + '...' : w.text,
    x: (i % 4) * 75 + 40,
    y: Math.floor(i / 4) * 40 + 30,
    group: w.pos === 'Noun' ? 1 : 2
  }));

  // Simple connections (just a few for visual effect)
  const links = [];
  if (nodes.length > 1) {
    for (let i = 0; i < Math.min(nodes.length - 1, 3); i++) {
      links.push({
        source: nodes[i],
        target: nodes[i + 1]
      });
    }
  }

  // Create links
  svg.selectAll('line')
    .data(links)
    .enter().append('line')
    .attr('x1', d => d.source.x)
    .attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x)
    .attr('y2', d => d.target.y)
    .attr('stroke', '#e2e8f0')
    .attr('stroke-width', 2);

  // Create nodes
  const node = svg.selectAll('circle')
    .data(nodes)
    .enter().append('circle')
    .attr('cx', d => d.x)
    .attr('cy', d => d.y)
    .attr('r', 12)
    .attr('fill', d => d.group === 1 ? '#667eea' : '#764ba2')
    .attr('stroke', '#fff')
    .attr('stroke-width', 2);

  // Add labels
  svg.selectAll('text')
    .data(nodes)
    .enter().append('text')
    .attr('x', d => d.x)
    .attr('y', d => d.y + 4)
    .attr('text-anchor', 'middle')
    .attr('font-size', '9px')
    .attr('font-weight', '500')
    .attr('fill', '#fff')
    .text(d => d.text);
}

document.getElementById("send").addEventListener("click", () => {
  const userPrompt = document.getElementById("prompt").value.trim();
  const responseDiv = document.getElementById("response");
  const sendButton = document.getElementById("send");

  // Add loading state
  sendButton.classList.add("loading");
  responseDiv.innerHTML = '<div class="loading-text">Processing your query...</div>';

  // Get current page content
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabs[0].id },
        func: () => document.body.innerText.substring(0, 10000) // Limit to avoid token overflow
      },
      (results) => {
        if (chrome.runtime.lastError || !results || !results[0]) {
          sendButton.classList.remove("loading");
          responseDiv.innerHTML = '<div class="loading-text">Error: Could not access page content.</div>';
          return;
        }
        const pageContent = results[0].result || "";
        const fullPrompt = userPrompt
          ? `Page content (excerpt): ${pageContent}\n\nUser query: ${userPrompt}`
          : `Summarize this page: ${pageContent}`;

        // Send to background for API call
        chrome.runtime.sendMessage({ action: "sendToGrok", prompt: fullPrompt }, (response) => {
          sendButton.classList.remove("loading");
          if (chrome.runtime.lastError) {
            responseDiv.innerHTML = '<div class="loading-text">Error: ' + chrome.runtime.lastError.message + '</div>';
          } else {
            // Assuming response is {response: text}
            const grokResponse = response.response || "No response received.";
            responseDiv.textContent = grokResponse;
          }
        });
      }
    );
  });
});

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
  const vocabList = document.getElementById("vocab-list");

  extractButton.classList.add("loading");
  vocabList.innerHTML = '<div class="loading-text">Extracting vocabulary...</div>';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabs[0].id },
        func: () => document.body.innerText.substring(0, 20000)
      },
      (results) => {
        if (chrome.runtime.lastError || !results || !results[0]) {
          extractButton.classList.remove("loading");
          vocabList.innerHTML = '<div class="loading-text">Error: Could not access page content.</div>';
          return;
        }
        const pageContent = results[0].result || "";
        console.log('Sending content to background, length:', pageContent.length);
        chrome.runtime.sendMessage({ action: "extractVocab", text: pageContent }, (response) => {
          console.log('Background response:', response);
          extractButton.classList.remove("loading");
          vocabList.innerHTML = '<div class="loading-text">Vocab extracted! Check vocab page for results.</div>';
          // This is always thrown regardless extractions were successful
          // Error: The message port closed before a response was received.
          // if (chrome.runtime.lastError) {
          //   vocabList.innerHTML = '<div class="loading-text">Error: ' + chrome.runtime.lastError.message + '</div>';
          // } else {
          //   vocabList.innerHTML = '<div class="loading-text">Vocab extracted! Check vocab page for results.</div>';
          // }
        });
      }
    );
  });
});

document.getElementById("view-full-vocab").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('vocab.html') });
});

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

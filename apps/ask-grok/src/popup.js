let lastGrokResponse = '';
let lastPrompt = '';

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['selectedText', 'vocabExtensionId'], (result) => {
    if (result.vocabExtensionId) {
      document.getElementById('save-vocab-row').style.display = 'block';
    }
    if (result.selectedText) {
      document.getElementById('prompt').value = result.selectedText;
      chrome.storage.local.remove('selectedText');
      document.getElementById('send').click();
    }
  });
});

document.getElementById('send').addEventListener('click', () => {
  const userPrompt = document.getElementById('prompt').value.trim();
  const responseDiv = document.getElementById('response');
  const sendButton = document.getElementById('send');

  sendButton.classList.add('loading');
  responseDiv.textContent = 'Processing...';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) {
      sendButton.classList.remove('loading');
      responseDiv.textContent = 'Error: No active tab.';
      return;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => document.body.innerText.substring(0, 10000),
      },
      (results) => {
        if (chrome.runtime.lastError || !results?.[0]) {
          sendButton.classList.remove('loading');
          responseDiv.textContent = 'Error: Could not read page content.';
          return;
        }

        const pageContent = results[0].result || '';
        const fullPrompt = userPrompt
          ? `Page content (excerpt):\n${pageContent}\n\nUser query: ${userPrompt}`
          : `Summarize this page:\n${pageContent}`;

        lastPrompt = userPrompt;

        chrome.runtime.sendMessage({ action: 'sendToGrok', prompt: fullPrompt }, (response) => {
          sendButton.classList.remove('loading');
          if (chrome.runtime.lastError) {
            responseDiv.textContent = `Error: ${chrome.runtime.lastError.message}`;
            return;
          }
          lastGrokResponse = response?.response || 'No response.';
          responseDiv.textContent = lastGrokResponse;
        });
      }
    );
  });
});

document.getElementById('save-vocab').addEventListener('click', async () => {
  const { vocabExtensionId } = await chrome.storage.local.get(['vocabExtensionId']);
  if (!vocabExtensionId) {
    alert('Set Vocab Builder extension ID in Ask Grok options (chrome://extensions).');
    return;
  }

  const selection = document.getElementById('prompt').value.trim().split(/\s+/)[0] || '';
  if (!selection) {
    alert('Enter or select a word in the prompt field first.');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const payload = {
      action: 'addWordFromGrok',
      text: selection.replace(/[^\w'-]/g, '').toLowerCase(),
      definition_en: lastGrokResponse.substring(0, 2000),
      source_snippet: lastPrompt || selection,
      source_url: tab?.url || '',
    };

    chrome.runtime.sendMessage(vocabExtensionId, payload, (res) => {
      if (chrome.runtime.lastError) {
        alert(
          `Could not reach Vocab Builder: ${chrome.runtime.lastError.message}\n` +
            'Run npm run link-extensions with Ask Grok ID, then reload Vocab Builder.'
        );
        return;
      }
      if (res?.success) {
        alert(`Saved "${payload.text}" to Vocab Builder.`);
      } else {
        alert(res?.error || 'Save failed.');
      }
    });
  });
});

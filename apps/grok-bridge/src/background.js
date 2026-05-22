chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'askGrok',
    title: 'Ask Grok about this',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'askGrok' && info.selectionText) {
    chrome.storage.local.set({ selectedText: info.selectionText }, () => {
      chrome.action.openPopup();
    });
  }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'sendToGrok') {
    sendToGrok(request.prompt, (response) => sendResponse({ response }));
    return true;
  }
  return false;
});

function sendToGrok(prompt, callback) {
  chrome.storage.local.get(['model', 'xaiApiKey'], (result) => {
    const model = result.model || 'grok-code-fast';
    const apiKey = result.xaiApiKey;
    if (!apiKey) {
      callback('Error: Set your xAI API key in extension options.');
      return;
    }

    fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        callback(data.choices?.[0]?.message?.content || 'No response received.');
      })
      .catch((err) => callback(`Error: ${err.message}`));
  });
}

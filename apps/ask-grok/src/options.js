document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['model', 'xaiApiKey', 'vocabExtensionId'], (result) => {
    document.getElementById('model').value = result.model || 'grok-code-fast';
    document.getElementById('apiKey').value = result.xaiApiKey || '';
    document.getElementById('vocabExtensionId').value = result.vocabExtensionId || '';
  });
});

document.getElementById('save').addEventListener('click', () => {
  const model = document.getElementById('model').value;
  const apiKey = document.getElementById('apiKey').value.trim();
  const vocabExtensionId = document.getElementById('vocabExtensionId').value.trim();

  if (!apiKey) {
    showStatus('Enter a valid API key.');
    return;
  }

  chrome.storage.local.set({ model, xaiApiKey: apiKey, vocabExtensionId }, () => {
    showStatus('Saved.');
  });
});

function showStatus(message) {
  const status = document.getElementById('status');
  status.textContent = message;
}

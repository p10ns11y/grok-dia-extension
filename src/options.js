document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['model', 'xaiApiKey'], (result) => {
    document.getElementById('model').value = result.model || 'grok-code-fast';
    document.getElementById('apiKey').value = result.xaiApiKey || '';
  });
});

document.getElementById("save").addEventListener("click", () => {
    const model = document.getElementById("model").value;
    const apiKey = document.getElementById("apiKey").value.trim();
    if (!apiKey) {
      showStatus("Please enter a valid API key.");
      return;
    }
    chrome.storage.local.set({ model, xaiApiKey: apiKey }, () => {
      showStatus("Settings saved successfully!");
    });
  });
  
  function showStatus(message) {
    const status = document.getElementById("status");
    status.textContent = message;
    status.classList.add("show");
    setTimeout(() => {
      status.classList.remove("show");
      setTimeout(() => { status.textContent = ""; }, 300); // Wait for fade out
    }, 3000);
  }
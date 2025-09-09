document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['xaiApiKey'], (result) => {
    document.getElementById('apiKey').value = result.xaiApiKey || '';
  });
});

document.getElementById("save").addEventListener("click", () => {
    const apiKey = document.getElementById("apiKey").value.trim();
    if (!apiKey) {
      showStatus("Please enter a valid API key.");
      return;
    }
    chrome.storage.local.set({ xaiApiKey: apiKey }, () => {
      showStatus("API key saved successfully!");
    });
  });
  
  function showStatus(message) {
    const status = document.getElementById("status");
    status.textContent = message;
    setTimeout(() => { status.textContent = ""; }, 3000);
  }
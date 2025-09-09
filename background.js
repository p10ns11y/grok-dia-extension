// Create context menu for quick "Ask Grok" on selected text
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "askGrok",
    title: "Ask Grok about this",
    contexts: ["selection"]
  });
});
  
  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "askGrok") {
      const selectedText = info.selectionText;
      // Store selected text and open popup
      chrome.storage.local.set({ selectedText: selectedText }, () => {
        chrome.action.openPopup();
      });
    }
  });
  
  // Listen for messages from popup (e.g., custom prompts with page content)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "sendToGrok") {
      sendToGrok(request.prompt, (response) => {
        sendResponse({ response });
      });
      return true; // Keep message channel open for async response
    }
  });
  
  // Core function to send prompt to Grok API
  function sendToGrok(prompt, callback) {
    chrome.storage.local.get(["xaiApiKey"], (result) => {
      const apiKey = result.xaiApiKey;
      if (!apiKey) {
        callback("Error: Please set your xAI API key in the extension options.");
        return;
      }
  
      fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "grok-code-fast",
          messages: [{ role: "user", content: prompt }]
        })
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
          return res.json();
        })
        .then((data) => {
          console.log(data);
          const response = data.choices[0].message.content || "No response received.";
          callback(response);
        })
        .catch((err) => {
          callback(`Error: ${err.message}. Check your API key or network.`);
        });
    });
  }
  
  // Show response via notification (fallback or for context menu)
  function showNotification(title, message) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.png",
      title: title,
      message: message.substring(0, 200) + (message.length > 200 ? "..." : "") // Truncate for notification limit
    });
  }
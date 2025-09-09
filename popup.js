document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['selectedText'], (result) => {
    if (result.selectedText) {
      document.getElementById('prompt').value = result.selectedText;
      chrome.storage.local.remove('selectedText');
      // Auto-send the query
      document.getElementById('send').click();
    }
  });
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
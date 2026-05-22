// Vocab Extractor Content Script
// Runs on all web pages to extract and rank unusual words

(async () => {
  // Wait for DOM to load
  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
  }

  // Extract visible text from page (exclude scripts, styles)
  const text = document.body.innerText || '';
  const cleanedText = text.replace(/[^\w\s]/g, ' ').toLowerCase();

  // Send to background for processing
  chrome.runtime.sendMessage({
    action: "extractVocab",
    text: cleanedText
  });
})();

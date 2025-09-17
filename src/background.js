import nlp from 'compromise';
import Dexie from 'dexie';

console.log('Background script loaded');

// Initialize Vocab Database
export const vocabDB = new Dexie('VocabDB');
vocabDB.version(1).stores({
  words: 'id, text, pos, freq_rank, dates_encountered',
  translations: 'id, word_id, lang, meaning, *sentences',
  relations: 'id, word_id, related_id, type, similarity_percentage'
});

// Open the database
vocabDB.open().then(() => {
  console.log('VocabDB initialized successfully');
}).catch(error => {
  console.error('VocabDB initialization failed:', error);
});

// Common word corpus (expanded for better filtering)
export const commonWords = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there',
  'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time',
  'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
  'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
  'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us'
]);

// Static translations for demo (English to other languages)
export const staticTranslations = {
  'love': { 'de': 'Liebe', 'it': 'Amore', 'fr': 'Amour', 'es': 'Amor', 'la': 'Amor', 'gr': 'Ἀγάπη', 'ta': 'காதல்', 'sa': 'प्रेम', 'zh': '爱', 'ja': '愛' },
  'happiness': { 'de': 'Glück', 'it': 'Felicità', 'fr': 'Bonheur', 'es': 'Felicidad', 'la': 'Felicitās', 'gr': 'Εὐδαιμονία', 'ta': 'மகிழ்ச்சி', 'sa': 'सुख', 'zh': '幸福', 'ja': '幸せ' },
  'knowledge': { 'de': 'Wissen', 'it': 'Conoscenza', 'fr': 'Connaissance', 'es': 'Conocimiento', 'la': 'Scientia', 'gr': 'Γνῶσις', 'ta': 'அறிவு', 'sa': 'ज्ञान', 'zh': '知识', 'ja': '知識' },
  'freedom': { 'de': 'Freiheit', 'it': 'Libertà', 'fr': 'Liberté', 'es': 'Libertad', 'la': 'Libertas', 'gr': 'Ἐλευθερία', 'ta': 'சுதந்திரம்', 'sa': 'स्वतन्त्रτα', 'zh': '自由', 'ja': '自由' }
  // Add more as needed
};

// Create context menu for quick "Ask Grok" on selected text
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "askGrok",
    title: "Ask Grok about this",
    contexts: ["selection"]
  });

  // Add vocab context menu
  chrome.contextMenus.create({
    id: "addVocab",
    title: "Add to Vocabulary",
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
  } else if (info.menuItemId === "addVocab") {
    addVocabWord(info.selectionText);
  }
});

// Listen for messages from popup (e.g., custom prompts with page content)
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log('Background: Message received:', request);

  if (request.action === "sendToGrok") {
    sendToGrok(request.prompt, (response) => {
      sendResponse({ response });
    });
    return true; // Keep message channel open for async response
  } else if (request.action === "extractVocab") {
    console.log('Background: Starting vocab extraction, text length:', request.text.length);

    // Handle the async extraction with proper promise handling
    extractVocab(request.text).then(result => {
      console.log('Background: Vocab extraction completed successfully');
      sendResponse({ status: "Extraction completed", result });
    }).catch(error => {
      console.error('Background: Vocab extraction failed:', error);
      sendResponse({ status: "Extraction failed", error: error.message });
    });

    // Return true to keep message channel open for async response
    return true;
  } else if (request.action === "getVocab") {
    try {
      console.log('getVocab: Starting database queries');
      const words = await vocabDB.words.toArray();
      const translations = await vocabDB.translations.toArray();
      const relations = await vocabDB.relations.toArray();
      console.log('getVocab words count:', words.length, translations.length, relations.length);
      console.log('getVocab: Sending response');
      sendResponse({ words, translations, relations });
    } catch (error) {
      console.error('getVocab: Database query failed:', error);
      sendResponse({ words: [], translations: [], relations: [], error: error.message });
    }
  }
  return true;
});

// Core function to send prompt to Grok API
function sendToGrok(prompt, callback) {
  chrome.storage.local.get(["model", "xaiApiKey"], (result) => {
    const model = result.model || "grok-code-fast";
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
        model: model,
        messages: [{ role: "user", content: prompt }]
      })
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
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

// Enhanced vocab extraction with TF-IDF-like ranking and better POS filtering
export async function extractVocab(text) {
  console.log('Extract text length:', text.length);

  // Limit text length to prevent processing issues
  const limitedText = text.substring(0, 10000);

  try {
    const statementsWithTermChunks = nlp(limitedText);
    const allTerms = statementsWithTermChunks.json().map(statement => statement.terms).flat();
    console.log('Total terms found:', allTerms.length);

    // Enhanced POS filtering with better categorization
    const candidates = [];
    allTerms.forEach(t => {
      const word = t.text.toLowerCase().trim();
      const pos = t.tags;

      // Skip if word doesn't meet basic criteria
      if (!word || word.length < 3 || word.length > 20 || !/^[a-z]+$/.test(word)) {
        return;
      }

      // Skip common words
      if (commonWords.has(word)) {
        return;
      }

      // Enhanced POS filtering - prioritize meaningful parts of speech
      let posScore = 0;
      let posCategory = 'Other';

      if (pos.includes('Noun')) {
        posScore = 10;
        posCategory = 'Noun';
      } else if (pos.includes('Verb')) {
        posScore = 8;
        posCategory = 'Verb';
      } else if (pos.includes('Adjective')) {
        posScore = 9;
        posCategory = 'Adjective';
      } else if (pos.includes('Adverb')) {
        posScore = 6;
        posCategory = 'Adverb';
      } else {
        return; // Skip words that aren't nouns, verbs, adjectives, or adverbs
      }

      candidates.push({
        word,
        pos: posCategory,
        posScore,
        frequency: 1,
        confidence: t.confidence || 0.5
      });
    });

    console.log('POS-filtered candidates:', candidates.length);

    // Group by word and calculate frequency
    const wordMap = new Map();
    candidates.forEach(candidate => {
      if (wordMap.has(candidate.word)) {
        const existing = wordMap.get(candidate.word);
        existing.frequency += 1;
        // Keep the highest POS score
        if (candidate.posScore > existing.posScore) {
          existing.posScore = candidate.posScore;
          existing.pos = candidate.pos;
        }
      } else {
        wordMap.set(candidate.word, candidate);
      }
    });

    // Calculate TF-IDF-like scores
    const words = Array.from(wordMap.values());
    const totalWords = words.length;
    const avgFrequency = words.reduce((sum, w) => sum + w.frequency, 0) / totalWords;

    words.forEach(word => {
      // TF (Term Frequency) - normalized by document length
      const tf = word.frequency / totalWords;

      // IDF-like score (rarity factor) - words that appear less frequently get higher scores
      const rarityFactor = Math.log(avgFrequency / (word.frequency + 1) + 1);

      // POS importance multiplier
      const posMultiplier = word.posScore / 10;

      // Word quality score (length, uniqueness)
      const qualityScore = Math.min(word.word.length / 10, 1) * (1 + word.confidence);

      // Final TF-IDF-like score
      word.score = tf * rarityFactor * posMultiplier * qualityScore * 1000;
    });

    // Sort by score and take top candidates
    const topWords = words
      .sort((a, b) => b.score - a.score)
      .slice(0, 15); // Reduced from 20 to 15 for better quality

    console.log('Top ranked words:', topWords.map(w => `${w.word}(${w.pos}): ${w.score.toFixed(2)}`));

    for (const wordData of topWords) {
      const existing = await vocabDB.words.where('text').equals(wordData.word).first();
      console.log('Processing word:', wordData.word, 'score:', wordData.score.toFixed(2), 'existing:', !!existing);

      if (!existing) {
        const wordId = Date.now() + Math.random();
        await vocabDB.words.add({
          id: wordId,
          text: wordData.word,
          pos: wordData.pos,
          freq_rank: wordData.score, // Use the enhanced TF-IDF-like score
          dates_encountered: [new Date().toISOString()]
        });
        console.log('Added new word to DB:', wordData.word);

        // Add translations - try static first, then dynamic
        let translationsAdded = false;

        if (staticTranslations[wordData.word]) {
          // Use static translations if available
          for (const [lang, meaning] of Object.entries(staticTranslations[wordData.word])) {
            await vocabDB.translations.add({
              id: Date.now() + Math.random(),
              word_id: wordId,
              lang,
              meaning,
              sentences: []
            });
          }
          console.log('Added static translations for:', wordData.word);
          translationsAdded = true;
        } else {
          // Try dynamic translation fetching
          try {
            console.log('Fetching dynamic translations for:', wordData.word);
            const dynamicTranslations = await fetchTranslations(wordData.word);

            if (Object.keys(dynamicTranslations).length > 0) {
              for (const [lang, meaning] of Object.entries(dynamicTranslations)) {
                await vocabDB.translations.add({
                  id: Date.now() + Math.random(),
                  word_id: wordId,
                  lang,
                  meaning,
                  sentences: []
                });
              }
              console.log('Added dynamic translations for:', wordData.word, Object.keys(dynamicTranslations));
              translationsAdded = true;
            } else {
              console.log('No translations found for:', wordData.word);
            }
          } catch (error) {
            console.warn('Dynamic translation failed for:', wordData.word, error.message);
          }
        }

        if (!translationsAdded) {
          console.log('No translations available for:', wordData.word);
        }

        // Fetch and add semantic relations
        try {
          const relations = await fetchRelations(wordData.word);
          await addRelations(wordId, relations);
          console.log('Added relations for:', wordData.word);
        } catch (error) {
          console.warn('Failed to fetch relations for:', wordData.word, error.message);
        }
      } else {
        // Update existing word's encounter date and potentially improve ranking
        existing.dates_encountered.push(new Date().toISOString());
        // Update ranking if the new score is better
        if (wordData.score > existing.freq_rank) {
          existing.freq_rank = wordData.score;
        }
        await vocabDB.words.update(existing.id, {
          dates_encountered: existing.dates_encountered,
          freq_rank: existing.freq_rank
        });
        console.log('Updated existing word:', wordData.word);
      }
    }
    console.log('extraction complete');
  } catch (error) {
    console.error('Error in extractVocab:', error);
    throw error; // Re-throw to be caught by the caller
  }
}

// Fetch synonyms and antonyms from Datamuse API
async function fetchRelations(word) {
  try {
    const response = await fetch(`https://api.datamuse.com/words?rel_syn=${word}&max=5`);
    const synonyms = await response.json();
    const antResponse = await fetch(`https://api.datamuse.com/words?rel_ant=${word}&max=5`);
    const antonyms = await antResponse.json();
    return { synonyms, antonyms };
  } catch (error) {
    console.error('Error fetching relations:', error);
    return { synonyms: [], antonyms: [] };
  }
}

// Fetch translations using Datamuse API (more reliable than LibreTranslate)
async function fetchTranslation(word, targetLang = 'es') {
  try {
    // Use Datamuse's translation endpoint
    const response = await fetch(`https://api.datamuse.com/words?sp=${word}&md=translations&max=1&v=en`);

    if (!response.ok) {
      throw new Error(`Datamuse API error: ${response.status}`);
    }

    const data = await response.json();

    if (data && data.length > 0 && data[0].defs) {
      // Parse Datamuse translation format
      const defs = data[0].defs;
      for (const def of defs) {
        if (def.startsWith(`${targetLang}\\t`)) {
          return def.split('\\t')[1]; // Extract translation after language code
        }
      }
    }

    // Fallback: try general translation search
    const fallbackResponse = await fetch(`https://api.datamuse.com/words?ml=${word}&max=5&v=en`);
    const fallbackData = await fallbackResponse.json();

    // Look for words that might be translations
    if (fallbackData && fallbackData.length > 0) {
      // This is a heuristic - return the first related word as a "translation"
      // In a real implementation, you'd want better language detection
      return fallbackData[0].word;
    }

    return null;
  } catch (error) {
    console.warn('Translation fetch failed for', word, 'to', targetLang, ':', error.message);
    return null;
  }
}

// Fetch translations for multiple languages using Datamuse
async function fetchTranslations(word) {
  const languages = ['es', 'fr', 'de', 'it', 'pt'];
  const translations = {};

  // Limit to 3 languages to respect API limits
  const selectedLangs = languages.slice(0, 3);

  const promises = selectedLangs.map(async (lang) => {
    try {
      const translation = await fetchTranslation(word, lang);
      if (translation && translation !== word && translation.length > 0) {
        translations[lang] = translation;
      }
    } catch (error) {
      console.warn(`Failed to translate ${word} to ${lang}:`, error.message);
    }
  });

  await Promise.allSettled(promises); // Don't fail if some translations fail
  return translations;
}

// Add relations to DB
async function addRelations(wordId, relations) {
  for (const syn of relations.synonyms.slice(0, 3)) {
    const relatedWord = syn.word;
    const existingRelated = await vocabDB.words.where('text').equals(relatedWord).first();
    let relatedId = existingRelated ? existingRelated.id : null;
    if (!relatedId) {
      relatedId = Date.now() + Math.random();
      await vocabDB.words.add({
        id: relatedId,
        text: relatedWord,
        pos: 'Noun',
        freq_rank: 0.1,
        dates_encountered: []
      });
    }
    await vocabDB.relations.add({
      id: Date.now() + Math.random(),
      word_id: wordId,
      related_id: relatedId,
      type: 'synonym',
      similarity_percentage: Math.min(100, syn.score / 10)
    });
  }
  for (const ant of relations.antonyms.slice(0, 3)) {
    const relatedWord = ant.word;
    const existingRelated = await vocabDB.words.where('text').equals(relatedWord).first();
    let relatedId = existingRelated ? existingRelated.id : null;
    if (!relatedId) {
      relatedId = Date.now() + Math.random();
      await vocabDB.words.add({
        id: relatedId,
        text: relatedWord,
        pos: 'Noun',
        freq_rank: 0.1,
        dates_encountered: []
      });
    }
    await vocabDB.relations.add({
      id: Date.now() + Math.random(),
      word_id: wordId,
      related_id: relatedId,
      type: 'antonym',
      similarity_percentage: Math.min(100, ant.score / 10)
    });
  }
}

// Add vocab word from selection
async function addVocabWord(selectedText) {
  const wordsArr = selectedText.toLowerCase().split(/\s+/);
  for (const word of wordsArr) {
    if (word.length > 2 && !commonWords.has(word)) {
      const existing = await vocabDB.words.where('text').equals(word).first();
      if (!existing) {
        const wordId = Date.now() + Math.random();
        await vocabDB.words.add({
          id: wordId,
          text: word,
          pos: 'Noun',
          freq_rank: 0.5,
          dates_encountered: [new Date().toISOString()]
        });
        if (staticTranslations[word]) {
          for (const [lang, meaning] of Object.entries(staticTranslations[word])) {
            await vocabDB.translations.add({
              id: Date.now() + Math.random(),
              word_id: wordId,
              lang,
              meaning,
              sentences: []
            });
          }
        }
        // Fetch and add relations
        const relations = await fetchRelations(word);
        await addRelations(wordId, relations);
      }
    }
  }
}

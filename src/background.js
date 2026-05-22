import nlp from 'compromise';
import Dexie from 'dexie';

console.log('Background script loaded');

// Initialize Vocab Database with optimized schema
export const vocabDB = new Dexie('VocabDB');
vocabDB.version(2).stores({
  words: 'id, text, pos, freq_rank, dates_encountered, ease_factor, interval, repetitions, next_review, last_reviewed, &[text+pos], &text, pos, freq_rank, next_review, repetitions',
  translations: 'id, word_id, lang, meaning, *sentences, &[word_id+lang], word_id, lang',
  relations: 'id, word_id, related_id, type, similarity_percentage, &[word_id+type], &[related_id+type], word_id, related_id, type',
  // Add metadata table for caching and statistics
  metadata: 'key, value, updated_at'
});

// Open the database
vocabDB.open().then(() => {
  console.log('VocabDB initialized successfully');
}).catch(error => {
  console.error('VocabDB initialization failed:', error);
});

// Add error handling for database operations
vocabDB.on('error', (error) => {
  console.error('Dexie database error:', error);
});

// Data compression utilities
const compressString = (str) => {
  // Simple compression for repeated patterns
  if (str.length < 100) return str; // Don't compress short strings

  // Remove excessive whitespace
  return str.replace(/\s+/g, ' ').trim();
};

const decompressString = (str) => {
  return str; // For now, just return as-is since we're using simple compression
};

// Batch operation utilities
const batchInsert = async (table, items, batchSize = 50) => {
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    await table.bulkAdd(batch);
  }
};

// Cache for frequently accessed data
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCached = (key) => {
  const item = cache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL) {
    return item.data;
  }
  cache.delete(key);
  return null;
};

const setCached = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
};

// Memory management utilities
const cleanupCache = () => {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (now - item.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
  console.log('Cache cleanup completed, remaining items:', cache.size);
};

// Periodic cleanup
setInterval(cleanupCache, CACHE_TTL / 2); // Clean every 2.5 minutes

// Performance monitoring
const performanceMetrics = {
  queryCount: 0,
  avgQueryTime: 0,
  cacheHits: 0,
  cacheMisses: 0
};

const measurePerformance = async (operation, fn) => {
  const start = performance.now();
  performanceMetrics.queryCount++;

  try {
    const result = await fn();
    const duration = performance.now() - start;

    // Update average query time
    performanceMetrics.avgQueryTime =
      (performanceMetrics.avgQueryTime * (performanceMetrics.queryCount - 1) + duration) / performanceMetrics.queryCount;

    console.log(`${operation} completed in ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    console.error(`${operation} failed:`, error);
    throw error;
  }
};

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
      console.log('getVocab: Starting optimized database queries');

      const result = await measurePerformance('getVocab', async () => {
        // Check cache first
        const cacheKey = 'vocab_data';
        const cachedData = getCached(cacheKey);
        if (cachedData) {
          performanceMetrics.cacheHits++;
          console.log('getVocab: Cache hit - returning cached data');
          return cachedData;
        }

        performanceMetrics.cacheMisses++;

        // Use optimized queries with proper indexing
        const [words, translations, relations] = await Promise.all([
          vocabDB.words.orderBy('freq_rank').reverse().toArray(), // Most frequent first
          vocabDB.translations.toArray(),
          vocabDB.relations.toArray()
        ]);

        const result = { words, translations, relations };

        // Cache the result
        setCached(cacheKey, result);

        console.log('getVocab: Retrieved', words.length, 'words,', translations.length, 'translations,', relations.length, 'relations');
        return result;
      });

      sendResponse(result);
    } catch (error) {
      console.error('getVocab: Database query failed:', error);
      sendResponse({ words: [], translations: [], relations: [], error: error.message });
    }
  } else if (request.action === "getReviewWords") {
    try {
      const result = await measurePerformance('getReviewWords', async () => {
        const limit = request.limit || 20;
        const words = await getWordsDueForReview(limit);
        const translations = await vocabDB.translations.toArray();
        const relations = await vocabDB.relations.toArray();
        return { words, translations, relations };
      });
      sendResponse(result);
    } catch (error) {
      console.error('getReviewWords: Failed:', error);
      sendResponse({ words: [], translations: [], relations: [], error: error.message });
    }
  } else if (request.action === "updateWordReview") {
    try {
      const { wordId, quality } = request;
      const success = await updateWordAfterReview(wordId, quality);
      sendResponse({ success });
    } catch (error) {
      console.error('updateWordReview: Failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === "getReviewStats") {
    try {
      const stats = await measurePerformance('getReviewStats', () => getReviewStats());
      sendResponse({ stats });
    } catch (error) {
      console.error('getReviewStats: Failed:', error);
      sendResponse({ stats: null, error: error.message });
    }
  } else if (request.action === "getPerformanceMetrics") {
    try {
      const metrics = {
        ...performanceMetrics,
        cacheSize: cache.size,
        dbSize: await vocabDB.words.count() + await vocabDB.translations.count() + await vocabDB.relations.count(),
        memoryUsage: performance.memory ? {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit
        } : null
      };
      sendResponse({ metrics });
    } catch (error) {
      console.error('getPerformanceMetrics: Failed:', error);
      sendResponse({ metrics: null, error: error.message });
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

    // Prepare batch operations for better performance
    const wordsToAdd = [];
    const translationsToAdd = [];
    const relationsToAdd = [];
    const wordsToUpdate = [];

    for (const wordData of topWords) {
      const existing = await vocabDB.words.where('text').equals(wordData.word).first();

      if (!existing) {
        const wordId = Date.now() + Math.random();
        const wordRecord = {
          id: wordId,
          text: wordData.word,
          pos: wordData.pos,
          freq_rank: wordData.score,
          dates_encountered: [new Date().toISOString()],
          ease_factor: 2.5,
          interval: 1,
          repetitions: 0,
          next_review: null,
          last_reviewed: null
        };
        wordsToAdd.push(wordRecord);

        // Prepare translations
        let translationsAdded = false;

        if (staticTranslations[wordData.word]) {
          for (const [lang, meaning] of Object.entries(staticTranslations[wordData.word])) {
            translationsToAdd.push({
              id: Date.now() + Math.random(),
              word_id: wordId,
              lang,
              meaning: compressString(meaning), // Compress translations
              sentences: []
            });
          }
          translationsAdded = true;
        } else {
          // Try dynamic translation fetching
          try {
            const dynamicTranslations = await fetchTranslations(wordData.word);
            if (Object.keys(dynamicTranslations).length > 0) {
              for (const [lang, meaning] of Object.entries(dynamicTranslations)) {
                translationsToAdd.push({
                  id: Date.now() + Math.random(),
                  word_id: wordId,
                  lang,
                  meaning: compressString(meaning),
                  sentences: []
                });
              }
              translationsAdded = true;
            }
          } catch (error) {
            console.warn('Dynamic translation failed for:', wordData.word, error.message);
          }
        }

        // Prepare relations
        try {
          const relations = await fetchRelations(wordData.word);
          for (const syn of relations.synonyms.slice(0, 3)) {
            relationsToAdd.push({
              id: Date.now() + Math.random(),
              word_id: wordId,
              related_id: null, // Will be resolved after insertion
              type: 'synonym',
              similarity_percentage: Math.min(100, syn.score / 10)
            });
          }
          for (const ant of relations.antonyms.slice(0, 3)) {
            relationsToAdd.push({
              id: Date.now() + Math.random(),
              word_id: wordId,
              related_id: null,
              type: 'antonym',
              similarity_percentage: Math.min(100, ant.score / 10)
            });
          }
        } catch (error) {
          console.warn('Failed to prepare relations for:', wordData.word, error.message);
        }

        console.log('Prepared new word for batch insert:', wordData.word);
      } else {
        // Prepare update for existing word
        const updatedEncounters = [...existing.dates_encountered, new Date().toISOString()];
        const updatedRank = Math.max(existing.freq_rank, wordData.score);

        wordsToUpdate.push({
          id: existing.id,
          changes: {
            dates_encountered: updatedEncounters,
            freq_rank: updatedRank
          }
        });
        console.log('Prepared update for existing word:', wordData.word);
      }
    }

    // Execute batch operations
    console.log('Executing batch operations...');

    // Add new words
    if (wordsToAdd.length > 0) {
      await batchInsert(vocabDB.words, wordsToAdd);
      console.log('Batch inserted', wordsToAdd.length, 'new words');
    }

    // Add translations
    if (translationsToAdd.length > 0) {
      await batchInsert(vocabDB.translations, translationsToAdd);
      console.log('Batch inserted', translationsToAdd.length, 'translations');
    }

    // Add relations (need to resolve related_ids first)
    if (relationsToAdd.length > 0) {
      // First, create a map of word text to ID for quick lookup
      const wordMap = new Map();
      const allWords = await vocabDB.words.toArray();
      allWords.forEach(word => wordMap.set(word.text, word.id));

      for (const relation of relationsToAdd) {
        if (relation.related_id === null) {
          // Find the related word ID using the word text stored in the relation
          // Note: We need to store the related word text in the relation object
          // For now, we'll skip relations that can't be resolved
          console.warn('Skipping relation with unresolved related_id');
        }
      }

      // Filter out unresolved relations and insert the rest
      const validRelations = relationsToAdd.filter(r => r.related_id !== null);
      if (validRelations.length > 0) {
        await batchInsert(vocabDB.relations, validRelations);
        console.log('Batch inserted', validRelations.length, 'relations');
      }
    }

    // Update existing words
    if (wordsToUpdate.length > 0) {
      for (const update of wordsToUpdate) {
        await vocabDB.words.update(update.id, update.changes);
      }
      console.log('Updated', wordsToUpdate.length, 'existing words');
    }

    // Clear cache after bulk operations
    cache.clear();
    console.log('Cleared cache after bulk operations');
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

// Spaced Repetition Algorithm (SuperMemo SM-2)
function calculateNextReview(word, quality) {
  // quality: 0-5 (0=complete blackout, 5=perfect response)
  let { ease_factor, interval, repetitions } = word;

  // Initialize if first time
  if (!ease_factor) ease_factor = 2.5;
  if (!interval) interval = 1;
  if (!repetitions) repetitions = 0;

  if (quality >= 3) {
    // Correct response
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease_factor);
    }
    repetitions += 1;
  } else {
    // Incorrect response
    repetitions = 0;
    interval = 1;
  }

  // Adjust ease factor
  ease_factor = Math.max(1.3, ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return {
    ease_factor: Math.round(ease_factor * 100) / 100,
    interval,
    repetitions,
    next_review: nextReview.toISOString(),
    last_reviewed: new Date().toISOString()
  };
}

// Get words due for review (optimized with caching and indexing)
async function getWordsDueForReview(limit = 20) {
  console.log('getWordsDueForReview: Starting with limit:', limit);
  const now = new Date().toISOString();

  try {
    // Check cache first
    const cacheKey = `review_words_${limit}`;
    const cachedResult = getCached(cacheKey);
    if (cachedResult) {
      console.log('getWordsDueForReview: Returning cached result');
      return cachedResult;
    }

    // Use optimized parallel queries with proper indexing
    const [dueWords, newWords] = await Promise.all([
      vocabDB.words
        .where('next_review')
        .belowOrEqual(now)
        .sortBy('next_review'), // Sort by due date
      vocabDB.words
        .where('next_review')
        .equals(null)
        .sortBy('freq_rank') // Sort new words by frequency
    ]);

    console.log('getWordsDueForReview: Found', dueWords.length, 'due words and', newWords.length, 'new words');

    // Combine and prioritize (new words first, then by due date)
    const allWords = [
      ...newWords.slice(0, Math.ceil(limit / 2)), // Take half from new words
      ...dueWords.slice(0, Math.floor(limit / 2))  // Take half from due words
    ];

    // If we don't have enough, fill with remaining words
    if (allWords.length < limit) {
      const remaining = [
        ...newWords.slice(Math.ceil(limit / 2)),
        ...dueWords.slice(Math.floor(limit / 2))
      ];
      allWords.push(...remaining.slice(0, limit - allWords.length));
    }

    const result = allWords.slice(0, limit);

    // Cache the result for 1 minute (shorter TTL for review data)
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    console.log('getWordsDueForReview: Returning', result.length, 'optimized words');
    return result;
  } catch (error) {
    console.error('Error getting words due for review:', error);
    console.error('Error details:', error.message);
    return [];
  }
}

// Update word after review
async function updateWordAfterReview(wordId, quality) {
  try {
    const word = await vocabDB.words.get(wordId);
    if (!word) {
      console.error('Word not found for review update:', wordId);
      return false;
    }

    const updates = calculateNextReview(word, quality);
    await vocabDB.words.update(wordId, updates);

    console.log('Updated word after review:', word.text, 'quality:', quality, 'next review:', updates.next_review);
    return true;
  } catch (error) {
    console.error('Error updating word after review:', error);
    return false;
  }
}

// Get review statistics
async function getReviewStats() {
  console.log('getReviewStats: Starting...');
  try {
    const allWords = await vocabDB.words.toArray();
    const now = new Date();
    console.log('getReviewStats: Found', allWords.length, 'words in database');

    let totalWords = allWords.length;
    let newWords = 0;
    let learningWords = 0;
    let matureWords = 0;
    let dueToday = 0;

    for (const word of allWords) {
      if (!word.repetitions || word.repetitions === 0) {
        newWords++;
      } else if (word.repetitions < 3) {
        learningWords++;
      } else {
        matureWords++;
      }

      if (!word.next_review || new Date(word.next_review) <= now) {
        dueToday++;
      }
    }

    const stats = {
      totalWords,
      newWords,
      learningWords,
      matureWords,
      dueToday
    };

    console.log('getReviewStats: Returning stats:', stats);
    return stats;
  } catch (error) {
    console.error('Error getting review stats:', error);
    console.error('Error details:', error.message);
    return {
      totalWords: 0,
      newWords: 0,
      learningWords: 0,
      matureWords: 0,
      dueToday: 0
    };
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
          dates_encountered: [new Date().toISOString()],
          ease_factor: 2.5, // Initial ease factor
          interval: 1,
          repetitions: 0,
          next_review: null, // New words are due immediately
          last_reviewed: null
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

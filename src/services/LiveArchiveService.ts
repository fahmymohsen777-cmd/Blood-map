/// <reference types="vite/client" />
import axios from 'axios';

// ========================================================================
// MULTI-KEY ROTATION SYSTEM
// Add up to 5 keys of each type in your .env file:
//   VITE_NEWS_API_KEY_1, VITE_NEWS_API_KEY_2, ... VITE_NEWS_API_KEY_5
//   VITE_GEMINI_API_KEY_1, VITE_GEMINI_API_KEY_2, ... VITE_GEMINI_API_KEY_5
// The system automatically rotates to the next key on quota/error.
// ========================================================================

const getKeys = (prefix: string): string[] =>
  [1, 2, 3, 4, 5]
    .map((i) => import.meta.env[`${prefix}_${i}`] as string)
    .filter(Boolean);

// Fallback to legacy single-key env vars for backward compatibility
const NEWS_KEYS: string[] = getKeys('VITE_NEWS_API_KEY').length
  ? getKeys('VITE_NEWS_API_KEY')
  : [import.meta.env.VITE_NEWS_API_KEY].filter(Boolean);

const GEMINI_KEYS: string[] = getKeys('VITE_GEMINI_API_KEY').length
  ? getKeys('VITE_GEMINI_API_KEY')
  : [import.meta.env.VITE_GEMINI_API_KEY].filter(Boolean);

// Track which key index we're on per session
let newsKeyIndex = 0;
let geminiKeyIndex = 0;

const nextNewsKey = (): string | null => {
  if (!NEWS_KEYS.length) return null;
  newsKeyIndex = newsKeyIndex % NEWS_KEYS.length;
  return NEWS_KEYS[newsKeyIndex];
};

const rotateNewsKey = () => {
  newsKeyIndex = (newsKeyIndex + 1) % NEWS_KEYS.length;
  console.warn(`[NewsAPI] Key rotated → using key #${newsKeyIndex + 1}`);
};

const nextGeminiKey = (): string | null => {
  if (!GEMINI_KEYS.length) return null;
  geminiKeyIndex = geminiKeyIndex % GEMINI_KEYS.length;
  return GEMINI_KEYS[geminiKeyIndex];
};

const rotateGeminiKey = () => {
  geminiKeyIndex = (geminiKeyIndex + 1) % GEMINI_KEYS.length;
  console.warn(`[Gemini] Key rotated → using key #${geminiKeyIndex + 1}`);
};

// ========================================================================

export interface LiveEvent {
  url: string;
  source: string;
  title: string;
  date: string;
  victims: number | string;
  location: string;
  isMassacre: boolean;
  aiSummary: string;
}

const CACHE_KEY = 'live_archive_cache_events';
const CACHE_TIMESTAMP_KEY = 'live_archive_timestamp';
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export const fetchAndAnalyzeLiveEvents = async (): Promise<LiveEvent[]> => {
  // Check sessionStorage cache to prevent API exhaustion
  try {
    const cachedData = sessionStorage.getItem(CACHE_KEY);
    const cachedTime = sessionStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (cachedData && cachedTime) {
      const parsedData = JSON.parse(cachedData);
      const isExpired = Date.now() - parseInt(cachedTime) > CACHE_EXPIRY_MS;
      if (!isExpired && parsedData.length > 0) {
        return parsedData;
      }
    }
  } catch (e) { /* ignore cache parse errors */ }

  // Fetch live articles with key rotation
  let articles: any[] = [];
  const keywords = '(مجزرة OR غارة OR شهداء OR "قصف جوي" OR مدنيين) AND (غزة OR لبنان OR ايران OR سوريا OR اليمن)';

  let newsAttempts = 0;
  while (newsAttempts < Math.max(NEWS_KEYS.length, 1)) {
    try {
      // Call our Vercel serverless proxy instead of NewsAPI directly
      // This avoids CORS restrictions on production deployments
      const response = await axios.get('/api/news', { timeout: 10000 });
      articles = response.data.articles || [];
      break; // success
    } catch (err: any) {
      const status = err.response?.status;
      console.error(`[NewsProxy] Failed (${status})`);
      if (status === 429) {
        // all server-side keys exhausted
        break;
      }
      // network/server error — no point retrying
      break;
    }
  }

  if (!articles.length) return [];

  const liveEvents: LiveEvent[] = [];

  // Analyze articles with Gemini — rotate key on quota errors
  for (const article of articles) {
    if (!article.title) continue;

    const cleanedTitle = article.title.split(' - ')[0];
    const textToAnalyze = `العنوان: ${cleanedTitle}\nالوصف: ${article.description || ''}`;

    try {
      const analysis = await analyzeWithGemini(textToAnalyze);
      if (analysis && analysis.isMassacre) {
        liveEvents.push({
          url: article.url,
          source: article.source?.name || 'وكالات',
          title: cleanedTitle,
          date: article.publishedAt,
          victims: analysis.victims,
          location: analysis.location,
          isMassacre: analysis.isMassacre,
          aiSummary: analysis.summary,
        });
      }
    } catch (e) {
      console.error('Failed to analyze article with Gemini', e);
    }
  }

  // Cache results
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(liveEvents));
  sessionStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());

  return liveEvents;
};

// ========================================================================
// GEMINI ANALYSIS WITH KEY ROTATION
// ========================================================================
const analyzeWithGemini = async (text: string): Promise<any> => {
  let geminiAttempts = 0;

  while (geminiAttempts < Math.max(GEMINI_KEYS.length, 1)) {
    const apiKey = nextGeminiKey();
    if (!apiKey) {
      console.warn('[Gemini] No API keys configured.');
      return null;
    }

    const systemInstruction = `
      You are an elite, objective Arabic analyst tracking brutal war crimes, civilian casualties, and massacres.
      You will receive a horrific news snippet in Arabic.
      Extract the casualty data into a strict raw JSON object without any formatting blocks or markdown.
      Format exactly matching:
      {
        "isMassacre": boolean (true if strike/bombing/civilians killed, false if generic political news),
        "victims": number (extract exact deaths/martyrs. If 'dozens' → 20, 'hundreds' → 100. If 0 or unmentioned → 0),
        "location": string (city/region/country in Arabic like "شمال غزة", "النبطية، لبنان"),
        "summary": string (short punchy 1-sentence intense Arabic summary of what happened)
      }
    `;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ parts: [{ text }] }],
          generationConfig: { response_mime_type: 'application/json' },
        }),
      });

      if (response.status === 429 || response.status === 403) {
        console.warn(`[Gemini] Key #${geminiKeyIndex + 1} quota exceeded — rotating`);
        rotateGeminiKey();
        geminiAttempts++;
        continue; // retry with next key
      }

      const data = await response.json();
      if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return JSON.parse(data.candidates[0].content.parts[0].text);
      }

      return null; // got response but no content
    } catch (error) {
      console.error(`[Gemini] Key #${geminiKeyIndex + 1} error`, error);
      rotateGeminiKey();
      geminiAttempts++;
    }
  }

  console.error('[Gemini] All keys exhausted!');
  return null;
};

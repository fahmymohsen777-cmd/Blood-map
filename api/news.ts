import type { VercelRequest, VercelResponse } from '@vercel/node';

// This serverless function acts as a proxy for NewsAPI
// It runs server-side so no CORS issues and API keys stay hidden
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow GET only
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rotate through multiple keys
  const keys = [
    process.env.VITE_NEWS_API_KEY_1,
    process.env.VITE_NEWS_API_KEY_2,
    process.env.VITE_NEWS_API_KEY_3,
    process.env.VITE_NEWS_API_KEY_4,
    process.env.VITE_NEWS_API_KEY_5,
    // Fallback to legacy single-key
    process.env.VITE_NEWS_API_KEY,
  ].filter(Boolean) as string[];

  if (!keys.length) {
    return res.status(500).json({ error: 'No NewsAPI keys configured' });
  }

  const keywords = '(مجزرة OR غارة OR شهداء OR "قصف جوي" OR مدنيين) AND (غزة OR لبنان OR ايران OR سوريا OR اليمن)';

  for (const apiKey of keys) {
    try {
      const params = new URLSearchParams({
        q: keywords,
        sortBy: 'publishedAt',
        language: 'ar',
        apiKey,
        pageSize: '7',
      });

      const response = await fetch(`https://newsapi.org/v2/everything?${params}`);
      const data = await response.json();

      if (response.status === 429 || response.status === 401 || data.code === 'apiKeyExhausted') {
        // Quota exceeded — try next key
        console.warn(`[API/news] Key exhausted: ${apiKey.slice(0, 8)}..., rotating`);
        continue;
      }

      if (!response.ok) {
        return res.status(response.status).json({ error: data.message || 'NewsAPI error' });
      }

      // Success — return articles
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.status(200).json({ articles: data.articles || [] });
    } catch (err: any) {
      console.error('[API/news] Fetch error:', err.message);
      return res.status(500).json({ error: 'Proxy fetch failed' });
    }
  }

  return res.status(429).json({ error: 'All NewsAPI keys exhausted' });
}

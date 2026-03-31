import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '../context/LangContext';
import { fetchAndAnalyzeLiveEvents, LiveEvent } from '../services/LiveArchiveService';
import { massacres } from '../data/massacres';

// Build a guaranteed fallback from local data (most recent 5 events by date)
const buildFallbackEvents = (): LiveEvent[] =>
  [...massacres]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)
    .map((m) => ({
      url: m.source.url,
      source: m.source.name,
      title: m.nameAr,
      date: m.date,
      victims: m.victims,
      location: `${m.location.cityAr}، ${m.location.countryAr}`,
      isMassacre: true,
      aiSummary: m.descriptionAr,
    }));

export const LiveNewsFeed = () => {
  const { isAr } = useLang();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let mounted = true;

    const getNews = async () => {
      if (mounted) setLoading(true);
      try {
        const liveArticles = await fetchAndAnalyzeLiveEvents();
        if (mounted) {
          if (liveArticles.length > 0) {
            setEvents(liveArticles);
            setIsLive(true);
          } else {
            setEvents(buildFallbackEvents());
            setIsLive(false);
          }
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setEvents(buildFallbackEvents());
          setIsLive(false);
          setLoading(false);
        }
      }
    };

    getNews();
    const interval = setInterval(getNews, 3600000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (loading && events.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto p-4 flex justify-center py-10">
        <div className="animate-spin w-6 h-6 border-2 border-blood border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <section className="relative px-4 sm:px-6 w-full max-w-4xl mx-auto mb-16 pt-8 z-10">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="bg-red-900/10 border-s-4 border-blood rounded-r-xl p-5 sm:p-6 backdrop-blur-md shadow-[0_0_30px_rgba(139,0,0,0.15)] overflow-hidden relative"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-blood/20 rounded-full blur-3xl animate-pulse pointer-events-none" />

        {/* Header with Live/Archive Badge */}
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-3 h-3">
              <div className={`absolute w-full h-full rounded-full animate-ping opacity-75 ${isLive ? 'bg-red-500' : 'bg-amber-600'}`} />
              <div className={`relative w-2 h-2 rounded-full ${isLive ? 'bg-red-600' : 'bg-amber-500'}`} />
            </div>
            <h3 className={`text-blood-light font-bold text-lg sm:text-xl uppercase tracking-wider ${isAr ? 'font-arabic' : 'font-display'}`}>
              {isAr ? 'رادار الأحداث - توثيق مستمر للمجازر' : 'EVENT RADAR - Ongoing Atrocities'}
            </h3>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-mono border ${
            isLive
              ? 'text-green-400 border-green-700 bg-green-900/20'
              : 'text-amber-400 border-amber-700 bg-amber-900/20'
          }`}>
            {isLive ? '🟢 LIVE' : (isAr ? '📁 أرشيف محلي' : '📁 ARCHIVE MODE')}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <AnimatePresence>
            {events.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: isAr ? 30 : -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className="group relative bg-black/40 border border-white/5 rounded-lg p-4 hover:border-blood/50 hover:bg-black/60 transition-all cursor-pointer"
                onClick={() => window.open(item.url, '_blank')}
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 text-xs font-mono text-gray-500">
                      <span>{new Date(item.date).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <span className="text-gray-700 mx-1">•</span>
                      <span>{item.source}</span>
                    </div>
                    <p className={`text-white text-base sm:text-lg font-medium leading-tight mb-2 ${isAr ? 'font-arabic' : 'font-display'}`}>
                      {item.aiSummary || item.title}
                    </p>
                  </div>

                  <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0">
                    <div className="px-3 py-1 bg-blood/20 border border-blood/30 rounded-full text-blood text-sm font-bold flex items-center gap-1.5 whitespace-nowrap">
                      <span>☠</span>
                      <span dir="ltr">+{item.victims}</span>
                    </div>
                    {item.location && (
                      <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-gray-400 text-xs flex items-center gap-1.5 whitespace-nowrap">
                        <span>📍</span>
                        <span>{item.location}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-gray-500 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {isAr ? 'اضغط لقراءة المصدر الأصلي...' : 'Click to read original source...'}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
};

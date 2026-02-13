'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { GlassCard } from '@/components/ui/GlassCard';
import { RulesModal } from '@/components/RulesModal';
import { Sparkles, Users, Info, Globe, Loader2, ArrowRight, LayoutGrid } from 'lucide-react';
import { Language } from '@/types/game';

export default function Home() {
  const { t, language, setLanguage } = useLanguage();
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [lobbyCode, setLobbyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [error, setError] = useState('');

  const generateCode = () => Math.random().toString(36).substring(2, 6).toUpperCase();

  const handleCreateGame = async () => {
    if (!nickname) {
      setError('Nickname required');
      return;
    }
    setLoading(true);
    const code = generateCode();

    try {
      // 1. Create Game
      const { data: game, error: gameError } = await supabase
        .from('twenty_games')
        .insert([{ code, status: 'LOBBY' }])
        .select()
        .single();

      if (gameError) throw gameError;

      // 2. Create Host Player
      const { data: player, error: playerError } = await supabase
        .from('twenty_players')
        .insert([{
          game_id: game.id,
          nickname,
          is_host: true
        }])
        .select()
        .single();

      if (playerError) throw playerError;

      // 3. Save to local storage for persistence
      localStorage.setItem('twenty_player_id', player.id);

      router.push(`/game/${code}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleJoinGame = async () => {
    if (!nickname || !lobbyCode) {
      setError('Nickname and Code required');
      return;
    }
    setLoading(true);

    try {
      // 1. Find Game
      const { data: game, error: gameError } = await supabase
        .from('twenty_games')
        .select('id, status')
        .eq('code', lobbyCode.toUpperCase())
        .single();

      if (gameError || !game) throw new Error('Lobby not found');

      // 2. Create Player
      const { data: player, error: playerError } = await supabase
        .from('twenty_players')
        .insert([{
          game_id: game.id,
          nickname,
          is_host: false
        }])
        .select()
        .single();

      if (playerError) throw playerError;

      localStorage.setItem('twenty_player_id', player.id);
      router.push(`/game/${lobbyCode.toUpperCase()}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const languageOptions: { id: Language; label: string; flag: string }[] = [
    { id: 'fr', label: 'Français', flag: '🇫🇷' },
    { id: 'en', label: 'English', flag: '🇺🇸' },
    { id: 'es_mx', label: 'Español (MX)', flag: '🇲🇽' },
  ];

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-6 sm:p-12 overflow-hidden">
      {/* Home Button */}
      <div className="fixed top-8 left-8 z-40">
        <button
          onClick={() => window.location.href = 'https://games-platform-hub.vercel.app/'}
          className="p-4 glass-card rounded-2xl flex items-center gap-2 hover:bg-white/10 transition-all group"
          title="Retour au menu"
        >
          <LayoutGrid size={20} className="text-blue-400 group-hover:text-blue-300 transition-colors" />
        </button>
      </div>

      {/* Settings / Floating Menu */}
      <div className="fixed top-8 right-8 flex gap-4 z-40">
        <div className="relative group">
          <button className="p-4 glass-card rounded-2xl flex items-center gap-2 hover:bg-white/10 transition-all">
            <Globe size={20} className="text-purple-400" />
            <span className="hidden sm:inline font-medium">{languageOptions.find(l => l.id === language)?.flag}</span>
          </button>
          <div className="absolute right-0 top-full mt-4 opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300">
            <div className="glass-card p-2 flex flex-col gap-1 min-w-[160px]">
              {languageOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setLanguage(opt.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all ${language === opt.id ? 'bg-purple-500/20 text-purple-300' : 'hover:bg-white/5'}`}
                >
                  {opt.flag} {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowRules(true)}
          className="p-4 glass-card rounded-2xl flex items-center gap-2 hover:bg-white/10 transition-all"
        >
          <Info size={20} className="text-pink-400" />
          <span className="hidden sm:inline font-medium">{t.rules}</span>
        </button>
      </div>

      {/* Hero */}
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="text-center mb-16 relative"
      >
        <div className="absolute inset-0 -top-20 blur-[100px] bg-purple-600/30 rounded-full scale-150 animate-pulse" />
        <h1 className="relative z-10 text-7xl sm:text-9xl font-black italic tracking-tighter text-gradient leading-none mb-4">
          {t.title}
        </h1>
        <p className="relative z-10 text-white/50 text-xl font-light tracking-[0.4em] uppercase">
          {t.subtitle}
        </p>
      </motion.div>

      {/* Main UI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl z-10">
        {/* Nickname & Setup */}
        <div className="md:col-span-2 flex justify-center mb-4">
          <div className="relative w-full max-w-md">
            <input
              type="text"
              placeholder={t.placeholderNickname}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full text-center text-3xl font-bold bg-transparent border-b-2 border-white/10 py-4 outline-none focus:border-purple-500/50 transition-all placeholder:text-white/20 placeholder:font-light"
            />
          </div>
        </div>

        {/* Create Card */}
        <GlassCard className="p-8 aspect-video flex flex-col items-center justify-between group">
          <div className="p-6 bg-purple-500/10 rounded-[2rem] group-hover:scale-110 transition-transform duration-500">
            <Sparkles size={48} className="text-purple-400" />
          </div>
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-2">{t.createGame}</h2>
            <p className="text-white/40">{t.waitingHost}</p>
          </div>
          <button
            onClick={handleCreateGame}
            disabled={loading}
            className="glass-button w-full flex items-center justify-center gap-3"
          >
            {loading ? <Loader2 className="animate-spin" /> : <ArrowRight size={20} />}
            {t.createGame}
          </button>
        </GlassCard>

        {/* Join Card */}
        <GlassCard className="p-8 aspect-video flex flex-col items-center justify-between group">
          <div className="p-6 bg-pink-500/10 rounded-[2rem] group-hover:scale-110 transition-transform duration-500">
            <Users size={48} className="text-pink-400" />
          </div>
          <div className="w-full space-y-4 text-center">
            <h2 className="text-3xl font-bold">{t.joinGame}</h2>
            <input
              type="text"
              placeholder={t.placeholderCode}
              maxLength={4}
              value={lobbyCode}
              onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-center text-3xl font-mono tracking-[0.4em] focus:border-pink-500/50 outline-none transition-all placeholder:tracking-normal placeholder:text-sm placeholder:font-sans"
            />
          </div>
          <button
            onClick={handleJoinGame}
            disabled={loading || lobbyCode.length !== 4}
            className="glass-button w-full flex items-center justify-center gap-3 disabled:opacity-20"
          >
            {loading ? <Loader2 className="animate-spin" /> : <ArrowRight size={20} />}
            {t.joinGame}
          </button>
        </GlassCard>
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 text-pink-400 font-bold bg-pink-500/10 px-6 py-3 rounded-full border border-pink-500/20"
        >
          {error}
        </motion.p>
      )}

      {/* Rules Modal */}
      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />

      {/* Decorative */}
      <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[80vw] h-48 bg-purple-500/10 blur-[100px] rounded-full" />
    </div>
  );
}

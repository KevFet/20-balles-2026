'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/LanguageContext';
import { GlassCard } from '@/components/ui/GlassCard';
import { Game, Player, Item } from '@/types/game';
import { Loader2, Users, Send, TrendingUp, Trophy, ArrowRight, ShieldAlert } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function GamePage() {
    const { code } = useParams();
    const { t, language } = useLanguage();
    const router = useRouter();

    const [game, setGame] = useState<Game | null>(null);
    const [players, setPlayers] = useState<Player[]>([]);
    const [me, setMe] = useState<Player | null>(null);
    const [currentItem, setCurrentItem] = useState<Item | null>(null);
    const [estimation, setEstimation] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitted, setSubmitted] = useState(false);

    // 1. Initial Load & Persistence
    useEffect(() => {
        const fetchData = async () => {
            const playerId = localStorage.getItem('twenty_player_id');
            if (!playerId) {
                router.push('/');
                return;
            }

            // Get Game
            const { data: gameData } = await supabase
                .from('twenty_games')
                .select('*')
                .eq('code', code)
                .single();

            if (!gameData) {
                router.push('/');
                return;
            }
            setGame(gameData);

            // Get Me
            const { data: myData } = await supabase
                .from('twenty_players')
                .select('*')
                .eq('id', playerId)
                .single();

            setMe(myData);

            // Get Item if estimation phase
            if (gameData.current_item_id) {
                fetchItem(gameData.current_item_id);
            }

            setLoading(false);
        };

        fetchData();
    }, [code, router]);

    const fetchItem = async (itemId: string) => {
        const { data } = await supabase
            .from('twenty_items')
            .select('*')
            .eq('id', itemId)
            .single();
        setCurrentItem(data);
    };

    // 2. Realtime Subscriptions
    useEffect(() => {
        if (!game) return;

        // Listen for Game changes
        const gameSub = supabase
            .channel('game_channel')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'twenty_games', filter: `id=eq.${game.id}` }, (payload) => {
                setGame(payload.new as Game);
                if (payload.new.status === 'ESTIMATION') {
                    setSubmitted(false);
                    setEstimation('');
                    fetchItem(payload.new.current_item_id);
                }
            })
            .subscribe();

        // Listen for Players changes
        const playerSub = supabase
            .channel('players_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'twenty_players', filter: `game_id=eq.${game.id}` }, async () => {
                const { data } = await supabase
                    .from('twenty_players')
                    .select('*')
                    .eq('game_id', game.id)
                    .order('joined_at', { ascending: true });
                setPlayers(data || []);

                // Update 'me'
                const myId = localStorage.getItem('twenty_player_id');
                const updatedMe = data?.find(p => p.id === myId);
                if (updatedMe) setMe(updatedMe);
            })
            .subscribe();

        // Initial player fetch
        supabase.from('twenty_players').select('*').eq('game_id', game.id).order('joined_at', { ascending: true })
            .then(({ data }) => setPlayers(data || []));

        return () => {
            gameSub.unsubscribe();
            playerSub.unsubscribe();
        };
    }, [game]);

    // Actions
    const handleStartGame = async () => {
        // Pick random item
        const { data: items } = await supabase.from('twenty_items').select('id');
        const randomItem = items![Math.floor(Math.random() * items!.length)];

        await supabase
            .from('twenty_games')
            .update({
                status: 'ESTIMATION',
                current_item_id: randomItem.id
            })
            .eq('id', game!.id);

        // Reset player estimations
        await supabase
            .from('twenty_players')
            .update({ last_estimation: null })
            .eq('game_id', game!.id);
    };

    const handleSubmitEstimation = async () => {
        if (!estimation || isNaN(parseFloat(estimation))) return;
        setSubmitted(true);
        await supabase
            .from('twenty_players')
            .update({ last_estimation: parseFloat(estimation) })
            .eq('id', me!.id);

        // Check if everyone submitted (if host)
        if (me?.is_host) {
            setTimeout(async () => {
                const { data: latestPlayers } = await supabase
                    .from('twenty_players')
                    .select('last_estimation')
                    .eq('game_id', game!.id);

                if (latestPlayers?.every(p => p.last_estimation !== null)) {
                    handleShowResults();
                }
            }, 1000);
        }
    };

    const handleShowResults = async () => {
        await supabase
            .from('twenty_games')
            .update({ status: 'RESULTS' })
            .eq('id', game!.id);

        // Logic for scoring is handled when game state turns to RESULTS (locally or via side effect)
        // Actually, let's do it here for the host to update scores
        if (me?.is_host) {
            calculateAndApplyScores();
        }
    };

    const calculateAndApplyScores = async () => {
        const { data: pData } = await supabase
            .from('twenty_players')
            .select('*')
            .eq('game_id', game!.id);

        if (!pData || pData.length < 2) return;

        const ests = pData.map(p => p.last_estimation || 0).sort((a, b) => a - b);
        const median = ests[Math.floor(ests.length / 2)];
        const minEst = ests[0];
        const maxEst = ests[ests.length - 1];

        // Find winners and losers
        const updates = pData.map(p => {
            const e = p.last_estimation || 0;
            let addedPoints = 0;

            const isExtreme = e === minEst || e === maxEst;

            if (!isExtreme) {
                addedPoints = 5; // Base points for being "reasonable"

                // Check if closest to median
                const diffs = pData.map(player => Math.abs((player.last_estimation || 0) - median));
                const minDiff = Math.min(...diffs);
                if (Math.abs(e - median) === minDiff) {
                    addedPoints += 20; // Raking the "mise"
                }
            }

            return {
                id: p.id,
                score: p.score + addedPoints
            };
        });

        for (const update of updates) {
            await supabase.from('twenty_players').update({ score: update.score }).eq('id', update.id);
        }

        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#8b5cf6', '#ec4899', '#3b82f6']
        });
    };

    const resultsInfo = useMemo(() => {
        if (game?.status !== 'RESULTS') return null;
        const ests = players.map(p => p.last_estimation || 0).sort((a, b) => a - b);
        const median = ests[Math.floor(ests.length / 2)];
        const minEst = ests[0];
        const maxEst = ests[ests.length - 1];

        const diffs = players.map(p => Math.abs((p.last_estimation || 0) - median));
        const minDiff = Math.min(...diffs);
        const winners = players.filter(p => Math.abs((p.last_estimation || 0) - median) === minDiff && (p.last_estimation !== minEst && p.last_estimation !== maxEst || players.length <= 2));

        return { median, minEst, maxEst, winners };
    }, [game, players]);

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-purple-500" size={48} /></div>;

    return (
        <div className="min-h-screen p-4 sm:p-12">
            {/* Header Stat Bar */}
            <div className="fixed top-6 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-40">
                <div className="glass-card px-8 py-4 flex justify-between items-center overflow-hidden">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold">
                            {me?.nickname[0]}
                        </div>
                        <div>
                            <p className="text-xs text-white/40 uppercase tracking-widest">{t.score}</p>
                            <p className="font-black text-xl">{me?.score} <span className="text-sm text-white/50">{t.pts}</span></p>
                        </div>
                    </div>

                    <div className="text-center hidden sm:block">
                        <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Status</p>
                        <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-xs font-bold text-purple-400">
                            {game?.status}
                        </div>
                    </div>

                    <div className="flex -space-x-3">
                        {players.slice(0, 5).map(p => (
                            <div key={p.id} className="w-10 h-10 rounded-full border-2 border-zinc-900 bg-zinc-800 flex items-center justify-center text-xs font-bold" title={p.nickname}>
                                {p.nickname[0]}
                            </div>
                        ))}
                        {players.length > 5 && (
                            <div className="w-10 h-10 rounded-full border-2 border-zinc-900 bg-zinc-700 flex items-center justify-center text-xs font-bold">
                                +{players.length - 5}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-28 flex flex-col items-center">
                <AnimatePresence mode="wait">
                    {game?.status === 'LOBBY' && (
                        <motion.div
                            key="lobby"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.1 }}
                            className="w-full max-w-2xl text-center"
                        >
                            <h2 className="text-6xl font-black text-gradient italic mb-8">{t.lobbyTitle}</h2>
                            <GlassCard className="p-10 mb-8 space-y-6">
                                <p className="text-white/50 text-xl">{t.shareCode}</p>
                                <div className="text-7xl font-mono font-black tracking-[0.5em] text-accent">
                                    {game.code}
                                </div>
                            </GlassCard>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-12">
                                {players.map((p, i) => (
                                    <GlassCard key={p.id} delay={i * 0.1} className="p-4 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs">
                                            {p.is_host ? '👑' : '🕹️'}
                                        </div>
                                        <span className="font-bold truncate">{p.nickname}</span>
                                    </GlassCard>
                                ))}
                            </div>

                            {me?.is_host ? (
                                <button
                                    onClick={handleStartGame}
                                    className="glass-button w-full text-2xl py-6"
                                >
                                    {t.startGame}
                                </button>
                            ) : (
                                <p className="text-white/40 italic animate-pulse">{t.waitingHost}</p>
                            )}
                        </motion.div>
                    )}

                    {game?.status === 'ESTIMATION' && currentItem && (
                        <motion.div
                            key="estimation"
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -50 }}
                            className="w-full max-w-xl"
                        >
                            <h2 className="text-3xl font-black text-center mb-10 tracking-widest uppercase text-white/30">{t.estimationTitle}</h2>

                            <GlassCard className="mb-8 overflow-hidden group">
                                <div className="aspect-square bg-white/5 flex flex-col items-center justify-center p-12 text-center relative">
                                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent opacity-60" />
                                    <motion.div
                                        initial={{ scale: 0.5, rotate: -10 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: "spring", stiffness: 200 }}
                                        className="relative z-10"
                                    >
                                        {/* Image placeholder or real image */}
                                        <div className="text-[120px] mb-4">📦</div>
                                    </motion.div>
                                    <h3 className="relative z-10 text-5xl font-black text-white mb-2">
                                        {language === 'fr' ? currentItem.name_fr : language === 'en' ? currentItem.name_en : currentItem.name_es_mx}
                                    </h3>
                                    <p className="relative z-10 text-2xl text-accent font-bold italic">
                                        {language === 'fr' ? currentItem.adj_fr : language === 'en' ? currentItem.adj_en : currentItem.adj_es_mx}
                                    </p>
                                </div>
                            </GlassCard>

                            <div className="flex gap-4">
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    value={estimation}
                                    onChange={(e) => setEstimation(e.target.value)}
                                    disabled={submitted}
                                    className="glass-input flex-1 text-4xl font-black text-center"
                                />
                                <button
                                    onClick={handleSubmitEstimation}
                                    disabled={submitted || !estimation}
                                    className="glass-button p-6 aspect-square flex items-center justify-center disabled:opacity-30"
                                >
                                    {submitted ? <Loader2 className="animate-spin" /> : <Send />}
                                </button>
                            </div>

                            {submitted && <p className="text-center mt-6 text-white/40 italic">{t.waitingPlayers}</p>}
                        </motion.div>
                    )}

                    {game?.status === 'RESULTS' && resultsInfo && (
                        <motion.div
                            key="results"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="w-full max-w-5xl"
                        >
                            <h2 className="text-6xl font-black text-center text-gradient italic mb-12">{t.resultsTitle}</h2>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                                {/* Median Card */}
                                <GlassCard className="p-8 flex flex-col items-center justify-center text-center bg-purple-500/10 border-purple-500/30">
                                    <TrendingUp className="text-purple-400 mb-4" size={48} />
                                    <p className="text-white/40 uppercase tracking-widest text-sm">{t.medianPrice}</p>
                                    <p className="text-6xl font-black">{resultsInfo.median}{t.currency}</p>
                                </GlassCard>

                                {/* Winner Card */}
                                <GlassCard className="p-8 flex flex-col items-center justify-center text-center bg-zinc-800/40 col-span-1 md:col-span-2 overflow-hidden relative">
                                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 to-transparent pointer-events-none" />
                                    <Trophy className="text-yellow-400 mb-4" size={48} />
                                    <p className="text-white/40 uppercase tracking-widest text-sm mb-4">{t.mostReasonable}</p>
                                    <div className="flex flex-wrap justify-center gap-4">
                                        {resultsInfo.winners.map(w => (
                                            <div key={w.id} className="flex flex-col items-center">
                                                <span className="text-3xl font-bold">{w.nickname}</span>
                                                <span className="text-white/30 text-sm">{w.last_estimation}{t.currency}</span>
                                            </div>
                                        ))}
                                    </div>
                                </GlassCard>
                            </div>

                            {/* Bento grid for others */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {players.map((p, i) => {
                                    const isExtreme = p.last_estimation === resultsInfo.minEst || p.last_estimation === resultsInfo.maxEst;
                                    return (
                                        <GlassCard key={p.id} delay={i * 0.1} className={`p-4 ${isExtreme ? 'border-red-500/30 bg-red-500/5' : ''}`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-bold truncate max-w-[80px]">{p.nickname}</span>
                                                {isExtreme && <ShieldAlert size={16} className="text-red-500" />}
                                            </div>
                                            <p className="text-2xl font-black">{p.last_estimation}{t.currency}</p>
                                            {isExtreme && <p className="text-[10px] text-red-500 font-bold uppercase mt-1">{t.extremePlayer}</p>}
                                        </GlassCard>
                                    );
                                })}
                            </div>

                            {me?.is_host && (
                                <div className="mt-12 flex justify-center">
                                    <button onClick={handleStartGame} className="glass-button px-16 group">
                                        {t.nextRound}
                                        <ArrowRight className="inline ml-2 group-hover:translate-x-2 transition-transform" />
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

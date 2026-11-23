import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTrading } from '../context/TradingContext';
import { MarketSymbol } from '../types/trading';
import { MAX_GLOBAL_LEVERAGE, WHITELIST_PERPS } from '../services/riskConstants';
import {
  Wallet,
  Power,
  TrendingUp,
  Volume2,
  VolumeX,
  Square,
  Download,
  Search,
  ChevronDown,
} from 'lucide-react';

interface HeaderProps {
  currentTab: 'terminal' | 'quant' | 'chat' | 'knowledge' | 'vault' | 'wallet' | 'export';
  setCurrentTab: (tab: 'terminal' | 'quant' | 'chat' | 'knowledge' | 'vault' | 'wallet' | 'export') => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, setCurrentTab }) => {
  const {
    activeSymbol,
    setActiveSymbol,
    markets,
    wallet,
    setIsWalletModalOpen,
    isAutoBotActive,
    toggleAutoBot,
    isTTSPlaying,
    stopTTS,
    isVoiceNarratorEnabled,
    toggleVoiceNarrator,
    isGuideLiveScanActive,
    isLiveOrderFlowConnected,
    openHashVerifier,
    arbitragePositions,
    openConnectionModal,
    openApkModal,
  } = useTrading();

  const curMarket = markets[activeSymbol] || Object.values(markets)[0];
  const isPositive = (curMarket?.change24h || 0) >= 0;
  const effectiveUsdc = Math.max(wallet.hyperliquidAccountValue || 0, wallet.balances.USDC || 0);

  const [isMarketMenuOpen, setIsMarketMenuOpen] = useState(false);
  const [marketSearch, setMarketSearch] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMarketMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const allSortedMarkets = useMemo(() => {
    const q = marketSearch.trim().toUpperCase();
    return Object.values(markets)
      .filter((m) => m && m.price > 0)
      .filter((m) => !q || m.symbol.toUpperCase().includes(q) || m.name.toUpperCase().includes(q))
      .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
  }, [markets, marketSearch]);

  const quickSymbols = useMemo(() => {
    const defaults: MarketSymbol[] = [...WHITELIST_PERPS];
    const available = defaults.filter((s) => markets[s]?.price > 0);
    const base = available.length > 0 ? available : defaults;
    if (!base.includes(activeSymbol)) {
      return [activeSymbol, ...base.slice(0, 3)];
    }
    return base;
  }, [markets, activeSymbol]);

  const totalMarketsCount = Object.values(markets).filter((m) => m?.price > 0).length;
  const fmtPrice = (p: number) =>
    p < 0.01
      ? p.toFixed(6)
      : p < 1
      ? p.toFixed(4)
      : p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <header className="border-b border-white/10 bg-[#07070a]/95 backdrop-blur-xl text-white sticky top-0 z-40 select-none">
      {/* Row 1: Brand + Market Picker + Inline Metrics + Primary Actions */}
      <div className="max-w-[1680px] mx-auto px-3 sm:px-5 py-2.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 lg:gap-6">
        {/* Zone 1: Brand & Market Selector (full width split on mobile/tablet so price has plenty of space) */}
        <div className="flex items-center justify-between lg:justify-start gap-3 min-w-0 w-full lg:w-auto">
          <button
            type="button"
            onClick={() => setCurrentTab('terminal')}
            className="flex items-center gap-2.5 cursor-pointer shrink-0 text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-[#16100b] border border-amber-500/60 flex items-center justify-center shrink-0">
              <span className="text-amber-400 font-black text-sm tracking-tighter">TM</span>
            </div>
            <span className="font-black text-sm tracking-wide text-amber-200 uppercase font-mono whitespace-nowrap">
              SCARFACE L1
            </span>
          </button>

          {/* Market Picker */}
          <div
            ref={menuRef}
            className="relative flex items-center bg-white/[0.04] border border-white/10 rounded-lg p-0.5 shrink-0"
          >
            <div className="hidden 2xl:flex items-center gap-0.5">
              {quickSymbols.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setActiveSymbol(sym)}
                  className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    activeSymbol === sym
                      ? 'bg-amber-500 text-black font-black'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {sym.replace('-PERP', '')}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsMarketMenuOpen((o) => !o)}
              className="px-2.5 py-1 text-xs font-mono font-bold rounded-md text-zinc-100 hover:bg-white/5 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="Explorar todos los tokens perpetuos de Hyperliquid L1"
            >
              <span className="2xl:hidden font-black">{activeSymbol.replace('-PERP', '')}</span>
              <span className="text-zinc-500 text-[10px] hidden sm:inline tabular-nums">({totalMarketsCount})</span>
              <span className="xl:hidden text-amber-300 font-bold tabular-nums text-[11px]">
                ${fmtPrice(curMarket?.price || 0)}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
            </button>

            {isMarketMenuOpen && (
              <div className="absolute right-0 lg:left-0 lg:right-auto top-10 w-72 sm:w-96 bg-[#0d0a08] border border-amber-500/40 rounded-xl shadow-2xl z-50 overflow-hidden font-mono">
                <div className="p-2.5 border-b border-white/10 bg-black/60 flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    value={marketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                    placeholder="Buscar token (BTC, DOGE, PEPE, XRP...)"
                    className="w-full bg-transparent text-xs text-white focus:outline-none placeholder-zinc-500"
                  />
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
                  {allSortedMarkets.slice(0, 80).map((m) => {
                    const up = m.change24h >= 0;
                    const apy = +(m.fundingRate * 3 * 365 * 100).toFixed(1);
                    return (
                      <button
                        key={m.symbol}
                        type="button"
                        onClick={() => {
                          setActiveSymbol(m.symbol);
                          setIsMarketMenuOpen(false);
                          setMarketSearch('');
                        }}
                        className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-white/5 cursor-pointer transition-colors ${
                          activeSymbol === m.symbol ? 'bg-amber-500/10' : ''
                        }`}
                      >
                        <div>
                          <div className="text-xs font-black text-white">
                            {m.symbol.replace('-PERP', '')}
                            <span className="text-[10px] text-zinc-500 font-normal ml-1.5">{m.maxLeverage}x</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 tabular-nums">
                            Vol ${(m.volume24h / 1e6).toFixed(1)}M · Fnd {apy}% APY
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          <div className="text-xs font-bold text-amber-200">${fmtPrice(m.price)}</div>
                          <div className={`text-[10px] font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                            {up ? '+' : ''}
                            {m.change24h}%
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Zone 2: Clean Inline Market Telemetry (XL+ Desktop, unboxed) */}
        <div className="hidden xl:flex items-center gap-5 text-xs font-mono tabular-nums text-zinc-400">
          <div>
            <span className="text-[10px] text-zinc-500 mr-1.5">{activeSymbol}</span>
            <span className="font-black text-white">${fmtPrice(curMarket?.price || 0)}</span>
          </div>
          <span className="text-zinc-800">|</span>
          <div className={`font-bold flex items-center gap-1 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            <TrendingUp className={`w-3 h-3 ${!isPositive && 'rotate-180'}`} />
            <span>
              {isPositive ? '+' : ''}
              {curMarket?.change24h || 0}%
            </span>
          </div>
          <span className="text-zinc-800">|</span>
          <div>
            <span className="text-[10px] text-zinc-500 mr-1.5">Vol 24h</span>
            <span className="text-zinc-200 font-bold">${((curMarket?.volume24h || 0) / 1e6).toFixed(1)}M</span>
          </div>
          <span className="text-zinc-800">|</span>
          <div>
            <span className="text-[10px] text-zinc-500 mr-1.5">Tope App</span>
            <span className="text-amber-300 font-bold">{MAX_GLOBAL_LEVERAGE}x Max</span>
          </div>
        </div>

        {/* Zone 3: Uncrowded Action Cluster (own full-width row on mobile/tablet, right-aligned on lg+) */}
        <div className="flex items-center justify-between lg:justify-end gap-2 sm:gap-2.5 shrink-0 font-mono w-full lg:w-auto pt-2 lg:pt-0 border-t border-white/5 lg:border-t-0">
          {/* Primary Autonomy Switch */}
          <button
            type="button"
            onClick={toggleAutoBot}
            className={`px-3 py-1.5 rounded-lg font-black text-[11px] tracking-wide transition-colors flex items-center gap-1.5 border cursor-pointer whitespace-nowrap shrink-0 ${
              isAutoBotActive
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black border-emerald-300'
                : 'bg-[#1a110c] hover:bg-[#271810] text-amber-200 border-amber-500/50'
            }`}
            title="Prender o apagar la autonomía del Cerebro EV+"
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isAutoBotActive ? 'Autonomía ON' : 'Autonomía OFF'}</span>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Voice Narrator Master Toggle + Quick Stop */}
            <button
              type="button"
              onClick={toggleVoiceNarrator}
              className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1.5 border cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                isVoiceNarratorEnabled
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-500/50'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 border-white/10'
              }`}
              title={
                isVoiceNarratorEnabled
                  ? 'Narrador en vivo ACTIVADO (toca para silenciar)'
                  : 'Narrador en vivo APAGADO (toca para activar)'
              }
            >
              {isVoiceNarratorEnabled ? (
                <Volume2 className={`w-3.5 h-3.5 text-amber-400 ${isTTSPlaying ? 'animate-pulse' : ''}`} />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
              )}
              <span className="hidden sm:inline">{isVoiceNarratorEnabled ? 'Voz ON' : 'Voz OFF'}</span>
            </button>

            {isTTSPlaying && (
              <button
                type="button"
                onClick={stopTTS}
                className="px-2 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                title="Detener lectura actual"
              >
                <Square className="w-3 h-3 fill-current" />
                <span className="hidden md:inline">Callar</span>
              </button>
            )}

            {/* Wallet / Balances */}
            <button
              type="button"
              onClick={() => setIsWalletModalOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              title="Configurar Cuenta Master, API Wallet Perps y ver balances L1"
            >
              <Wallet className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold text-emerald-400 tabular-nums">
                ${effectiveUsdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </button>

            {/* APK Download */}
            <button
              type="button"
              onClick={openApkModal}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/50 text-amber-200 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              title="Descargar APK Android Funcional v2.5"
            >
              <Download className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Descargar APK</span>
              <span className="sm:hidden">APK</span>
              <span className="text-[10px] text-emerald-400 font-black">v2.5</span>
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Clean Typographic Navigation + L1 Health */}
      <div className="max-w-[1680px] mx-auto px-3 sm:px-5 border-t border-white/5 flex items-center justify-between gap-4 overflow-x-auto no-scrollbar">
        <nav className="flex items-center gap-5 py-2 shrink-0 text-xs font-medium">
          {[
            { id: 'terminal' as const, label: 'Terminal' },
            { id: 'quant' as const, label: 'Quant Pro' },
            { id: 'chat' as const, label: 'Despacho Tony', tts: isTTSPlaying },
            { id: 'knowledge' as const, label: 'Guía EV+', activeDot: isGuideLiveScanActive },
            {
              id: 'vault' as const,
              label: 'Delta-0 & Bóveda',
              activeDot: arbitragePositions.some((p) => p.status === 'ACTIVE'),
            },
            { id: 'wallet' as const, label: 'API & Balances' },
            { id: 'export' as const, label: 'Dossier Master' },
          ].map((item) => {
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentTab(item.id)}
                className={`pb-0.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  active
                    ? 'border-amber-400 text-amber-200 font-bold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-100'
                }`}
              >
                <span>{item.label}</span>
                {item.tts && <Volume2 className="w-3 h-3 text-amber-400" />}
                {item.activeDot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => openHashVerifier()}
            className="pb-0.5 border-b-2 border-transparent text-zinc-400 hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Verificar Hash
          </button>
        </nav>

        <button
          type="button"
          onClick={openConnectionModal}
          className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
          title="Verificar conexiones Hyperliquid L1 en vivo"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isLiveOrderFlowConnected ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          <span className={isLiveOrderFlowConnected ? 'text-emerald-400 font-bold' : 'text-amber-300'}>
            {isLiveOrderFlowConnected ? 'Mainnet L1' : 'Conectando'}
          </span>
        </button>
      </div>
    </header>
  );
};

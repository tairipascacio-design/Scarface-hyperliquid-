import React, { useState, useEffect, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { Volume2, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import { isWhitelistedSymbol, MAX_GLOBAL_LEVERAGE } from '../services/riskConstants';

export const LiveTonyVerdictBanner: React.FC = () => {
  const {
    activeSymbol,
    setActiveSymbol,
    markets,
    unifiedBrainMetrics,
    guideAnalysis,
    playTTS,
    stopTTS,
    isTTSPlaying,
    scanMode,
    setScanMode,
    marketOpportunities,
    scannedTokensCount,
  } = useTrading();

  const [lastTick, setLastTick] = useState<number>(Date.now());
  const [secondsAgo, setSecondsAgo] = useState<number>(0);

  const curMarket = markets[activeSymbol] || Object.values(markets)[0];
  const whitelistOpportunities = marketOpportunities.filter((o) => isWhitelistedSymbol(o.symbol));
  const radarOpportunities = whitelistOpportunities.length > 0 ? whitelistOpportunities : marketOpportunities;
  const topGlobal = radarOpportunities[0] || null;
  const useGlobalLeader = scanMode === 'ALL_TOKENS' && Boolean(topGlobal);

  const displayData = useMemo(() => {
    if (useGlobalLeader && topGlobal) {
      if (topGlobal.symbol === activeSymbol && unifiedBrainMetrics) {
        const px = curMarket?.price || topGlobal.price;
        return {
          symbol: activeSymbol,
          price: px,
          score: unifiedBrainMetrics.compositeScore,
          verdict: unifiedBrainMetrics.verdict,
          action: unifiedBrainMetrics.action,
          confidence: unifiedBrainMetrics.confidence,
          leverage: Math.min(MAX_GLOBAL_LEVERAGE, unifiedBrainMetrics.suggestedLeverage || MAX_GLOBAL_LEVERAGE),
          takeProfit: unifiedBrainMetrics.takeProfitPrice,
          stopLoss: unifiedBrainMetrics.stopLossPrice,
          evApproved: unifiedBrainMetrics.positiveEntryApproved,
          expectedValuePct: unifiedBrainMetrics.expectedValuePct,
          riskRewardRatio: unifiedBrainMetrics.riskRewardRatio,
          rsiLabel: `RSI ${unifiedBrainMetrics.rsi14} · ${unifiedBrainMetrics.emaTrend}`,
          subMeta: `${unifiedBrainMetrics.alignedPillars}/4 TFs`,
          synthesis:
            unifiedBrainMetrics.tonyActionableSynthesis ||
            guideAnalysis?.actionableSynthesis ||
            '',
        };
      }

      const px = topGlobal.price;
      const pxDec = px < 0.01 ? 6 : px < 1 ? 4 : px < 10 ? 3 : 2;
      const rr = 2.5;
      const slDist = 0.018;
      const tpDist = slDist * rr;
      const lev = Math.min(MAX_GLOBAL_LEVERAGE, topGlobal.maxLeverage || MAX_GLOBAL_LEVERAGE);

      let tp = px;
      let sl = px;
      if (topGlobal.action === 'LONG' && px > 0) {
        tp = +(px * (1 + tpDist)).toFixed(pxDec);
        sl = +(px * (1 - slDist)).toFixed(pxDec);
      } else if (topGlobal.action === 'SHORT' && px > 0) {
        tp = +(px * (1 - tpDist)).toFixed(pxDec);
        sl = +(px * (1 + slDist)).toFixed(pxDec);
      }

      const verdictMap =
        topGlobal.action === 'DELTA_NEUTRAL'
          ? 'DELTA_NEUTRAL_ARBITRAGE'
          : topGlobal.action === 'LONG'
          ? topGlobal.score >= 55
            ? 'STRONG_BUY'
            : 'BUY'
          : topGlobal.action === 'SHORT'
          ? topGlobal.score <= -55
            ? 'STRONG_SELL'
            : 'SELL'
          : 'NEUTRAL_WAIT';

      const actionLabel =
        topGlobal.action === 'LONG'
          ? 'COMPRA LONG (LÍDER EV+ GLOBAL)'
          : topGlobal.action === 'SHORT'
          ? 'VENTA SHORT (LÍDER EV+ GLOBAL)'
          : topGlobal.action === 'DELTA_NEUTRAL'
          ? 'ARBITRAJE DELTA-0 (LÍDER FUNDING)'
          : 'ESPERANDO SETUP EV+ EN EL MERCADO';

      const runners = radarOpportunities
        .slice(1, 4)
        .filter((o) => o.positiveEntryApproved)
        .map((o) => `${o.coin} (${o.action} +${o.expectedValuePct}% EV)`)
        .join(', ');

      const synthesis = `El líder del tablero es ${topGlobal.symbol} a $${px.toFixed(pxDec)} (${topGlobal.change24h >= 0 ? '+' : ''}${topGlobal.change24h}% 24h). Acción: ${actionLabel} (${lev}x) · TP $${tp} · SL $${sl}. ${topGlobal.reason}.${runners ? ` Siguen en mira: ${runners}.` : ''}`;

      return {
        symbol: topGlobal.symbol,
        price: px,
        score: topGlobal.score,
        verdict: verdictMap,
        action: topGlobal.action,
        confidence: topGlobal.confidence,
        leverage: lev,
        takeProfit: tp,
        stopLoss: sl,
        evApproved: topGlobal.positiveEntryApproved,
        expectedValuePct: topGlobal.expectedValuePct,
        riskRewardRatio: rr,
        rsiLabel: `24h ${topGlobal.change24h >= 0 ? '+' : ''}${topGlobal.change24h}% · Funding ${topGlobal.fundingApy}%`,
        subMeta: `Top #1 de ${scannedTokensCount} L1`,
        synthesis,
      };
    }

    const px = curMarket?.price || 0;
    const pxDec = px < 0.01 ? 6 : px < 1 ? 4 : 2;
    return {
      symbol: activeSymbol,
      price: px,
      score: unifiedBrainMetrics?.compositeScore || 0,
      verdict: unifiedBrainMetrics?.verdict || 'NEUTRAL_WAIT',
      action: unifiedBrainMetrics?.action || 'WAIT',
      confidence: unifiedBrainMetrics?.confidence || 0,
      leverage: Math.min(MAX_GLOBAL_LEVERAGE, unifiedBrainMetrics?.suggestedLeverage || 0),
      takeProfit: unifiedBrainMetrics?.takeProfitPrice || 0,
      stopLoss: unifiedBrainMetrics?.stopLossPrice || 0,
      evApproved: Boolean(unifiedBrainMetrics?.positiveEntryApproved),
      expectedValuePct: unifiedBrainMetrics?.expectedValuePct || 0,
      riskRewardRatio: unifiedBrainMetrics?.riskRewardRatio || 2.5,
      rsiLabel: `RSI ${unifiedBrainMetrics?.rsi14 ?? 50} · ${unifiedBrainMetrics?.emaTrend || 'NEUTRAL'}`,
      subMeta: `${unifiedBrainMetrics?.alignedPillars ?? 0}/4 TFs`,
      synthesis:
        unifiedBrainMetrics?.tonyActionableSynthesis ||
        guideAnalysis?.actionableSynthesis ||
        (px > 0
          ? `${activeSymbol} en $${px.toFixed(pxDec)}: Esperando confluencia EV+ positiva de los pilares antes de autorizar entrada.`
          : `Conectando flujo L1 en tiempo real de Hyperliquid para ${activeSymbol}...`),
    };
  }, [
    useGlobalLeader,
    topGlobal,
    activeSymbol,
    curMarket?.price,
    unifiedBrainMetrics,
    guideAnalysis?.actionableSynthesis,
    radarOpportunities,
    scannedTokensCount,
  ]);

  useEffect(() => {
    setLastTick(Date.now());
  }, [displayData.symbol, displayData.price, displayData.score, topGlobal?.scannedAt]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastTick) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastTick]);

  const pxDec = displayData.price < 0.01 ? 6 : displayData.price < 1 ? 4 : 2;
  const isBuy = displayData.action === 'LONG';
  const isSell = displayData.action === 'SHORT';
  const isDeltaNeutral = displayData.action === 'DELTA_NEUTRAL';

  const tpPct =
    displayData.price > 0 && displayData.takeProfit > 0
      ? ((displayData.takeProfit / displayData.price - 1) * 100).toFixed(2)
      : '0.00';
  const slPct =
    displayData.price > 0 && displayData.stopLoss > 0
      ? ((displayData.stopLoss / displayData.price - 1) * 100).toFixed(2)
      : '0.00';

  const topRadarSpeech = radarOpportunities
    .slice(0, 4)
    .map((o) => `${o.coin} ${o.action} con EV más ${o.expectedValuePct} por ciento`)
    .join(', ');

  const fullSpokenVerdict = `${displayData.synthesis}. Score ${displayData.score} de 100, EV esperado ${displayData.expectedValuePct} por ciento, convicción ${displayData.confidence} por ciento, Take Profit en ${displayData.takeProfit} dólares y Stop Loss en ${displayData.stopLoss} dólares.${topRadarSpeech ? ` En el radar top: ${topRadarSpeech}.` : ''}`;

  return (
    <section className="bg-[#0c0a09] border border-white/10 rounded-xl overflow-hidden font-mono">
      {/* Header Row: Title + Unboxed Live Metadata + 2 Clean Controls */}
      <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-black text-amber-200">
            <span>Veredicto en Vivo · Tony Montana</span>
            <span className="text-zinc-600">·</span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-bold ${
                isDeltaNeutral
                  ? 'text-amber-300'
                  : isBuy
                  ? 'text-emerald-400'
                  : isSell
                  ? 'text-red-400'
                  : 'text-zinc-400'
              }`}
            >
              {isBuy && <TrendingUp className="w-3.5 h-3.5" />}
              {isSell && <TrendingDown className="w-3.5 h-3.5" />}
              {isDeltaNeutral && <Layers className="w-3.5 h-3.5" />}
              <span>
                {isDeltaNeutral
                  ? `${displayData.symbol.replace('-PERP', '')} DELTA-0`
                  : isBuy
                  ? `${displayData.symbol.replace('-PERP', '')} LONG (${displayData.leverage}x)`
                  : isSell
                  ? `${displayData.symbol.replace('-PERP', '')} SHORT (${displayData.leverage}x)`
                  : 'ESPERAR SETUP EV+'}
              </span>
            </span>
          </div>

          <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-1.5 tabular-nums">
            <button
              type="button"
              onClick={() => setActiveSymbol(displayData.symbol)}
              className="text-white font-bold hover:text-amber-300 underline decoration-amber-500/50 cursor-pointer"
            >
              {displayData.symbol}
            </button>
            <span>${displayData.price.toFixed(pxDec)}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">{displayData.rsiLabel}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400">Hace {secondsAgo}s</span>
          </div>
        </div>

        {/* Clean 2-control right bar */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-white/[0.04] rounded-lg p-0.5 border border-white/10 text-[11px]">
            <button
              type="button"
              onClick={() => setScanMode('ALL_TOKENS')}
              className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                scanMode === 'ALL_TOKENS' ? 'bg-amber-500 text-black font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Todos ({scannedTokensCount})
            </button>
            <button
              type="button"
              onClick={() => setScanMode('ACTIVE_ONLY')}
              className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                scanMode === 'ACTIVE_ONLY' ? 'bg-amber-500 text-black font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Solo {activeSymbol.replace('-PERP', '')}
            </button>
          </div>

          <button
            type="button"
            onClick={() => (isTTSPlaying ? stopTTS() : playTTS(fullSpokenVerdict, { interrupt: true, force: true }))}
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-amber-300 border border-white/10 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title={isTTSPlaying ? 'Detener lectura de Tony' : 'Escuchar veredicto completo y radar con voz de Tony'}
          >
            <Volume2 className={`w-3.5 h-3.5 text-amber-400 ${isTTSPlaying ? 'animate-bounce' : ''}`} />
            <span>{isTTSPlaying ? 'Detener' : 'Escuchar'}</span>
          </button>
        </div>
      </div>

      {/* Body Split: Synthesis Prose (Left) + Unified 4-Metric Strip (Right) */}
      <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        <div
          onClick={() => playTTS(fullSpokenVerdict, { interrupt: true, force: true })}
          className="lg:col-span-7 space-y-1.5 cursor-pointer hover:text-white transition-colors"
          title="Haz clic aquí para que Tony lea todo el veredicto y métricas"
        >
          <p className="text-xs sm:text-[13px] text-zinc-200 leading-relaxed font-sans">
            {displayData.synthesis}
          </p>
        </div>

        <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-4 border border-white/10 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-white/10 bg-black/30 text-center tabular-nums">
          <div className="p-2.5 border-r border-white/10 sm:border-r-0">
            <div className="text-[10px] text-zinc-500">Score / EV+</div>
            <div className={`text-xs font-black mt-0.5 ${displayData.score >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {displayData.score > 0 ? `+${displayData.score}` : displayData.score}
            </div>
            <div className="text-[10px] text-cyan-300">
              {displayData.expectedValuePct > 0 ? '+' : ''}
              {displayData.expectedValuePct}%
            </div>
          </div>

          <div className="p-2.5">
            <div className="text-[10px] text-zinc-500">Convicción</div>
            <div className="text-xs font-black text-amber-300 mt-0.5">{displayData.confidence}%</div>
            <div className="text-[10px] text-zinc-500 truncate">{displayData.subMeta}</div>
          </div>

          <div className="p-2.5 border-r border-white/10 sm:border-r-0">
            <div className="text-[10px] text-zinc-500">Take Profit</div>
            <div className="text-xs font-black text-emerald-400 mt-0.5">${displayData.takeProfit}</div>
            <div className="text-[10px] text-zinc-500">
              {Number(tpPct) >= 0 ? '+' : ''}
              {tpPct}%
            </div>
          </div>

          <div className="p-2.5">
            <div className="text-[10px] text-zinc-500">Stop Loss</div>
            <div className="text-xs font-black text-rose-400 mt-0.5">${displayData.stopLoss}</div>
            <div className="text-[10px] text-zinc-500">{slPct}%</div>
          </div>
        </div>
      </div>

      {/* Clean Quick-Select Top Tokens Row */}
      {radarOpportunities.length > 0 && (
        <div className="px-4 sm:px-5 py-2.5 border-t border-white/5 flex items-center gap-4 overflow-x-auto no-scrollbar text-[11px] tabular-nums">
          <span className="text-zinc-500 font-semibold shrink-0">Top Radar (Whitelist):</span>
          {radarOpportunities.slice(0, 4).map((opp) => {
            const pDec = opp.price < 0.01 ? 6 : opp.price < 1 ? 4 : 2;
            const isSel = opp.symbol === activeSymbol;
            return (
              <button
                key={opp.symbol}
                type="button"
                onClick={() => setActiveSymbol(opp.symbol)}
                className={`shrink-0 cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  isSel ? 'text-amber-300 font-bold underline underline-offset-4' : 'text-zinc-300 hover:text-white'
                }`}
              >
                <span className="font-bold">{opp.coin}</span>
                <span className="text-zinc-500">${opp.price.toFixed(pDec)}</span>
                <span
                  className={
                    opp.action === 'LONG'
                      ? 'text-emerald-400 font-bold'
                      : opp.action === 'SHORT'
                      ? 'text-red-400 font-bold'
                      : opp.action === 'DELTA_NEUTRAL'
                      ? 'text-amber-300 font-bold'
                      : 'text-zinc-500'
                  }
                >
                  {opp.action} +{opp.expectedValuePct}%
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

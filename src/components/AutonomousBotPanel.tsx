import React from 'react';
import { useTrading } from '../context/TradingContext';
import { Power, Radio, ShieldCheck, Volume2 } from 'lucide-react';
import {
  MAX_GLOBAL_LEVERAGE,
  BE_TRIGGER_R,
  BE_PRICE_BUFFER_PCT,
  WHITELIST_PERPS,
} from '../services/riskConstants';

export const AutonomousBotPanel: React.FC = () => {
  const {
    isAutoBotActive,
    toggleAutoBot,
    riskProfile,
    setRiskProfile,
    maxMarginPct,
    setMaxMarginPct,
    wallet,
    aiLogs,
    triggerManualAIScan,
    openHashVerifier,
    unifiedBrainMetrics,
    activeSymbol,
    setActiveSymbol,
    markets,
    openConnectionModal,
    scanMode,
    setScanMode,
    marketOpportunities,
    scannedTokensCount,
    isScanningAllMarkets,
    liveEnsemble,
    botBrainMode,
    setBotBrainMode,
    riskState,
    playTTS,
    stopTTS,
    isTTSPlaying,
    isGuideLiveScanActive,
    toggleGuideLiveScan,
    guideAnalysis,
  } = useTrading();

  const effectiveUsdc = Math.max(wallet.hyperliquidAccountValue || 0, wallet.balances.USDC || 0);
  const allowedMarginUsd = ((effectiveUsdc * maxMarginPct) / 100).toFixed(2);
  const curMarket = markets[activeSymbol] || Object.values(markets)[0];

  const score = unifiedBrainMetrics ? unifiedBrainMetrics.compositeScore : 0;
  const evApproved = Boolean(unifiedBrainMetrics?.positiveEntryApproved);
  const fullBrainSpeech = `Cerebro Maestro EV+ para ${activeSymbol}. Score ${score} de 100, ${evApproved ? 'entrada EV positiva aprobada' : 'filtro EV en espera'}. ${unifiedBrainMetrics?.rationale || 'Sincronizando datos L1.'} Estrategia activa ${liveEnsemble?.selectedStrategyName || 'Multistrategia'}, régimen ${liveEnsemble?.regime || 'desconocido'}. Drawdown diario ${riskState.dailyLossPct} por ciento de ${riskState.config.maxDailyLossPct} por ciento.`;

  return (
    <section className="bg-[#0c0a09] border border-white/10 rounded-xl overflow-hidden flex flex-col h-full font-mono divide-y divide-white/10">
      {/* 1. Primary Autonomy Header */}
      <div className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black text-amber-200 tracking-tight">
              Sistema Autónomo de Trading L1
            </h3>
            <span className="text-xs text-zinc-500 tabular-nums">
              · {scannedTokensCount || 0} Mercados L1
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">
            {isAutoBotActive
              ? `Operando en vivo con $${allowedMarginUsd} USDC (${maxMarginPct}% disponible), apertura automática L1 y gestión TP/SL.`
              : 'Apagado. Préndelo para que use tu capital disponible y ejecute órdenes reales automáticamente en L1.'}
            {' · '}
            <button
              type="button"
              onClick={openConnectionModal}
              className="text-amber-300 hover:text-amber-200 underline cursor-pointer"
            >
              Auditar L1
            </button>
          </p>
        </div>

        <button
          type="button"
          onClick={toggleAutoBot}
          className={`px-4 py-2.5 rounded-lg font-black text-xs tracking-wide flex items-center justify-center gap-2 transition-colors border cursor-pointer whitespace-nowrap shrink-0 ${
            isAutoBotActive
              ? 'bg-emerald-500 hover:bg-emerald-400 text-black border-emerald-300'
              : 'bg-amber-500 hover:bg-amber-400 text-black border-amber-300'
          }`}
        >
          <Power className="w-4 h-4" />
          <span>{isAutoBotActive ? 'Autonomía ON' : 'Prender Autonomía'}</span>
        </button>
      </div>

      {/* 2. Unified EV+ Strategy Summary & 7-Pillar Table (Flat hairline grid) */}
      <div className="p-4 sm:px-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-zinc-200">
            Cerebro Maestro EV+ · <span className="text-amber-300">{activeSymbol}</span>
          </span>
          <div className="flex items-center gap-2.5 tabular-nums text-[11px]">
            <span className={evApproved ? 'text-emerald-400 font-bold' : 'text-amber-300 font-semibold'}>
              {evApproved ? 'Entrada EV+ Aprobada' : 'Filtro EV+ en Espera'}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="font-black text-white">{score > 0 ? `+${score}` : score} / 100</span>
            <button
              type="button"
              onClick={() => (isTTSPlaying ? stopTTS() : playTTS(fullBrainSpeech, { interrupt: true, force: true }))}
              className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
              title="Escuchar diagnóstico completo del Cerebro Maestro"
            >
              <Volume2 className="w-3 h-3 text-amber-400" />
              <span>{isTTSPlaying ? 'Detener' : 'Escuchar'}</span>
            </button>
          </div>
        </div>

        <p
          onClick={() => playTTS(fullBrainSpeech, { interrupt: true, force: true })}
          className="text-[11px] text-zinc-400 hover:text-zinc-200 leading-relaxed font-sans cursor-pointer transition-colors"
          title="Haz clic para que Tony lea todo el análisis"
        >
          {unifiedBrainMetrics?.rationale ||
            'Sincronizando velas y libro L2 de Hyperliquid para evaluar los 7 pilares EV+...'}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 border border-white/10 rounded-lg divide-x divide-y divide-white/5 bg-black/25 text-[11px] tabular-nums">
          <div className="p-2.5">
            <div className="text-[10px] text-zinc-500">1. EV+ Neto ({unifiedBrainMetrics?.alignedPillars ?? 0}/5)</div>
            <div className="font-black text-emerald-300 mt-0.5">
              {unifiedBrainMetrics
                ? `${unifiedBrainMetrics.expectedValuePct > 0 ? '+' : ''}${unifiedBrainMetrics.expectedValuePct}% (${unifiedBrainMetrics.riskRewardRatio}:1)`
                : '0.00% (0:1)'}
            </div>
          </div>

          <div className="p-2.5">
            <div className="text-[10px] text-zinc-500">2. {unifiedBrainMetrics?.emaTrend || 'NEUTRAL'}</div>
            <div className="font-black text-amber-300 mt-0.5">RSI {unifiedBrainMetrics?.rsi14 ?? 50}</div>
          </div>

          <div className="p-2.5">
            <div className="text-[10px] text-zinc-500">3. Funding APY</div>
            <div className="font-black text-amber-200 mt-0.5">
              {unifiedBrainMetrics
                ? `${unifiedBrainMetrics.fundingRateApy}%`
                : `${((curMarket?.fundingRate || 0) * 3 * 365 * 100).toFixed(1)}%`}
            </div>
          </div>

          <div className="p-2.5">
            <div className="text-[10px] text-zinc-500">4. Murallas L2</div>
            <div className="font-black text-cyan-300 mt-0.5">
              {unifiedBrainMetrics ? `${unifiedBrainMetrics.orderbookImbalanceRatio}x` : '0.00x'}
            </div>
          </div>

          <div className="p-2.5">
            <div className="text-[10px] text-zinc-500">5. CVD Tape Flow</div>
            <div
              className={`font-black mt-0.5 ${
                (unifiedBrainMetrics?.cvdMomentumPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {unifiedBrainMetrics
                ? `${unifiedBrainMetrics.cvdMomentumPct > 0 ? '+' : ''}${unifiedBrainMetrics.cvdMomentumPct}%`
                : '0.0%'}
            </div>
          </div>

          <div className="p-2.5">
            <div className="text-[10px] text-zinc-500">6. VWAP · Squeeze {unifiedBrainMetrics?.squeezeProbability ?? 0}%</div>
            <div className="font-black text-zinc-200 mt-0.5">
              {unifiedBrainMetrics
                ? `${unifiedBrainMetrics.vwapDistancePct > 0 ? '+' : ''}${unifiedBrainMetrics.vwapDistancePct}%`
                : '0.00%'}
            </div>
          </div>

          <div className="p-2.5 col-span-2">
            <div className="text-[10px] text-zinc-500">7. Auto-Optimizador · Coste L1</div>
            <div className="font-black text-emerald-300 mt-0.5">
              {unifiedBrainMetrics?.optimizer
                ? `${unifiedBrainMetrics.optimizer.modeLabel === 'MODO DEFENSIVO ANTI-RACHA' ? 'Defensivo' : unifiedBrainMetrics.optimizer.modeLabel === 'TURBO TENDENCIA' ? 'Turbo' : 'Óptimo'} · Max ${unifiedBrainMetrics.optimizer.dynamicLeverageCap}x · Coste ${unifiedBrainMetrics.optimizer.feeAndSpreadCostPct}%`
                : `WinRate ${unifiedBrainMetrics?.historicalWinRatePct ?? 0}% · R:R ${unifiedBrainMetrics?.riskRewardRatio ?? 0}:1`}
            </div>
          </div>
        </div>

        {unifiedBrainMetrics?.optimizer && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 pt-1 tabular-nums">
            <span>
              Calibración: <strong className="text-amber-300">{unifiedBrainMetrics.optimizer.modeLabel}</strong>
              {' · '}Exige Score &ge; {unifiedBrainMetrics.optimizer.minScoreThreshold} y {unifiedBrainMetrics.optimizer.minPillarsRequired}/5 pilares
            </span>
            <span>
              {unifiedBrainMetrics.optimizer.cooldownSymbols.length > 0
                ? `Cooldown activo: ${unifiedBrainMetrics.optimizer.cooldownSymbols.map((s) => s.replace('-PERP', '')).join(', ')}`
                : `Seguro Break-Even L1 (+${BE_TRIGGER_R}R / +${(BE_PRICE_BUFFER_PCT * 100).toFixed(2)}% fees) + Trailing (+1.5R) activos`}
            </span>
          </div>
        )}

        {/* Compact Quant Decision + Hybrid Brain + Risk DD Bar */}
        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[10px] tabular-nums">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-zinc-500">Cerebro:</span>
            {(['HYBRID', 'QUANT', 'AI'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBotBrainMode(mode)}
                className={`px-2 py-0.5 rounded font-bold border transition-colors cursor-pointer ${
                  botBrainMode === mode
                    ? 'bg-amber-500 text-black border-amber-300'
                    : 'bg-white/[0.03] text-zinc-400 border-white/10 hover:text-white'
                }`}
              >
                {mode === 'HYBRID' ? 'Híbrido' : mode === 'QUANT' ? 'Quant' : 'IA'}
              </button>
            ))}
            <span className="text-zinc-600 hidden sm:inline">|</span>
            <span className="text-zinc-300">
              Estrategia:{' '}
              <strong className="text-amber-300">
                {liveEnsemble?.selectedStrategyName || 'Sincronizando 10 módulos'}
              </strong>
              {liveEnsemble ? ` (${liveEnsemble.calibratedScore}/100 · ${liveEnsemble.regime})` : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleGuideLiveScan}
              className={`px-2 py-0.5 rounded font-bold border transition-colors cursor-pointer ${
                isGuideLiveScanActive
                  ? 'bg-cyan-950/70 text-cyan-300 border-cyan-600/60 hover:bg-cyan-900/70'
                  : 'bg-white/[0.03] text-zinc-400 border-white/10 hover:text-white'
              }`}
              title="Guía de Internet escaneando junto con el Cerebro Quant incluso al salir de Guía EV+"
            >
              Guía Internet: {isGuideLiveScanActive ? `ON (${guideAnalysis?.internetWisdom?.sentimentScore ?? 50}%)` : 'OFF'}
            </button>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">
              Trades:{' '}
              <strong className={riskState.tradesTodayCount >= riskState.maxTradesPerDay ? 'text-amber-300' : 'text-zinc-200'}>
                {riskState.tradesTodayCount}/{riskState.maxTradesPerDay}
              </strong>
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">
              DD Diario:{' '}
              <strong className={riskState.dailyLossPct >= riskState.config.maxDailyLossPct * 0.8 ? 'text-red-400' : 'text-zinc-200'}>
                {riskState.dailyLossPct}% / {riskState.config.maxDailyLossPct}%
              </strong>
            </span>
            <span className="text-zinc-600">·</span>
            <span className={`font-bold ${riskState.dailyDrawdownBreached || (riskState.pauseUntilMs && Date.now() < riskState.pauseUntilMs) ? 'text-amber-300' : 'text-emerald-400'}`}>
              {riskState.pauseUntilMs && Date.now() < riskState.pauseUntilMs
                ? 'Pausa 3-SL (2h)'
                : riskState.dailyDrawdownBreached
                ? 'DD en Vigilancia'
                : 'Riesgo OK'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Risk Profile & Capital Allocation Controls */}
      <div className="p-4 sm:px-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Risk Profile */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-zinc-300">Perfil de Riesgo</span>
            <span className="text-amber-300 font-bold">{riskProfile}</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 bg-white/[0.03] p-1 rounded-lg border border-white/10">
            {(['Conservative', 'Balanced', 'Aggressive'] as const).map((prof) => (
              <button
                key={prof}
                type="button"
                onClick={() => setRiskProfile(prof)}
                className={`py-1.5 px-2 text-[11px] font-bold rounded-md transition-colors cursor-pointer text-center whitespace-nowrap ${
                  riskProfile === prof ? 'bg-amber-500 text-black font-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {prof === 'Conservative' ? 'Conservador' : prof === 'Balanced' ? 'Capo' : 'Imperio'}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-zinc-500">
            {riskProfile === 'Conservative' && `1x–${MAX_GLOBAL_LEVERAGE}x máximo, Stop 1.5x ATR (≤2.5%) y Break-Even +${BE_TRIGGER_R}R.`}
            {riskProfile === 'Balanced' && `Tope ${MAX_GLOBAL_LEVERAGE}x global · Nocional controlado $12–$15 y Trailing +1.5R.`}
            {riskProfile === 'Aggressive' && `Tope ${MAX_GLOBAL_LEVERAGE}x global · Filtro EV+ estricto (≥4x fees) y TP Único +2.5R.`}
          </p>
        </div>

        {/* Max Allocation & Immediate Trade Trigger */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
            <span className="font-bold text-zinc-300">Capital a Operar</span>
            <span className="text-emerald-400 font-black">
              {maxMarginPct}% (${allowedMarginUsd} USDC)
            </span>
          </div>

          <input
            type="range"
            min="10"
            max="80"
            step="5"
            value={Math.min(80, maxMarginPct)}
            onChange={(e) => setMaxMarginPct(Math.min(80, parseInt(e.target.value, 10) || 40))}
            className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-800 rounded"
          />

          <button
            type="button"
            onClick={triggerManualAIScan}
            disabled={!isAutoBotActive || isScanningAllMarkets}
            className="w-full py-2 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-bold text-xs border border-amber-500/45 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Radio className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {isScanningAllMarkets
                ? 'Ejecutando orden autónoma en L1...'
                : 'Ejecutar Trade Autónomo Ahora'}
            </span>
          </button>
        </div>
      </div>

      {/* 4. Multi-Token Radar (Compact Clean Rows) */}
      <div className="p-4 sm:px-5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-zinc-200">
            Radar Multi-Token ({scannedTokensCount} L1)
          </span>

          <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-white/10 text-[10px]">
            <button
              type="button"
              onClick={() => setScanMode('ALL_TOKENS')}
              className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                scanMode === 'ALL_TOKENS' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Todos ({scannedTokensCount})
            </button>
            <button
              type="button"
              onClick={() => setScanMode('ACTIVE_ONLY')}
              className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                scanMode === 'ACTIVE_ONLY' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Solo {activeSymbol.replace('-PERP', '')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-white/10 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-white/5 bg-black/25 tabular-nums">
          {marketOpportunities
            .filter((o) => (WHITELIST_PERPS as readonly string[]).includes(o.symbol))
            .slice(0, 4)
            .map((opp) => {
            const isSelected = opp.symbol === activeSymbol;
            const priceStr =
              opp.price < 0.01 ? opp.price.toFixed(6) : opp.price < 1 ? opp.price.toFixed(4) : opp.price.toFixed(2);
            return (
              <button
                key={opp.symbol}
                type="button"
                onClick={() => setActiveSymbol(opp.symbol)}
                className={`p-2.5 text-left transition-colors cursor-pointer space-y-1 ${
                  isSelected ? 'bg-amber-500/10' : 'hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-black text-white">
                    {opp.coin} <span className="text-[10px] text-zinc-500 font-normal">{Math.min(MAX_GLOBAL_LEVERAGE, opp.maxLeverage)}x</span>
                  </span>
                  <span
                    className={`text-[10px] font-black ${
                      opp.action === 'LONG'
                        ? 'text-emerald-400'
                        : opp.action === 'SHORT'
                        ? 'text-red-400'
                        : opp.action === 'DELTA_NEUTRAL'
                        ? 'text-amber-300'
                        : 'text-zinc-400'
                    }`}
                  >
                    {opp.action}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-amber-200 font-bold">${priceStr}</span>
                  <span className="text-cyan-300">EV +{opp.expectedValuePct}%</span>
                </div>
              </button>
            );
          })}
          {marketOpportunities.length === 0 && (
            <div className="col-span-full text-center text-xs text-zinc-500 py-3">
              Cargando universo completo de Hyperliquid L1...
            </div>
          )}
        </div>
      </div>

      {/* 5. Clean Telemetry Log */}
      <div className="p-4 sm:px-5 space-y-2 flex-1 flex flex-col">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span className="font-bold">Registro del Cerebro</span>
          <span className="text-[11px] tabular-nums">{aiLogs.length} eventos</span>
        </div>

        <div className="h-36 overflow-y-auto divide-y divide-white/5 text-xs pr-1">
          {aiLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-zinc-500 text-xs text-center">
              Presiona “Prender Autonomía” para iniciar el escaneo y ejecución L1.
            </div>
          ) : (
            aiLogs.map((log) => (
              <div
                key={log.id}
                onClick={() => playTTS(`${log.type} en ${log.symbol}. ${log.message}`, { interrupt: true, force: true })}
                className="py-2 space-y-1 text-[11px] cursor-pointer hover:bg-white/[0.03] px-1 rounded transition-colors group"
                title="Haz clic para escuchar este evento completo"
              >
                <div className="flex items-center justify-between text-[10px] tabular-nums">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5">
                    <span>{log.type} · {log.symbol}</span>
                    <Volume2 className="w-3 h-3 text-amber-400/60 group-hover:text-amber-300" />
                  </span>
                  <span className="text-zinc-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-zinc-300 leading-relaxed font-sans">{log.message}</p>
                {log.details?.txHash && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openHashVerifier(log.details.txHash);
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 hover:text-amber-200 underline cursor-pointer"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>Verificar TX {log.details.txHash.slice(0, 8)}...</span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

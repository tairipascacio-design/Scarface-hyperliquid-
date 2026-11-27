import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { BotBrainMode, BotExecutionMode, DecisionTier } from '../types/trading';
import {
  MAX_GLOBAL_LEVERAGE,
  PARTIAL_TP_MIN_NOTIONAL_USDC,
  WHITELIST_TIMEFRAMES,
} from '../services/riskConstants';
import {
  Activity,
  Download,
  Lock,
  Play,
  RefreshCw,
  ShieldAlert,
  Volume2,
} from 'lucide-react';

type SubView = 'strategies' | 'risk' | 'journal' | 'walkforward';

const REGIME_LABELS: Record<string, string> = {
  BULL_TREND: 'Tendencia Alcista',
  BEAR_TREND: 'Tendencia Bajista',
  RANGE_LATERAL: 'Rango Lateral',
  HIGH_VOLATILITY: 'Alta Volatilidad',
};

const TIER_LABELS: Record<DecisionTier, string> = {
  NO_OPERAR: '0–49 · No Operar',
  ESPERAR_CONFIRMACION: '50–64 · Esperar Confirmación',
  SENAL_VALIDA: '65–79 · Señal Válida',
  CONFLUENCIA_ALTA: '80–100 · Confluencia Alta',
};

export const QuantEngineTab: React.FC = () => {
  const {
    activeSymbol,
    timeframe,
    positions,
    liveEnsemble,
    botBrainMode,
    setBotBrainMode,
    botExecutionMode,
    setBotExecutionMode,
    riskConfig,
    setRiskConfig,
    riskState,
    quantJournal,
    walkForwardStats,
    isRunningWalkForward,
    runWalkForwardBacktest,
    isAutoBotActive,
    toggleAutoBot,
    closeAllPositions,
    openApkModal,
    playTTS,
    stopTTS,
    isTTSPlaying,
  } = useTrading();

  const [subView, setSubView] = useState<SubView>('strategies');

  const fmtPx = (p: number | undefined) => {
    if (!p || p <= 0) return '$0.00';
    return p < 0.01 ? `$${p.toFixed(6)}` : p < 1 ? `$${p.toFixed(4)}` : `$${p.toFixed(2)}`;
  };

  const fmtExpiry = (ts: number | undefined) => {
    if (!ts) return '--:--';
    const mins = Math.max(0, Math.round((ts - Date.now()) / 60000));
    return `${mins} min`;
  };

  return (
    <div className="space-y-4 max-w-[1680px] mx-auto pb-12 font-mono text-zinc-200">
      {/* Top Executive Control Strip */}
      <section className="bg-[#0c0a09] border border-white/10 rounded-xl p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <h2 className="text-base sm:text-lg font-bold text-amber-200 tracking-tight">
              Motor Cuantitativo Multi-Estrategia
            </h2>
            <span className="text-zinc-500">·</span>
            <span className="text-emerald-400 font-bold">Ejecución Real Hyperliquid L1 (Sin Paper)</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400 tabular-nums">
              {activeSymbol} ({timeframe})
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-sans">
            Sistema coordinado de 10 estrategias independientes, filtrado multi-temporal (5m–4h), cálculo de tamaño controlado ($12–$15 nocional · tope {MAX_GLOBAL_LEVERAGE}x), TP único +2.5R / Trailing +1.5R (&lt; ${PARTIAL_TP_MIN_NOTIONAL_USDC}) o parciales (&ge; ${PARTIAL_TP_MIN_NOTIONAL_USDC}) en Mainnet y validación Walk-Forward.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={openApkModal}
            className="px-3.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-amber-500/40 text-amber-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Descargar APK v2.5</span>
          </button>

          <button
            type="button"
            onClick={toggleAutoBot}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 border cursor-pointer whitespace-nowrap ${
              isAutoBotActive
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black border-emerald-300'
                : 'bg-amber-500 hover:bg-amber-400 text-black border-amber-300'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isAutoBotActive ? 'Autonomía Live ON' : 'Activar Live L1'}</span>
          </button>
        </div>
      </section>

      {/* Architecture Selector + Live Decision Pipeline */}
      <section className="bg-[#0c0a09] border border-white/10 rounded-xl divide-y divide-white/10">
        <div className="p-4 sm:px-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Architecture Config (Brain & Execution Mode) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-300">1. Tipo de Cerebro</span>
                <span className="text-amber-300 font-bold">{botBrainMode}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 bg-white/[0.03] p-1 rounded-lg border border-white/10">
                {([
                  { id: 'HYBRID', label: 'Híbrido (Rec.)' },
                  { id: 'QUANT', label: 'Cuantitativo' },
                  { id: 'AI', label: 'IA + Filtro' },
                ] as Array<{ id: BotBrainMode; label: string }>).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setBotBrainMode(m.id)}
                    className={`py-1.5 px-2 text-[11px] font-bold rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                      botBrainMode === m.id ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-300">2. Cómo Operar</span>
                <span className="text-cyan-300 font-bold">{botExecutionMode}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 bg-white/[0.03] p-1 rounded-lg border border-white/10">
                {([
                  { id: 'MULTI_STRATEGY', label: 'Multistrategia' },
                  { id: 'CONSENSUS', label: 'Consenso' },
                  { id: 'INDEPENDENT', label: 'Independiente' },
                ] as Array<{ id: BotExecutionMode; label: string }>).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setBotExecutionMode(e.id)}
                    className={`py-1.5 px-2 text-[11px] font-bold rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                      botExecutionMode === e.id ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Coordinated Decision Pipeline & Calibration */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-zinc-200">
                Veredicto del Cerebro Central ·{' '}
                <span className="text-amber-300">{liveEnsemble?.selectedStrategyName || 'Evaluando...'}</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-[11px] text-zinc-400">
                  Régimen: <strong className="text-white">{REGIME_LABELS[liveEnsemble?.regime || 'RANGE_LATERAL']}</strong>
                  {' · '}
                  {liveEnsemble ? TIER_LABELS[liveEnsemble.decisionTier] : 'Calculando...'}
                </span>
                {liveEnsemble && (
                  <button
                    type="button"
                    onClick={() =>
                      isTTSPlaying
                        ? stopTTS()
                        : playTTS(
                            `Veredicto Quant para ${activeSymbol}. Estrategia ${liveEnsemble.selectedStrategyName}, dirección ${liveEnsemble.direction}, score ${liveEnsemble.calibratedScore} de 100, régimen ${REGIME_LABELS[liveEnsemble.regime]}. Multi-timeframe ${liveEnsemble.mtf.alignedCount} de 4 alineados. Correlación BTC ${liveEnsemble.indicators.btcCorrelation}. Stop Loss en ${fmtPx(liveEnsemble.stopLoss)}, TP1 en ${fmtPx(liveEnsemble.tp1)}, TP2 en ${fmtPx(liveEnsemble.tp2)}, TP3 en ${fmtPx(liveEnsemble.tp3)}. ${liveEnsemble.justification}`,
                            { interrupt: true, force: true }
                          )
                    }
                    className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-amber-300 font-bold flex items-center gap-1 cursor-pointer text-[11px]"
                    title="Escuchar veredicto completo del Cerebro Central"
                  >
                    <Volume2 className="w-3 h-3 text-amber-400" />
                    <span>{isTTSPlaying ? 'Detener' : 'Escuchar'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 border border-white/10 rounded-lg divide-x divide-y sm:divide-y-0 divide-white/10 bg-black/30 tabular-nums text-xs">
              <div className="p-2.5">
                <div className="text-[10px] text-zinc-500">Dirección & Score</div>
                <div
                  className={`font-bold mt-0.5 ${
                    liveEnsemble?.direction === 'LONG'
                      ? 'text-emerald-400'
                      : liveEnsemble?.direction === 'SHORT'
                      ? 'text-red-400'
                      : 'text-amber-300'
                  }`}
                >
                  {liveEnsemble?.direction || 'WAIT'} · {liveEnsemble?.calibratedScore ?? 0}/100
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  WR Calibrado {liveEnsemble?.historicalCalibrationWr ?? 0}%
                </div>
              </div>

              <div className="p-2.5">
                <div className="text-[10px] text-zinc-500">Multi-Timeframe (4 TFs)</div>
                <div className="font-bold text-white mt-0.5">
                  {liveEnsemble?.mtf.alignedCount ?? 0}/4 · {liveEnsemble?.mtf.dominantDirection || 'NEUTRAL'}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
                  5m {liveEnsemble?.mtf.m5.slice(0, 1)} / 15m {liveEnsemble?.mtf.m15.slice(0, 1)} / 1h {liveEnsemble?.mtf.h1.slice(0, 1)} / 4h {liveEnsemble?.mtf.h4.slice(0, 1)}
                </div>
              </div>

              <div className="p-2.5">
                <div className="text-[10px] text-zinc-500">Correlación BTC & CVD</div>
                <div className="font-bold text-cyan-300 mt-0.5">
                  ρ {liveEnsemble?.indicators.btcCorrelation ?? 0} ({liveEnsemble?.indicators.btcDirection || 'NEUTRAL'})
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  CVD {liveEnsemble?.indicators.cvdMomentumPct ?? 0}% · L2 {liveEnsemble?.indicators.orderbookRatio ?? 1}x
                </div>
              </div>

              <div className="p-2.5">
                <div className="text-[10px] text-zinc-500">Plan +2.5R & Tope {MAX_GLOBAL_LEVERAGE}x</div>
                <div className="font-bold text-emerald-300 mt-0.5">
                  {Math.min(MAX_GLOBAL_LEVERAGE, liveEnsemble?.suggestedRiskLeverage ?? MAX_GLOBAL_LEVERAGE)}x · ${liveEnsemble?.riskAmountUsdc ?? 0} riesgo
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  SL {fmtPx(liveEnsemble?.stopLoss)} · TP {fmtPx(liveEnsemble?.tp3)}
                </div>
              </div>
            </div>

            <p
              onClick={() =>
                liveEnsemble &&
                playTTS(
                  `${liveEnsemble.selectedStrategyName}. ${liveEnsemble.justification}. Stop Loss ${fmtPx(liveEnsemble.stopLoss)}, TP3 ${fmtPx(liveEnsemble.tp3)}.`,
                  { interrupt: true, force: true }
                )
              }
              className="text-[11px] text-zinc-400 hover:text-zinc-200 font-sans leading-relaxed cursor-pointer transition-colors"
              title="Haz clic para que Tony lea la justificación completa"
            >
              {liveEnsemble?.justification || 'Sincronizando velas multi-timeframe, libro L2 y BTC-PERP desde Hyperliquid L1...'}
            </p>
          </div>
        </div>

        {/* Market Intelligence Indicator Strip */}
        {liveEnsemble && (
          <div className="px-4 sm:px-5 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] tabular-nums text-zinc-400 bg-black/25">
            <span>
              EMA 9/21/50/200:{' '}
              <strong className="text-zinc-200">
                {fmtPx(liveEnsemble.indicators.ema9)} / {fmtPx(liveEnsemble.indicators.ema21)} /{' '}
                {fmtPx(liveEnsemble.indicators.ema50)} / {fmtPx(liveEnsemble.indicators.ema200)}
              </strong>
            </span>
            <span>·</span>
            <span>
              RSI(14): <strong className="text-amber-300">{liveEnsemble.indicators.rsi14}</strong>
            </span>
            <span>·</span>
            <span>
              MACD Hist: <strong className="text-zinc-200">{liveEnsemble.indicators.macdHist}</strong>
            </span>
            <span>·</span>
            <span>
              ATR: <strong className="text-zinc-200">{liveEnsemble.indicators.atrPct}%</strong>
            </span>
            <span>·</span>
            <span>
              Soporte / Resistencia:{' '}
              <strong className="text-emerald-400">{fmtPx(liveEnsemble.indicators.support)}</strong> /{' '}
              <strong className="text-red-400">{fmtPx(liveEnsemble.indicators.resistance)}</strong>
            </span>
            <span>·</span>
            <span>
              Volume Profile POC: <strong className="text-cyan-300">{fmtPx(liveEnsemble.indicators.poc)}</strong>
            </span>
            {liveEnsemble.volatilitySubRegime && (
              <>
                <span>·</span>
                <span>
                  Volatilidad:{' '}
                  <strong className="text-amber-300">
                    {liveEnsemble.volatilitySubRegime === 'INSTITUTIONAL_VOLUME'
                      ? 'Vol. Institucional'
                      : liveEnsemble.volatilitySubRegime === 'NEWS_PANIC'
                      ? 'Pánico Noticias'
                      : liveEnsemble.volatilitySubRegime === 'TIGHT_RANGE'
                      ? 'Rango Estrecho (Quieto)'
                      : 'Flujo Normal'}
                  </strong>
                </span>
              </>
            )}
            {liveEnsemble.betaRatioVsBtc !== undefined && (
              <>
                <span>·</span>
                <span>
                  Beta vs BTC:{' '}
                  <strong className="text-emerald-300">{liveEnsemble.betaRatioVsBtc}x</strong>
                </span>
              </>
            )}
            {liveEnsemble.btcSweepTrigger && (
              <>
                <span>·</span>
                <span>
                  Gatillo BTC:{' '}
                  <strong
                    className={
                      liveEnsemble.btcSweepTrigger.reboundConfirmed
                        ? 'text-emerald-400'
                        : liveEnsemble.btcSweepTrigger.sweepDetected
                        ? 'text-amber-300'
                        : 'text-zinc-400'
                    }
                  >
                    {liveEnsemble.btcSweepTrigger.reboundConfirmed
                      ? 'Rebote Confirmado'
                      : liveEnsemble.btcSweepTrigger.sweepDetected
                      ? 'Barriendo Mínimos'
                      : 'Sin Barrido'}
                  </strong>
                </span>
              </>
            )}
          </div>
        )}
      </section>

      {/* Sub-navigation Segmented Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0c0a09] border border-white/10 rounded-lg text-xs">
          {([
            { id: 'strategies', label: '10 Estrategias & Señales' },
            { id: 'risk', label: `Optimizador & Riesgo (${positions.length} L1)` },
            { id: 'journal', label: `Memoria & Bitácora (${quantJournal.length})` },
            { id: 'walkforward', label: 'Walk-Forward Out-of-Sample' },
          ] as Array<{ id: SubView; label: string }>).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubView(t.id)}
              className={`px-3 py-1.5 rounded-md font-bold cursor-pointer transition-colors whitespace-nowrap ${
                subView === t.id ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <span className="text-[11px] text-zinc-500 tabular-nums">
          Pipeline 3 Niveles: 1. Señal → 2. Confirmación MTF/BTC → 3. Ejecución Real Mainnet L1
        </span>
      </div>

      {/* VIEW 1: 10 INDEPENDENT STRATEGIES MATRIX */}
      {subView === 'strategies' && (
        <section className="bg-[#0c0a09] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-zinc-200">
              Matriz de 10 Módulos Independientes ({activeSymbol})
            </span>
            <span className="text-[11px] text-zinc-400 tabular-nums">
              0–49 No operar · 50–64 Esperar confirmación · 65–79 Señal válida · 80–100 Confluencia alta
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="bg-black/40 text-[10px] text-zinc-500 uppercase border-b border-white/10">
                <tr>
                  <th className="py-2.5 px-3">Estrategia</th>
                  <th className="py-2.5 px-3">Dirección</th>
                  <th className="py-2.5 px-3">Score</th>
                  <th className="py-2.5 px-3">Entrada</th>
                  <th className="py-2.5 px-3">Stop Loss</th>
                  <th className="py-2.5 px-3">TP1 (30%)</th>
                  <th className="py-2.5 px-3">TP2 (30%)</th>
                  <th className="py-2.5 px-3">TP3 (40%)</th>
                  <th className="py-2.5 px-3">R:R / Expira</th>
                  <th className="py-2.5 px-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(liveEnsemble?.signals || []).map((sig) => (
                  <tr key={sig.strategyId} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span>{sig.strategyName}</span>
                        {sig.priority === 'PRIORITARIA' && (
                          <span className="text-[10px] text-amber-300 font-bold">· Prioritaria</span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 font-sans mt-0.5 max-w-md">{sig.justification}</p>
                    </td>
                    <td className="py-2.5 px-3 font-bold">
                      <span
                        className={
                          sig.direction === 'LONG'
                            ? 'text-emerald-400'
                            : sig.direction === 'SHORT'
                            ? 'text-red-400'
                            : 'text-zinc-500'
                        }
                      >
                        {sig.direction}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-amber-200">{sig.score}/100</td>
                    <td className="py-2.5 px-3 text-zinc-300">{fmtPx(sig.entryPrice)}</td>
                    <td className="py-2.5 px-3 text-red-400">{sig.direction === 'WAIT' ? '--' : fmtPx(sig.stopLoss)}</td>
                    <td className="py-2.5 px-3 text-emerald-300">{sig.direction === 'WAIT' ? '--' : fmtPx(sig.tp1)}</td>
                    <td className="py-2.5 px-3 text-emerald-400">{sig.direction === 'WAIT' ? '--' : fmtPx(sig.tp2)}</td>
                    <td className="py-2.5 px-3 text-cyan-300">{sig.direction === 'WAIT' ? '--' : fmtPx(sig.tp3)}</td>
                    <td className="py-2.5 px-3 text-zinc-400">
                      {sig.riskRewardRatio > 0 ? `${sig.riskRewardRatio}:1` : '--'} · {fmtExpiry(sig.expiresAt)}
                    </td>
                    <td className="py-2.5 px-3 font-bold">
                      <span
                        className={
                          sig.stage === 'AUTHORIZED'
                            ? 'text-emerald-400'
                            : sig.stage === 'CONFIRMED'
                            ? 'text-amber-300'
                            : sig.stage === 'REJECTED'
                            ? 'text-red-400'
                            : 'text-zinc-500'
                        }
                      >
                        {sig.stage === 'AUTHORIZED'
                          ? 'Autorizada L1'
                          : sig.stage === 'CONFIRMED'
                          ? 'Confirmada'
                          : sig.stage === 'REJECTED'
                          ? 'Filtrada'
                          : 'En Espera'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* VIEW 2: POSITION OPTIMIZER + RISK ENGINE */}
      {subView === 'risk' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Risk Controls */}
          <section className="lg:col-span-5 bg-[#0c0a09] border border-white/10 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <h3 className="text-sm font-bold text-amber-200 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Motor de Riesgo y Control de Capital</span>
              </h3>
              <span className={`text-xs font-bold ${riskState.dailyDrawdownBreached ? 'text-amber-300' : 'text-emerald-400'}`}>
                {riskState.dailyDrawdownBreached ? 'Drawdown en Vigilancia' : 'Protección Activa'}
              </span>
            </div>

            <div className="space-y-3 text-xs tabular-nums">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Riesgo Inicial por Operación</span>
                  <span className="text-amber-300 font-bold">{riskConfig.riskPerTradePct}% del capital</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0.25, 0.5, 1.0, 1.5].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setRiskConfig((p) => ({ ...p, riskPerTradePct: v }))}
                      className={`py-1.5 rounded border text-[11px] font-bold cursor-pointer ${
                        riskConfig.riskPerTradePct === v
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-black/40 text-zinc-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Límite Pérdida Diaria Máxima</span>
                  <span className="text-red-300 font-bold">{riskConfig.maxDailyLossPct}%</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1.5, 2.0, 3.0, 5.0].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setRiskConfig((p) => ({ ...p, maxDailyLossPct: v }))}
                      className={`py-1.5 rounded border text-[11px] font-bold cursor-pointer ${
                        riskConfig.maxDailyLossPct === v
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-black/40 text-zinc-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Posiciones Simultáneas Máximas</span>
                  <span className="text-white font-bold">{riskConfig.maxSimultaneousPositions} abiertas</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setRiskConfig((p) => ({ ...p, maxSimultaneousPositions: v }))}
                      className={`py-1.5 rounded border text-[11px] font-bold cursor-pointer ${
                        riskConfig.maxSimultaneousPositions === v
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-black/40 text-zinc-400 border-white/10 hover:text-white'
                      }`}
                    >
                      Máx {v}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-zinc-400">PnL Hoy (Realizado + Abierto):</span>
                  <span className={riskState.dailyPnlUsdc >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {riskState.dailyPnlUsdc >= 0 ? '+' : ''}${riskState.dailyPnlUsdc.toFixed(2)} USDC ({riskState.dailyLossPct}% DD)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Prohibido Promediar Pérdidas:</span>
                  <span className="text-emerald-400 font-bold">Bloqueo Estricto ON</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Bloqueo por Correlación BTC:</span>
                  <button
                    type="button"
                    onClick={() => setRiskConfig((p) => ({ ...p, correlationBlockEnabled: !p.correlationBlockEnabled }))}
                    className={`px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer ${
                      riskConfig.correlationBlockEnabled
                        ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
                        : 'bg-zinc-900 text-zinc-400 border-white/10'
                    }`}
                  >
                    {riskConfig.correlationBlockEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Trades Hoy (Límite Diario):</span>
                  <span className={riskState.tradesTodayCount >= riskState.maxTradesPerDay ? 'text-amber-300 font-bold' : 'text-emerald-400 font-bold'}>
                    {riskState.tradesTodayCount} / {riskState.maxTradesPerDay} trades
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Racha SL Consecutivos (Pausa 2h al 3º):</span>
                  <span className={riskState.consecutiveSlCount >= 2 ? 'text-amber-300 font-bold' : 'text-zinc-200 font-bold'}>
                    {riskState.consecutiveSlCount} / 3 SL
                    {riskState.pauseUntilMs && riskState.pauseUntilMs > Date.now()
                      ? ` · Pausa hasta ${new Date(riskState.pauseUntilMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Zonas Bloqueadas Anti-Reentrada:</span>
                  <span className="text-amber-300 font-bold">{riskState.lockedZones.length} activas</span>
                </div>
                {riskState.correlatedExposureWarning && (
                  <p className="text-amber-300 pt-1">{riskState.correlatedExposureWarning}</p>
                )}
              </div>
            </div>
          </section>

          {/* Active Live Position Optimizer Lifecycle */}
          <section className="lg:col-span-7 bg-[#0c0a09] border border-white/10 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <h3 className="text-sm font-bold text-amber-200 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Optimizador Activo (Break-Even +1.2R · Trailing +1.5R · TP +2.5R)</span>
              </h3>
              {positions.length > 0 && (
                <button
                  type="button"
                  onClick={closeAllPositions}
                  className="px-2.5 py-1 rounded bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-700 text-[11px] font-bold cursor-pointer"
                >
                  Cerrar Todas L1
                </button>
              )}
            </div>

            <div className="text-[11px] text-zinc-400 font-sans leading-relaxed border border-white/5 bg-black/30 p-3 rounded-lg">
              Administración L1 sin parches: <strong className="text-emerald-300">Break-Even (+1.2R)</strong> protege entrada + 0.15% (cubre coste 0.12% L1);{' '}
              <strong className="text-cyan-300">Trailing (+1.5R)</strong> sigue el impulso. Para nocionales &lt; ${PARTIAL_TP_MIN_NOTIONAL_USDC} se usa{' '}
              <strong className="text-white">TP único (+2.5R)</strong> sin parciales; &ge; ${PARTIAL_TP_MIN_NOTIONAL_USDC} habilita TP1/TP2/TP3.
            </div>

            {positions.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-500">
                No hay posiciones abiertas en Hyperliquid L1 ahorita. El optimizador tomará el control automático en cuanto entre una posición válida.
              </div>
            ) : (
              <div className="space-y-3 tabular-nums">
                {positions.map((pos) => (
                  <div key={pos.id} className="p-3.5 rounded-lg border border-white/10 bg-black/35 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-white">{pos.symbol}</span>{' '}
                        <span className={pos.side === 'LONG' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                          {pos.side} {Math.min(MAX_GLOBAL_LEVERAGE, pos.leverage)}x
                        </span>
                        {pos.singleTpMode && (
                          <span className="text-[10px] text-cyan-300 font-bold"> · TP Único +2.5R</span>
                        )}
                        {pos.trailingActive && (
                          <span className="text-[10px] text-emerald-300 font-bold"> · Trailing ON</span>
                        )}
                        {pos.strategyName && <span className="text-zinc-500"> · {pos.strategyName}</span>}
                      </div>
                      <span className={pos.unrealizedPnl >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)} ({pos.unrealizedPnlPercent.toFixed(2)}% ROE)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] pt-1 border-t border-white/5">
                      <div>
                        <span className="text-zinc-500 block">Entrada</span>
                        <span className="text-zinc-200 font-bold">{fmtPx(pos.entryPrice)}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Stop Loss ATR</span>
                        <span className="text-red-400 font-bold">{fmtPx(pos.stopLoss)}</span>
                      </div>
                      {pos.singleTpMode ? (
                        <>
                          <div>
                            <span className="text-zinc-500 block">BE (+1.2R)</span>
                            <span className="text-emerald-300 font-bold">{pos.breakEvenStatus || 'WAITING'}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">Trailing (+1.5R)</span>
                            <span className="text-cyan-300 font-bold">{pos.trailingActive ? 'ACTIVO' : 'ESPERA'}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">TP Único (+2.5R)</span>
                            <span className="text-emerald-400 font-bold">{fmtPx(pos.takeProfit ?? pos.tp3)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <span className="text-zinc-500 block">TP1 (30%+BE)</span>
                            <span className="text-emerald-300 font-bold">
                              {fmtPx(pos.tp1)} {pos.tp1Hit ? '✓' : ''}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">TP2 (30%)</span>
                            <span className="text-emerald-400 font-bold">
                              {fmtPx(pos.tp2)} {pos.tp2Hit ? '✓' : ''}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">TP3 (40% Trail)</span>
                            <span className="text-cyan-300 font-bold">{fmtPx(pos.tp3)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* VIEW 3: QUANT MEMORY & DECISION JOURNAL */}
      {subView === 'journal' && (
        <section className="bg-[#0c0a09] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-zinc-200">
              Bitácora Cuántica Auditada ({quantJournal.length} registros Live L1)
            </span>
            <span className="text-[11px] text-zinc-400">
              Registra motivo de entrada, condiciones, evolución posterior y evaluación post-hoc sin auto-sobreajustar reglas.
            </span>
          </div>

          {quantJournal.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              Aún no hay eventos registrados en la nueva bitácora cuantitativa. Cada ejecución, parcial TP1/TP2, cierre o bloqueo de riesgo quedará auditado aquí.
            </div>
          ) : (
            <div className="divide-y divide-white/5 max-h-[520px] overflow-y-auto text-xs">
              {quantJournal.map((j) => (
                <div
                  key={j.id}
                  onClick={() =>
                    playTTS(
                      `${j.symbol} ${j.side}, evento ${j.eventType}. Estrategia ${j.strategyName}, score ${j.score}. Decisión: ${j.entryWhy}. Condiciones: ${j.marketConditions}. Post acción: ${j.priceActionAfter}. Óptimo post-hoc: ${j.optimalPostHocDecision}.`,
                      { interrupt: true, force: true }
                    )
                  }
                  className="p-3.5 sm:px-5 space-y-1.5 hover:bg-white/[0.03] cursor-pointer group transition-colors"
                  title="Haz clic para escuchar esta bitácora completa"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 tabular-nums">
                    <div className="flex flex-wrap items-center gap-2">
                      <Volume2 className="w-3.5 h-3.5 text-amber-400/70 group-hover:text-amber-300 shrink-0" />
                      <span className="font-bold text-white">{j.symbol}</span>
                      <span className={j.side === 'LONG' ? 'text-emerald-400 font-bold' : j.side === 'SHORT' ? 'text-red-400 font-bold' : 'text-amber-300'}>
                        {j.side}
                      </span>
                      <span className="text-amber-300">· {j.eventType}</span>
                      <span className="text-zinc-400">· {j.strategyName} (Score {j.score})</span>
                    </div>
                    <span className="text-[11px] text-zinc-500">{new Date(j.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-[11px] text-zinc-300 font-sans">
                    <strong className="text-zinc-400">Decisión:</strong> {j.entryWhy}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400 tabular-nums">
                    <span>Condiciones: {j.marketConditions}</span>
                    <span>·</span>
                    <span>Post-Acción: {j.priceActionAfter}</span>
                    <span>·</span>
                    <span className="text-cyan-300">Post-Hoc Óptimo: {j.optimalPostHocDecision}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* VIEW 4: OUT-OF-SAMPLE WALK-FORWARD VALIDATOR */}
      {subView === 'walkforward' && (
        <section className="bg-[#0c0a09] border border-white/10 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h3 className="text-sm font-bold text-amber-200 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                <span>Validación Walk-Forward Fuera de Muestra (70% In-Sample / 30% Out-of-Sample)</span>
              </h3>
              <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
                Simula sobre velas históricas reales de Hyperliquid L1 con 6 bps de comisiones + funding real. Los parámetros en producción permanecen protegidos contra sobreajuste estadístico.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {WHITELIST_TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  disabled={isRunningWalkForward}
                  onClick={() => runWalkForwardBacktest(tf)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRunningWalkForward ? 'animate-spin' : ''}`} />
                  <span>Validar {tf}</span>
                </button>
              ))}
            </div>
          </div>

          {!walkForwardStats ? (
            <div className="py-10 text-center text-xs text-zinc-400 space-y-3">
              <p>
                Presiona <strong className="text-amber-300">Validar 5m / 15m / 1h / 4h</strong> para evaluar las 10 estrategias con comisiones y funding reales sobre el historial L1 de {activeSymbol}.
              </p>
            </div>
          ) : (
            <div className="space-y-4 tabular-nums">
              <div className="grid grid-cols-2 sm:grid-cols-5 border border-white/10 rounded-lg divide-x divide-y sm:divide-y-0 divide-white/10 bg-black/30 text-xs">
                <div className="p-3">
                  <div className="text-[10px] text-zinc-500">Win Rate OOS</div>
                  <div className="font-bold text-emerald-400 text-sm mt-0.5">{walkForwardStats.outOfSampleWinRate}%</div>
                </div>
                <div className="p-3">
                  <div className="text-[10px] text-zinc-500">Profit Factor OOS</div>
                  <div className="font-bold text-amber-300 text-sm mt-0.5">{walkForwardStats.outOfSampleProfitFactor}</div>
                </div>
                <div className="p-3">
                  <div className="text-[10px] text-zinc-500">Retorno Neto (Post-Fees)</div>
                  <div
                    className={`font-bold text-sm mt-0.5 ${
                      walkForwardStats.netReturnAfterFeesAndFundingPct >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {walkForwardStats.netReturnAfterFeesAndFundingPct >= 0 ? '+' : ''}
                    {walkForwardStats.netReturnAfterFeesAndFundingPct}%
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-[10px] text-zinc-500">Max Drawdown OOS</div>
                  <div className="font-bold text-red-400 text-sm mt-0.5">-{walkForwardStats.maxDrawdownPct}%</div>
                </div>
                <div className="p-3">
                  <div className="text-[10px] text-zinc-500">Control de Cambios</div>
                  <div className="font-bold text-cyan-300 text-xs mt-0.5">Bloqueado (Anti-Overfit)</div>
                </div>
              </div>

              <p className="text-[11px] text-zinc-400 font-sans">{walkForwardStats.summary}</p>

              <div className="overflow-x-auto border border-white/10 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-black/40 text-[10px] text-zinc-500 uppercase border-b border-white/10">
                    <tr>
                      <th className="py-2 px-3">Estrategia</th>
                      <th className="py-2 px-3">In-Sample Trades / WR</th>
                      <th className="py-2 px-3">OOS Trades / WR</th>
                      <th className="py-2 px-3">OOS Profit Factor</th>
                      <th className="py-2 px-3">Neto OOS (Post-Fee)</th>
                      <th className="py-2 px-3">Validación Live</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {walkForwardStats.strategyBreakdown.map((sb) => (
                      <tr key={sb.strategyId}>
                        <td className="py-2 px-3 font-bold text-white">{sb.strategyName}</td>
                        <td className="py-2 px-3 text-zinc-400">
                          {sb.inSampleTrades} · {sb.inSampleWinRate}%
                        </td>
                        <td className="py-2 px-3 text-zinc-300">
                          {sb.outOfSampleTrades} · {sb.outOfSampleWinRate}%
                        </td>
                        <td className="py-2 px-3 text-amber-300 font-bold">{sb.outOfSampleProfitFactor}</td>
                        <td
                          className={`py-2 px-3 font-bold ${
                            sb.netPnlPctAfterFees >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {sb.netPnlPctAfterFees >= 0 ? '+' : ''}
                          {sb.netPnlPctAfterFees}%
                        </td>
                        <td className="py-2 px-3 font-bold">
                          <span className={sb.validatedForLive ? 'text-emerald-400' : 'text-zinc-500'}>
                            {sb.validatedForLive ? 'Validada OOS' : 'Muestra Baja'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

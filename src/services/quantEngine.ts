import {
  BotBrainMode,
  BotExecutionMode,
  BtcSweepReboundTrigger,
  Candle,
  ClosedTrade,
  DecisionTier,
  EnsembleDecision,
  ExecutionPosture,
  MarketData,
  MarketRegime,
  MultiTimeframeState,
  OrderBookEntry,
  QuantIndicatorSnapshot,
  RecentTrade,
  RiskEngineConfig,
  StrategyId,
  StrategyPerformanceStat,
  StrategyWalkForwardMetric,
  StructuredStrategySignal,
  TrendDirection,
  VolatilitySubRegime,
  WalkForwardStats,
} from '../types/trading';
import {
  BE_TRIGGER_R,
  CVD_WINDOW_MAX_MS,
  CVD_WINDOW_MIN_MS,
  DEFAULT_SIGNAL_TTL_MS,
  HIGH_BETA_PERPS,
  ISOLATED_SNIPER_MARGIN_DEFAULT,
  L1_ROUND_TRIP_COST_PCT,
  MAX_GLOBAL_LEVERAGE,
  MAX_SL_DISTANCE_PCT,
  MIN_FEE_COVERAGE_MULT,
  MIN_PRE_ORDER_RR,
  SINGLE_TP_R,
  SL_ATR_MULTIPLIER,
  SWEEP_SIGNAL_TTL_MS,
  TRAILING_TRIGGER_R,
  UNIFIED_MIN_PILLARS,
  UNIFIED_MIN_SCORE,
  UNIFIED_TOTAL_PILLARS,
  WR_CALIBRATION_FLOOR_PCT,
  computeControlledPositionSizing,
} from './riskConstants';

const KNOWN_STRATEGY_CATALOG: Array<{ id: StrategyId; name: string }> = [
  { id: 'LIQUIDITY_SWEEP', name: '1. Liquidity Sweep' },
  { id: 'BREAKOUT_RETEST', name: '2. Breakout & Retest' },
  { id: 'SMC', name: '3. Smart Money Concepts' },
  { id: 'MEAN_REVERSION', name: '4. Mean Reversion' },
  { id: 'TREND_FOLLOWING', name: '5. Trend Following' },
  { id: 'VOLUME_PROFILE', name: '6. Volume Profile' },
  { id: 'ORDERFLOW_CVD', name: '7. Order Flow & CVD' },
  { id: 'LIQUIDATION_HUNTING', name: '8. Liquidation Hunting' },
  { id: 'MOMENTUM_DIVERGENCE', name: '9. Momentum & Divergence' },
  { id: 'VOLATILITY_BREAKOUT', name: '10. Volatility Breakout' },
];

export function computeStrategyPerformanceMatrix(
  closedTrades: ClosedTrade[] = [],
  walkForwardStats?: WalkForwardStats | null,
  symbolFilter?: string
): StrategyPerformanceStat[] {
  const botTrades = closedTrades.filter((t) => t.openedBy === 'AI_BOT');
  const relevantPool = botTrades.length > 0 ? botTrades : closedTrades;

  return KNOWN_STRATEGY_CATALOG.map((cat) => {
    const matched = relevantPool.filter(
      (t) =>
        t.strategyId === cat.id ||
        t.strategyName === cat.name ||
        t.strategyUsed === cat.name ||
        t.strategyUsed === cat.id
    );
    const tradesCount = matched.length;
    const wins = matched.filter((t) => (t.realizedPnl || 0) > 0).length;
    const grossWin = matched.filter((t) => (t.realizedPnl || 0) > 0).reduce((a, t) => a + (t.realizedPnl || 0), 0);
    const grossLoss = Math.abs(
      matched.filter((t) => (t.realizedPnl || 0) < 0).reduce((a, t) => a + (t.realizedPnl || 0), 0)
    );
    const netPnlUsdc = +matched.reduce((a, t) => a + (t.realizedPnl || 0), 0).toFixed(2);
    const winRatePct = tradesCount > 0 ? +((wins / tradesCount) * 100).toFixed(1) : 0;
    const profitFactor = grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : grossWin > 0 ? 2.5 : 0;
    const expectancyUsdc = tradesCount > 0 ? +(netPnlUsdc / tradesCount).toFixed(3) : 0;

    const wfMetric =
      walkForwardStats && (!symbolFilter || walkForwardStats.symbol === symbolFilter)
        ? walkForwardStats.strategyBreakdown.find((s) => s.strategyId === cat.id)
        : undefined;

    const failedLive = tradesCount >= 4 && netPnlUsdc < 0 && (profitFactor < 0.9 || winRatePct < 38);
    const failedWalkForward =
      Boolean(wfMetric) &&
      (wfMetric?.outOfSampleTrades || 0) >= 4 &&
      (wfMetric?.netPnlPctAfterFees || 0) < 0 &&
      (wfMetric?.outOfSampleProfitFactor || 0) < 0.95;

    let status: StrategyPerformanceStat['status'] = 'ACTIVE';
    if (failedLive || (tradesCount < 4 && failedWalkForward)) {
      status = 'QUARANTINED';
    } else if (tradesCount >= 2 && netPnlUsdc < 0) {
      status = 'PENALIZED';
    }

    return {
      strategyId: cat.id,
      strategyName: cat.name,
      tradesCount,
      wins,
      winRatePct,
      netPnlUsdc,
      profitFactor,
      expectancyUsdc,
      status,
    };
  });
}

function calcEMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcEMASeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

function calcMACD(closes: number[]): { macdLine: number; macdSignal: number; macdHist: number; prevHist: number } {
  if (closes.length < 30) {
    return { macdLine: 0, macdSignal: 0, macdHist: 0, prevHist: 0 };
  }
  const ema12 = calcEMASeries(closes, 12);
  const ema26 = calcEMASeries(closes, 26);
  const macdSeries = closes.map((_, i) => ema12[i] - ema26[i]);
  const signalSeries = calcEMASeries(macdSeries, 9);
  const lastIdx = closes.length - 1;
  const prevIdx = Math.max(0, lastIdx - 1);
  const macdLine = macdSeries[lastIdx];
  const macdSignal = signalSeries[lastIdx];
  const macdHist = macdLine - macdSignal;
  const prevHist = macdSeries[prevIdx] - signalSeries[prevIdx];
  return { macdLine, macdSignal, macdHist, prevHist };
}

function calcATRPercent(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 1.4;
  const slice = candles.slice(-Math.min(candles.length, period + 1));
  let trSum = 0;
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i];
    const pc = slice[i - 1].close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    trSum += pc > 0 ? (tr / pc) * 100 : 0;
  }
  return Math.max(0.35, Math.min(8.0, +(trSum / Math.max(1, slice.length - 1)).toFixed(2)));
}

function calcTrendFromCandles(candles: Candle[]): TrendDirection {
  if (!candles || candles.length < 10) return 'NEUTRAL';
  const closes = candles.map((c) => c.close).filter((v) => v > 0);
  if (closes.length < 10) return 'NEUTRAL';
  const ema9 = calcEMA(closes.slice(-24), 9);
  const ema21 = calcEMA(closes.slice(-35), 21);
  const last = closes[closes.length - 1];
  if (ema9 > ema21 * 1.0008 && last >= ema21) return 'BULLISH';
  if (ema9 < ema21 * 0.9992 && last <= ema21) return 'BEARISH';
  return 'NEUTRAL';
}

function calcPearsonCorrelation(a: Candle[], b: Candle[]): number {
  const len = Math.min(a.length, b.length, 32);
  if (len < 6) return 0.75;
  const aSlice = a.slice(-len);
  const bSlice = b.slice(-len);
  const retA: number[] = [];
  const retB: number[] = [];
  for (let i = 1; i < len; i++) {
    retA.push(aSlice[i - 1].close > 0 ? (aSlice[i].close - aSlice[i - 1].close) / aSlice[i - 1].close : 0);
    retB.push(bSlice[i - 1].close > 0 ? (bSlice[i].close - bSlice[i - 1].close) / bSlice[i - 1].close : 0);
  }
  const meanA = retA.reduce((acc, v) => acc + v, 0) / retA.length;
  const meanB = retB.reduce((acc, v) => acc + v, 0) / retB.length;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < retA.length; i++) {
    const da = retA[i] - meanA;
    const db = retB[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const denom = Math.sqrt(denA * denB);
  if (denom === 0) return 0;
  return +Math.max(-1, Math.min(1, num / denom)).toFixed(2);
}

export function computeBetaVsBtc(
  altCandles: Candle[],
  btcCandles?: Candle[] | null,
  altAtrPct: number = 1.6,
  symbol: string = ''
): number {
  if (symbol === 'BTC-PERP') return 1.0;
  const btcAtr = btcCandles && btcCandles.length >= 4 ? calcATRPercent(btcCandles, 14) : 1.15;
  const atrBeta = Math.max(0.6, Math.min(2.8, altAtrPct / Math.max(0.45, btcAtr)));

  if (!btcCandles || btcCandles.length < 8 || altCandles.length < 8) {
    const baseBoost = symbol === 'ZEC-PERP' ? 1.45 : symbol === 'HYPE-PERP' ? 1.38 : symbol === 'SOL-PERP' ? 1.25 : 1.1;
    return +Math.max(atrBeta, baseBoost).toFixed(2);
  }

  const len = Math.min(altCandles.length, btcCandles.length, 28);
  const aSlice = altCandles.slice(-len);
  const bSlice = btcCandles.slice(-len);
  const retA: number[] = [];
  const retB: number[] = [];
  for (let i = 1; i < len; i++) {
    retA.push(aSlice[i - 1].close > 0 ? (aSlice[i].close - aSlice[i - 1].close) / aSlice[i - 1].close : 0);
    retB.push(bSlice[i - 1].close > 0 ? (bSlice[i].close - bSlice[i - 1].close) / bSlice[i - 1].close : 0);
  }
  const meanA = retA.reduce((acc, v) => acc + v, 0) / retA.length;
  const meanB = retB.reduce((acc, v) => acc + v, 0) / retB.length;
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < retA.length; i++) {
    const da = retA[i] - meanA;
    const db = retB[i] - meanB;
    cov += da * db;
    varB += db * db;
  }
  const rawBeta = varB > 1e-10 ? cov / varB : atrBeta;
  const blended = Math.max(0.55, Math.min(3.2, rawBeta * 0.55 + atrBeta * 0.45));
  return +blended.toFixed(2);
}

export function classifyVolatilitySubRegime(params: {
  atrPct: number;
  volRatio: number;
  curRangePct: number;
  avgRangePct: number;
  liveSpreadPct: number;
  cvdMomentumPct: number;
}): { volatilitySubRegime: VolatilitySubRegime; executionPosture: ExecutionPosture } {
  const { atrPct, volRatio, curRangePct, avgRangePct, liveSpreadPct, cvdMomentumPct } = params;
  if (atrPct >= 3.0 || (avgRangePct > 0 && curRangePct >= avgRangePct * 2.3) || liveSpreadPct > 0.055) {
    return { volatilitySubRegime: 'NEWS_PANIC', executionPosture: 'WAIT_CONFIRMATION' };
  }
  if (atrPct < 0.85 && volRatio < 0.88 && Math.abs(cvdMomentumPct) < 14 && (avgRangePct <= 0 || curRangePct <= avgRangePct * 1.15)) {
    return { volatilitySubRegime: 'TIGHT_RANGE', executionPosture: 'STAY_QUIET' };
  }
  if (volRatio >= 1.25 && Math.abs(cvdMomentumPct) >= 12 && liveSpreadPct <= 0.045) {
    return { volatilitySubRegime: 'INSTITUTIONAL_VOLUME', executionPosture: 'SNIPER_DIRECTIONAL' };
  }
  return { volatilitySubRegime: 'NORMAL_FLOW', executionPosture: 'SNIPER_DIRECTIONAL' };
}

export function detectBtcLiquiditySweepRebound(
  btcCandles?: Candle[] | null,
  btcMarket?: MarketData | null
): BtcSweepReboundTrigger {
  const now = Date.now();
  const expiresAt = now + SWEEP_SIGNAL_TTL_MS;

  if (!btcCandles || btcCandles.length < 12) {
    return {
      sweepDetected: false,
      reboundConfirmed: false,
      sweptLowPrice: btcMarket?.low24h || 0,
      reboundStrengthPct: 0,
      absorptionWickRatio: 0,
      detectedAt: now,
      expiresAt,
      summary: 'Esperando velas cortas de BTC para vigilar limpieza de liquidez.',
    };
  }

  const priorSlice = btcCandles.slice(-22, -2);
  const priorLow = priorSlice.length > 0 ? Math.min(...priorSlice.map((c) => c.low)) : btcCandles[0].low;
  const avgVol =
    priorSlice.reduce((acc, c) => acc + (c.volume || 1), 0) / Math.max(1, priorSlice.length);

  const recentBars = btcCandles.slice(-3);
  const lastBtc = btcCandles[btcCandles.length - 1];
  const prevBtc = btcCandles[btcCandles.length - 2] || lastBtc;
  const minRecentLow = Math.min(...recentBars.map((c) => c.low));

  const intrabarFlushPct =
    lastBtc.close > 0 ? ((Math.max(lastBtc.open, prevBtc.high) - minRecentLow) / lastBtc.close) * 100 : 0;
  const sweptPriorLow = minRecentLow < priorLow * 0.9998 || intrabarFlushPct >= 0.45;

  const barRange = Math.max(1e-8, lastBtc.high - lastBtc.low);
  const lowerWick = Math.min(lastBtc.open, lastBtc.close) - lastBtc.low;
  const prevRange = Math.max(1e-8, prevBtc.high - prevBtc.low);
  const prevLowerWick = Math.min(prevBtc.open, prevBtc.close) - prevBtc.low;
  const absorptionWickRatio = +Math.max(lowerWick / barRange, prevLowerWick / prevRange).toFixed(2);

  const reclaimedLow = lastBtc.close >= priorLow * 0.9992 || lastBtc.close > prevBtc.low * 1.0018;
  const bullTurn = lastBtc.close > lastBtc.open && reclaimedLow;
  const reboundStrengthPct =
    minRecentLow > 0 ? +(((lastBtc.close - minRecentLow) / minRecentLow) * 100).toFixed(2) : 0;
  const volAbsorption = avgVol > 0 ? Math.max(lastBtc.volume || 0, prevBtc.volume || 0) >= avgVol * 1.02 : true;

  const reboundConfirmed = Boolean(
    sweptPriorLow && bullTurn && (absorptionWickRatio >= 0.3 || reboundStrengthPct >= 0.25) && volAbsorption
  );

  const summary = reboundConfirmed
    ? `Gatillo BTC Líder CONFIRMADO: barrió $${priorLow.toFixed(0)} (mín $${minRecentLow.toFixed(0)}) y rebotó +${reboundStrengthPct}% con mecha absorción ${(absorptionWickRatio * 100).toFixed(0)}%.`
    : sweptPriorLow
    ? `BTC barriendo liquidez bajo $${priorLow.toFixed(0)} — esperando cierre/giro alcista de absorción antes de disparar alts.`
    : `BTC sin barrido de mínimos reciente (soporte $${priorLow.toFixed(0)} intacto).`;

  return {
    sweepDetected: sweptPriorLow,
    reboundConfirmed,
    sweptLowPrice: +minRecentLow.toFixed(2),
    reboundStrengthPct,
    absorptionWickRatio,
    detectedAt: now,
    expiresAt,
    summary,
  };
}

function calcVolumeProfile(candles: Candle[], fallbackPx: number): { poc: number; vah: number; val: number } {
  const slice = candles.slice(-48);
  if (slice.length < 5) {
    return { poc: fallbackPx, vah: fallbackPx * 1.01, val: fallbackPx * 0.99 };
  }
  let low = Infinity;
  let high = -Infinity;
  for (const c of slice) {
    if (c.low < low) low = c.low;
    if (c.high > high) high = c.high;
  }
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
    return { poc: fallbackPx, vah: fallbackPx * 1.01, val: fallbackPx * 0.99 };
  }
  const bins = 20;
  const step = (high - low) / bins;
  const volBuckets = new Array(bins).fill(0);
  let totalVol = 0;
  for (const c of slice) {
    const mid = (c.high + c.low + c.close) / 3;
    const idx = Math.max(0, Math.min(bins - 1, Math.floor((mid - low) / step)));
    const v = Math.max(0.01, c.volume || 1);
    volBuckets[idx] += v;
    totalVol += v;
  }
  let maxVol = -1;
  let pocIdx = Math.floor(bins / 2);
  for (let i = 0; i < bins; i++) {
    if (volBuckets[i] > maxVol) {
      maxVol = volBuckets[i];
      pocIdx = i;
    }
  }
  // Expand 70% value area around POC
  let cumVol = volBuckets[pocIdx];
  let loIdx = pocIdx;
  let hiIdx = pocIdx;
  while (cumVol < totalVol * 0.7 && (loIdx > 0 || hiIdx < bins - 1)) {
    const downVol = loIdx > 0 ? volBuckets[loIdx - 1] : -1;
    const upVol = hiIdx < bins - 1 ? volBuckets[hiIdx + 1] : -1;
    if (upVol >= downVol && hiIdx < bins - 1) {
      hiIdx++;
      cumVol += volBuckets[hiIdx];
    } else if (loIdx > 0) {
      loIdx--;
      cumVol += volBuckets[loIdx];
    } else {
      break;
    }
  }
  return {
    poc: low + (pocIdx + 0.5) * step,
    vah: low + (hiIdx + 1) * step,
    val: low + loIdx * step,
  };
}

function roundPx(px: number, refPx: number): number {
  const dec = refPx < 0.01 ? 6 : refPx < 1 ? 4 : refPx < 10 ? 3 : 2;
  return +px.toFixed(dec);
}

function buildLevels(
  direction: 'LONG' | 'SHORT' | 'WAIT',
  entryPrice: number,
  atrPct: number,
  _slMult: number,
  support: number,
  resistance: number
): { stopLoss: number; tp1: number; tp2: number; tp3: number; rr: number; rawAtrStopPct: number } {
  if (direction === 'WAIT' || entryPrice <= 0) {
    return {
      stopLoss: roundPx(entryPrice, entryPrice),
      tp1: roundPx(entryPrice, entryPrice),
      tp2: roundPx(entryPrice, entryPrice),
      tp3: roundPx(entryPrice, entryPrice),
      rr: 0,
      rawAtrStopPct: 0,
    };
  }

  // Stop Loss estrictamente a 1.5x ATR (sin recortar artificialmente si excede 2.5% para poder descartar la entrada)
  const rawAtrDist = Math.max(0.008, (atrPct / 100) * SL_ATR_MULTIPLIER);
  let stopDistPct = rawAtrDist;

  // Ajuste estructural solo si cabe dentro de [0.8%, 2.5%] y cerca del 1.5x ATR
  if (rawAtrDist <= MAX_SL_DISTANCE_PCT) {
    if (direction === 'LONG' && support > 0 && support < entryPrice) {
      const structDist = (entryPrice - support * 0.9985) / entryPrice;
      if (structDist >= 0.008 && structDist <= MAX_SL_DISTANCE_PCT && structDist <= rawAtrDist * 1.15) {
        stopDistPct = structDist;
      }
    } else if (direction === 'SHORT' && resistance > entryPrice) {
      const structDist = (resistance * 1.0015 - entryPrice) / entryPrice;
      if (structDist >= 0.008 && structDist <= MAX_SL_DISTANCE_PCT && structDist <= rawAtrDist * 1.15) {
        stopDistPct = structDist;
      }
    }
  }

  const stopDist = entryPrice * stopDistPct;

  if (direction === 'LONG') {
    const stopLoss = roundPx(entryPrice - stopDist, entryPrice);
    const tp1 = roundPx(entryPrice + stopDist * BE_TRIGGER_R, entryPrice); // +1.2R Break-Even trigger
    const tp2 = roundPx(entryPrice + stopDist * TRAILING_TRIGGER_R, entryPrice); // +1.5R Trailing Stop trigger
    const tp3 = roundPx(entryPrice + stopDist * SINGLE_TP_R, entryPrice); // +2.5R TP Único
    return { stopLoss, tp1, tp2, tp3, rr: SINGLE_TP_R, rawAtrStopPct: stopDistPct };
  }

  const stopLoss = roundPx(entryPrice + stopDist, entryPrice);
  const tp1 = roundPx(entryPrice - stopDist * BE_TRIGGER_R, entryPrice);
  const tp2 = roundPx(entryPrice - stopDist * TRAILING_TRIGGER_R, entryPrice);
  const tp3 = roundPx(entryPrice - stopDist * SINGLE_TP_R, entryPrice);
  return { stopLoss, tp1, tp2, tp3, rr: SINGLE_TP_R, rawAtrStopPct: stopDistPct };
}

export interface EvaluateQuantEnsembleParams {
  market: MarketData;
  orderBook: { bids: OrderBookEntry[]; asks: OrderBookEntry[]; spread: number; midPrice: number };
  recentTrades: RecentTrade[];
  candles: Candle[];
  mtfCandles?: {
    m1?: Candle[] | null;
    m5?: Candle[] | null;
    m15?: Candle[] | null;
    h1?: Candle[] | null;
    h4?: Candle[] | null;
  };
  btcCandles?: Candle[] | null;
  btcSweepCandles?: Candle[] | null;
  btcMarket?: MarketData | null;
  timeframe: string;
  brainMode: BotBrainMode;
  executionMode: BotExecutionMode;
  riskConfig: RiskEngineConfig;
  walletEquityUsdc: number;
  closedTrades?: ClosedTrade[];
  maxLeverageAllowed?: number;
  maxMarginBudgetPct?: number;
  walkForwardStats?: WalkForwardStats | null;
}

/**
 * MOTOR CENTRAL CUANTITATIVO DE 10 ESTRATEGIAS + RÉGIMEN + MTF + RIESGO REAL L1
 */
export function evaluateQuantEnsemble(params: EvaluateQuantEnsembleParams): EnsembleDecision {
  const {
    market,
    orderBook,
    recentTrades,
    candles,
    mtfCandles,
    btcCandles,
    btcSweepCandles,
    btcMarket,
    timeframe,
    brainMode,
    executionMode,
    riskConfig,
    walletEquityUsdc,
    closedTrades = [],
    maxLeverageAllowed = MAX_GLOBAL_LEVERAGE,
    maxMarginBudgetPct = 40,
    walkForwardStats = null,
  } = params;

  const effectiveLevCap = Math.max(1, Math.min(MAX_GLOBAL_LEVERAGE, maxLeverageAllowed || MAX_GLOBAL_LEVERAGE));

  const currentPrice = market.price || candles[candles.length - 1]?.close || 0;
  const bestBid = orderBook.bids[0]?.price || currentPrice;
  const bestAsk = orderBook.asks[0]?.price || currentPrice;
  const liveSpreadPct = bestBid > 0 && bestAsk >= bestBid ? +(((bestAsk - bestBid) / bestBid) * 100).toFixed(3) : 0.03;

  const closes = candles.map((c) => c.close).filter((v) => v > 0);
  const ema9 = roundPx(calcEMA(closes.slice(-30), 9) || currentPrice, currentPrice);
  const ema21 = roundPx(calcEMA(closes.slice(-50), 21) || currentPrice, currentPrice);
  const ema50 = roundPx(calcEMA(closes.slice(-90), 50) || currentPrice, currentPrice);
  const ema200 = roundPx(calcEMA(closes, 200) || calcEMA(closes, Math.max(20, closes.length)) || currentPrice, currentPrice);
  const rsi14 = calcRSI(closes, 14);
  const { macdLine, macdSignal, macdHist, prevHist } = calcMACD(closes);
  const atrPct = calcATRPercent(candles, 14);

  // Recent structural S/R (last 30 candles excluding live bar)
  const histSlice = candles.slice(-32, -1);
  const supportRaw = histSlice.length > 0 ? Math.min(...histSlice.map((c) => c.low)) : currentPrice * 0.98;
  const resistanceRaw = histSlice.length > 0 ? Math.max(...histSlice.map((c) => c.high)) : currentPrice * 1.02;
  const support = roundPx(supportRaw, currentPrice);
  const resistance = roundPx(resistanceRaw, currentPrice);

  // Volume profile
  const vp = calcVolumeProfile(candles, currentPrice);
  const poc = roundPx(vp.poc, currentPrice);
  const vah = roundPx(vp.vah, currentPrice);
  const val = roundPx(vp.val, currentPrice);

  // CVD & Orderbook Flow sobre ventana temporal real 5-15 minutos
  const nowTs = Date.now();
  const window15mTrades = recentTrades.filter((t) => nowTs - (t.time || nowTs) <= CVD_WINDOW_MAX_MS);
  const tapeSample = window15mTrades.length >= 4 ? window15mTrades : recentTrades.slice(0, 60);
  let buyVol = 0;
  let sellVol = 0;
  tapeSample.forEach((t) => {
    const ageMs = Math.max(0, nowTs - (t.time || nowTs));
    const w = ageMs <= CVD_WINDOW_MIN_MS ? 1.6 : 1.0;
    const usdFlow = (t.size || 0) * (t.price || currentPrice || 1);
    if (t.side === 'buy') buyVol += usdFlow * w;
    else sellVol += usdFlow * w;
  });
  const totalTape = buyVol + sellVol;
  const cvdMomentumPct = totalTape > 0 ? +(((buyVol - sellVol) / totalTape) * 100).toFixed(1) : 0;

  const bidDepth = orderBook.bids.slice(0, 8).reduce((acc, b) => acc + b.size, 0);
  const askDepth = orderBook.asks.slice(0, 8).reduce((acc, a) => acc + a.size, 0);
  const orderbookRatio = askDepth > 0 ? +(bidDepth / askDepth).toFixed(2) : 1.0;

  // BTC Direction & Correlation
  let btcDirection: TrendDirection = 'NEUTRAL';
  if (btcCandles && btcCandles.length >= 10) {
    btcDirection = calcTrendFromCandles(btcCandles);
  } else if (btcMarket) {
    btcDirection = btcMarket.change24h > 0.6 ? 'BULLISH' : btcMarket.change24h < -0.6 ? 'BEARISH' : 'NEUTRAL';
  }
  const btcCorrelation =
    market.symbol === 'BTC-PERP'
      ? 1.0
      : btcCandles && btcCandles.length >= 10 && candles.length >= 10
      ? calcPearsonCorrelation(candles, btcCandles)
      : 0.78;

  // Multi-Timeframe Trends: estrictamente 5m / 15m / 1h / 4h (eliminado trigger en 1m)
  const hasFullMtf = Boolean(
    mtfCandles?.m5?.length &&
      mtfCandles?.m15?.length &&
      mtfCandles?.h1?.length &&
      mtfCandles?.h4?.length
  );
  const m1: TrendDirection = 'NEUTRAL';
  const m5: TrendDirection = mtfCandles?.m5?.length ? calcTrendFromCandles(mtfCandles.m5) : 'NEUTRAL';
  const m15: TrendDirection = mtfCandles?.m15?.length
    ? calcTrendFromCandles(mtfCandles.m15)
    : timeframe === '15m' && candles.length >= 10
    ? calcTrendFromCandles(candles)
    : 'NEUTRAL';
  const h1: TrendDirection = mtfCandles?.h1?.length
    ? calcTrendFromCandles(mtfCandles.h1)
    : timeframe === '1h' && candles.length >= 10
    ? calcTrendFromCandles(candles)
    : 'NEUTRAL';
  const h4: TrendDirection = mtfCandles?.h4?.length
    ? calcTrendFromCandles(mtfCandles.h4)
    : ema50 > ema200 * 1.003
    ? 'BULLISH'
    : ema50 < ema200 * 0.997
    ? 'BEARISH'
    : 'NEUTRAL';

  const tfList = [m5, m15, h1, h4];
  const bullTfCount = tfList.filter((t) => t === 'BULLISH').length;
  const bearTfCount = tfList.filter((t) => t === 'BEARISH').length;
  const dominantDirection: TrendDirection =
    bullTfCount > bearTfCount ? 'BULLISH' : bearTfCount > bullTfCount ? 'BEARISH' : 'NEUTRAL';
  const alignedCount = Math.max(bullTfCount, bearTfCount);

  const mtf: MultiTimeframeState = { m1, m5, m15, h1, h4, alignedCount, dominantDirection };
  const indicators: QuantIndicatorSnapshot = {
    ema9,
    ema21,
    ema50,
    ema200,
    rsi14,
    macdLine: +macdLine.toFixed(4),
    macdSignal: +macdSignal.toFixed(4),
    macdHist: +macdHist.toFixed(4),
    atrPct,
    support,
    resistance,
    poc,
    vah,
    val,
    cvdMomentumPct,
    orderbookRatio,
    liveSpreadPct,
    btcDirection,
    btcCorrelation,
  };

  // Regime Detection
  const emaSepPct = ema50 > 0 ? Math.abs(ema9 - ema50) / ema50 : 0;
  let regime: MarketRegime = 'RANGE_LATERAL';
  if (atrPct >= 2.75) {
    regime = 'HIGH_VOLATILITY';
  } else if (ema9 > ema21 && ema21 > ema50 && emaSepPct >= 0.0025) {
    regime = 'BULL_TREND';
  } else if (ema9 < ema21 && ema21 < ema50 && emaSepPct >= 0.0025) {
    regime = 'BEAR_TREND';
  } else if (dominantDirection === 'BULLISH' && currentPrice > ema50) {
    regime = 'BULL_TREND';
  } else if (dominantDirection === 'BEARISH' && currentPrice < ema50) {
    regime = 'BEAR_TREND';
  }

  const lastBar = candles[candles.length - 1] || { open: currentPrice, high: currentPrice, low: currentPrice, close: currentPrice, volume: 0, time: Date.now() };
  const prevBar = candles[candles.length - 2] || lastBar;
  const prev2Bar = candles[candles.length - 3] || prevBar;
  const lastBull = lastBar.close >= lastBar.open;
  const avgVol = candles.slice(-20).reduce((acc, c) => acc + (c.volume || 1), 0) / Math.max(1, Math.min(20, candles.length));
  const volRatio = avgVol > 0 ? (lastBar.volume || avgVol) / avgVol : 1;

  const recentRangeBars = candles.slice(-14, -2);
  const avgRangePct =
    recentRangeBars.length > 0
      ? recentRangeBars.reduce((acc, c) => acc + (c.close > 0 ? ((c.high - c.low) / c.close) * 100 : 0), 0) / recentRangeBars.length
      : 0.8;
  const curRangePct = lastBar.close > 0 ? ((lastBar.high - lastBar.low) / lastBar.close) * 100 : 0;

  const { volatilitySubRegime, executionPosture } = classifyVolatilitySubRegime({
    atrPct,
    volRatio,
    curRangePct,
    avgRangePct,
    liveSpreadPct,
    cvdMomentumPct,
  });

  const btcShortCandles = btcSweepCandles && btcSweepCandles.length >= 12 ? btcSweepCandles : btcCandles;
  const btcSweepTrigger = detectBtcLiquiditySweepRebound(btcShortCandles, btcMarket);
  const betaRatioVsBtc = computeBetaVsBtc(candles, btcShortCandles, atrPct, market.symbol);

  // Strict 5-10s Latency TTL (7.5s for post-sweep liquidity bounces, 9s for directional snipers)
  const signalTtlMs = btcSweepTrigger.reboundConfirmed ? SWEEP_SIGNAL_TTL_MS : DEFAULT_SIGNAL_TTL_MS;
  const expiresAt = Date.now() + signalTtlMs;

  const makeSignal = (
    strategyId: StrategyId,
    strategyName: string,
    priority: 'PRIORITARIA' | 'CORE',
    suitedRegimes: MarketRegime[],
    direction: 'LONG' | 'SHORT' | 'WAIT',
    rawScore: number,
    slMult: number,
    justification: string
  ): StructuredStrategySignal => {
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    const entryPx =
      direction === 'LONG' ? bestBid || currentPrice : direction === 'SHORT' ? bestAsk || currentPrice : currentPrice;
    const lv = buildLevels(direction, entryPx, atrPct, slMult, support, resistance);
    return {
      strategyId,
      strategyName,
      priority,
      suitedRegimes,
      direction,
      entryPrice: roundPx(entryPx, currentPrice),
      stopLoss: lv.stopLoss,
      tp1: lv.tp1,
      tp2: lv.tp2,
      tp3: lv.tp3,
      score,
      riskRewardRatio: lv.rr,
      timeframe,
      expiresAt,
      justification,
      stage: score >= 65 && direction !== 'WAIT' ? 'CONFIRMED' : score >= 50 ? 'SIGNAL' : 'REJECTED',
    };
  };

  // =========================================================================
  // 10 INDEPENDENT STRATEGY MODULES
  // =========================================================================
  const signals: StructuredStrategySignal[] = [];

  // 1. Liquidity Sweep (PRIORITARIA)
  {
    const sweptLow = (lastBar.low < support * 1.0012 || prevBar.low < support * 1.0012) && lastBar.close > support && lastBull;
    const sweptHigh = (lastBar.high > resistance * 0.9988 || prevBar.high > resistance * 0.9988) && lastBar.close < resistance && !lastBull;
    const lowerWick = Math.min(lastBar.open, lastBar.close) - lastBar.low;
    const upperWick = lastBar.high - Math.max(lastBar.open, lastBar.close);
    const barRange = Math.max(1e-8, lastBar.high - lastBar.low);
    const strongLowerReject = lowerWick / barRange > 0.42;
    const strongUpperReject = upperWick / barRange > 0.42;

    const isBetaLeaderTarget =
      market.symbol !== 'BTC-PERP' &&
      (HIGH_BETA_PERPS as readonly string[]).includes(market.symbol) &&
      (betaRatioVsBtc >= 1.08 || market.symbol === 'ZEC-PERP' || market.symbol === 'HYPE-PERP' || market.symbol === 'SOL-PERP');
    const altReboundConfirm =
      btcSweepTrigger.reboundConfirmed &&
      isBetaLeaderTarget &&
      liveSpreadPct <= 0.055 &&
      rsi14 <= 68 &&
      (lastBull || cvdMomentumPct >= 4 || orderbookRatio >= 1.12);

    if (altReboundConfirm) {
      const betaBonus = Math.min(12, Math.round((betaRatioVsBtc - 1) * 18));
      const s = 72 + betaBonus + (strongLowerReject || sweptLow ? 8 : 0) + (cvdMomentumPct > 8 ? 6 : 0);
      signals.push(
        makeSignal(
          'LIQUIDITY_SWEEP',
          '1. Liquidity Sweep',
          'PRIORITARIA',
          ['RANGE_LATERAL', 'HIGH_VOLATILITY', 'BULL_TREND', 'BEAR_TREND'],
          'LONG',
          s,
          1.15,
          `[GATILLO BTC -> BETA ${betaRatioVsBtc}x] ${btcSweepTrigger.summary} Disparo LONG en ${market.symbol} (CVD ${cvdMomentumPct >= 0 ? '+' : ''}${cvdMomentumPct}%, L2 ${orderbookRatio}x).`
        )
      );
    } else if (sweptLow && (strongLowerReject || cvdMomentumPct > 4)) {
      const s = 68 + (strongLowerReject ? 12 : 0) + (cvdMomentumPct > 10 ? 10 : 0) + (rsi14 < 45 ? 6 : 0);
      signals.push(
        makeSignal(
          'LIQUIDITY_SWEEP',
          '1. Liquidity Sweep',
          'PRIORITARIA',
          ['RANGE_LATERAL', 'HIGH_VOLATILITY', 'BULL_TREND'],
          'LONG',
          s,
          1.15,
          `Barrida de liquidez bajo soporte $${support} con mecha de rechazo comprador y CVD ${cvdMomentumPct >= 0 ? '+' : ''}${cvdMomentumPct}%.`
        )
      );
    } else if (sweptHigh && (strongUpperReject || cvdMomentumPct < -4)) {
      const s = 68 + (strongUpperReject ? 12 : 0) + (cvdMomentumPct < -10 ? 10 : 0) + (rsi14 > 55 ? 6 : 0);
      signals.push(
        makeSignal(
          'LIQUIDITY_SWEEP',
          '1. Liquidity Sweep',
          'PRIORITARIA',
          ['RANGE_LATERAL', 'HIGH_VOLATILITY', 'BEAR_TREND'],
          'SHORT',
          s,
          1.15,
          `Barrida de stops sobre resistencia $${resistance} con rechazo vendedor y presión CVD ${cvdMomentumPct}%.`
        )
      );
    } else {
      signals.push(
        makeSignal(
          'LIQUIDITY_SWEEP',
          '1. Liquidity Sweep',
          'PRIORITARIA',
          ['RANGE_LATERAL', 'HIGH_VOLATILITY', 'BULL_TREND', 'BEAR_TREND'],
          'WAIT',
          36,
          1.15,
          `Sin barrida confirmada en extremos $${support} / $${resistance}. Esperando caza de stops.`
        )
      );
    }
  }

  // 2. Breakout & Retest
  {
    const brokeUp = currentPrice > resistance * 0.999 && prevBar.close >= resistance * 0.996 && lastBull;
    const brokeDown = currentPrice < support * 1.001 && prevBar.close <= support * 1.004 && !lastBull;
    if (brokeUp && volRatio >= 1.05 && ema9 > ema21) {
      const s = 64 + (volRatio > 1.3 ? 12 : 6) + (cvdMomentumPct > 8 ? 10 : 0) + (m15 === 'BULLISH' ? 6 : 0);
      signals.push(
        makeSignal(
          'BREAKOUT_RETEST',
          '2. Breakout & Retest',
          'CORE',
          ['BULL_TREND', 'HIGH_VOLATILITY'],
          'LONG',
          s,
          1.25,
          `Ruptura y retesteo sobre resistencia $${resistance} con volumen ${volRatio.toFixed(2)}x y EMA9 > EMA21.`
        )
      );
    } else if (brokeDown && volRatio >= 1.05 && ema9 < ema21) {
      const s = 64 + (volRatio > 1.3 ? 12 : 6) + (cvdMomentumPct < -8 ? 10 : 0) + (m15 === 'BEARISH' ? 6 : 0);
      signals.push(
        makeSignal(
          'BREAKOUT_RETEST',
          '2. Breakout & Retest',
          'CORE',
          ['BEAR_TREND', 'HIGH_VOLATILITY'],
          'SHORT',
          s,
          1.25,
          `Ruptura bajista bajo soporte $${support} con expansión de volumen ${volRatio.toFixed(2)}x.`
        )
      );
    } else {
      signals.push(
        makeSignal(
          'BREAKOUT_RETEST',
          '2. Breakout & Retest',
          'CORE',
          ['BULL_TREND', 'BEAR_TREND', 'HIGH_VOLATILITY'],
          'WAIT',
          40,
          1.25,
          `Precio dentro del rango $${support}–$${resistance}; sin breakout/retest limpio.`
        )
      );
    }
  }

  // 3. Smart Money Concepts (SMC: BOS / CHoCH + FVG)
  {
    const bullFvg = lastBar.low > prev2Bar.high * 1.0005 && prevBar.close > prevBar.open;
    const bearFvg = lastBar.high < prev2Bar.low * 0.9995 && prevBar.close < prevBar.open;
    const bullBos = currentPrice > ema21 && ema9 > ema21 && lastBull;
    const bearBos = currentPrice < ema21 && ema9 < ema21 && !lastBull;

    if ((bullFvg || bullBos) && currentPrice >= val) {
      const s = 54 + (bullFvg ? 16 : 6) + (bullBos ? 12 : 0) + (h1 === 'BULLISH' ? 10 : 0);
      signals.push(
        makeSignal(
          'SMC',
          '3. Smart Money Concepts',
          'CORE',
          ['BULL_TREND', 'RANGE_LATERAL'],
          bullFvg || bullBos ? 'LONG' : 'WAIT',
          s,
          1.2,
          bullFvg
            ? `Desequilibrio alcista FVG + Order Block institucional defendido sobre $${val}.`
            : `BOS estructural alcista con confluencia H1 y zona de demanda institucional.`
        )
      );
    } else if ((bearFvg || bearBos) && currentPrice <= vah) {
      const s = 54 + (bearFvg ? 16 : 6) + (bearBos ? 12 : 0) + (h1 === 'BEARISH' ? 10 : 0);
      signals.push(
        makeSignal(
          'SMC',
          '3. Smart Money Concepts',
          'CORE',
          ['BEAR_TREND', 'RANGE_LATERAL'],
          bearFvg || bearBos ? 'SHORT' : 'WAIT',
          s,
          1.2,
          bearFvg
            ? `FVG bajista institucional + distribución bajo zona oferta $${vah}.`
            : `BOS bajista confirmado con cambio de carácter (CHoCH) en flujo institucional.`
        )
      );
    } else {
      signals.push(
        makeSignal(
          'SMC',
          '3. Smart Money Concepts',
          'CORE',
          ['BULL_TREND', 'BEAR_TREND', 'RANGE_LATERAL'],
          'WAIT',
          42,
          1.2,
          `Sin FVG ni quiebre estructural BOS/CHoCH activo.`
        )
      );
    }
  }

  // 4. Mean Reversion (Deviation from EMA21 / Value Area)
  {
    const devPct = ema21 > 0 ? ((currentPrice - ema21) / ema21) * 100 : 0;
    if (devPct <= -1.25 && rsi14 <= 36 && lastBull) {
      const s = 62 + Math.min(20, Math.round(Math.abs(devPct) * 6)) + (cvdMomentumPct > 0 ? 10 : 0);
      signals.push(
        makeSignal(
          'MEAN_REVERSION',
          '4. Mean Reversion',
          'CORE',
          ['RANGE_LATERAL', 'HIGH_VOLATILITY'],
          'LONG',
          s,
          1.1,
          `Desviación extrema ${devPct.toFixed(2)}% bajo media EMA21 (RSI ${rsi14}) con vela de giro compradora.`
        )
      );
    } else if (devPct >= 1.25 && rsi14 >= 64 && !lastBull) {
      const s = 62 + Math.min(20, Math.round(Math.abs(devPct) * 6)) + (cvdMomentumPct < 0 ? 10 : 0);
      signals.push(
        makeSignal(
          'MEAN_REVERSION',
          '4. Mean Reversion',
          'CORE',
          ['RANGE_LATERAL', 'HIGH_VOLATILITY'],
          'SHORT',
          s,
          1.1,
          `Sobre-extensión +${devPct.toFixed(2)}% sobre EMA21 (RSI ${rsi14}) mostrando agotamiento de compra.`
        )
      );
    } else {
      signals.push(
        makeSignal(
          'MEAN_REVERSION',
          '4. Mean Reversion',
          'CORE',
          ['RANGE_LATERAL', 'HIGH_VOLATILITY'],
          'WAIT',
          38,
          1.1,
          `Desviación ${devPct.toFixed(2)}% dentro de banda normal; sin extremo estadístico.`
        )
      );
    }
  }

  // 5. Trend Following (EMA 9/21/50/200 stack)
  {
    const fullBullStack = ema9 > ema21 && ema21 > ema50 && currentPrice >= ema21 && rsi14 >= 44 && rsi14 <= 68;
    const fullBearStack = ema9 < ema21 && ema21 < ema50 && currentPrice <= ema21 && rsi14 <= 56 && rsi14 >= 32;
    if (fullBullStack) {
      const s = 65 + (ema50 > ema200 ? 12 : 4) + (lastBull ? 8 : -8) + (alignedCount >= 3 ? 8 : 0);
      signals.push(
        makeSignal(
          'TREND_FOLLOWING',
          '5. Trend Following',
          'CORE',
          ['BULL_TREND'],
          'LONG',
          s,
          1.35,
          `Alineación alcista EMA9 ($${ema9}) > EMA21 ($${ema21}) > EMA50 ($${ema50}) con RSI sano (${rsi14}).`
        )
      );
    } else if (fullBearStack) {
      const s = 65 + (ema50 < ema200 ? 12 : 4) + (!lastBull ? 8 : -8) + (alignedCount >= 3 ? 8 : 0);
      signals.push(
        makeSignal(
          'TREND_FOLLOWING',
          '5. Trend Following',
          'CORE',
          ['BEAR_TREND'],
          'SHORT',
          s,
          1.35,
          `Tendencia bajista limpia EMA9 < EMA21 < EMA50 y pendiente direccional confirmada (RSI ${rsi14}).`
        )
      );
    } else {
      signals.push(
        makeSignal(
          'TREND_FOLLOWING',
          '5. Trend Following',
          'CORE',
          ['BULL_TREND', 'BEAR_TREND'],
          'WAIT',
          44,
          1.35,
          `EMAs cruzadas/mixtas (${regime}); no hay tendencia direccional limpia.`
        )
      );
    }
  }

  // 6. Volume Profile (POC / VAH / VAL)
  {
    const nearValBounce = Math.abs(currentPrice - val) / Math.max(1e-8, currentPrice) < 0.0055 && lastBull;
    const abovePocAccept = currentPrice > poc && prevBar.close <= poc && lastBull;
    const nearVahReject = Math.abs(currentPrice - vah) / Math.max(1e-8, currentPrice) < 0.0055 && !lastBull;
    const belowPocReject = currentPrice < poc && prevBar.close >= poc && !lastBull;

    if (nearValBounce || abovePocAccept) {
      const s = 64 + (nearValBounce ? 14 : 10) + (cvdMomentumPct > 5 ? 8 : 0);
      signals.push(
        makeSignal(
          'VOLUME_PROFILE',
          '6. Volume Profile',
          'CORE',
          ['RANGE_LATERAL', 'BULL_TREND'],
          'LONG',
          s,
          1.2,
          nearValBounce
            ? `Rebote en Value Area Low (VAL $${val}) defendido hacia POC $${poc}.`
            : `Aceptación sobre Point of Control (POC $${poc}) rumbo a VAH $${vah}.`
        )
      );
    } else if (nearVahReject || belowPocReject) {
      const s = 64 + (nearVahReject ? 14 : 10) + (cvdMomentumPct < -5 ? 8 : 0);
      signals.push(
        makeSignal(
          'VOLUME_PROFILE',
          '6. Volume Profile',
          'CORE',
          ['RANGE_LATERAL', 'BEAR_TREND'],
          'SHORT',
          s,
          1.2,
          nearVahReject
            ? `Rechazo en Value Area High (VAH $${vah}) regresando hacia POC $${poc}.`
            : `Pérdida de aceptación bajo POC $${poc} con objetivo VAL $${val}.`
        )
      );
    } else {
      signals.push(
        makeSignal(
          'VOLUME_PROFILE',
          '6. Volume Profile',
          'CORE',
          ['RANGE_LATERAL', 'BULL_TREND', 'BEAR_TREND'],
          'WAIT',
          41,
          1.2,
          `Precio neutro dentro del área de valor VAL $${val} · POC $${poc} · VAH $${vah}.`
        )
      );
    }
  }

  // 7. Order Flow & CVD (Corregido: nunca clasificar desequilibrios extremos como equilibrados)
  {
    const extremeBullFlow = cvdMomentumPct >= 25 && orderbookRatio >= 1.45;
    const standardBullFlow = cvdMomentumPct >= 14 && orderbookRatio >= 1.15 && lastBull;
    const tapeDominantBull = cvdMomentumPct >= 40 && orderbookRatio >= 1.0;

    const extremeBearFlow = cvdMomentumPct <= -25 && orderbookRatio <= 0.68;
    const standardBearFlow = cvdMomentumPct <= -14 && orderbookRatio <= 0.88 && !lastBull;
    const tapeDominantBear = cvdMomentumPct <= -40 && orderbookRatio <= 1.0;

    if (extremeBullFlow || standardBullFlow || tapeDominantBull) {
      const s =
        68 +
        (cvdMomentumPct >= 45 ? 14 : cvdMomentumPct >= 25 ? 9 : 4) +
        (orderbookRatio >= 2.0 ? 10 : orderbookRatio >= 1.45 ? 6 : 2);
      signals.push(
        makeSignal(
          'ORDERFLOW_CVD',
          '7. Order Flow & CVD',
          'CORE',
          ['BULL_TREND', 'RANGE_LATERAL', 'HIGH_VOLATILITY'],
          'LONG',
          s,
          1.5,
          `${extremeBullFlow || tapeDominantBull ? 'Absorción alcista extrema' : 'Agresividad compradora L1'} (CVD +${cvdMomentumPct}% en 5-15m, ratio Bids/Asks ${orderbookRatio}x).`
        )
      );
    } else if (extremeBearFlow || standardBearFlow || tapeDominantBear) {
      const s =
        68 +
        (cvdMomentumPct <= -45 ? 14 : cvdMomentumPct <= -25 ? 9 : 4) +
        (orderbookRatio <= 0.5 ? 10 : orderbookRatio <= 0.7 ? 6 : 2);
      signals.push(
        makeSignal(
          'ORDERFLOW_CVD',
          '7. Order Flow & CVD',
          'CORE',
          ['BEAR_TREND', 'RANGE_LATERAL', 'HIGH_VOLATILITY'],
          'SHORT',
          s,
          1.5,
          `${extremeBearFlow || tapeDominantBear ? 'Distribución agresiva extrema' : 'Presión vendedora agresiva L1'} (CVD ${cvdMomentumPct}% en 5-15m, ratio L2 ${orderbookRatio}x).`
        )
      );
    } else {
      signals.push(
        makeSignal(
          'ORDERFLOW_CVD',
          '7. Order Flow & CVD',
          'CORE',
          ['BULL_TREND', 'BEAR_TREND', 'RANGE_LATERAL', 'HIGH_VOLATILITY'],
          'WAIT',
          43,
          1.5,
          `CVD 5-15m (${cvdMomentumPct}%) y libro L2 (${orderbookRatio}x) equilibrados sin absorción clara.`
        )
      );
    }
  }

  // 8. Liquidation Hunting
  {
    const fnd = market.fundingRate || 0;
    const negFundingSqueeze = fnd <= -0.00012 && cvdMomentumPct > 8 && lastBull;
    const posFundingFlush = fnd >= 0.00025 && cvdMomentumPct < -8 && !lastBull;
    if (negFundingSqueeze) {
      const s = 66 + (fnd <= -0.00025 ? 15 : 8) + (orderbookRatio > 1.2 ? 9 : 0);
      signals.push(
        makeSignal(
          'LIQUIDATION_HUNTING',
          '8. Liquidation Hunting',
          'CORE',
          ['HIGH_VOLATILITY', 'BULL_TREND'],
          'LONG',
          s,
          1.25,
          `Concentración de shorts sobre-apalancados (Funding ${(fnd * 100).toFixed(4)}%) lista para cascada de liquidación alcista.`
        )
      );
    } else if (posFundingFlush) {
      const s = 66 + (fnd >= 0.0004 ? 15 : 8) + (orderbookRatio < 0.85 ? 9 : 0);
      signals.push(
        makeSignal(
          'LIQUIDATION_HUNTING',
          '8. Liquidation Hunting',
          'CORE',
          ['HIGH_VOLATILITY', 'BEAR_TREND'],
          'SHORT',
          s,
          1.25,
          `Exceso de longs apalancados (Funding +${(fnd * 100).toFixed(4)}%) vulnerable a barrida bajista de liquidaciones.`
        )
      );
    } else {
      signals.push(
        makeSignal(
          'LIQUIDATION_HUNTING',
          '8. Liquidation Hunting',
          'CORE',
          ['HIGH_VOLATILITY', 'BULL_TREND', 'BEAR_TREND'],
          'WAIT',
          39,
          1.25,
          `Funding neutral (${(fnd * 100).toFixed(4)}%); sin cluster extremo de liquidaciones.`
        )
      );
    }
  }

  // 9. Momentum & Divergence (RSI + MACD)
  {
    const macdExpandingUp = macdHist > 0 && macdHist > prevHist && rsi14 >= 45 && rsi14 <= 70;
    const macdExpandingDown = macdHist < 0 && macdHist < prevHist && rsi14 <= 55 && rsi14 >= 30;
    if (macdExpandingUp && lastBull) {
      const s = 63 + (macdLine > macdSignal ? 12 : 4) + (cvdMomentumPct > 5 ? 8 : 0);
      signals.push(
        makeSignal(
          'MOMENTUM_DIVERGENCE',
          '9. Momentum & Divergence',
          'CORE',
          ['BULL_TREND', 'HIGH_VOLATILITY'],
          'LONG',
          s,
          1.25,
          `Histograma MACD acelerando al alza (${macdHist.toFixed(4)}) con RSI ${rsi14} sin sobrecompra.`
        )
      );
    } else if (macdExpandingDown && !lastBull) {
      const s = 63 + (macdLine < macdSignal ? 12 : 4) + (cvdMomentumPct < -5 ? 8 : 0);
      signals.push(
        makeSignal(
          'MOMENTUM_DIVERGENCE',
          '9. Momentum & Divergence',
          'CORE',
          ['BEAR_TREND', 'HIGH_VOLATILITY'],
          'SHORT',
          s,
          1.25,
          `Histograma MACD en expansión bajista (${macdHist.toFixed(4)}) y momentum RSI ${rsi14} descendente.`
        )
      );
    } else {
      signals.push(
        makeSignal(
          'MOMENTUM_DIVERGENCE',
          '9. Momentum & Divergence',
          'CORE',
          ['BULL_TREND', 'BEAR_TREND', 'HIGH_VOLATILITY'],
          'WAIT',
          44,
          1.25,
          `MACD (${macdHist.toFixed(4)}) y RSI (${rsi14}) sin divergencia ni aceleración clara.`
        )
      );
    }
  }

  // 10. Volatility Breakout (ATR compression -> range expansion)
  {
    const prevBars = candles.slice(-14, -2);
    const avgRangePct =
      prevBars.length > 0
        ? prevBars.reduce((acc, c) => acc + (c.close > 0 ? ((c.high - c.low) / c.close) * 100 : 0), 0) / prevBars.length
        : 0.6;
    const curRangePct = lastBar.close > 0 ? ((lastBar.high - lastBar.low) / lastBar.close) * 100 : 0;
    const isExpansion = curRangePct > avgRangePct * 1.45 && volRatio >= 1.2;

    if (isExpansion && lastBull && currentPrice > prevBar.high) {
      const s = 66 + (volRatio > 1.6 ? 14 : 7) + (ema9 > ema21 ? 8 : 0);
      signals.push(
        makeSignal(
          'VOLATILITY_BREAKOUT',
          '10. Volatility Breakout',
          'CORE',
          ['HIGH_VOLATILITY', 'BULL_TREND'],
          'LONG',
          s,
          1.3,
          `Expansión de volatilidad alcista (${curRangePct.toFixed(2)}% rango vs ${avgRangePct.toFixed(2)}% media) con vol ${volRatio.toFixed(2)}x.`
        )
      );
    } else if (isExpansion && !lastBull && currentPrice < prevBar.low) {
      const s = 66 + (volRatio > 1.6 ? 14 : 7) + (ema9 < ema21 ? 8 : 0);
      signals.push(
        makeSignal(
          'VOLATILITY_BREAKOUT',
          '10. Volatility Breakout',
          'CORE',
          ['HIGH_VOLATILITY', 'BEAR_TREND'],
          'SHORT',
          s,
          1.3,
          `Ruptura de compresión bajista (${curRangePct.toFixed(2)}% rango, vol ${volRatio.toFixed(2)}x ATR ${atrPct}%).`
        )
      );
    } else {
      signals.push(
        makeSignal(
          'VOLATILITY_BREAKOUT',
          '10. Volatility Breakout',
          'CORE',
          ['HIGH_VOLATILITY', 'BULL_TREND', 'BEAR_TREND'],
          'WAIT',
          40,
          1.3,
          `Sin ruptura explosiva de compresión (ATR ${atrPct}%, Vol ${volRatio.toFixed(2)}x).`
        )
      );
    }
  }

  // =========================================================================
  // ENSEMBLE INTELLIGENCE: REGIME + LIVE PERFORMANCE MATRIX + CONSENSUS
  // =========================================================================
  const perfMatrix = computeStrategyPerformanceMatrix(closedTrades, walkForwardStats, market.symbol);
  const perfById = new Map<string, StrategyPerformanceStat>(perfMatrix.map((p) => [p.strategyId, p]));
  const quarantinedStrategies = perfMatrix
    .filter((p) => p.status === 'QUARANTINED')
    .map((p) => p.strategyId as StrategyId);

  const eligibleSignals = signals.map((s) => {
    const perf = perfById.get(s.strategyId);
    if (perf?.status === 'QUARANTINED' && s.direction !== 'WAIT') {
      return {
        ...s,
        direction: 'WAIT' as const,
        score: Math.min(40, s.score - 25),
        stage: 'REJECTED' as const,
        justification: `[CUARENTENA ADAPTATIVA] ${s.strategyName} suspendida por rendimiento neto negativo (PF ${perf.profitFactor}, PnL $${perf.netPnlUsdc}).`,
      };
    }
    return s;
  });

  const directionalSignals = eligibleSignals.filter((s) => s.direction !== 'WAIT');
  const longSignals = directionalSignals.filter((s) => s.direction === 'LONG');
  const shortSignals = directionalSignals.filter((s) => s.direction === 'SHORT');

  let winningSignal: StructuredStrategySignal = eligibleSignals[0];
  let ensembleRawScore = 0;

  if (executionMode === 'CONSENSUS') {
    const bullScoreAvg = longSignals.reduce((acc, s) => acc + s.score, 0) / Math.max(1, longSignals.length);
    const bearScoreAvg = shortSignals.reduce((acc, s) => acc + s.score, 0) / Math.max(1, shortSignals.length);
    if (longSignals.length >= 3 && bullScoreAvg >= bearScoreAvg) {
      winningSignal = [...longSignals].sort((a, b) => b.score - a.score)[0];
      ensembleRawScore = Math.min(100, Math.round(bullScoreAvg + longSignals.length * 3));
    } else if (shortSignals.length >= 3) {
      winningSignal = [...shortSignals].sort((a, b) => b.score - a.score)[0];
      ensembleRawScore = Math.min(100, Math.round(bearScoreAvg + shortSignals.length * 3));
    } else {
      winningSignal = [...eligibleSignals].sort((a, b) => b.score - a.score)[0];
      ensembleRawScore = Math.min(58, winningSignal.score);
    }
  } else if (executionMode === 'INDEPENDENT') {
    const sorted = [...eligibleSignals].sort((a, b) => b.score - a.score);
    winningSignal = sorted[0];
    ensembleRawScore = winningSignal.score;
  } else {
    // MULTI_STRATEGY: Seleccionar por ajuste real al régimen y rendimiento histórico neto (SIN bono ciego a Liquidity Sweep)
    const weighted = eligibleSignals.map((s) => {
      const regimeBonus = s.suitedRegimes.includes(regime) ? 8 : -8;
      const perf = perfById.get(s.strategyId);
      const perfDelta =
        perf?.status === 'QUARANTINED'
          ? -30
          : perf?.status === 'PENALIZED'
          ? -12
          : perf && perf.tradesCount >= 4 && perf.profitFactor >= 1.35 && perf.netPnlUsdc > 0
          ? +6
          : 0;
      const activeBonus = s.direction !== 'WAIT' ? 5 : -15;
      return { sig: s, weight: s.score + regimeBonus + perfDelta + activeBonus };
    });
    weighted.sort((a, b) => b.weight - a.weight);
    winningSignal = weighted[0].sig;
    const sameSideCount = directionalSignals.filter((s) => s.direction === winningSignal.direction).length;
    ensembleRawScore =
      winningSignal.direction === 'WAIT'
        ? winningSignal.score
        : Math.min(100, Math.round(winningSignal.score + Math.min(10, sameSideCount * 2.5)));
  }

  // Calibración histórica REAL por estrategia/régimen (sin inventar % cuando no hay trades)
  const relevantClosed = closedTrades.filter((t) => t.openedBy === 'AI_BOT');
  const stratMatches = relevantClosed.filter(
    (t) =>
      t.strategyId === winningSignal.strategyId ||
      t.strategyName === winningSignal.strategyName ||
      t.strategyUsed === winningSignal.strategyName
  );
  const calSample = (stratMatches.length >= 3 ? stratMatches : relevantClosed).slice(0, 20);
  const calGrossWin = calSample.filter((t) => t.realizedPnl > 0).reduce((a, t) => a + t.realizedPnl, 0);
  const calGrossLoss = Math.abs(calSample.filter((t) => t.realizedPnl < 0).reduce((a, t) => a + t.realizedPnl, 0));
  const calNetPnl = calSample.reduce((a, t) => a + t.realizedPnl, 0);
  const calPf = calGrossLoss > 0 ? calGrossWin / calGrossLoss : calGrossWin > 0 ? 2.0 : 0;
  // Piso inicial de calibración WR en 40% (nunca 0%)
  const rawSampleWr =
    calSample.length > 0
      ? +((calSample.filter((t) => t.realizedPnl > 0).length / calSample.length) * 100).toFixed(1)
      : WR_CALIBRATION_FLOOR_PCT;
  const historicalCalibrationWr = Math.max(WR_CALIBRATION_FLOOR_PCT, rawSampleWr);

  let calibrationDelta = 0;
  if (calSample.length >= 3) {
    if (calNetPnl < 0 && calPf < 0.9) calibrationDelta = -16;
    else if (calNetPnl < 0) calibrationDelta = -8;
    else if (calSample.length >= 6 && calPf >= 1.35 && calNetPnl > 0) calibrationDelta = +4;
  }

  // Costes L1 reales de ida y vuelta (0.12% baseline) + EV neto esperado
  const stopDistancePct =
    winningSignal.entryPrice > 0 && winningSignal.stopLoss > 0
      ? Math.abs(winningSignal.entryPrice - winningSignal.stopLoss) / winningSignal.entryPrice
      : 0.015;
  const tpTargetDistancePct =
    winningSignal.entryPrice > 0 && winningSignal.tp3 > 0
      ? Math.abs(winningSignal.tp3 - winningSignal.entryPrice) / winningSignal.entryPrice
      : stopDistancePct * SINGLE_TP_R;

  const fr = market.fundingRate || 0;
  const projectedFundingDragPct =
    winningSignal.direction === 'LONG'
      ? Math.max(0, fr * 100)
      : winningSignal.direction === 'SHORT'
      ? Math.max(0, -fr * 100)
      : 0;
  const estimatedRoundTripCostPct = +(Math.max(L1_ROUND_TRIP_COST_PCT, L1_ROUND_TRIP_COST_PCT + projectedFundingDragPct)).toFixed(3);

  const calibratedWrDec = calSample.length >= 6 ? historicalCalibrationWr / 100 : WR_CALIBRATION_FLOOR_PCT / 100;
  const conservativeWinProb = Math.min(0.65, Math.max(0.4, calibratedWrDec * 0.45 + (ensembleRawScore / 100) * 0.35));
  const netExpectedEvPct = +((conservativeWinProb * tpTargetDistancePct - (1 - conservativeWinProb) * stopDistancePct) * 100 - estimatedRoundTripCostPct).toFixed(3);

  const isBtcSweepReboundShot =
    winningSignal.strategyId === 'LIQUIDITY_SWEEP' &&
    winningSignal.direction === 'LONG' &&
    btcSweepTrigger.reboundConfirmed &&
    (HIGH_BETA_PERPS as readonly string[]).includes(market.symbol);

  // Conteo unificado a 4 Pilares antes de firmar
  const checkDirection = winningSignal.direction;
  const pillar1Trend =
    checkDirection === 'LONG'
      ? isBtcSweepReboundShot
        ? m5 === 'BULLISH' || m15 === 'BULLISH' || lastBull
        : h4 === 'BULLISH' && (m15 === 'BULLISH' || h1 === 'BULLISH')
      : checkDirection === 'SHORT'
      ? h4 === 'BEARISH' && (m15 === 'BEARISH' || h1 === 'BEARISH')
      : false;
  const pillar2Momentum =
    checkDirection === 'LONG'
      ? rsi14 >= (isBtcSweepReboundShot ? 28 : 42) && rsi14 <= 70 && (macdHist >= prevHist || lastBull)
      : checkDirection === 'SHORT'
      ? rsi14 <= 58 && rsi14 >= 30 && (macdHist <= prevHist || !lastBull)
      : false;
  const pillar3OrderFlow =
    checkDirection === 'LONG'
      ? cvdMomentumPct >= (isBtcSweepReboundShot ? 4 : 8) || orderbookRatio >= 1.15
      : checkDirection === 'SHORT'
      ? cvdMomentumPct <= -8 || orderbookRatio <= 0.88
      : false;
  const pillar4RiskCost =
    checkDirection !== 'WAIT' &&
    stopDistancePct <= MAX_SL_DISTANCE_PCT &&
    tpTargetDistancePct * 100 >= L1_ROUND_TRIP_COST_PCT * MIN_FEE_COVERAGE_MULT &&
    (winningSignal.riskRewardRatio || SINGLE_TP_R) >= MIN_PRE_ORDER_RR &&
    winningSignal.tp3 !== winningSignal.stopLoss;
  const alignedPillarsCount = [pillar1Trend, pillar2Momentum, pillar3OrderFlow, pillar4RiskCost].filter(Boolean).length;

  // Filtros estrictos de calidad de entrada, MTF 15m/1h+4h, régimen volatilidad, gatillo BTC líder, SL <= 2.5%
  const contradictionFilters: string[] = [];
  if (!hasFullMtf) {
    contradictionFilters.push('MTF incompleto (faltan velas reales 5m/15m/1h/4h)');
  }
  if (liveSpreadPct > 0.06) {
    contradictionFilters.push(`Spread L2 amplio (${liveSpreadPct.toFixed(3)}% > 0.06%)`);
  }
  if (winningSignal.direction !== 'WAIT') {
    if (
      executionPosture === 'STAY_QUIET' &&
      winningSignal.strategyId !== 'VOLATILITY_BREAKOUT' &&
      winningSignal.strategyId !== 'LIQUIDITY_SWEEP'
    ) {
      contradictionFilters.push(
        `Régimen Rango Estrecho (${volatilitySubRegime}): agente quieto para no regalar comisiones L1`
      );
    }
    if (
      executionPosture === 'WAIT_CONFIRMATION' &&
      !(winningSignal.strategyId === 'LIQUIDITY_SWEEP' && (btcSweepTrigger.reboundConfirmed || market.symbol === 'BTC-PERP'))
    ) {
      contradictionFilters.push(
        `Régimen Pánico/Noticias (${volatilitySubRegime}): esperando confirmación de barrido y absorción`
      );
    }
    if (
      market.symbol !== 'BTC-PERP' &&
      winningSignal.direction === 'LONG' &&
      btcSweepTrigger.sweepDetected &&
      !btcSweepTrigger.reboundConfirmed
    ) {
      contradictionFilters.push(
        'Gatillo BTC Líder en espera: BTC barrió mínimos pero falta giro alcista confirmado'
      );
    }
    if (stopDistancePct > MAX_SL_DISTANCE_PCT) {
      contradictionFilters.push(
        `SL 1.5x ATR (${(stopDistancePct * 100).toFixed(2)}%) supera máximo 2.5% permitido — entrada descartada`
      );
    }
    if (winningSignal.tp3 === winningSignal.stopLoss) {
      contradictionFilters.push('TP igual a SL inválido');
    }
    if ((winningSignal.riskRewardRatio || 0) < MIN_PRE_ORDER_RR) {
      contradictionFilters.push(`R:R ${(winningSignal.riskRewardRatio || 0).toFixed(2)} < ${MIN_PRE_ORDER_RR}:1 mínimo`);
    }
    if (tpTargetDistancePct * 100 < L1_ROUND_TRIP_COST_PCT * MIN_FEE_COVERAGE_MULT) {
      contradictionFilters.push(
        `Distancia TP (${(tpTargetDistancePct * 100).toFixed(2)}%) no cubre 4x coste L1 (${(L1_ROUND_TRIP_COST_PCT * MIN_FEE_COVERAGE_MULT).toFixed(2)}%)`
      );
    }
    if (netExpectedEvPct <= 0.15) {
      contradictionFilters.push(`EV Neto insuficiente tras fees/funding (${netExpectedEvPct}%)`);
    }
    if (alignedPillarsCount < UNIFIED_MIN_PILLARS) {
      contradictionFilters.push(`Pilares insuficientes (${alignedPillarsCount}/${UNIFIED_TOTAL_PILLARS}, exige ${UNIFIED_MIN_PILLARS}/${UNIFIED_TOTAL_PILLARS})`);
    }
  }

  if (winningSignal.direction === 'LONG') {
    if (!isBtcSweepReboundShot) {
      if (h4 === 'BEARISH') {
        contradictionFilters.push('Filtro 4h bajista bloquea LONG');
      } else if (m15 !== 'BULLISH' && h1 !== 'BULLISH') {
        contradictionFilters.push(`Falta confirmación 15m/1h alcista (15m ${m15}, 1h ${h1})`);
      }
      if (btcCorrelation >= 0.65 && btcDirection === 'BEARISH' && market.symbol !== 'BTC-PERP') {
        contradictionFilters.push(`Correlación BTC (${btcCorrelation}) bajista bloquea LONG`);
      }
    }
    if (rsi14 > 72) {
      contradictionFilters.push(`Sobrecompra FOMO RSI ${rsi14} > 72`);
    }
  } else if (winningSignal.direction === 'SHORT') {
    if (h4 === 'BULLISH') {
      contradictionFilters.push('Filtro 4h alcista bloquea SHORT');
    } else if (m15 !== 'BEARISH' && h1 !== 'BEARISH') {
      contradictionFilters.push(`Falta confirmación 15m/1h bajista (15m ${m15}, 1h ${h1})`);
    }
    if (btcCorrelation >= 0.65 && btcDirection === 'BULLISH' && market.symbol !== 'BTC-PERP') {
      contradictionFilters.push(`Correlación BTC (${btcCorrelation}) alcista bloquea SHORT`);
    }
    if (rsi14 < 28) {
      contradictionFilters.push(`Sobreventa extrema RSI ${rsi14} < 28`);
    }
  }

  const filterPenalty = contradictionFilters.length * 10;
  const calibratedScore = Math.max(0, Math.min(100, Math.round(ensembleRawScore + calibrationDelta - filterPenalty)));

  // Tamaño de posición controlado (Single Source of Truth):
  // $12-$15 USD mientras equity < $100, apalancamiento máx 3x, y SKIP_MIN_NOTIONAL si < $11.50 sin disparar Kill Switch
  const sizing = computeControlledPositionSizing({
    equityUsdc: walletEquityUsdc,
    maxMarginBudgetPct,
    riskPerTradePct: riskConfig.riskPerTradePct,
    stopDistancePct,
    marketMaxLeverage: Math.min(effectiveLevCap, market.maxLeverage || MAX_GLOBAL_LEVERAGE),
    score: calibratedScore,
  });

  const suggestedRiskLeverage = sizing.leverage;
  const riskAmountUsdc = sizing.riskAmountUsdc;
  const abstainedByL1Minimum = sizing.skipMinNotional && winningSignal.direction !== 'WAIT';
  const l1MinimumAbstainReason = abstainedByL1Minimum ? sizing.skipReason : null;
  if (abstainedByL1Minimum && l1MinimumAbstainReason) {
    contradictionFilters.push(l1MinimumAbstainReason);
  }
  const suggestedRiskMarginUsdc = abstainedByL1Minimum ? 0 : sizing.marginUsdc;

  let decisionTier: DecisionTier = 'NO_OPERAR';
  if (calibratedScore >= 80 && alignedPillarsCount >= UNIFIED_MIN_PILLARS) decisionTier = 'CONFLUENCIA_ALTA';
  else if (calibratedScore >= UNIFIED_MIN_SCORE && alignedPillarsCount >= UNIFIED_MIN_PILLARS) decisionTier = 'SENAL_VALIDA';
  else if (calibratedScore >= 50) decisionTier = 'ESPERAR_CONFIRMACION';

  const finalDirection: 'LONG' | 'SHORT' | 'WAIT' =
    !abstainedByL1Minimum &&
    calibratedScore >= UNIFIED_MIN_SCORE &&
    alignedPillarsCount >= UNIFIED_MIN_PILLARS &&
    winningSignal.direction !== 'WAIT' &&
    contradictionFilters.length === 0
      ? winningSignal.direction
      : 'WAIT';

  const pipelineStage: EnsembleDecision['pipelineStage'] =
    finalDirection !== 'WAIT'
      ? 'EXECUTION_APPROVED'
      : contradictionFilters.length > 0
      ? 'EXECUTION_BLOCKED'
      : calibratedScore >= 50
      ? 'CONFIRMATION'
      : 'SIGNAL';

  const annotatedSignals = eligibleSignals.map((s) => {
    if (s.strategyId === winningSignal.strategyId && finalDirection !== 'WAIT') {
      return { ...s, stage: 'AUTHORIZED' as const };
    }
    if ((contradictionFilters.length > 0 && s.direction === winningSignal.direction) || s.stage === 'REJECTED') {
      return { ...s, stage: 'REJECTED' as const };
    }
    return s;
  });

  const justification =
    finalDirection !== 'WAIT'
      ? `[${decisionTier === 'CONFLUENCIA_ALTA' ? '80-100 Confluencia Alta' : '65-79 Señal Válida'}] ${winningSignal.strategyName} (${regime}, ${alignedPillarsCount}/${UNIFIED_TOTAL_PILLARS} pilares, ${alignedCount}/4 TFs, EV Neto +${netExpectedEvPct}% tras ${estimatedRoundTripCostPct}% coste L1). ${winningSignal.justification}`
      : contradictionFilters.length > 0
      ? `Abstención controlada: ${contradictionFilters.join(' · ')}.`
      : `Régimen ${regime} en espera (${calibratedScore}/100 < ${UNIFIED_MIN_SCORE} o ${alignedPillarsCount}/${UNIFIED_TOTAL_PILLARS} pilares). ${winningSignal.justification}`;

  return {
    symbol: market.symbol,
    regime,
    brainMode,
    executionMode,
    selectedStrategyId: winningSignal.strategyId,
    selectedStrategyName: winningSignal.strategyName,
    direction: finalDirection,
    rawScore: ensembleRawScore,
    calibratedScore,
    historicalCalibrationWr,
    decisionTier,
    entryPrice: winningSignal.entryPrice,
    stopLoss: winningSignal.stopLoss,
    tp1: winningSignal.tp1,
    tp2: winningSignal.tp2,
    tp3: winningSignal.tp3,
    riskRewardRatio: winningSignal.riskRewardRatio || SINGLE_TP_R,
    timeframe,
    expiresAt,
    justification,
    pipelineStage,
    contradictionFilters,
    mtf,
    indicators,
    signals: annotatedSignals,
    suggestedRiskLeverage,
    suggestedRiskMarginUsdc,
    suggestedNotionalUsdc: sizing.targetNotionalUsdc,
    riskAmountUsdc,
    stopDistancePct: +(stopDistancePct * 100).toFixed(2),
    alignedPillarsCount,
    totalPillarsCount: UNIFIED_TOTAL_PILLARS,
    netExpectedEvPct,
    estimatedRoundTripCostPct,
    abstainedByL1Minimum,
    l1MinimumAbstainReason,
    skipMinNotional: sizing.skipMinNotional,
    hasFullMtf,
    quarantinedStrategies,
    volatilitySubRegime,
    executionPosture,
    btcSweepTrigger,
    betaRatioVsBtc,
    signalTtlMs,
    isolatedMarginRecommended:
      ISOLATED_SNIPER_MARGIN_DEFAULT &&
      (suggestedRiskMarginUsdc <= 25 || walletEquityUsdc < 100 || isBtcSweepReboundShot || winningSignal.strategyId === 'LIQUIDITY_SWEEP'),
    calculatedAt: Date.now(),
  };
}

/**
 * WALK-FORWARD & BACKTESTING FUERA DE MUESTRA CON COMISIONES REALES L1 Y FUNDING
 * Opera estrictamente sobre velas históricas reales de Hyperliquid (NO muta parámetros en producción).
 */
export function runWalkForwardValidation(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  fundingRate8h: number;
}): WalkForwardStats {
  const { symbol, timeframe, candles, fundingRate8h } = params;
  if (!candles || candles.length < 70) {
    return {
      symbol,
      timeframe,
      candlesAnalyzed: candles?.length || 0,
      inSampleRatio: 0.7,
      outOfSampleWinRate: 0,
      outOfSampleProfitFactor: 0,
      netReturnAfterFeesAndFundingPct: 0,
      maxDrawdownPct: 0,
      feeBpsRoundTrip: 6.0,
      fundingBpsAvg: +(Math.abs(fundingRate8h) * 10000).toFixed(2),
      parameterLockStatus: 'LOCKED_PROTECTED',
      summary: 'Velas históricas insuficientes (<70) para split Walk-Forward 70/30.',
      strategyBreakdown: [],
      computedAt: Date.now(),
    };
  }

  const splitIdx = Math.floor(candles.length * 0.7);
  const roundTripFeePct = 0.0006; // 1.5 bps Maker entry + 4.5 bps Taker exit = 6 bps (0.06%)
  const barFundingCostPct = Math.abs(fundingRate8h) * 0.12; // pro-rated per holding interval

  const strategyConfigs: Array<{ id: StrategyId; name: string }> = [
    { id: 'LIQUIDITY_SWEEP', name: '1. Liquidity Sweep' },
    { id: 'BREAKOUT_RETEST', name: '2. Breakout & Retest' },
    { id: 'SMC', name: '3. Smart Money Concepts' },
    { id: 'MEAN_REVERSION', name: '4. Mean Reversion' },
    { id: 'TREND_FOLLOWING', name: '5. Trend Following' },
    { id: 'VOLUME_PROFILE', name: '6. Volume Profile' },
    { id: 'ORDERFLOW_CVD', name: '7. Order Flow & CVD' },
    { id: 'LIQUIDATION_HUNTING', name: '8. Liquidation Hunting' },
    { id: 'MOMENTUM_DIVERGENCE', name: '9. Momentum & Divergence' },
    { id: 'VOLATILITY_BREAKOUT', name: '10. Volatility Breakout' },
  ];

  const oosTradesPnl: number[] = [];
  const stratAccumulator = new Map<
    StrategyId,
    { inW: number; inTotal: number; outW: number; outTotal: number; outGrossWin: number; outGrossLoss: number; outNet: number }
  >();
  for (const sc of strategyConfigs) {
    stratAccumulator.set(sc.id, { inW: 0, inTotal: 0, outW: 0, outTotal: 0, outGrossWin: 0, outGrossLoss: 0, outNet: 0 });
  }

  // Deterministic historical bar-by-bar simulator across real candles (look-forward max 8 bars)
  for (let i = 36; i < candles.length - 8; i += 2) {
    const windowCandles = candles.slice(Math.max(0, i - 60), i + 1);
    const bar = candles[i];
    const isOos = i >= splitIdx;
    const closes = windowCandles.map((c) => c.close);
    const ema9 = calcEMA(closes.slice(-20), 9);
    const ema21 = calcEMA(closes.slice(-32), 21);
    const rsi = calcRSI(closes, 14);
    const atrPct = calcATRPercent(windowCandles, 14);
    const slPct = Math.max(0.009, Math.min(0.025, (atrPct / 100) * 1.15));
    const sup = Math.min(...windowCandles.slice(-18, -1).map((c) => c.low));
    const res = Math.max(...windowCandles.slice(-18, -1).map((c) => c.high));

    // Check which strategy signals trigger on this real historical bar
    const triggered: Array<{ id: StrategyId; dir: 'LONG' | 'SHORT' }> = [];
    if (bar.low < sup && bar.close > sup) triggered.push({ id: 'LIQUIDITY_SWEEP', dir: 'LONG' });
    else if (bar.high > res && bar.close < res) triggered.push({ id: 'LIQUIDITY_SWEEP', dir: 'SHORT' });

    if (bar.close > res && bar.close > bar.open) triggered.push({ id: 'BREAKOUT_RETEST', dir: 'LONG' });
    else if (bar.close < sup && bar.close < bar.open) triggered.push({ id: 'BREAKOUT_RETEST', dir: 'SHORT' });

    if (ema9 > ema21 && rsi >= 45 && rsi <= 68 && bar.close > bar.open) triggered.push({ id: 'TREND_FOLLOWING', dir: 'LONG' });
    else if (ema9 < ema21 && rsi <= 55 && rsi >= 32 && bar.close < bar.open) triggered.push({ id: 'TREND_FOLLOWING', dir: 'SHORT' });

    if (rsi < 34 && bar.close > bar.open) triggered.push({ id: 'MEAN_REVERSION', dir: 'LONG' });
    else if (rsi > 66 && bar.close < bar.open) triggered.push({ id: 'MEAN_REVERSION', dir: 'SHORT' });

    const macd = calcMACD(closes);
    if (macd.macdHist > 0 && macd.macdHist > macd.prevHist) triggered.push({ id: 'MOMENTUM_DIVERGENCE', dir: 'LONG' });
    else if (macd.macdHist < 0 && macd.macdHist < macd.prevHist) triggered.push({ id: 'MOMENTUM_DIVERGENCE', dir: 'SHORT' });

    if (bar.close > ema21 && windowCandles[windowCandles.length - 2].close > windowCandles[windowCandles.length - 2].open) {
      triggered.push({ id: 'SMC', dir: 'LONG' });
    } else if (bar.close < ema21 && windowCandles[windowCandles.length - 2].close < windowCandles[windowCandles.length - 2].open) {
      triggered.push({ id: 'SMC', dir: 'SHORT' });
    }

    const avgRng =
      windowCandles.slice(-10, -1).reduce((a, c) => a + (c.high - c.low) / Math.max(1e-8, c.close), 0) / 9;
    const curRng = (bar.high - bar.low) / Math.max(1e-8, bar.close);
    if (curRng > avgRng * 1.4 && bar.close > bar.open) triggered.push({ id: 'VOLATILITY_BREAKOUT', dir: 'LONG' });
    else if (curRng > avgRng * 1.4 && bar.close < bar.open) triggered.push({ id: 'VOLATILITY_BREAKOUT', dir: 'SHORT' });

    const vp = calcVolumeProfile(windowCandles, bar.close);
    if (bar.close > vp.poc && bar.close > bar.open) triggered.push({ id: 'VOLUME_PROFILE', dir: 'LONG' });
    else if (bar.close < vp.poc && bar.close < bar.open) triggered.push({ id: 'VOLUME_PROFILE', dir: 'SHORT' });

    const buyBias = bar.close >= bar.open && (bar.volume || 1) >= (windowCandles[windowCandles.length - 2].volume || 1);
    if (buyBias && ema9 >= ema21) triggered.push({ id: 'ORDERFLOW_CVD', dir: 'LONG' });
    else if (!buyBias && ema9 <= ema21) triggered.push({ id: 'ORDERFLOW_CVD', dir: 'SHORT' });

    if (fundingRate8h <= -0.0001 && bar.close > bar.open) triggered.push({ id: 'LIQUIDATION_HUNTING', dir: 'LONG' });
    else if (fundingRate8h >= 0.00015 && bar.close < bar.open) triggered.push({ id: 'LIQUIDATION_HUNTING', dir: 'SHORT' });

    if (triggered.length === 0) continue;

    // Evaluate future bars using realistic TP1 (30%) + Break-Even + TP2 (30%) + TP3 (40%) lifecycle
    const evalOutcome = (dir: 'LONG' | 'SHORT'): number => {
      const entry = bar.close;
      let tp1Hit = false;
      let tp2Hit = false;
      let remaining = 1.0;
      let totalRet = 0;

      for (let f = 1; f <= 8; f++) {
        const fb = candles[i + f];
        const moveBest = dir === 'LONG' ? (fb.high - entry) / entry : (entry - fb.low) / entry;
        const moveWorst = dir === 'LONG' ? (fb.low - entry) / entry : (entry - fb.high) / entry;
        const activeSl = tp1Hit ? 0.0012 : -slPct; // After TP1, Break-Even protects remaining!

        if (moveWorst <= activeSl) {
          totalRet += remaining * activeSl;
          remaining = 0;
          break;
        }
        if (!tp1Hit && moveBest >= slPct * 1.0) {
          tp1Hit = true;
          totalRet += 0.3 * (slPct * 1.0);
          remaining -= 0.3;
        }
        if (!tp2Hit && moveBest >= slPct * 2.0) {
          tp2Hit = true;
          totalRet += 0.3 * (slPct * 2.0);
          remaining -= 0.3;
        }
        if (moveBest >= slPct * 3.0) {
          totalRet += remaining * (slPct * 3.0);
          remaining = 0;
          break;
        }
      }
      if (remaining > 0) {
        const endClose = candles[i + 8].close;
        const endMove = dir === 'LONG' ? (endClose - entry) / entry : (entry - endClose) / entry;
        totalRet += remaining * endMove;
      }
      return (totalRet - roundTripFeePct - barFundingCostPct) * 100; // Net % after fees & funding
    };

    const primaryOutcome = evalOutcome(triggered[0].dir);
    if (isOos) oosTradesPnl.push(primaryOutcome);

    for (const tr of triggered) {
      const acc = stratAccumulator.get(tr.id)!;
      const netPct = evalOutcome(tr.dir);
      if (isOos) {
        acc.outTotal++;
        acc.outNet += netPct;
        if (netPct > 0) {
          acc.outW++;
          acc.outGrossWin += netPct;
        } else {
          acc.outGrossLoss += Math.abs(netPct);
        }
      } else {
        acc.inTotal++;
        if (netPct > 0) acc.inW++;
      }
    }
  }

  let equity = 100;
  let peak = 100;
  let maxDd = 0;
  let oosWins = 0;
  let grossWin = 0;
  let grossLoss = 0;
  for (const p of oosTradesPnl) {
    equity *= 1 + p / 100;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
    if (p > 0) {
      oosWins++;
      grossWin += p;
    } else {
      grossLoss += Math.abs(p);
    }
  }

  const outOfSampleWinRate = oosTradesPnl.length > 0 ? +((oosWins / oosTradesPnl.length) * 100).toFixed(1) : 0;
  const outOfSampleProfitFactor = grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : grossWin > 0 ? 2.4 : 0;
  const netReturnAfterFeesAndFundingPct = +(equity - 100).toFixed(2);

  const strategyBreakdown: StrategyWalkForwardMetric[] = strategyConfigs.map((sc) => {
    const acc = stratAccumulator.get(sc.id)!;
    const inWr = acc.inTotal > 0 ? +((acc.inW / acc.inTotal) * 100).toFixed(1) : 0;
    const outWr = acc.outTotal > 0 ? +((acc.outW / acc.outTotal) * 100).toFixed(1) : 0;
    const pf = acc.outGrossLoss > 0 ? +(acc.outGrossWin / acc.outGrossLoss).toFixed(2) : acc.outGrossWin > 0 ? 2.1 : 0;
    // En Walk-Forward fuera de muestra exigir rentabilidad neta positiva + PF >= 1.15 (NO confundir WR% con rentabilidad)
    return {
      strategyId: sc.id,
      strategyName: sc.name,
      inSampleTrades: acc.inTotal,
      inSampleWinRate: inWr,
      outOfSampleTrades: acc.outTotal,
      outOfSampleWinRate: outWr,
      outOfSampleProfitFactor: pf,
      netPnlPctAfterFees: +acc.outNet.toFixed(2),
      validatedForLive: acc.outTotal >= 4 && pf >= 1.15 && acc.outNet > 0,
    };
  });

  return {
    symbol,
    timeframe,
    candlesAnalyzed: candles.length,
    inSampleRatio: 0.7,
    outOfSampleWinRate,
    outOfSampleProfitFactor,
    netReturnAfterFeesAndFundingPct,
    maxDrawdownPct: +maxDd.toFixed(2),
    feeBpsRoundTrip: 6.0,
    fundingBpsAvg: +(Math.abs(fundingRate8h) * 10000).toFixed(2),
    parameterLockStatus: 'LOCKED_PROTECTED',
    summary: `Walk-Forward 70/30 sobre ${candles.length} velas reales L1 (${timeframe}) con 6 bps fees + funding: OOS WR ${outOfSampleWinRate}% · PF ${outOfSampleProfitFactor} · DD Max ${maxDd.toFixed(2)}%. Parámetros de producción bloqueados contra sobreajuste.`,
    strategyBreakdown,
    computedAt: Date.now(),
  };
}

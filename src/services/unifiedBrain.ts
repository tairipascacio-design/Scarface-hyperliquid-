import {
  MarketData,
  MarketScanOpportunity,
  OrderBookEntry,
  RecentTrade,
  Candle,
  UnifiedBrainMetrics,
  AutoCompoundVaultState,
  ClosedTrade,
  LearnedPattern,
  OptimizerMetrics,
} from '../types/trading';
import {
  CVD_WINDOW_MAX_MS,
  CVD_WINDOW_MIN_MS,
  L1_ROUND_TRIP_COST_PCT,
  MAX_GLOBAL_LEVERAGE,
  MAX_SL_DISTANCE_PCT,
  MIN_FEE_COVERAGE_MULT,
  SINGLE_TP_R,
  SL_ATR_MULTIPLIER,
  UNIFIED_MIN_PILLARS,
  UNIFIED_MIN_SCORE,
  UNIFIED_TOTAL_PILLARS,
  WR_CALIBRATION_FLOOR_PCT,
  computeControlledPositionSizing,
  isWhitelistedSymbol,
} from './riskConstants';

interface BrainInputParams {
  market: MarketData;
  orderBook: { bids: OrderBookEntry[]; asks: OrderBookEntry[]; spread: number; midPrice: number };
  recentTrades: RecentTrade[];
  candles: Candle[];
  riskProfile: 'Conservative' | 'Balanced' | 'Aggressive';
  walletUsdcBalance: number;
  maxMarginPct: number;
  isMevShieldActive: boolean;
  autoCompoundVault: AutoCompoundVaultState;
  closedTrades?: ClosedTrade[];
  learnedPatterns?: LearnedPattern[];
}

function computeEMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  const start = closes.length - period;
  for (let i = start; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

function computeATRPercent(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 1.6;
  const slice = candles.slice(-Math.min(candles.length, period + 1));
  let trSum = 0;
  for (let i = 1; i < slice.length; i++) {
    const cur = slice[i];
    const prevClose = slice[i - 1].close;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose)
    );
    trSum += prevClose > 0 ? (tr / prevClose) * 100 : 0;
  }
  return Math.max(0.7, Math.min(4.8, trSum / Math.max(1, slice.length - 1)));
}

/**
 * AUTO-OPTIMIZADOR ADAPTATIVO EN TIEMPO REAL
 * Analiza las operaciones cerradas reales en Hyperliquid L1 (priorizando trades de la IA)
 * para recalibrar dinámicamente apalancamiento, umbral de score, pilares requeridos,
 * cooldowns anti-venganza por token y bloqueo de dirección perdedora.
 */
export function computeAdaptiveOptimizer(
  closedTrades: ClosedTrade[] = [],
  riskProfile: 'Conservative' | 'Balanced' | 'Aggressive' = 'Balanced',
  liveSpreadPct: number = 0.03
): OptimizerMetrics {
  const now = Date.now();
  const sorted = [...closedTrades].sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
  const aiTrades = sorted.filter((t) => t.openedBy === 'AI_BOT');
  const sample = (aiTrades.length >= 2 ? aiTrades : sorted).slice(0, 20);

  const totalAnalyzedTrades = sample.length;
  const wins = sample.filter((t) => (t.realizedPnl || 0) > 0).length;
  const grossWin = sample.filter((t) => (t.realizedPnl || 0) > 0).reduce((a, t) => a + (t.realizedPnl || 0), 0);
  const grossLoss = Math.abs(sample.filter((t) => (t.realizedPnl || 0) < 0).reduce((a, t) => a + (t.realizedPnl || 0), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 2.0 : 0;
  const winRatePct =
    totalAnalyzedTrades > 0
      ? Math.max(WR_CALIBRATION_FLOOR_PCT, +((wins / totalAnalyzedTrades) * 100).toFixed(1))
      : WR_CALIBRATION_FLOOR_PCT;
  const recentPnlUsdc = +sample.slice(0, 10).reduce((acc, t) => acc + (t.realizedPnl || 0), 0).toFixed(2);

  let consecutiveLosses = 0;
  for (const t of sample) {
    if ((t.realizedPnl || 0) < 0) consecutiveLosses++;
    else break;
  }

  // Cooldown por símbolo: evita re-entrar al mismo token que acaba de dar pérdida
  const cooldownSet = new Set<string>();
  const latestBySymbol = new Map<string, ClosedTrade[]>();
  for (const t of sorted) {
    if (!t.symbol) continue;
    const arr = latestBySymbol.get(t.symbol) || [];
    arr.push(t);
    latestBySymbol.set(t.symbol, arr);
  }
  for (const [sym, symTrades] of latestBySymbol.entries()) {
    const newest = symTrades[0];
    if (newest && newest.realizedPnl <= 0 && now - (newest.closedAt || 0) < 45 * 60 * 1000) {
      cooldownSet.add(sym);
    } else if (
      symTrades.length >= 2 &&
      symTrades[0].realizedPnl <= 0 &&
      symTrades[1].realizedPnl <= 0 &&
      now - (symTrades[0].closedAt || 0) < 120 * 60 * 1000
    ) {
      cooldownSet.add(sym);
    }
  }

  // Detectar lado sistemáticamente perdedor en la sesión reciente
  const recentTen = sample.slice(0, 10);
  const longRecent = recentTen.filter((t) => t.side === 'LONG');
  const shortRecent = recentTen.filter((t) => t.side === 'SHORT');
  const longPnl = longRecent.reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
  const shortPnl = shortRecent.reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
  const longWr = longRecent.length > 0 ? longRecent.filter((t) => t.realizedPnl > 0).length / longRecent.length : 1;
  const shortWr = shortRecent.length > 0 ? shortRecent.filter((t) => t.realizedPnl > 0).length / shortRecent.length : 1;

  let weakSidePenalized: 'LONG' | 'SHORT' | null = null;
  if (longRecent.length >= 3 && longWr <= 0.34 && longPnl < 0) weakSidePenalized = 'LONG';
  else if (shortRecent.length >= 3 && shortWr <= 0.34 && shortPnl < 0) weakSidePenalized = 'SHORT';

  // Tope único global de 3x máximo en toda la app (eliminado 4x-6x y 10x)
  const baseLevCap = MAX_GLOBAL_LEVERAGE;
  let dynamicLeverageCap = baseLevCap;
  let minScoreThreshold = UNIFIED_MIN_SCORE;
  let minPillarsRequired = UNIFIED_MIN_PILLARS;
  let modeLabel: OptimizerMetrics['modeLabel'] = 'CALIBRACIÓN ÓPTIMA';

  if (consecutiveLosses >= 3 || (totalAnalyzedTrades >= 4 && winRatePct < 40 && recentPnlUsdc < 0)) {
    modeLabel = 'MODO DEFENSIVO ANTI-RACHA';
    dynamicLeverageCap = Math.min(baseLevCap, 2);
    minScoreThreshold = 74;
    minPillarsRequired = UNIFIED_TOTAL_PILLARS;
  } else if (consecutiveLosses >= 1 || (totalAnalyzedTrades >= 2 && recentPnlUsdc < 0)) {
    modeLabel = 'MODO DEFENSIVO ANTI-RACHA';
    dynamicLeverageCap = Math.min(baseLevCap, 3);
    minScoreThreshold = 68;
    minPillarsRequired = UNIFIED_MIN_PILLARS;
  } else if (totalAnalyzedTrades >= 30 && profitFactor >= 1.35 && recentPnlUsdc > 0 && consecutiveLosses === 0) {
    modeLabel = 'CALIBRACIÓN ÓPTIMA';
    dynamicLeverageCap = baseLevCap;
    minScoreThreshold = UNIFIED_MIN_SCORE;
    minPillarsRequired = UNIFIED_MIN_PILLARS;
  }

  // Coste real L1 completo ida y vuelta (0.12% baseline)
  const feeAndSpreadCostPct = +(Math.max(L1_ROUND_TRIP_COST_PCT, 0.1 + Math.max(0.02, liveSpreadPct * 0.5))).toFixed(3);

  return {
    modeLabel,
    winRatePct,
    totalAnalyzedTrades,
    consecutiveLosses,
    recentPnlUsdc,
    dynamicLeverageCap,
    minScoreThreshold,
    minPillarsRequired,
    cooldownSymbols: Array.from(cooldownSet),
    weakSidePenalized,
    feeAndSpreadCostPct,
  };
}

/**
 * CEREBRO MAESTRO UNIFICADO EV+ DE TONY MONTANA (CON AUTO-OPTIMIZADOR)
 */
export function computeUnifiedQuantBrain(params: BrainInputParams): UnifiedBrainMetrics {
  const {
    market,
    orderBook,
    recentTrades,
    candles,
    riskProfile,
    walletUsdcBalance,
    maxMarginPct,
    isMevShieldActive,
    autoCompoundVault,
    closedTrades = [],
    learnedPatterns = [],
  } = params;

  const currentPrice = market.price || 0;
  const fundingRate = market.fundingRate || 0;

  const bestBid = orderBook.bids[0]?.price || currentPrice;
  const bestAsk = orderBook.asks[0]?.price || currentPrice;
  const liveSpreadPct =
    bestBid > 0 && bestAsk >= bestBid ? ((bestAsk - bestBid) / bestBid) * 100 : 0.03;

  const optimizer = computeAdaptiveOptimizer(closedTrades, riskProfile, liveSpreadPct);
  const inCooldown = optimizer.cooldownSymbols.includes(market.symbol);

  // 1. FUNDING 8H & APY DELTA-NEUTRAL
  const fundingRateApy = +(fundingRate * 3 * 365 * 100).toFixed(2);
  let fundingScore = 0; // -18 a +18
  if (fundingRate > 0.00035) {
    fundingScore = -12;
  } else if (fundingRate < -0.0002) {
    fundingScore = +18;
  } else if (fundingRate > 0.00005) {
    fundingScore = +9;
  } else if (fundingRate < -0.00005) {
    fundingScore = -7;
  }

  // 2. LIBRO DE ÓRDENES L2 (BIDS vs ASKS)
  const bidDepth = orderBook.bids.slice(0, 8).reduce((acc, b) => acc + b.size, 0);
  const askDepth = orderBook.asks.slice(0, 8).reduce((acc, a) => acc + a.size, 0);
  const orderbookImbalanceRatio = askDepth > 0 ? +(bidDepth / askDepth).toFixed(3) : 1.0;

  let orderbookScore = 0; // -10 a +10 (confirmación secundaria para evitar muros spoofed L2)
  if (orderbookImbalanceRatio > 1.75) orderbookScore = +10;
  else if (orderbookImbalanceRatio > 1.25) orderbookScore = +6;
  else if (orderbookImbalanceRatio < 0.56) orderbookScore = -10;
  else if (orderbookImbalanceRatio < 0.8) orderbookScore = -6;

  // 3. CINTA DE ÓRDENES L1 EN VIVO (CVD sobre ventana temporal real 5-15m)
  const nowTapeTs = Date.now();
  const recentWindowTrades = recentTrades.filter((t) => nowTapeTs - (t.time || nowTapeTs) <= CVD_WINDOW_MAX_MS);
  const recentSlice = recentWindowTrades.length >= 4 ? recentWindowTrades : recentTrades.slice(0, 60);
  let buyVol = 0;
  let sellVol = 0;
  recentSlice.forEach((t) => {
    const ageMs = Math.max(0, nowTapeTs - (t.time || nowTapeTs));
    const recencyWeight = ageMs <= CVD_WINDOW_MIN_MS ? 1.6 : 1.0;
    const usdFlow = (t.size || 0) * (t.price || currentPrice || 1);
    if (t.side === 'buy') buyVol += usdFlow * recencyWeight;
    else sellVol += usdFlow * recencyWeight;
  });
  const totalVol = buyVol + sellVol;
  const cvdMomentumPct = totalVol > 0 ? +(((buyVol - sellVol) / totalVol) * 100).toFixed(1) : 0;

  let cvdScore = 0; // -20 a +20
  if (cvdMomentumPct >= 28) cvdScore = +20;
  else if (cvdMomentumPct >= 12) cvdScore = +12;
  else if (cvdMomentumPct <= -28) cvdScore = -20;
  else if (cvdMomentumPct <= -12) cvdScore = -12;

  // 4. VWAP INSTITUCIONAL + PENDIENTE (SIN COMPRAR CUCHILLOS CAYENDO)
  let vwapSum = 0;
  let vwapVol = 0;
  candles.slice(-36).forEach((c) => {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    vwapSum += typicalPrice * (c.volume || 1);
    vwapVol += c.volume || 1;
  });
  const vwap = vwapVol > 0 && currentPrice > 0 ? vwapSum / vwapVol : currentPrice;
  const vwapDistancePct = vwap > 0 ? +(((currentPrice - vwap) / vwap) * 100).toFixed(2) : 0;

  const closes = candles.map((c) => c.close).filter((v) => v > 0);
  const ema9 = computeEMA(closes.slice(-25), 9);
  const ema21 = computeEMA(closes.slice(-35), 21);
  const ema21Prev = computeEMA(closes.slice(-40, -5), 21);
  const rsi14 = computeRSI(closes, 14);
  const atrPct = computeATRPercent(candles, 14);

  const lastCandle = candles[candles.length - 1];
  const prevCandle3 = candles[Math.max(0, candles.length - 4)];
  const microMovePct =
    prevCandle3 && prevCandle3.close > 0 && lastCandle
      ? ((lastCandle.close - prevCandle3.close) / prevCandle3.close) * 100
      : 0;
  const lastCandleBull = lastCandle ? lastCandle.close >= lastCandle.open : true;

  let vwapScore = 0; // -15 a +15
  if (vwapDistancePct >= 0.05 && vwapDistancePct < 1.35) {
    vwapScore = +15; // Soportado encima del VWAP con espacio sano
  } else if (vwapDistancePct >= 1.35 && vwapDistancePct < 2.6) {
    vwapScore = +6;
  } else if (vwapDistancePct >= 2.6) {
    vwapScore = -9; // Muy sobre-extendido arriba del VWAP
  } else if (vwapDistancePct <= -0.05 && vwapDistancePct > -1.8) {
    vwapScore = -14; // Rechazo bajo VWAP -> sesgo bajista
  } else if (vwapDistancePct <= -1.8) {
    // Solo marcar rebote si YA hay confirmación real de reversión en vela y CVD
    vwapScore = rsi14 < 30 && lastCandleBull && cvdMomentumPct > 12 ? +10 : -10;
  }

  // 5. PROBABILIDAD DE SQUEEZE
  let squeezeScore = 0; // -10 a +10
  let squeezeProbability = 30;
  if (fundingRate < -0.00012 && orderbookImbalanceRatio > 1.2) {
    squeezeProbability = 84;
    squeezeScore = +10;
  } else if (fundingRate > 0.00035 && orderbookImbalanceRatio < 0.82) {
    squeezeProbability = 80;
    squeezeScore = -10;
  }

  // 6. TENDENCIA EMA(9/21) + PENDIENTE EMA21 + MICRO-MOMENTUM + ANTI-FOMO RSI(14)
  const emaSlopeUp = ema21 > 0 && ema21Prev > 0 ? ema21 > ema21Prev * 1.0003 : false;
  const emaSlopeDown = ema21 > 0 && ema21Prev > 0 ? ema21 < ema21Prev * 0.9997 : false;

  let emaTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (ema9 > 0 && ema21 > 0) {
    if (ema9 > ema21 * 1.0009 && (emaSlopeUp || currentPrice > ema21)) emaTrend = 'BULLISH';
    else if (ema9 < ema21 * 0.9991 && (emaSlopeDown || currentPrice < ema21)) emaTrend = 'BEARISH';
  }

  let trendRsiScore = 0; // -28 a +28 (peso dominante de tendencia y acción de precio real)
  if (emaTrend === 'BULLISH' && rsi14 >= 44 && rsi14 <= 66) {
    trendRsiScore = +20;
  } else if (emaTrend === 'BULLISH' && rsi14 > 72) {
    trendRsiScore = -14; // FOMO: sobrecompra
  } else if (emaTrend === 'BEARISH' && rsi14 <= 56 && rsi14 >= 34) {
    trendRsiScore = -20;
  } else if (emaTrend === 'BEARISH' && rsi14 < 28) {
    trendRsiScore = +10;
  } else if (emaTrend === 'BULLISH') {
    trendRsiScore = +10;
  } else if (emaTrend === 'BEARISH') {
    trendRsiScore = -10;
  }

  // Impulso inmediato de vela viva para no comprar velas rojas ni shortear rebotes
  if (microMovePct > 0.06 && lastCandleBull) trendRsiScore += 8;
  else if (microMovePct < -0.06 && !lastCandleBull) trendRsiScore -= 8;
  else if (trendRsiScore > 0 && !lastCandleBull) trendRsiScore -= 14;
  else if (trendRsiScore < 0 && lastCandleBull) trendRsiScore += 14;

  // 7. MEMORIA HISTÓRICA REAL (Piso WR 40%)
  const symbolTrades = closedTrades.filter((t) => t.symbol === market.symbol);
  const relevantTrades = symbolTrades.length >= 2 ? symbolTrades : closedTrades;
  const totalRealTrades = relevantTrades.length;
  const wins = relevantTrades.filter((t) => t.realizedPnl > 0).length;
  const rawWrPct = totalRealTrades > 0 ? +((wins / totalRealTrades) * 100).toFixed(1) : WR_CALIBRATION_FLOOR_PCT;
  const historicalWinRatePct = Math.max(WR_CALIBRATION_FLOOR_PCT, rawWrPct);
  const isStatisticallyCalibrated = totalRealTrades >= 10;

  let memoryPatternScore = 0; // -12 a +12
  if (totalRealTrades > 0) {
    const recentDirectionalTrades = relevantTrades.slice(0, 6);
    const recentLongPnl = recentDirectionalTrades
      .filter((t) => t.side === 'LONG')
      .reduce((acc, t) => acc + t.realizedPnl, 0);
    const recentShortPnl = recentDirectionalTrades
      .filter((t) => t.side === 'SHORT')
      .reduce((acc, t) => acc + t.realizedPnl, 0);

    if (recentLongPnl > 0 && recentLongPnl > recentShortPnl) memoryPatternScore = +8;
    else if (recentShortPnl > 0 && recentShortPnl > recentLongPnl) memoryPatternScore = -8;
    else if (recentLongPnl < 0 && recentShortPnl >= 0) memoryPatternScore = -8;
    else if (recentShortPnl < 0 && recentLongPnl >= 0) memoryPatternScore = +8;
  }

  let rawScore =
    fundingScore +
    orderbookScore +
    cvdScore +
    vwapScore +
    squeezeScore +
    trendRsiScore +
    memoryPatternScore;

  // Penalización si el lado elegido viene perdiendo en la sesión reciente
  if (optimizer.weakSidePenalized === 'LONG' && rawScore > 0) {
    rawScore -= 14;
  } else if (optimizer.weakSidePenalized === 'SHORT' && rawScore < 0) {
    rawScore += 14;
  }

  const compositeScore = Math.max(-100, Math.min(100, Math.round(rawScore)));

  // Conteo unificado a 4 Pilares (Tendencia EMA+VWAP, Momentum RSI, Flujo Orderbook+CVD, Coste/Funding/Squeeze)
  const bullPillars = [
    trendRsiScore > 0 && vwapScore >= 0,
    rsi14 >= 42 && rsi14 <= 70 && lastCandleBull,
    cvdMomentumPct >= 10 || orderbookImbalanceRatio >= 1.15,
    fundingScore + squeezeScore >= 0,
  ].filter(Boolean).length;

  const bearPillars = [
    trendRsiScore < 0 && vwapScore <= 0,
    rsi14 <= 58 && rsi14 >= 30 && !lastCandleBull,
    cvdMomentumPct <= -10 || orderbookImbalanceRatio <= 0.88,
    fundingScore + squeezeScore <= 0,
  ].filter(Boolean).length;

  const isOverboughtFomo = rsi14 > 72;
  const isOversoldExhausted = rsi14 < 28;
  const isHighFundingArbitrage = fundingRate >= 0.00028 && fundingRateApy >= 30;
  const spreadTooWide = liveSpreadPct > 0.06;

  // Stop-loss estricto a 1.5x ATR; si supera 2.5% se descarta la entrada
  const slDistPct = Math.max(0.008, (atrPct * SL_ATR_MULTIPLIER) / 100);
  const slTooWide = slDistPct > MAX_SL_DISTANCE_PCT;
  const riskRewardRatio = SINGLE_TP_R;
  const tpDistPct = slDistPct * riskRewardRatio;
  const tpCoversFourXCost = tpDistPct * 100 >= L1_ROUND_TRIP_COST_PCT * MIN_FEE_COVERAGE_MULT;

  // VALOR ESPERADO NETO REAL: Comisiones Maker/Taker (0.12% ida/vuelta) + Funding
  const alignedPillars = compositeScore >= 0 ? bullPillars : bearPillars;
  const calibratedWrPrior = isStatisticallyCalibrated ? historicalWinRatePct / 100 : WR_CALIBRATION_FLOOR_PCT / 100;
  const estWinProb = Math.min(
    0.66,
    Math.max(0.4, calibratedWrPrior * 0.42 + (alignedPillars / UNIFIED_TOTAL_PILLARS) * 0.36 + (Math.abs(compositeScore) / 100) * 0.16)
  );
  const projectedFundingCostPct =
    compositeScore >= 0
      ? Math.max(0, fundingRate * 100)
      : Math.max(0, -fundingRate * 100);
  const totalRoundTripCostPct = +(Math.max(L1_ROUND_TRIP_COST_PCT, optimizer.feeAndSpreadCostPct + projectedFundingCostPct)).toFixed(3);
  const grossEvPct = (estWinProb * tpDistPct - (1 - estWinProb) * slDistPct) * 100;
  const expectedValuePct = +(grossEvPct - totalRoundTripCostPct).toFixed(2);

  // Confirmación en vivo (permite absorción extrema CVD/L2 o vela + micro-impulso)
  const bullLiveConfirmed = (lastCandleBull && cvdMomentumPct > 4) || (cvdMomentumPct >= 25 && orderbookImbalanceRatio >= 1.45);
  const bearLiveConfirmed = (!lastCandleBull && cvdMomentumPct < -4) || (cvdMomentumPct <= -25 && orderbookImbalanceRatio <= 0.68);

  let verdict: UnifiedBrainMetrics['verdict'] = 'NEUTRAL_WAIT';
  let action: UnifiedBrainMetrics['action'] = 'WAIT';
  let positiveEntryApproved = false;

  const effectiveScoreFloor = Math.max(UNIFIED_MIN_SCORE, optimizer.minScoreThreshold);

  if (inCooldown || spreadTooWide || slTooWide || !tpCoversFourXCost) {
    verdict = 'NEUTRAL_WAIT';
    action = 'WAIT';
    positiveEntryApproved = false;
  } else if (isHighFundingArbitrage && bullPillars < UNIFIED_MIN_PILLARS && bearPillars < UNIFIED_MIN_PILLARS) {
    verdict = 'DELTA_NEUTRAL_ARBITRAGE';
    action = 'DELTA_NEUTRAL';
    positiveEntryApproved = true;
  } else if (
    compositeScore >= Math.max(76, effectiveScoreFloor + 10) &&
    bullPillars >= UNIFIED_MIN_PILLARS &&
    !isOverboughtFomo &&
    expectedValuePct > 0.25 &&
    bullLiveConfirmed
  ) {
    verdict = 'STRONG_BUY';
    action = 'LONG';
    positiveEntryApproved = true;
  } else if (
    compositeScore >= effectiveScoreFloor &&
    bullPillars >= UNIFIED_MIN_PILLARS &&
    !isOverboughtFomo &&
    expectedValuePct > 0.15 &&
    bullLiveConfirmed
  ) {
    verdict = 'BUY';
    action = 'LONG';
    positiveEntryApproved = true;
  } else if (
    compositeScore <= -Math.max(76, effectiveScoreFloor + 10) &&
    bearPillars >= UNIFIED_MIN_PILLARS &&
    !isOversoldExhausted &&
    expectedValuePct > 0.25 &&
    bearLiveConfirmed
  ) {
    verdict = 'STRONG_SELL';
    action = 'SHORT';
    positiveEntryApproved = true;
  } else if (
    compositeScore <= -effectiveScoreFloor &&
    bearPillars >= UNIFIED_MIN_PILLARS &&
    !isOversoldExhausted &&
    expectedValuePct > 0.15 &&
    bearLiveConfirmed
  ) {
    verdict = 'SELL';
    action = 'SHORT';
    positiveEntryApproved = true;
  }

  const confidence =
    action === 'DELTA_NEUTRAL'
      ? 92
      : action === 'WAIT'
      ? Math.max(40, Math.min(64, Math.round(42 + Math.abs(compositeScore) * 0.25)))
      : Math.min(95, Math.round(62 + alignedPillars * 6 + Math.min(10, Math.abs(compositeScore) * 0.1)));

  // Dimensionamiento controlado + tope global 3x desde riskConstants
  const sizing = computeControlledPositionSizing({
    equityUsdc: walletUsdcBalance,
    maxMarginBudgetPct: maxMarginPct,
    riskPerTradePct: 0.5,
    stopDistancePct: slDistPct,
    marketMaxLeverage: Math.min(optimizer.dynamicLeverageCap, MAX_GLOBAL_LEVERAGE, market.maxLeverage || MAX_GLOBAL_LEVERAGE),
    score: Math.abs(compositeScore),
  });
  const suggestedLeverage = sizing.leverage;
  const proposedMarginUsdc = sizing.marginUsdc;

  let takeProfitPrice = currentPrice;
  let stopLossPrice = currentPrice;
  const priceDecimals = currentPrice < 0.01 ? 6 : currentPrice < 1 ? 4 : currentPrice < 10 ? 3 : 2;

  if (action === 'LONG' && currentPrice > 0) {
    takeProfitPrice = +(currentPrice * (1 + tpDistPct)).toFixed(priceDecimals);
    stopLossPrice = +(currentPrice * (1 - slDistPct)).toFixed(priceDecimals);
  } else if (action === 'SHORT' && currentPrice > 0) {
    takeProfitPrice = +(currentPrice * (1 - tpDistPct)).toFixed(priceDecimals);
    stopLossPrice = +(currentPrice * (1 + slDistPct)).toFixed(priceDecimals);
  }

  const mevSavedEstimatedUsdc =
    isMevShieldActive && proposedMarginUsdc > 0 ? +(proposedMarginUsdc * 0.0022).toFixed(2) : 0;

  const vaultBoostNote =
    autoCompoundVault.isActive && autoCompoundVault.depositedUsdc > 0
      ? ` Ganancias compuestas en Bóveda USDC (${autoCompoundVault.currentApy}% APY).`
      : '';

  let rationale = '';
  if (inCooldown) {
    rationale = `Optimizador Anti-Racha: ${market.symbol} en cooldown tras SL reciente. Protegiendo capital USDC.`;
  } else if (slTooWide) {
    rationale = `SL 1.5x ATR (${(slDistPct * 100).toFixed(2)}%) supera límite 2.5%. Entrada descartada para proteger equity.`;
  } else if (!tpCoversFourXCost) {
    rationale = `Distancia TP (${(tpDistPct * 100).toFixed(2)}%) no cubre 4x coste ida/vuelta (0.48%). Bloqueado.`;
  } else if (spreadTooWide) {
    rationale = `Spread L2 demasiado alto (${liveSpreadPct.toFixed(3)}%). Optimizador bloquea entrada.`;
  } else if (action === 'DELTA_NEUTRAL') {
    rationale = `Estrategia Maestra EV+: Funding +${(fundingRate * 100).toFixed(4)}%/8h (${fundingRateApy}% APY). Cobertura Delta-0.${vaultBoostNote}`;
  } else if (action === 'LONG') {
    rationale = `Setup A+ EV+ Neto (+${expectedValuePct}% tras 0.12% L1, TP +2.5R): ${alignedPillars}/${UNIFIED_TOTAL_PILLARS} pilares alcistas, Bids ${orderbookImbalanceRatio}x, CVD ${cvdMomentumPct >= 0 ? '+' : ''}${cvdMomentumPct}%, RSI ${rsi14}, EMA ${emaTrend}.${vaultBoostNote}`;
  } else if (action === 'SHORT') {
    rationale = `Setup A+ EV+ Neto (+${expectedValuePct}% tras 0.12% L1, TP +2.5R): ${alignedPillars}/${UNIFIED_TOTAL_PILLARS} pilares bajistas, Asks ${(1 / Math.max(0.1, orderbookImbalanceRatio)).toFixed(2)}x, CVD ${cvdMomentumPct}%, RSI ${rsi14}, EMA ${emaTrend}.${vaultBoostNote}`;
  } else if (isOverboughtFomo) {
    rationale = `Anti-FOMO activo: RSI(14) en ${rsi14}. Esperando pullback sano.`;
  } else if (isOversoldExhausted) {
    rationale = `Anti-Trampa activo: RSI(14) en ${rsi14}. Evitando Short en suelo extremo.`;
  } else {
    rationale = `Optimizador [${optimizer.modeLabel}] en espera: Score ${compositeScore > 0 ? '+' : ''}${compositeScore} (exige ±${effectiveScoreFloor}) y ${alignedPillars}/${UNIFIED_MIN_PILLARS} pilares.`;
  }

  const actionText =
    action === 'LONG'
      ? 'COMPRA LONG (EV+ NETO)'
      : action === 'SHORT'
      ? 'VENTA SHORT (EV+ NETO)'
      : action === 'DELTA_NEUTRAL'
      ? 'ARBITRAJE DELTA-0'
      : 'ESPERAR SETUP LIMPIO';

  const tonyActionableSynthesis = `OPTIMIZADOR TONY [${optimizer.modeLabel}]: ${market.symbol} a $${currentPrice.toFixed(priceDecimals)} | Score: ${compositeScore > 0 ? '+' : ''}${compositeScore}/100 | Pilares: ${alignedPillars}/${UNIFIED_TOTAL_PILLARS} | EV+ Neto: ${expectedValuePct > 0 ? '+' : ''}${expectedValuePct}% (R:R ${riskRewardRatio}:1). Acción: ${actionText} (${suggestedLeverage}x). TP: $${takeProfitPrice} | SL: $${stopLossPrice}. ${rationale}`;

  return {
    compositeScore,
    verdict,
    action,
    confidence,
    fundingRateApy,
    orderbookImbalanceRatio,
    cvdMomentumPct,
    vwapDistancePct,
    squeezeProbability,
    rsi14,
    emaTrend,
    riskRewardRatio,
    expectedValuePct,
    positiveEntryApproved,
    alignedPillars,
    historicalWinRatePct,
    mevSavedEstimatedUsdc,
    suggestedLeverage,
    suggestedMarginUsdc: proposedMarginUsdc,
    takeProfitPrice,
    stopLossPrice,
    rationale,
    tonyActionableSynthesis,
    formulaBreakdown: {
      fundingScore,
      orderbookScore,
      cvdScore,
      vwapScore,
      squeezeScore,
      trendRsiScore,
      memoryPatternScore,
    },
    optimizer,
    isStatisticallyCalibrated,
    roundTripCostPct: totalRoundTripCostPct,
    calculatedAt: Date.now(),
  };
}

/**
 * SCANNER DE RADAR WHITELIST FIJA (4 PARES LÍQUIDOS: BTC, ETH, SOL, HYPE)
 */
export function scanAllHyperliquidMarkets(
  markets: Record<string, MarketData>,
  closedTrades: ClosedTrade[] = [],
  riskProfile: 'Conservative' | 'Balanced' | 'Aggressive' = 'Balanced'
): MarketScanOpportunity[] {
  const now = Date.now();
  const optimizer = computeAdaptiveOptimizer(closedTrades, riskProfile, 0.03);
  const opportunities: MarketScanOpportunity[] = [];

  for (const m of Object.values(markets)) {
    if (!m || !m.price || m.price <= 0) continue;
    // Whitelist fija de 4 pares líquidos (BTC, ETH, SOL, HYPE) — elimina escaneo de 801 tokens
    if (!isWhitelistedSymbol(m.symbol)) continue;

    const coin = m.symbol.replace('-PERP', '');
    const fundingRate = m.fundingRate || 0;
    const fundingApy = +(fundingRate * 3 * 365 * 100).toFixed(1);
    const change24h = m.change24h || 0;
    const premiumPct = +((m.premium || 0) * 100).toFixed(3);
    const volToOi = m.openInterest > 0 ? m.volume24h / m.openInterest : 1;
    const inCooldown = optimizer.cooldownSymbols.includes(m.symbol);

    // 1. Score por Funding & Squeeze
    let fScore = 0;
    if (fundingRate <= -0.00015) fScore = +24;
    else if (fundingRate >= 0.00035) fScore = -16;
    else if (fundingRate > 0.00005) fScore = +10;
    else if (fundingRate < -0.00005) fScore = -8;

    // 2. Score por Momentum 24h con Guardia Anti-FOMO
    let momScore = 0;
    const isFomoOverbought = change24h > 14;
    const isOversoldCrash = change24h < -14;
    if (change24h >= 1.8 && change24h <= 10) momScore = +24;
    else if (change24h > 10 && change24h <= 14) momScore = +10;
    else if (change24h > 14) momScore = -15;
    else if (change24h <= -1.8 && change24h >= -10) momScore = -24;
    else if (change24h < -10 && change24h >= -14) momScore = -10;
    else if (change24h < -14) momScore = +8;

    // 3. Score por Basis Mark-vs-Oracle
    let basisScore = 0;
    if (premiumPct > 0.03) basisScore = +16;
    else if (premiumPct > 0.008) basisScore = +8;
    else if (premiumPct < -0.03) basisScore = -16;
    else if (premiumPct < -0.008) basisScore = -8;

    // 4. Liquidez institucional y rotación
    const liquidityBonus = m.volume24h >= 40_000_000 ? 14 : m.volume24h >= 8_000_000 ? 9 : 4;
    const rotationBonus = volToOi >= 1.1 ? 6 : 0;

    // 5. Memoria histórica real
    const tokenTrades = closedTrades.filter((t) => t.symbol === m.symbol);
    const tokenPnl = tokenTrades.reduce((acc, t) => acc + t.realizedPnl, 0);

    const directionalSign = fScore + momScore + basisScore >= 0 ? 1 : -1;
    const baseMagnitude = Math.abs(fScore + momScore + basisScore + directionalSign * (liquidityBonus + rotationBonus));
    const adjustedMagnitude =
      tokenTrades.length > 0 && tokenPnl < 0
        ? Math.max(0, baseMagnitude - 16)
        : tokenTrades.length > 0 && tokenPnl > 0
        ? baseMagnitude + 8
        : baseMagnitude;
    let rawScore = directionalSign * adjustedMagnitude;
    if (optimizer.weakSidePenalized === 'LONG' && rawScore > 0) rawScore = Math.max(0, rawScore - 14);
    if (optimizer.weakSidePenalized === 'SHORT' && rawScore < 0) rawScore = Math.min(0, rawScore + 14);

    const score = Math.max(-100, Math.min(100, Math.round(rawScore)));

    const rr = SINGLE_TP_R;
    const slPct = 0.015;
    const tpPct = slPct * rr;
    const estWinProb = Math.min(0.64, Math.max(0.4, 0.4 + (Math.abs(score) / 100) * 0.22));
    const scannerCostPct = +(L1_ROUND_TRIP_COST_PCT + Math.max(0, Math.abs(fundingRate) * 100)).toFixed(3);
    const expectedValuePct = +((estWinProb * tpPct - (1 - estWinProb) * slPct) * 100 - scannerCostPct).toFixed(2);

    let action: MarketScanOpportunity['action'] = 'WAIT';
    let positiveEntryApproved = false;
    let reason = '';

    const scanThreshold = Math.max(UNIFIED_MIN_SCORE, optimizer.minScoreThreshold);

    if (inCooldown) {
      reason = 'Cooldown anti-racha activo (pérdida reciente)';
    } else if (fundingRate >= 0.00028 && fundingApy >= 30 && Math.abs(momScore) <= 12) {
      action = 'DELTA_NEUTRAL';
      positiveEntryApproved = true;
      reason = `Funding alto +${fundingApy}% APY ideal para cobertura Delta-0 en USDC`;
    } else if (score >= scanThreshold && !isFomoOverbought && expectedValuePct > 0.20) {
      action = 'LONG';
      positiveEntryApproved = true;
      reason = `Impulso alcista L1 (${change24h >= 0 ? '+' : ''}${change24h}%), Basis ${premiumPct >= 0 ? '+' : ''}${premiumPct}% y Vol $${(m.volume24h / 1e6).toFixed(1)}M`;
    } else if (score <= -scanThreshold && !isOversoldCrash && expectedValuePct > 0.20) {
      action = 'SHORT';
      positiveEntryApproved = true;
      reason = `Presión bajista L1 (${change24h}%), Basis ${premiumPct}% y Vol $${(m.volume24h / 1e6).toFixed(1)}M`;
    } else {
      reason = isFomoOverbought
        ? `Guardia Anti-FOMO (+${change24h}% extendido)`
        : `Consolidación (${score > 0 ? '+' : ''}${score}/100 < ±${scanThreshold})`;
    }

    const confidence =
      action === 'WAIT'
        ? Math.min(62, Math.round(42 + Math.abs(score) * 0.25))
        : Math.min(94, Math.round(64 + Math.abs(score) * 0.28));

    opportunities.push({
      symbol: m.symbol,
      coin,
      price: m.price,
      change24h,
      volume24h: m.volume24h,
      openInterest: m.openInterest,
      fundingRate,
      fundingApy,
      premiumPct,
      maxLeverage: Math.min(MAX_GLOBAL_LEVERAGE, optimizer.dynamicLeverageCap, m.maxLeverage || MAX_GLOBAL_LEVERAGE),
      score,
      action,
      expectedValuePct,
      confidence,
      positiveEntryApproved,
      reason,
      scannedAt: now,
    });
  }

  return opportunities.sort((a, b) => {
    if (a.positiveEntryApproved !== b.positiveEntryApproved) {
      return a.positiveEntryApproved ? -1 : 1;
    }
    const rankA = a.expectedValuePct * a.confidence + Math.log10(Math.max(1, a.volume24h)) * 4;
    const rankB = b.expectedValuePct * b.confidence + Math.log10(Math.max(1, b.volume24h)) * 4;
    return rankB - rankA;
  });
}

export const WHITELIST_COINS = ['BTC', 'ETH', 'SOL', 'HYPE'] as const;
export const WHITELIST_PERPS = ['BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'HYPE-PERP'] as const;
export const WHITELIST_TIMEFRAMES = ['5m', '15m', '1h', '4h'] as const;

export const MAX_GLOBAL_LEVERAGE = 3;
export const SMALL_EQUITY_THRESHOLD_USDC = 100;
export const CONTROLLED_NOTIONAL_MIN_USDC = 12;
export const CONTROLLED_NOTIONAL_MAX_USDC = 15;
export const MIN_VIABLE_NOTIONAL_USDC = 11.5;

export const SL_ATR_MULTIPLIER = 1.5;
export const MAX_SL_DISTANCE_PCT = 0.025; // 2.5% max distance from entry

export const BE_TRIGGER_R = 1.2; // +1.2R triggers Break-Even
export const BE_PRICE_BUFFER_PCT = 0.0015; // entry +/- 0.15% to cover L1 round-trip cost (0.12%)
export const L1_ROUND_TRIP_COST_PCT = 0.12;
export const MIN_FEE_COVERAGE_MULT = 4; // TP >= 4 * 0.12% = 0.48%

export const PARTIAL_TP_MIN_NOTIONAL_USDC = 60;
export const SINGLE_TP_R = 2.5; // +2.5R single TP when notional < $60
export const TRAILING_TRIGGER_R = 1.5; // +1.5R activates trailing stop when notional < $60
export const TRAILING_GIVEBACK_R = 0.45;

export const MAX_TRADES_PER_DAY = 4;
export const SL_COOLDOWN_CANDLES = 3;
export const CONSECUTIVE_SL_PAUSE_COUNT = 3;
export const CONSECUTIVE_SL_PAUSE_MS = 2 * 60 * 60 * 1000; // 2 hours

export const UNIFIED_MIN_SCORE = 65;
export const UNIFIED_TOTAL_PILLARS = 4;
export const UNIFIED_MIN_PILLARS = 3;
export const MIN_PRE_ORDER_RR = 2.0;

export const WR_CALIBRATION_FLOOR_PCT = 40;
export const CVD_WINDOW_MIN_MS = 5 * 60 * 1000;
export const CVD_WINDOW_MAX_MS = 15 * 60 * 1000;

export const GUIDE_BG_SCAN_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
export const TARGET_VALIDATION_CLOSES = 50;

// Deterministic 128-bit hex prefix for bot cloid ('0x' + 32 hex chars)
export const BOT_CLOID_PREFIX = '0x4c46b071'; // "LFbot1" tag

export const DELTA0_MIN_TOTAL_USDC = 23; // >= $11.50 Spot + >= $11.50 Perp
export const DELTA0_MIN_APY_PCT = 30;

export const CACHED_EQUITY_STORAGE_KEY = 'hl_cached_equity_v1';

export function isWhitelistedSymbol(symbol: string): boolean {
  const clean = symbol.toUpperCase().replace('-PERP', '');
  return (WHITELIST_COINS as readonly string[]).includes(clean);
}

/**
 * Generates a valid 128-bit Hyperliquid L1 cloid ('0x' + 32 hex chars)
 * encoding BOT_CLOID_PREFIX + 2-char strategy tag + 8-char timestamp + 14-char entropy/counter.
 */
export function buildBotCloid(strategyTag: string = 'lf'): string {
  const cleanTag = strategyTag
    .toLowerCase()
    .replace(/[^a-f0-9]/g, '')
    .padEnd(2, 'a')
    .slice(0, 2);
  const tsHex = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0')
    .slice(-8);
  let randHex = '';
  for (let i = 0; i < 14; i++) {
    randHex += Math.floor(Math.random() * 16).toString(16);
  }
  const full = `${BOT_CLOID_PREFIX}${cleanTag}${tsHex}${randHex}`.toLowerCase();
  return full.slice(0, 34); // '0x' + 32 hex chars = 34 chars
}

export function isBotCloid(cloid?: string | null): boolean {
  if (!cloid || typeof cloid !== 'string') return false;
  return cloid.toLowerCase().startsWith(BOT_CLOID_PREFIX);
}

export interface ControlledSizingResult {
  leverage: number;
  targetNotionalUsdc: number;
  marginUsdc: number;
  riskAmountUsdc: number;
  skipMinNotional: boolean;
  skipReason: string | null;
}

/**
 * Single Source of Truth for SCARFACE L1 position sizing:
 * - Global leverage strictly capped at 3x.
 * - While equity < $100: fixed controlled notional between $12 and $15 USD ($4-$5 margin @ 3x).
 * - When equity >= $100: risk-per-trade proportional notional bounded by margin budget.
 * - If final viable notional < $11.50 -> returns skipMinNotional=true WITHOUT tripping Kill Switch.
 */
export function computeControlledPositionSizing(params: {
  equityUsdc: number;
  availableMarginUsdc?: number;
  maxMarginBudgetPct: number;
  riskPerTradePct: number;
  stopDistancePct: number;
  marketMaxLeverage?: number;
  score?: number;
}): ControlledSizingResult {
  const {
    equityUsdc,
    availableMarginUsdc,
    maxMarginBudgetPct,
    riskPerTradePct,
    stopDistancePct,
    marketMaxLeverage = MAX_GLOBAL_LEVERAGE,
    score = 70,
  } = params;

  const leverage = Math.max(1, Math.min(MAX_GLOBAL_LEVERAGE, marketMaxLeverage || MAX_GLOBAL_LEVERAGE));
  const safeEquity = Math.max(0, equityUsdc || 0);
  const safeStopPct = Math.max(0.005, stopDistancePct || 0.015);
  const effectiveBudgetPct = Math.max(10, Math.min(80, maxMarginBudgetPct || 40));
  const freeMargin = availableMarginUsdc !== undefined ? Math.max(0, availableMarginUsdc) : safeEquity;
  const maxBudgetMarginUsdc = Math.min(freeMargin, (safeEquity * effectiveBudgetPct) / 100);
  const maxBudgetNotional = maxBudgetMarginUsdc * leverage;
  const maxFreeNotional = freeMargin * leverage;

  if (safeEquity <= 0) {
    return {
      leverage,
      targetNotionalUsdc: 0,
      marginUsdc: 0,
      riskAmountUsdc: 0,
      skipMinNotional: true,
      skipReason: 'SKIP_MIN_NOTIONAL: Equity L1 $0.00 insuficiente para nocional mínimo $11.50.',
    };
  }

  let rawNotional = 0;
  if (safeEquity < SMALL_EQUITY_THRESHOLD_USDC) {
    // Escala suavemente entre $12 y $15 USD según convicción del setup
    const scoreRatio = Math.max(0, Math.min(1, (Math.abs(score) - UNIFIED_MIN_SCORE) / 25));
    const desiredNotional =
      CONTROLLED_NOTIONAL_MIN_USDC +
      scoreRatio * (CONTROLLED_NOTIONAL_MAX_USDC - CONTROLLED_NOTIONAL_MIN_USDC);
    // Respect free margin at 3x; allow up to desiredNotional if margin permits
    const usableNotionalCap = Math.min(maxFreeNotional, Math.max(maxBudgetNotional, CONTROLLED_NOTIONAL_MIN_USDC));
    rawNotional = Math.min(desiredNotional, maxFreeNotional, usableNotionalCap);
  } else {
    const riskAmountTarget = safeEquity * (Math.max(0.25, Math.min(1.5, riskPerTradePct || 0.5)) / 100);
    const idealNotional = riskAmountTarget / safeStopPct;
    rawNotional = Math.min(idealNotional, maxBudgetNotional, maxFreeNotional);
  }

  if (rawNotional < MIN_VIABLE_NOTIONAL_USDC) {
    return {
      leverage,
      targetNotionalUsdc: 0,
      marginUsdc: 0,
      riskAmountUsdc: +(rawNotional * safeStopPct).toFixed(3),
      skipMinNotional: true,
      skipReason: `SKIP_MIN_NOTIONAL: Nocional calculado $${rawNotional.toFixed(2)} < $${MIN_VIABLE_NOTIONAL_USDC.toFixed(2)} requerido (margen libre $${freeMargin.toFixed(2)} a ${leverage}x).`,
    };
  }

  const targetNotionalUsdc = +rawNotional.toFixed(2);
  const marginUsdc = +(targetNotionalUsdc / leverage).toFixed(2);
  const riskAmountUsdc = +(targetNotionalUsdc * safeStopPct).toFixed(3);

  return {
    leverage,
    targetNotionalUsdc,
    marginUsdc,
    riskAmountUsdc,
    skipMinNotional: false,
    skipReason: null,
  };
}

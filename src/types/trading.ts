export type MarketSymbol = string;

export interface MarketData {
  symbol: MarketSymbol;
  name: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  fundingRate: number; // e.g. 0.00012 = 0.012%
  openInterest: number;
  maxLeverage: number;
  tickSize: number;
  stepSize: number;
  premium?: number;
  szDecimals?: number;
  assetIndex?: number;
}

export interface MarketScanOpportunity {
  symbol: MarketSymbol;
  coin: string;
  price: number;
  change24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
  fundingApy: number;
  premiumPct: number;
  maxLeverage: number;
  score: number; // -100 to +100
  action: 'LONG' | 'SHORT' | 'DELTA_NEUTRAL' | 'WAIT';
  expectedValuePct: number;
  confidence: number;
  positiveEntryApproved: boolean;
  reason: string;
  scannedAt: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookEntry {
  price: number;
  size: number;
  total: number;
}

export interface RecentTrade {
  id: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  time: number;
}

export interface Position {
  id: string;
  symbol: MarketSymbol;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  size: number; // in coin
  margin: number; // in USDC
  leverage: number;
  liquidationPrice: number;
  takeProfit?: number;
  stopLoss?: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  openedAt: number;
  openedBy: 'MANUAL' | 'AI_BOT';
  aiRationale?: string;
  isRealLive?: boolean;
  txHash?: string;
  breakEvenEnabled?: boolean;
  breakEvenStatus?: 'ARMED_L1' | 'WAITING' | 'OFF';
  breakEvenPrice?: number;
  peakRoePct?: number;
  breakEvenOid?: string | number;
  tpOrderOid?: string | number;
  cloid?: string;
  trailingActive?: boolean;
  peakR?: number;
  singleTpMode?: boolean;
  strategyId?: StrategyId;
  strategyName?: string;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  tp1Hit?: boolean;
  tp2Hit?: boolean;
  initialSize?: number;
  decisionScore?: number;
}

export interface ClosedTrade {
  id: string;
  symbol: MarketSymbol;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  size: number;
  margin: number;
  leverage: number;
  realizedPnl: number;
  realizedPnlPercent: number;
  openedAt: number;
  closedAt: number;
  closedReason: 'TP_HIT' | 'SL_HIT' | 'MANUAL_CLOSE' | 'AI_CLOSE' | 'LIQUIDATED';
  openedBy: 'MANUAL' | 'AI_BOT';
  aiRationale?: string;
  aiLessonLearned?: string;
  aiAdjustmentNote?: string;
  strategyUsed?: string;
  strategyId?: StrategyId;
  strategyName?: string;
  regime?: MarketRegime;
  feesPaidUsdc?: number;
  fundingPaidUsdc?: number;
  expectedEvPct?: number;
  spreadAtEntryPct?: number;
  isRealLive?: boolean;
  txHash?: string;
  cloid?: string;
}

export interface SpotTokenBalance {
  coin: string;
  total: number;
  hold: number;
  available: number;
}

export interface WalletState {
  address: string;
  privateKey: string;
  seedPhrase: string;
  isConnected: boolean;
  type: 'CREATED' | 'IMPORTED_KEY' | 'IMPORTED_SEED' | 'HYPERLIQUID_API_WALLET';
  balances: {
    USDC: number; // Primary perps collateral
    ETH: number;  // L1 & gas
    HYPE: number; // Native Hyperliquid
    ARB: number;  // Arbitrum
  };
  // Hyperliquid Perps API Wallet fields
  masterAddress?: string;
  apiWalletAddress?: string;
  apiWalletKey?: string;
  apiWalletName?: string;
  hyperliquidAccountValue?: number;
  hyperliquidSpotUsdc?: number;
  hyperliquidSpotBalances?: SpotTokenBalance[];
  hyperliquidWithdrawable?: number;
  hyperliquidMarginUsed?: number;
  hyperliquidUserRole?: string;
  isAgentAuthorized?: boolean;
  arbitrumUsdc?: number;
  lastSyncedAt?: number;
}

export interface OnChainTransfer {
  id: string;
  hash: string;
  asset: 'USDC' | 'ETH' | 'HYPE' | 'ARB';
  amount: number;
  from: string;
  to: string;
  timestamp: number;
  status: 'CONFIRMED' | 'PENDING';
  gasUsed: string;
  blockNumber: number;
}

export interface HashVerificationRecord {
  hash: string;
  timestamp: number;
  type: 'REAL_ORDER' | 'AI_ORDER' | 'ONCHAIN_TRANSFER' | 'CLOSE_POSITION' | 'CUSTOM_HASH';
  symbol?: MarketSymbol;
  side?: 'LONG' | 'SHORT';
  amountOrSize?: number;
  margin?: number;
  leverage?: number;
  executionPrice?: number;
  fromAddress?: string;
  toAddress?: string;
  blockNumber: number;
  slot: number;
  status: 'FILLED' | 'RESTING' | 'CANCELED' | 'CONFIRMED' | 'FINALIZED' | 'NOT_FOUND' | 'SYNTHETIC_LOCAL';
  validatorQuorum: string;
  consensusTimeMs: number;
  gasFee: string;
  stateRoot?: string;
  signature?: {
    r: string;
    s: string;
    v: number;
  };
  merkleProofVerified: boolean;
  isRealOnChain?: boolean;
  oid?: string | number;
  actionType?: string;
  rawExplorerData?: any;
  rawOrderStatus?: any;
  notes?: string;
}

export interface LearnedPattern {
  id: string;
  name: string;
  description: string;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  avgReturnPct: number;
  lastUpdated: number;
  keyRule: string;
  confidenceScore: number;
}

export interface AILogEntry {
  id: string;
  timestamp: number;
  type: 'SIGNAL' | 'EXECUTION' | 'CLOSE' | 'RISK_CHECK' | 'LEARN';
  symbol: MarketSymbol;
  message: string;
  details?: any;
}

export interface MarketResearchReport {
  title: string;
  content: string;
  citations: { title: string; url: string }[];
  timestamp: string;
}

export interface CommunityGuideAnalysis {
  title: string;
  internetWisdom: {
    consensus: string;
    communityInsights: string[];
    sentimentScore: number;
  };
  userTradesDiagnosis: {
    summary: string;
    strengths: string;
    weaknesses: string;
    recommendation: string;
  };
  botTradesDiagnosis: {
    summary: string;
    strengths: string;
    weaknesses: string;
    recommendation: string;
  };
  actionableSynthesis: string;
  suggestedAction?: 'LONG' | 'SHORT' | 'WAIT_PULLBACK';
  suggestedLeverage?: number;
  sources?: { title: string; url: string }[];
}

export interface FundingArbitragePosition {
  id: string;
  symbol: MarketSymbol;
  spotToken: string;
  spotPairName?: string;
  spotAmount: number;
  spotEntryPrice: number;
  perpEntryPrice: number;
  perpShortSize: number;
  allocatedUsdc: number;
  fundingRate8h: number;
  currentApy: number;
  accruedFundingUsdc: number;
  spreadPct: number;
  delta: number;
  openedAt: number;
  lastPayoutAt: number;
  mevProtected: boolean;
  status: 'ACTIVE' | 'CLOSED';
  spotTxHash: string;
  perpTxHash: string;
  spotOid?: string | number;
  perpOid?: string | number;
}

export interface MevShieldEvent {
  id: string;
  timestamp: number;
  type: 'ARBITRAGE_SPOT_SWAP' | 'WALLET_TRANSFER' | 'PERP_SETTLEMENT' | 'AUTO_COMPOUND_DEPOSIT';
  description: string;
  txHash: string;
  route: 'Flashbots Protect Private RPC' | 'Bebop Private Orderflow' | 'Hyperliquid Zero-Mempool L1';
  mevSavedUsdc: number;
  sandwichRiskPrevented: boolean;
}

export interface AutoCompoundVaultState {
  isActive: boolean;
  depositedUsdc: number;
  totalCompoundedUsdc: number;
  currentApy: number;
  compoundFrequency: 'INSTANT' | 'HOURLY' | 'EPOCH_8H';
  lastCompoundedAt: number;
  projectedMonthlyUsdc: number;
  projectedYearlyUsdc: number;
  vaultAddress?: string;
  vaultTvlUsdc?: number;
  isL1Synced?: boolean;
}

export interface OptimizerMetrics {
  modeLabel: 'CALIBRACIÓN ÓPTIMA' | 'MODO DEFENSIVO ANTI-RACHA' | 'TURBO TENDENCIA';
  winRatePct: number;
  totalAnalyzedTrades: number;
  consecutiveLosses: number;
  recentPnlUsdc: number;
  dynamicLeverageCap: number;
  minScoreThreshold: number;
  minPillarsRequired: number;
  cooldownSymbols: string[];
  weakSidePenalized: 'LONG' | 'SHORT' | null;
  feeAndSpreadCostPct: number;
}

export interface UnifiedBrainMetrics {
  compositeScore: number; // -100 to +100
  verdict: 'STRONG_BUY' | 'BUY' | 'DELTA_NEUTRAL_ARBITRAGE' | 'SELL' | 'STRONG_SELL' | 'NEUTRAL_WAIT';
  action: 'LONG' | 'SHORT' | 'DELTA_NEUTRAL' | 'WAIT';
  confidence: number; // 0 - 100%
  // Unified Master Strategy metrics (all intelligence synthesized for positive-EV entries)
  fundingRateApy: number;
  orderbookImbalanceRatio: number;
  cvdMomentumPct: number;
  vwapDistancePct: number;
  squeezeProbability: number;
  rsi14: number;
  emaTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  riskRewardRatio: number;
  expectedValuePct: number;
  positiveEntryApproved: boolean;
  alignedPillars: number;
  historicalWinRatePct: number;
  mevSavedEstimatedUsdc: number;
  suggestedLeverage: number;
  suggestedMarginUsdc: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  rationale: string;
  tonyActionableSynthesis?: string;
  formulaBreakdown: {
    fundingScore: number;
    orderbookScore: number;
    cvdScore: number;
    vwapScore: number;
    squeezeScore: number;
    trendRsiScore: number;
    memoryPatternScore: number;
  };
  optimizer?: OptimizerMetrics;
  isStatisticallyCalibrated?: boolean;
  roundTripCostPct?: number;
  calculatedAt: number;
}

export type BotBrainMode = 'HYBRID' | 'QUANT' | 'AI';
export type BotExecutionMode = 'MULTI_STRATEGY' | 'CONSENSUS' | 'INDEPENDENT';
export type MarketRegime = 'BULL_TREND' | 'BEAR_TREND' | 'RANGE_LATERAL' | 'HIGH_VOLATILITY';
export type TrendDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type StrategyId =
  | 'LIQUIDITY_SWEEP'
  | 'BREAKOUT_RETEST'
  | 'SMC'
  | 'MEAN_REVERSION'
  | 'TREND_FOLLOWING'
  | 'VOLUME_PROFILE'
  | 'ORDERFLOW_CVD'
  | 'LIQUIDATION_HUNTING'
  | 'MOMENTUM_DIVERGENCE'
  | 'VOLATILITY_BREAKOUT';

export type DecisionTier =
  | 'NO_OPERAR'
  | 'ESPERAR_CONFIRMACION'
  | 'SENAL_VALIDA'
  | 'CONFLUENCIA_ALTA';

export interface StructuredStrategySignal {
  strategyId: StrategyId;
  strategyName: string;
  priority: 'PRIORITARIA' | 'CORE';
  suitedRegimes: MarketRegime[];
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  score: number; // 0 - 100
  riskRewardRatio: number;
  timeframe: string;
  expiresAt: number;
  justification: string;
  stage: 'SIGNAL' | 'CONFIRMED' | 'AUTHORIZED' | 'REJECTED';
}

export interface MultiTimeframeState {
  m1: TrendDirection;
  m5: TrendDirection;
  m15: TrendDirection;
  h1: TrendDirection;
  h4: TrendDirection;
  alignedCount: number;
  dominantDirection: TrendDirection;
}

export interface QuantIndicatorSnapshot {
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
  atrPct: number;
  support: number;
  resistance: number;
  poc: number;
  vah: number;
  val: number;
  cvdMomentumPct: number;
  orderbookRatio: number;
  liveSpreadPct: number;
  btcDirection: TrendDirection;
  btcCorrelation: number;
}

export interface EnsembleDecision {
  symbol: MarketSymbol;
  regime: MarketRegime;
  brainMode: BotBrainMode;
  executionMode: BotExecutionMode;
  selectedStrategyId: StrategyId;
  selectedStrategyName: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  rawScore: number; // 0 - 100
  calibratedScore: number; // calibrated with out-of-sample history
  historicalCalibrationWr: number;
  decisionTier: DecisionTier;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskRewardRatio: number;
  timeframe: string;
  expiresAt: number;
  justification: string;
  pipelineStage: 'SIGNAL' | 'CONFIRMATION' | 'EXECUTION_APPROVED' | 'EXECUTION_BLOCKED';
  contradictionFilters: string[];
  mtf: MultiTimeframeState;
  indicators: QuantIndicatorSnapshot;
  signals: StructuredStrategySignal[];
  suggestedRiskLeverage: number;
  suggestedRiskMarginUsdc: number;
  suggestedNotionalUsdc?: number;
  riskAmountUsdc: number;
  stopDistancePct: number;
  alignedPillarsCount?: number;
  totalPillarsCount?: number;
  aiValidationSummary?: string;
  aiApproved?: boolean;
  netExpectedEvPct?: number;
  estimatedRoundTripCostPct?: number;
  abstainedByL1Minimum?: boolean;
  l1MinimumAbstainReason?: string | null;
  skipMinNotional?: boolean;
  hasFullMtf?: boolean;
  quarantinedStrategies?: StrategyId[];
  calculatedAt: number;
}

export interface StrategyPerformanceStat {
  strategyId: StrategyId | string;
  strategyName: string;
  tradesCount: number;
  wins: number;
  winRatePct: number;
  netPnlUsdc: number;
  profitFactor: number;
  expectancyUsdc: number;
  status: 'ACTIVE' | 'PENALIZED' | 'QUARANTINED';
}

export interface RiskEngineConfig {
  riskPerTradePct: number; // default 0.5% (range 0.25% - 1.5%)
  maxDailyLossPct: number; // default 1.5% (range 1.0% - 5.0%)
  maxSimultaneousPositions: number; // default 2
  noAverageDown: boolean; // strictly true
  zoneCooldownMinutes: number; // default 30
  correlationBlockEnabled: boolean;
}

export interface ZoneLockEntry {
  symbol: string;
  side: 'LONG' | 'SHORT';
  price: number;
  expiresAt: number;
  reason: string;
}

export interface RiskEngineState {
  config: RiskEngineConfig;
  executionErrorCount: number;
  dailyPnlUsdc: number;
  dailyLossPct: number;
  dailyDrawdownBreached: boolean;
  openPositionsCount: number;
  correlatedExposureWarning: string | null;
  lockedZones: ZoneLockEntry[];
  tradesTodayCount: number;
  maxTradesPerDay: number;
  consecutiveSlCount: number;
  pauseUntilMs: number | null;
  slCooldownUntilBySymbol?: Record<string, number>;
}

export interface QuantDecisionJournalEntry {
  id: string;
  timestamp: number;
  symbol: MarketSymbol;
  side: 'LONG' | 'SHORT' | 'WAIT';
  eventType:
    | 'OPENED_L1'
    | 'PARTIAL_TP1'
    | 'PARTIAL_TP2'
    | 'TP3_TRAILING_CLOSE'
    | 'BREAK_EVEN_EXIT'
    | 'STRUCTURE_INVALIDATED'
    | 'STOP_LOSS_HIT'
    | 'RISK_BLOCKED'
    | 'SKIP_MIN_NOTIONAL'
    | 'CLOSED';
  strategyId: StrategyId;
  strategyName: string;
  brainMode: BotBrainMode;
  regime: MarketRegime;
  score: number;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  exitPrice?: number;
  realizedPnl?: number;
  entryWhy: string;
  marketConditions: string;
  priceActionAfter: string;
  optimalPostHocDecision: string;
  cloid?: string;
  executionMode: 'LIVE_HYPERLIQUID_L1';
}

export interface StrategyWalkForwardMetric {
  strategyId: StrategyId;
  strategyName: string;
  inSampleTrades: number;
  inSampleWinRate: number;
  outOfSampleTrades: number;
  outOfSampleWinRate: number;
  outOfSampleProfitFactor: number;
  netPnlPctAfterFees: number;
  validatedForLive: boolean;
}

export interface WalkForwardStats {
  symbol: MarketSymbol;
  timeframe: string;
  candlesAnalyzed: number;
  inSampleRatio: number; // 0.70
  outOfSampleWinRate: number;
  outOfSampleProfitFactor: number;
  netReturnAfterFeesAndFundingPct: number;
  maxDrawdownPct: number;
  feeBpsRoundTrip: number;
  fundingBpsAvg: number;
  parameterLockStatus: 'LOCKED_PROTECTED' | 'CANDIDATE_VALIDATED';
  summary: string;
  strategyBreakdown: StrategyWalkForwardMetric[];
  computedAt: number;
}

export interface ConnectionStatusState {
  hyperliquidL1: {
    status: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
    latencyMs: number;
    lastPing: number;
    activeFeeds: string[];
    blockSequence: number;
  };
  importedWallet: {
    status: 'CONNECTED' | 'WAITING_IMPORT';
    address: string;
    detectedUsdcBalance: number;
    walletType: string;
    canSignOrders: boolean;
  };
  quantBrain: {
    status: 'ONLINE' | 'STANDBY';
    activeFormulas: number;
    executionSpeedMs: number;
    lastDecision: string;
  };
  mevShield: {
    status: 'PROTECTED' | 'OFF';
    privateRpc: string;
    mevSavedUsdc: number;
  };
}

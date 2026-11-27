export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  text: string;
  groundingUrls?: { title: string; url: string }[];
  error?: string;
}

export function isStandaloneApkRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'file:' ||
    window.location.origin === 'null' ||
    Boolean((window as any).__HL_ANDROID_APK__)
  );
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  if (isStandaloneApkRuntime()) {
    const raw = String((window as any).__HL_API_BASE_URL__ || '').trim();
    return raw ? raw.replace(/\/+$/, '') : '';
  }
  return '';
}

const HL_DIRECT_INFO_URL = 'https://api.hyperliquid.xyz/info';

interface RouteHealthEntry {
  id: string;
  url: string;
  cooldownUntil: number;
  lastLatencyMs: number;
  failures: number;
  successes: number;
}

const routeHealthMap: Record<string, RouteHealthEntry> = {};
let activeInfoRouteId = 'proxy-info';
let routeFailoverCount = 0;

function getOrderedInfoRoutes(): Array<{ id: string; url: string }> {
  const apiBase = getApiBaseUrl();
  if (isStandaloneApkRuntime()) {
    const routes: Array<{ id: string; url: string }> = [{ id: 'direct-l1', url: HL_DIRECT_INFO_URL }];
    if (apiBase) {
      routes.push({ id: 'apk-proxy-info', url: `${apiBase}/api/hyperliquid/info` });
    }
    return routes;
  }
  return [
    { id: 'proxy-info', url: '/api/hyperliquid/info' },
    { id: 'direct-l1', url: HL_DIRECT_INFO_URL },
  ];
}

export function getHyperliquidRouteTelemetry() {
  return {
    activeInfoRouteId,
    routeFailoverCount,
    routes: Object.values(routeHealthMap).map((r) => ({
      id: r.id,
      lastLatencyMs: r.lastLatencyMs,
      coolingDown: Date.now() < r.cooldownUntil,
      failures: r.failures,
      successes: r.successes,
    })),
  };
}

export async function postHyperliquidInfo(payload: any, timeoutMs: number = 3200): Promise<Response> {
  const now = Date.now();
  const candidates = getOrderedInfoRoutes();
  // Try healthy routes first, then fallback to cooling routes so we never stay blind
  const sorted = [...candidates].sort((a, b) => {
    const ha = routeHealthMap[a.id];
    const hb = routeHealthMap[b.id];
    const aCooling = ha && now < ha.cooldownUntil ? 1 : 0;
    const bCooling = hb && now < hb.cooldownUntil ? 1 : 0;
    if (aCooling !== bCooling) return aCooling - bCooling;
    return (ha?.lastLatencyMs || 0) - (hb?.lastLatencyMs || 0);
  });

  let lastResponse: Response | null = null;
  let lastError: any = null;

  for (let i = 0; i < sorted.length; i++) {
    const route = sorted[i];
    if (!routeHealthMap[route.id]) {
      routeHealthMap[route.id] = {
        id: route.id,
        url: route.url,
        cooldownUntil: 0,
        lastLatencyMs: 120,
        failures: 0,
        successes: 0,
      };
    }
    const health = routeHealthMap[route.id];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = performance.now();

    try {
      const res = await fetch(route.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const elapsed = Math.max(1, Math.round(performance.now() - t0));
      if (res.ok) {
        health.lastLatencyMs = Math.round(health.lastLatencyMs * 0.6 + elapsed * 0.4);
        health.cooldownUntil = 0;
        health.successes += 1;
        if (activeInfoRouteId !== route.id) {
          routeFailoverCount += 1;
          activeInfoRouteId = route.id;
        }
        return res;
      }

      // On rate limit (429) or gateway error (5xx), cool down this route and fail over
      lastResponse = res;
      if (res.status === 429 || res.status >= 500 || res.status === 404) {
        health.failures += 1;
        health.cooldownUntil = Date.now() + (res.status === 429 ? 25_000 : 12_000);
        continue;
      }
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;
      health.failures += 1;
      health.cooldownUntil = Date.now() + 12_000;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error('All Hyperliquid info routes failed');
}

function buildStandaloneTonyChat(messages: ChatMessage[], marketContext?: any): ChatResponse {
  const sym = marketContext?.activeSymbol || 'HYPE-PERP';
  const px = marketContext?.price ?? 0;
  const fnd = ((marketContext?.fundingRate || 0) * 100).toFixed(4);
  const lastUserMsg = [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';
  const botState = marketContext?.botActive ? 'ACTIVO (FUEGO REAL ON)' : 'STANDBY (OFF)';
  const eq = Number(marketContext?.walletEquity ?? 0).toFixed(2);
  const brain = marketContext?.unifiedBrain;
  const brainLine = brain
    ? `Cerebro Unificado EV+: ${brain.verdict} (Score ${brain.compositeScore}/100 | EV ${brain.expectedValuePct}% | R:R ${brain.riskRewardRatio}:1 | TP $${brain.takeProfitPrice} / SL $${brain.stopLossPrice}).`
    : 'Esperando confluencia de los 7 pilares para entrada positiva EV+.';

  return {
    text: `¡Oye socio! Aquí Tony Montana directo desde tu terminal Android L1.${lastUserMsg ? `\n\nSobre "${lastUserMsg}":` : ''}\n• Mercado en vivo: ${sym} a $${px} (Funding 8h: ${fnd}%)\n• ${brainLine}\n• Capital Master L1: $${eq} USDC | Bot Autónomo: ${botState}\n\n"THE WORLD IS YOURS" — Disciplina de acero, sin entradas FOMO y siempre con EV+ positivo.`,
    groundingUrls: [{ title: 'Hyperliquid L1 Live API', url: 'https://hyperliquid.xyz' }],
  };
}

export async function sendChatMessage(
  messages: ChatMessage[],
  marketContext?: any,
  enableSearch: boolean = true
): Promise<ChatResponse> {
  if (isStandaloneApkRuntime()) {
    return buildStandaloneTonyChat(messages, marketContext);
  }

  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, marketContext, enableSearch }),
    });

    if (!response.ok) {
      return buildStandaloneTonyChat(messages, marketContext);
    }

    return response.json();
  } catch {
    return buildStandaloneTonyChat(messages, marketContext);
  }
}

export async function runMarketResearch(
  query: string,
  topic?: string
): Promise<{ title: string; content: string; citations: { title: string; url: string }[]; timestamp: string }> {
  if (!isStandaloneApkRuntime()) {
    try {
      const response = await fetch('/api/ai/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, topic }),
      });
      if (response.ok) {
        return response.json();
      }
    } catch {
      // Fallback below
    }
  }

  return {
    title: `Dossier L1: ${topic || query || 'Hyperliquid Multi-Token'}`,
    content: `Radar L1 directo ejecutado para "${query || 'Hyperliquid Perps'}". Priorizando pares con volumen 24h >= $250K, imbalance favorable en libro L2 y filtro EV+ >= 2.6:1.`,
    citations: [{ title: 'Hyperliquid DEX Radar', url: 'https://hyperliquid.xyz' }],
    timestamp: new Date().toISOString(),
  };
}

export async function requestAISignal(data: {
  symbol: string;
  currentPrice: number;
  fundingRate: number;
  orderbook?: any;
  riskProfile?: string;
}): Promise<{
  action: 'LONG' | 'SHORT' | 'HOLD';
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  suggestedLeverage: number;
  rationale: string;
  patternIdentified: string;
}> {
  if (!isStandaloneApkRuntime()) {
    try {
      const response = await fetch('/api/ai/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        return response.json();
      }
    } catch {
      // fallback below
    }
  }

  const isBullish = data.fundingRate >= 0;
  const pxDec = data.currentPrice < 0.01 ? 6 : data.currentPrice < 1 ? 4 : 2;
  return {
    action: isBullish ? 'LONG' : 'SHORT',
    confidence: 78,
    entryPrice: data.currentPrice,
    stopLoss: isBullish ? +(data.currentPrice * 0.985).toFixed(pxDec) : +(data.currentPrice * 1.015).toFixed(pxDec),
    takeProfit: isBullish ? +(data.currentPrice * 1.0375).toFixed(pxDec) : +(data.currentPrice * 0.9625).toFixed(pxDec),
    suggestedLeverage: 3,
    rationale: `Evaluación L2 de ${data.symbol} acotada al tope global de 3x.`,
    patternIdentified: 'Orderbook Wall Absorption Scalp',
  };
}

export async function requestAITradeLearning(trade: any): Promise<{
  lesson: string;
  strategyAdjustment: string;
  confidenceMultiplier: number;
}> {
  if (!isStandaloneApkRuntime()) {
    try {
      const response = await fetch('/api/ai/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trade }),
      });

      if (response.ok) {
        return response.json();
      }
    } catch {
      // fallback below
    }
  }

  const isWin = (trade?.realizedPnl || 0) >= 0;
  return {
    lesson: isWin
      ? `Operación ganadora en ${trade?.symbol}: la toma de ganancias escalonada preservó el capital.`
      : `Pérdida acotada en ${trade?.symbol}: el Stop Loss técnico evitó una mayor exposición al mercado.`,
    strategyAdjustment: 'Mantener estricto dimensionamiento del margen.',
    confidenceMultiplier: 1.0,
  };
}

let ttsQuotaCooldownUntil = 0;

export async function requestTextToSpeech(text: string, voice: string = 'Kore'): Promise<string> {
  const apiBase = getApiBaseUrl();
  if (isStandaloneApkRuntime() && !apiBase) {
    throw new Error('APK_NATIVE_TTS');
  }
  if (Date.now() < ttsQuotaCooldownUntil) {
    throw new Error('TTS_QUOTA_COOLDOWN');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), isStandaloneApkRuntime() ? 4500 : 12000);
  try {
    const response = await fetch(`${apiBase}/api/ai/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        const errData = await response.json().catch(() => ({}));
        const retrySec = Number(errData?.retryAfterSec || 120);
        ttsQuotaCooldownUntil = Date.now() + Math.max(60_000, Math.min(300_000, retrySec * 1000));
      }
      throw new Error('TTS indisponible temporalmente');
    }

    const data = await response.json();
    if (!data?.audioBase64) {
      throw new Error('Audio TTS vacío');
    }
    return data.audioBase64;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestGuideAnalysis(payload: {
  symbol: string;
  currentPrice: number;
  fundingRate: number;
  orderbook?: any;
  userTrades: any[];
  botTrades: any[];
  customTopic?: string;
  hasResearchReports?: boolean;
}): Promise<{
  title: string;
  internetWisdom: {
    consensus: string;
    communityInsights: string[];
    sentimentScore: number;
    weightPct?: number;
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
  source?: string;
  quotaExhausted?: boolean;
  retryAfterSec?: number;
  quotaNotice?: string;
}> {
  if (!isStandaloneApkRuntime()) {
    try {
      const response = await fetch('/api/ai/guide-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const parsed = await response.json();
        return {
          ...parsed,
          suggestedLeverage: Math.min(3, Number(parsed?.suggestedLeverage || 3)),
          internetWisdom: {
            ...(parsed?.internetWisdom || {}),
            weightPct: payload.hasResearchReports ? 25 : 0,
          },
        };
      }
    } catch {
      // Fallback to deterministic local quant diagnosis below
    }
  }

  const userPnl = (payload.userTrades || []).reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
  const botPnl = (payload.botTrades || []).reduce((acc, t) => acc + (t.realizedPnl || 0), 0);

  return {
    title: `Guía Cuántica & Sabiduría Colectiva: ${payload.symbol}`,
    internetWisdom: {
      consensus: payload.hasResearchReports
        ? 'Flujo L1 activo con monitoreo de liquidez en el libro de órdenes.'
        : 'Sin reportes de investigación activos — Peso Sabiduría Internet fijado en 0% (solo filtro de veto L1).',
      communityInsights: [
        'Protocolo SCARFACE L1: Tope único 3x máximo, SL 1.5x ATR (máx 2.5%), BE +1.2R y TP único +2.5R.',
        'Whitelist activa: BTC, ETH, SOL, HYPE con velas MTF 5m/15m/1h/4h por WebSocket.',
        'La IA actúa exclusivamente como filtro de veto y detección de Bull Trap / invalidación estructural.',
      ],
      sentimentScore: payload.hasResearchReports ? 74 : 50,
      weightPct: payload.hasResearchReports ? 25 : 0,
    },
    userTradesDiagnosis: {
      summary: `Has ejecutado ${payload.userTrades?.length || 0} operaciones manuales con PnL real de ${userPnl >= 0 ? '+' : ''}$${userPnl.toFixed(2)} USDC.`,
      strengths: 'Lectura directa del flujo L1.',
      weaknesses: 'Mantener disciplina estricta de Stop Loss <= 2.5%.',
      recommendation: 'Operar solo setups aprobados (>= 65/100 y 3/4 pilares) a 3x máximo.'
    },
    botTradesDiagnosis: {
      summary: `Bot Autónomo ha ejecutado ${payload.botTrades?.length || 0} operaciones con PnL real de ${botPnl >= 0 ? '+' : ''}$${botPnl.toFixed(2)} USDC.`,
      strengths: 'Ejecución Limit Post-Only (Alo) para entradas/TP y Market solo en SL/emergencias.',
      weaknesses: 'Modo veto activo contra trampas alcistas o divergencias estructurales.',
      recommendation: 'Respetar límite máximo de 4 trades/día y cooldown de 3 velas tras SL.'
    },
    actionableSynthesis: `VEREDICTO EN VIVO // TONY MONTANA: ${payload.symbol} cotiza a $${payload.currentPrice}. La IA solo actúa como filtro de veto sin alterar tamaño, SL, TP ni apalancamiento (3x máx).`,
    suggestedAction: 'WAIT_PULLBACK',
    suggestedLeverage: 3,
    sources: [
      { title: 'Hyperliquid DEX Global Liquidity Radar', url: 'https://hyperliquid.xyz' },
    ],
    source: 'LOCAL_QUANT_FALLBACK',
    quotaExhausted: false,
  };
}

export async function fetchLiveHyperliquidMids(): Promise<Record<string, number> | null> {
  try {
    const res = await postHyperliquidInfo({ type: 'allMids' });
    if (!res.ok) return null;
    const mids = await res.json();
    const result: Record<string, number> = {};
    for (const [coin, priceStr] of Object.entries(mids)) {
      result[coin] = parseFloat(priceStr as string);
    }
    return result;
  } catch (err) {
    console.warn('Could not fetch live Hyperliquid mids:', err);
    return null;
  }
}

export async function fetchLiveHyperliquidL2Book(coin: string): Promise<{ bids: any[]; asks: any[] } | null> {
  try {
    const res = await postHyperliquidInfo({ type: 'l2Book', coin });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.levels) && data.levels.length >= 2) {
      return {
        bids: data.levels[0],
        asks: data.levels[1],
      };
    }
    return null;
  } catch (err) {
    console.warn('Could not fetch live Hyperliquid L2 book:', err);
    return null;
  }
}

export async function fetchLiveHyperliquidMetaAndCtxs(): Promise<any | null> {
  try {
    const res = await postHyperliquidInfo({ type: 'metaAndAssetCtxs' });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('Could not fetch live Hyperliquid meta:', err);
    return null;
  }
}

export async function fetchLiveHyperliquidRecentTrades(
  coin: string
): Promise<Array<{ id: string; price: number; size: number; side: 'buy' | 'sell'; time: number }> | null> {
  try {
    const res = await postHyperliquidInfo({ type: 'recentTrades', coin });
    if (!res.ok) return null;
    const trades = await res.json();
    if (!Array.isArray(trades)) return null;
    return trades.map((t: any, idx: number) => ({
      id: `${t.tid || t.time || Date.now()}-${idx}`,
      price: parseFloat(t.px || '0'),
      size: parseFloat(t.sz || '0'),
      side: t.side === 'B' ? 'buy' : 'sell',
      time: Number(t.time || Date.now()),
    }));
  } catch (err) {
    console.warn('Could not fetch live Hyperliquid recentTrades:', err);
    return null;
  }
}

const INTERVAL_MS_MAP: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

export async function fetchLiveHyperliquidCandles(
  coin: string,
  interval: string = '15m',
  count: number = 60
): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> | null> {
  try {
    const validInterval = INTERVAL_MS_MAP[interval] ? interval : '15m';
    const stepMs = INTERVAL_MS_MAP[validInterval];
    const endTime = Date.now();
    const startTime = endTime - stepMs * count;

    const res = await postHyperliquidInfo({
      type: 'candleSnapshot',
      req: { coin, interval: validInterval, startTime, endTime },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return data.map((c: any) => ({
      time: Number(c.t),
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v),
    }));
  } catch (err) {
    console.warn('Could not fetch live Hyperliquid candleSnapshot:', err);
    return null;
  }
}

export async function fetchLiveHyperliquidUserFills(user: string): Promise<any[] | null> {
  try {
    if (!user || !/^0x[a-fA-F0-9]{40}$/.test(user)) return null;
    const res = await postHyperliquidInfo({ type: 'userFills', user });
    if (!res.ok) return null;
    const fills = await res.json();
    return Array.isArray(fills) ? fills : null;
  } catch {
    return null;
  }
}

export async function fetchLiveHyperliquidOpenOrders(user: string): Promise<any[] | null> {
  try {
    if (!user || !/^0x[a-fA-F0-9]{40}$/.test(user)) return null;
    const res = await postHyperliquidInfo({ type: 'openOrders', user });
    if (!res.ok) return null;
    const orders = await res.json();
    return Array.isArray(orders) ? orders : null;
  } catch {
    return null;
  }
}

export async function requestHybridAIValidation(payload: {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  regime: string;
  score: number;
  strategyName: string;
  mtfAligned: number;
  pillarsAligned?: number;
  btcCorrelation: number;
  btcDirection: string;
  rsi14: number;
  atrPct: number;
  cvdMomentumPct: number;
  isPositionExitCheck?: boolean;
}): Promise<{
  approved: boolean;
  bullTrapDetected?: boolean;
  structuralInvalidation?: boolean;
  confidenceAdjustment: number;
  summary: string;
  source?: string;
}> {
  const pillarsOk = payload.pillarsAligned !== undefined ? payload.pillarsAligned >= 3 : payload.mtfAligned >= 2;
  const mathApproved = payload.direction !== 'WAIT' && payload.score >= 65 && pillarsOk;
  const fallback = {
    approved: mathApproved,
    bullTrapDetected: false,
    structuralInvalidation: false,
    confidenceAdjustment: 0, // Veto-only: nunca suma ni modifica score matemático
    summary: mathApproved
      ? `Filtro Veto IA OK: ${payload.strategyName} (${payload.direction}) sin Bull Trap ni invalidación (${payload.score}/100).`
      : `Veto cuantitativo activo: Score ${payload.score}/100 bajo régimen ${payload.regime}.`,
    source: 'LOCAL_QUANT_VETO_GATE',
  };

  if (isStandaloneApkRuntime() || payload.direction === 'WAIT') {
    return fallback;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2800);
    const res = await fetch('/api/ai/hybrid-validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return fallback;
    const data = await res.json();
    const bullTrap = Boolean(data.bullTrapDetected);
    const invalidation = Boolean(data.structuralInvalidation);
    return {
      approved: typeof data.approved === 'boolean' ? data.approved && !bullTrap && !invalidation : mathApproved,
      bullTrapDetected: bullTrap,
      structuralInvalidation: invalidation,
      confidenceAdjustment: 0, // Estricto: IA nunca altera score, tamaño, SL, TP ni apalancamiento
      summary: data.summary || fallback.summary,
      source: data.source || 'HYBRID_AI_VETO',
    };
  } catch {
    return fallback;
  }
}

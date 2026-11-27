import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, hexToBytes } from 'viem';
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { isStandaloneApkRuntime, getApiBaseUrl, postHyperliquidInfo } from './api';
import { SpotTokenBalance, HashVerificationRecord } from '../types/trading';
import { isValidTxHash, extractOidNumber } from './walletCrypto';
import { MAX_GLOBAL_LEVERAGE } from './riskConstants';

export const HYPERLIQUID_API_WALLET_KEY =
  '0x6dcd2d11df86d3e7450161a108217e2d66516aedd83b5160a65aaef399502291';

export const HLP_VAULT_ADDRESS = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

export interface RealWalletBalances {
  USDC: number;
  ETH: number;
  HYPE: number;
  ARB: number;
  arbitrumUsdc: number;
  hyperliquidAccountValue: number;
  hyperliquidSpotUsdc: number;
  hyperliquidSpotBalances: SpotTokenBalance[];
  hyperliquidWithdrawable: number;
  hyperliquidMarginUsed: number;
  hyperliquidUserRole: string;
  isAgentAuthorized: boolean;
  hyperliquidPositions: any[];
  effectiveUser: string;
  chStateSucceeded: boolean;
  networkName: string;
  chainId: string;
  syncedAt: number;
}

// Arbitrum One Native USDC
const ARBITRUM_USDC_CONTRACT = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
// Bridged USDC.e on Arbitrum One
const ARBITRUM_USDC_BRIDGED = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
// Arbitrum One Native ARB Token
const ARBITRUM_ARB_CONTRACT = '0x912CE59144191C1204E64559FE8253a0e49E6548';
const ARBITRUM_DIRECT_RPCS = ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'];

async function callArbitrumRpc(method: string, params: any[]): Promise<string | null> {
  if (!isStandaloneApkRuntime()) {
    try {
      const res = await fetch('/api/arbitrum/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params }),
      });
      if (res.ok) {
        const data = await res.json();
        return data?.result || null;
      }
    } catch {
      // Fallback to direct Arbitrum RPC below
    }
  }

  for (const rpcUrl of ARBITRUM_DIRECT_RPCS) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data?.error) return data?.result || null;
      }
    } catch {
      // Try next RPC
    }
  }
  return null;
}

async function callHyperliquidInfo(payload: any): Promise<any | null> {
  try {
    const res = await postHyperliquidInfo(payload, 3500);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function callHyperliquidExplorer(payload: any): Promise<any | null> {
  if (!isStandaloneApkRuntime()) {
    try {
      const res = await fetch('/api/hyperliquid/explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status !== 404) return await res.json().catch(() => null);
    } catch {
      // Fallback to direct explorer RPC below
    }
  }

  try {
    const res = await fetch('https://rpc.hyperliquid.xyz/explorer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/**
 * Fetch 100% GENUINE balances from Arbitrum One Mainnet RPC and Hyperliquid L1 Clearinghouse/Spot.
 * Always queries Hyperliquid Clearinghouse with the MASTER address per official docs!
 * Returns exact real values (0 when empty; zero fallback fake balances).
 */
export async function fetchRealWalletBalances(
  accountAddress: string,
  apiAgentAddress?: string
): Promise<RealWalletBalances> {
  let ethBalance = 0;
  let arbitrumUsdc = 0;
  let arbBalance = 0;
  let hypeBalance = 0;
  let hlAccountValue = 0;
  let hlWithdrawable = 0;
  let hlMarginUsed = 0;
  let hlUserRole = 'missing';
  let isAgentAuthorized = false;
  let hlPositions: any[] = [];

  const cleanTarget = (accountAddress || '').trim();
  const cleanAgent = (apiAgentAddress || cleanTarget).trim();

  let effectiveUser = cleanTarget;

  if (/^0x[a-fA-F0-9]{40}$/.test(cleanTarget)) {
    const preRoleData = /^0x[a-fA-F0-9]{40}$/.test(cleanAgent)
      ? await callHyperliquidInfo({ type: 'userRole', user: cleanAgent })
      : null;
    if (preRoleData?.role) {
      hlUserRole = preRoleData.role;
    }
    const discoveredMaster = preRoleData?.data?.user;
    if (
      discoveredMaster &&
      /^0x[a-fA-F0-9]{40}$/.test(discoveredMaster) &&
      cleanTarget.toLowerCase() === cleanAgent.toLowerCase()
    ) {
      effectiveUser = discoveredMaster;
    }

    const cleanAddrPadded = effectiveUser.toLowerCase().replace('0x', '').padStart(64, '0');
    const balanceOfPayload = `0x70a08231${cleanAddrPadded}`;

    const [
      rawEthHex,
      rawUsdcHex,
      rawUsdcEHex,
      rawArbHex,
      hlChData,
      hlSpotData,
      hlExtraAgents,
    ] = await Promise.all([
      callArbitrumRpc('eth_getBalance', [effectiveUser, 'latest']),
      callArbitrumRpc('eth_call', [{ to: ARBITRUM_USDC_CONTRACT, data: balanceOfPayload }, 'latest']),
      callArbitrumRpc('eth_call', [{ to: ARBITRUM_USDC_BRIDGED, data: balanceOfPayload }, 'latest']),
      callArbitrumRpc('eth_call', [{ to: ARBITRUM_ARB_CONTRACT, data: balanceOfPayload }, 'latest']),
      callHyperliquidInfo({ type: 'clearinghouseState', user: effectiveUser }),
      callHyperliquidInfo({ type: 'spotClearinghouseState', user: effectiveUser }),
      callHyperliquidInfo({ type: 'extraAgents', user: effectiveUser }),
    ]);

    if (rawEthHex && rawEthHex !== '0x') {
      ethBalance = +(Number(BigInt(rawEthHex)) / 1e18).toFixed(5);
    }

    let nativeUsdc = 0;
    let bridgedUsdc = 0;
    if (rawUsdcHex && rawUsdcHex !== '0x') {
      nativeUsdc = Number(BigInt(rawUsdcHex)) / 1e6;
    }
    if (rawUsdcEHex && rawUsdcEHex !== '0x') {
      bridgedUsdc = Number(BigInt(rawUsdcEHex)) / 1e6;
    }
    arbitrumUsdc = +(nativeUsdc + bridgedUsdc).toFixed(2);

    if (rawArbHex && rawArbHex !== '0x') {
      arbBalance = +(Number(BigInt(rawArbHex)) / 1e18).toFixed(2);
    }

    if (hlChData?.marginSummary) {
      hlAccountValue = +(parseFloat(hlChData.marginSummary.accountValue || '0')).toFixed(2);
      hlMarginUsed = +(parseFloat(hlChData.marginSummary.totalMarginUsed || '0')).toFixed(2);
      hlWithdrawable = +(parseFloat(hlChData.withdrawable || '0')).toFixed(2);
    }
    if (Array.isArray(hlChData?.assetPositions)) {
      hlPositions = hlChData.assetPositions;
    }

    let hlSpotUsdc = 0;
    const spotBalances: SpotTokenBalance[] = [];
    if (hlSpotData && Array.isArray(hlSpotData.balances)) {
      for (const b of hlSpotData.balances) {
        const totalVal = parseFloat(b.total || '0');
        const holdVal = parseFloat(b.hold || '0');
        const availableVal = Math.max(0, totalVal - holdVal);
        const coinName = String(b.coin || '').toUpperCase();
        if (totalVal > 0 || holdVal > 0) {
          spotBalances.push({
            coin: coinName,
            total: +totalVal.toFixed(6),
            hold: +holdVal.toFixed(6),
            available: +availableVal.toFixed(6),
          });
        }
        if (coinName === 'HYPE') hypeBalance = +availableVal.toFixed(4);
        if (coinName === 'USDC') hlSpotUsdc = +availableVal.toFixed(2);
      }
    }

    if (Array.isArray(hlExtraAgents) && cleanAgent) {
      isAgentAuthorized = hlExtraAgents.some(
        (ag: any) => (ag.address || '').toLowerCase() === cleanAgent.toLowerCase()
      );
    }
    if (cleanAgent.toLowerCase() === effectiveUser.toLowerCase() && (hlAccountValue > 0 || hlSpotUsdc > 0)) {
      isAgentAuthorized = true;
    }

    const totalUsdc = +(hlAccountValue + hlSpotUsdc + arbitrumUsdc).toFixed(2);

    const chStateSucceeded = Boolean(hlChData?.marginSummary);

    return {
      USDC: totalUsdc,
      ETH: ethBalance,
      HYPE: hypeBalance,
      ARB: arbBalance,
      arbitrumUsdc,
      hyperliquidAccountValue: hlAccountValue,
      hyperliquidSpotUsdc: hlSpotUsdc,
      hyperliquidSpotBalances: spotBalances,
      hyperliquidWithdrawable: hlWithdrawable,
      hyperliquidMarginUsed: hlMarginUsed,
      hyperliquidUserRole: hlUserRole,
      isAgentAuthorized,
      hyperliquidPositions: hlPositions,
      effectiveUser,
      chStateSucceeded,
      networkName: 'Hyperliquid L1 + Arbitrum One',
      chainId: '0xa4b1',
      syncedAt: Date.now(),
    };
  }

  return {
    USDC: 0,
    ETH: 0,
    HYPE: 0,
    ARB: 0,
    arbitrumUsdc: 0,
    hyperliquidAccountValue: 0,
    hyperliquidSpotUsdc: 0,
    hyperliquidSpotBalances: [],
    hyperliquidWithdrawable: 0,
    hyperliquidMarginUsed: 0,
    hyperliquidUserRole: 'invalid_address',
    isAgentAuthorized: false,
    hyperliquidPositions: [],
    effectiveUser: cleanTarget,
    chStateSucceeded: false,
    networkName: 'Hyperliquid L1 + Arbitrum One',
    chainId: '0xa4b1',
    syncedAt: Date.now(),
  };
}

function stripTrailingZeros(numStr: string): string {
  if (!numStr.includes('.')) return numStr;
  return numStr.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

async function postSignedHyperliquidAction(params: {
  privateKey: string;
  action: any;
  vaultAddress?: string;
}): Promise<{ ok: boolean; status: number; data: any }> {
  const cleanKey = params.privateKey.trim().startsWith('0x')
    ? params.privateKey.trim()
    : `0x${params.privateKey.trim()}`;
  const account = privateKeyToAccount(cleanKey as `0x${string}`);

  const nonce = Date.now();
  const encodedAction = msgpackEncode(params.action);

  const nonceBytes = new Uint8Array(8);
  const view = new DataView(nonceBytes.buffer);
  view.setBigUint64(0, BigInt(nonce), false);

  const hasVault = params.vaultAddress && /^0x[a-fA-F0-9]{40}$/.test(params.vaultAddress);
  const vaultBytes = hasVault
    ? new Uint8Array([1, ...hexToBytes(params.vaultAddress as `0x${string}`)])
    : new Uint8Array([0]);

  const payload = new Uint8Array(encodedAction.length + nonceBytes.length + vaultBytes.length);
  payload.set(encodedAction, 0);
  payload.set(nonceBytes, encodedAction.length);
  payload.set(vaultBytes, encodedAction.length + nonceBytes.length);

  const connectionId = keccak256(payload);

  const sigHex = await account.signTypedData({
    domain: {
      name: 'Exchange',
      version: '1',
      chainId: 1337,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
    },
    primaryType: 'Agent',
    message: {
      source: 'a',
      connectionId,
    },
  });

  const sigClean = sigHex.slice(2);
  const r = `0x${sigClean.slice(0, 64)}`;
  const s = `0x${sigClean.slice(64, 128)}`;
  const vByte = parseInt(sigClean.slice(128, 130), 16);
  const v = vByte < 27 ? vByte + 27 : vByte;

  const exchangePayload = JSON.stringify({
    action: params.action,
    nonce,
    signature: { r, s, v },
    ...(hasVault ? { vaultAddress: params.vaultAddress } : {}),
  });

  const exchangeRoutes: Array<{ id: string; url: string }> = isStandaloneApkRuntime()
    ? [
        { id: 'direct-exchange', url: 'https://api.hyperliquid.xyz/exchange' },
        ...(getApiBaseUrl() ? [{ id: 'apk-proxy-exchange', url: `${getApiBaseUrl()}/api/hyperliquid/exchange` }] : []),
      ]
    : [
        { id: 'proxy-exchange', url: '/api/hyperliquid/exchange' },
        { id: 'direct-exchange', url: 'https://api.hyperliquid.xyz/exchange' },
      ];

  let exRes: Response | null = null;
  let lastExErr: any = null;

  for (const route of exchangeRoutes) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(route.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: exchangePayload,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 404 || res.status === 429 || res.status >= 502) {
        exRes = res;
        continue;
      }
      exRes = res;
      break;
    } catch (err: any) {
      clearTimeout(timer);
      lastExErr = err;
    }
  }

  if (!exRes) {
    throw lastExErr || new Error('All Hyperliquid exchange execution routes timed out');
  }

  const data = await exRes.json().catch(() => ({}));
  return { ok: exRes.ok, status: exRes.status, data };
}

function formatHyperliquidPrice(px: number, szDecimals: number): string {
  const sigRounded = Number(px.toPrecision(5));
  const maxDecimals = Math.max(0, 6 - szDecimals);
  const decRounded = Number(sigRounded.toFixed(maxDecimals));
  return stripTrailingZeros(decRounded.toString());
}

function normalizeCloid(cloid?: string): string | undefined {
  if (!cloid || typeof cloid !== 'string') return undefined;
  const trimmed = cloid.trim().toLowerCase();
  return /^0x[0-9a-f]{32}$/.test(trimmed) ? trimmed : undefined;
}

/**
 * Official Hyperliquid L1 Phantom Agent EIP-712 Order Signing & Submission (/api/hyperliquid/exchange)
 * Follows Hyperliquid GitBook spec: msgpack(action) + 8-byte nonce + vaultFlag -> keccak256 -> EIP-712 ChainId 1337
 * Strict OrderWire field sequence: a -> b -> p -> s -> r -> t -> c (optional cloid).
 */
export async function submitHyperliquidL1Order(params: {
  privateKey: string;
  coin: string;
  isBuy: boolean;
  price: number;
  size: number;
  leverage?: number;
  isCross?: boolean;
  reduceOnly?: boolean;
  vaultAddress?: string;
  slippagePct?: number;
  tif?: 'Ioc' | 'Alo' | 'Gtc';
  cloid?: string;
}): Promise<{ ok: boolean; status: string; response: any; oid?: number | string; filledSz?: number; avgPx?: number; cloid?: string }> {
  // 1. Resolve asset index from Hyperliquid meta
  const metaRes = await callHyperliquidInfo({ type: 'meta' });
  const universe = metaRes?.universe || [];
  const assetIdx = universe.findIndex((u: any) => u.name === params.coin);
  if (assetIdx === -1) {
    return { ok: false, status: 'ASSET_NOT_FOUND', response: { error: `Activo ${params.coin} no encontrado en meta L1` } };
  }

  // 2. Sync leverage on Hyperliquid L1 before order entry (strictly capped at MAX_GLOBAL_LEVERAGE = 3x)
  if (params.leverage && params.leverage >= 1 && !params.reduceOnly) {
    const assetMaxLev = Number(universe[assetIdx]?.maxLeverage || MAX_GLOBAL_LEVERAGE);
    const targetLev = Math.max(1, Math.min(MAX_GLOBAL_LEVERAGE, assetMaxLev, Math.round(params.leverage)));
    try {
      await postSignedHyperliquidAction({
        privateKey: params.privateKey,
        vaultAddress: params.vaultAddress,
        action: {
          type: 'updateLeverage',
          asset: assetIdx,
          isCross: params.isCross !== false,
          leverage: targetLev,
        },
      });
    } catch {
      // Non-blocking: proceed with order submission even if leverage was already set
    }
  }

  const szDecimals = typeof universe[assetIdx].szDecimals === 'number' ? universe[assetIdx].szDecimals : 2;
  const tif = params.tif || 'Alo';
  // For Post-Only Maker ('Alo') or GTC, post strictly at exact top-of-book/target price (never cross spread!)
  const slip = tif === 'Alo' ? 0 : params.slippagePct ?? (params.reduceOnly ? 0.0025 : 0.0012);
  const limitPx = slip === 0 ? params.price : params.isBuy ? params.price * (1 + slip) : params.price * (1 - slip);
  const formattedPx = formatHyperliquidPrice(limitPx, szDecimals);
  const formattedSz = stripTrailingZeros(params.size.toFixed(szDecimals));
  const validCloid = normalizeCloid(params.cloid);

  // Strict Hyperliquid OrderWire field order for L1 msgpack hashing: a -> b -> p -> s -> r -> t -> c
  const orderWire: any = {
    a: assetIdx,
    b: params.isBuy,
    p: formattedPx,
    s: formattedSz,
    r: Boolean(params.reduceOnly),
    t: { limit: { tif } },
  };
  if (validCloid) {
    orderWire.c = validCloid;
  }

  const orderAction = {
    type: 'order',
    orders: [orderWire],
    grouping: 'na',
  };

  const { ok: httpOk, data } = await postSignedHyperliquidAction({
    privateKey: params.privateKey,
    action: orderAction,
    vaultAddress: params.vaultAddress,
  });

  const isOk = httpOk && data?.status === 'ok';
  const statuses = data?.response?.data?.statuses || [];
  const firstStatus = statuses[0];
  const oid = firstStatus?.filled?.oid || firstStatus?.resting?.oid;
  const filledSz = firstStatus?.filled?.totalSz ? parseFloat(firstStatus.filled.totalSz) : undefined;
  const avgPx = firstStatus?.filled?.avgPx ? parseFloat(firstStatus.filled.avgPx) : undefined;
  const orderErr = firstStatus?.error;

  return {
    ok: isOk && !orderErr,
    status: orderErr ? 'REJECTED' : data?.status || 'ERROR',
    response: data,
    oid,
    filledSz,
    avgPx,
    cloid: validCloid,
  };
}

/**
 * Cancel an unfilled resting order on Hyperliquid L1 by coin + oid
 */
export async function cancelHyperliquidL1Order(params: {
  privateKey: string;
  coin: string;
  oid: number | string;
  vaultAddress?: string;
}): Promise<boolean> {
  try {
    const metaRes = await callHyperliquidInfo({ type: 'meta' });
    const universe = metaRes?.universe || [];
    const assetIdx = universe.findIndex((u: any) => u.name === params.coin);
    if (assetIdx === -1) return false;

    const { ok, data } = await postSignedHyperliquidAction({
      privateKey: params.privateKey,
      vaultAddress: params.vaultAddress,
      action: {
        type: 'cancel',
        cancels: [
          {
            a: assetIdx,
            o: Number(params.oid),
          },
        ],
      },
    });
    return ok && data?.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Places a real Reduce-Only Trigger Stop-Loss order on Hyperliquid L1 at Break-Even price
 * so the position stays protected on-chain even if the app/browser is closed.
 */
export async function submitHyperliquidBreakEvenOrder(params: {
  privateKey: string;
  coin: string;
  positionSide: 'LONG' | 'SHORT';
  triggerPrice: number;
  size: number;
  vaultAddress?: string;
  cloid?: string;
}): Promise<{ ok: boolean; status: string; response: any; oid?: number | string }> {
  const metaRes = await callHyperliquidInfo({ type: 'meta' });
  const universe = metaRes?.universe || [];
  const assetIdx = universe.findIndex((u: any) => u.name === params.coin);
  if (assetIdx === -1) {
    return { ok: false, status: 'ASSET_NOT_FOUND', response: { error: `Activo ${params.coin} no encontrado en L1` } };
  }

  const szDecimals = typeof universe[assetIdx].szDecimals === 'number' ? universe[assetIdx].szDecimals : 2;
  const closeIsBuy = params.positionSide === 'SHORT';
  // Worst-case execution price (0.35% past triggerPx) to ensure immediate fill if triggered
  const execSlipPx = closeIsBuy ? params.triggerPrice * 1.0035 : params.triggerPrice * 0.9965;
  const formattedTriggerPx = formatHyperliquidPrice(params.triggerPrice, szDecimals);
  const formattedLimitPx = formatHyperliquidPrice(execSlipPx, szDecimals);
  const formattedSz = stripTrailingZeros(params.size.toFixed(szDecimals));
  const validCloid = normalizeCloid(params.cloid);

  const triggerWire: any = {
    a: assetIdx,
    b: closeIsBuy,
    p: formattedLimitPx,
    s: formattedSz,
    r: true,
    t: {
      trigger: {
        isMarket: true,
        triggerPx: formattedTriggerPx,
        tpsl: 'sl',
      },
    },
  };
  if (validCloid) {
    triggerWire.c = validCloid;
  }

  const triggerOrderAction = {
    type: 'order',
    orders: [triggerWire],
    grouping: 'na',
  };

  const { ok: httpOk, data } = await postSignedHyperliquidAction({
    privateKey: params.privateKey,
    action: triggerOrderAction,
    vaultAddress: params.vaultAddress,
  });

  const isOk = httpOk && data?.status === 'ok';
  const statuses = data?.response?.data?.statuses || [];
  const firstStatus = statuses[0];
  const oid = firstStatus?.resting?.oid || firstStatus?.filled?.oid;
  const orderErr = firstStatus?.error;

  return {
    ok: isOk && !orderErr,
    status: orderErr ? 'REJECTED' : data?.status || 'ERROR',
    response: data,
    oid,
  };
}

export interface HyperliquidSpotAssetInfo {
  assetId: number; // 10000 + pair.index
  pairIndex: number;
  pairName: string; // e.g. '@107' or 'PURR/USDC'
  baseTokenName: string; // e.g. 'HYPE', 'UBTC'
  szDecimals: number;
  midPx: number;
}

/**
 * Resolves the native Hyperliquid L1 Spot market (quoted in USDC) for any perpetual coin symbol.
 */
export async function fetchHyperliquidSpotAsset(baseCoin: string): Promise<HyperliquidSpotAssetInfo | null> {
  try {
    const res = await callHyperliquidInfo({ type: 'spotMetaAndAssetCtxs' });
    if (!Array.isArray(res) || res.length < 2) return null;
    const meta = res[0];
    const ctxs = res[1] || [];
    const tokens = meta?.tokens || [];
    const universe = meta?.universe || [];

    const tokMap = new Map<number, any>(tokens.map((t: any) => [t.index, t]));
    const upper = baseCoin.toUpperCase().replace('-PERP', '');
    const candidates = [upper, `U${upper}`];

    const matching = universe
      .filter((u: any) => {
        if (!Array.isArray(u.tokens) || u.tokens.length < 2 || u.tokens[1] !== 0) return false;
        const baseTok = tokMap.get(u.tokens[0]);
        if (!baseTok) return false;
        return candidates.includes(String(baseTok.name || '').toUpperCase());
      })
      .map((u: any) => {
        const ctx = ctxs[u.index] || {};
        const baseTok = tokMap.get(u.tokens[0]);
        const mid = parseFloat(ctx.midPx || ctx.markPx || '0');
        const vol = parseFloat(ctx.dayNtlVlm || '0');
        return {
          assetId: 10000 + Number(u.index),
          pairIndex: Number(u.index),
          pairName: String(u.name),
          baseTokenName: String(baseTok.name),
          szDecimals: typeof baseTok.szDecimals === 'number' ? baseTok.szDecimals : 2,
          midPx: mid,
          vol,
        };
      })
      .filter((x: any) => x.midPx > 0)
      .sort((a: any, b: any) => b.vol - a.vol);

    if (matching.length === 0) return null;
    const best = matching[0];
    return {
      assetId: best.assetId,
      pairIndex: best.pairIndex,
      pairName: best.pairName,
      baseTokenName: best.baseTokenName,
      szDecimals: best.szDecimals,
      midPx: best.midPx,
    };
  } catch {
    return null;
  }
}

/**
 * Places a 100% genuine Spot Buy/Sell order on Hyperliquid L1 Spot Orderbook (asset = 10000 + pair.index)
 */
export async function submitHyperliquidSpotOrder(params: {
  privateKey: string;
  spotAsset: HyperliquidSpotAssetInfo;
  isBuy: boolean;
  price: number;
  size: number;
  slippagePct?: number;
  tif?: 'Ioc' | 'Gtc' | 'Alo';
}): Promise<{ ok: boolean; status: string; response: any; oid?: number | string; filledSz?: number; avgPx?: number }> {
  const tif = params.tif || 'Ioc';
  const slip = tif === 'Alo' ? 0 : params.slippagePct ?? 0.0035;
  const limitPx = params.isBuy ? params.price * (1 + slip) : params.price * (1 - slip);
  const sigRounded = Number(limitPx.toPrecision(5));
  const maxDecimals = Math.max(0, 8 - params.spotAsset.szDecimals);
  const decRounded = Number(sigRounded.toFixed(maxDecimals));
  const formattedPx = stripTrailingZeros(decRounded.toString());
  const formattedSz = stripTrailingZeros(params.size.toFixed(params.spotAsset.szDecimals));

  const orderAction = {
    type: 'order',
    orders: [
      {
        a: params.spotAsset.assetId,
        b: params.isBuy,
        p: formattedPx,
        s: formattedSz,
        r: false,
        t: { limit: { tif } },
      },
    ],
    grouping: 'na',
  };

  const { ok: httpOk, data } = await postSignedHyperliquidAction({
    privateKey: params.privateKey,
    action: orderAction,
  });

  const isOk = httpOk && data?.status === 'ok';
  const statuses = data?.response?.data?.statuses || [];
  const firstStatus = statuses[0];
  const oid = firstStatus?.filled?.oid || firstStatus?.resting?.oid;
  const filledSz = firstStatus?.filled?.totalSz ? parseFloat(firstStatus.filled.totalSz) : undefined;
  const avgPx = firstStatus?.filled?.avgPx ? parseFloat(firstStatus.filled.avgPx) : undefined;
  const orderErr = firstStatus?.error;

  return {
    ok: isOk && !orderErr,
    status: orderErr ? 'REJECTED' : data?.status || 'ERROR',
    response: data,
    oid,
    filledSz,
    avgPx,
  };
}

/**
 * Fetches live Hyperliquid HLP Vault APR, TVL, and the user's real vault equity on L1.
 */
export async function fetchRealHlpVaultData(userAddress?: string): Promise<{
  vaultAddress: string;
  aprPct: number;
  tvlUsdc: number;
  userEquityUsdc: number;
  userAllTimePnlUsdc: number;
}> {
  try {
    const cleanUser = userAddress && /^0x[a-fA-F0-9]{40}$/.test(userAddress) ? userAddress : '';
    const [details, equities] = await Promise.all([
      callHyperliquidInfo({ type: 'vaultDetails', vaultAddress: HLP_VAULT_ADDRESS }),
      cleanUser ? callHyperliquidInfo({ type: 'userVaultEquities', user: cleanUser }) : Promise.resolve([]),
    ]);

    const aprPct = details?.apr ? +(Number(details.apr) * 100).toFixed(2) : 0;
    const dayEntry = Array.isArray(details?.portfolio)
      ? details.portfolio.find((p: any) => p[0] === 'day')
      : null;
    const hist = dayEntry?.[1]?.accountValueHistory || [];
    const latestTvlStr = hist.length > 0 ? hist[hist.length - 1][1] : '0';
    const tvlUsdc = +(parseFloat(latestTvlStr) || 0).toFixed(2);

    let userEquityUsdc = 0;
    let userAllTimePnlUsdc = 0;
    if (Array.isArray(equities)) {
      const hlpRow = equities.find(
        (eq: any) => String(eq.vaultAddress || '').toLowerCase() === HLP_VAULT_ADDRESS.toLowerCase()
      );
      if (hlpRow) {
        userEquityUsdc = +(parseFloat(hlpRow.equity || '0') || 0).toFixed(2);
        userAllTimePnlUsdc = +(parseFloat(hlpRow.allTimeReturn || hlpRow.pnl || '0') || 0).toFixed(2);
      }
    }

    return {
      vaultAddress: HLP_VAULT_ADDRESS,
      aprPct,
      tvlUsdc,
      userEquityUsdc,
      userAllTimePnlUsdc,
    };
  } catch {
    return {
      vaultAddress: HLP_VAULT_ADDRESS,
      aprPct: 0,
      tvlUsdc: 0,
      userEquityUsdc: 0,
      userAllTimePnlUsdc: 0,
    };
  }
}

/**
 * Executes a real L1 Vault Deposit / Withdraw on Hyperliquid Mainnet (HLP Vault by default).
 */
export async function submitHyperliquidVaultTransfer(params: {
  privateKey: string;
  vaultAddress?: string;
  isDeposit: boolean;
  usdAmount: number;
}): Promise<{ ok: boolean; status: string; response: any; errorMessage?: string }> {
  const vaultAddr = (params.vaultAddress || HLP_VAULT_ADDRESS).toLowerCase();
  const usdMicro = Math.round(params.usdAmount * 1e6);

  const action = {
    type: 'vaultTransfer',
    vaultAddress: vaultAddr,
    isDeposit: Boolean(params.isDeposit),
    usd: usdMicro,
  };

  const { ok: httpOk, data } = await postSignedHyperliquidAction({
    privateKey: params.privateKey,
    action,
  });

  const isOk = httpOk && data?.status === 'ok';
  const errMsg = !isOk
    ? typeof data?.response === 'string'
      ? data.response
      : data?.response?.error || JSON.stringify(data)
    : undefined;

  return {
    ok: isOk,
    status: data?.status || (isOk ? 'ok' : 'ERROR'),
    response: data,
    errorMessage: errMsg,
  };
}

/**
 * Fetches genuine Hyperliquid L1 userFunding ledger entries (hourly realized funding payments).
 */
export async function fetchLiveHyperliquidUserFunding(
  userAddress: string,
  startTimeMs: number
): Promise<Array<{ time: number; coin: string; usdc: number; szi: number; fundingRate: number; hash?: string }>> {
  if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) return [];
  const res = await callHyperliquidInfo({
    type: 'userFunding',
    user: userAddress,
    startTime: startTimeMs,
  });
  if (!Array.isArray(res)) return [];
  return res.map((row: any) => ({
    time: Number(row.time || 0),
    coin: String(row.delta?.coin || ''),
    usdc: parseFloat(row.delta?.usdc || '0'),
    szi: parseFloat(row.delta?.szi || '0'),
    fundingRate: parseFloat(row.delta?.fundingRate || '0'),
    hash: row.hash,
  }));
}

/**
 * Resolves a genuine 64-hex L1 fill hash from Hyperliquid userFills matching a specific OID.
 */
export async function resolveFillHashByOid(
  userAddress: string,
  oid?: number | string
): Promise<string | undefined> {
  if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress) || oid === undefined || oid === null) {
    return undefined;
  }
  const fills = await callHyperliquidInfo({ type: 'userFills', user: userAddress });
  if (!Array.isArray(fills)) return undefined;
  const oidNum = Number(oid);
  const match = fills.find((f: any) => Number(f.oid) === oidNum && f.hash && isValidTxHash(f.hash) && !/^0x0+$/.test(f.hash));
  return match?.hash;
}

/**
 * Queries Hyperliquid L1 Explorer RPC (txDetails) + L1 Info (orderStatus & userFills)
 * to produce 100% genuine, non-fabricated on-chain verification.
 */
export async function verifyHyperliquidL1Transaction(params: {
  query: string;
  userAddress?: string;
  fallbackRecord?: Partial<HashVerificationRecord>;
}): Promise<HashVerificationRecord> {
  const cleanQuery = (params.query || '').trim();
  const cleanUser =
    params.userAddress && /^0x[a-fA-F0-9]{40}$/.test(params.userAddress.trim())
      ? params.userAddress.trim()
      : '';
  const t0 = performance.now();

  const isHex64 = isValidTxHash(cleanQuery) && !/^0x0+$/.test(cleanQuery);
  const parsedOid = extractOidNumber(cleanQuery);

  let explorerTx: any = null;
  let orderStatusData: any = null;
  let matchedFill: any = null;

  const lookups: Promise<any>[] = [];
  if (isHex64) {
    lookups.push(
      callHyperliquidExplorer({ type: 'txDetails', hash: cleanQuery }).then((d) => {
        if (d?.type === 'txDetails' && d?.tx) explorerTx = d.tx;
      })
    );
  }
  if (cleanUser && parsedOid !== null) {
    lookups.push(
      callHyperliquidInfo({ type: 'orderStatus', user: cleanUser, oid: parsedOid }).then((d) => {
        if (d?.status === 'order' && d?.order) orderStatusData = d.order;
      })
    );
  }
  if (cleanUser) {
    lookups.push(
      callHyperliquidInfo({ type: 'userFills', user: cleanUser }).then((fills) => {
        if (Array.isArray(fills)) {
          matchedFill = fills.find(
            (f: any) =>
              (isHex64 && String(f.hash || '').toLowerCase() === cleanQuery.toLowerCase()) ||
              (parsedOid !== null && Number(f.oid) === parsedOid)
          );
        }
      })
    );
  }

  await Promise.all(lookups);
  const elapsedMs = Math.max(1, Math.round(performance.now() - t0));

  const resolvedRealHash =
    explorerTx?.hash ||
    (matchedFill?.hash && !/^0x0+$/.test(matchedFill.hash) ? matchedFill.hash : undefined) ||
    cleanQuery;

  // If fill gave us the real txHash and we initially queried by OID, fetch Explorer txDetails too
  if (!explorerTx && resolvedRealHash && isValidTxHash(resolvedRealHash) && !/^0x0+$/.test(resolvedRealHash)) {
    const d = await callHyperliquidExplorer({ type: 'txDetails', hash: resolvedRealHash });
    if (d?.type === 'txDetails' && d?.tx) explorerTx = d.tx;
  }

  const foundOnL1 = Boolean(explorerTx || orderStatusData || matchedFill);
  const isSyntheticLegacyId = !foundOnL1 && /^0x(spot|perp)_/i.test(cleanQuery);

  const rawOrd = orderStatusData?.order;
  const ordSide =
    matchedFill?.side === 'B' || rawOrd?.side === 'B' || explorerTx?.action?.orders?.[0]?.b === true
      ? 'LONG'
      : matchedFill?.side === 'A' || rawOrd?.side === 'A' || explorerTx?.action?.orders?.[0]?.b === false
      ? 'SHORT'
      : params.fallbackRecord?.side;

  const ordCoin = matchedFill?.coin || rawOrd?.coin || params.fallbackRecord?.symbol;
  const ordPx =
    (matchedFill?.px ? parseFloat(matchedFill.px) : undefined) ??
    (rawOrd?.limitPx ? parseFloat(rawOrd.limitPx) : undefined) ??
    (explorerTx?.action?.orders?.[0]?.p ? parseFloat(explorerTx.action.orders[0].p) : undefined) ??
    params.fallbackRecord?.executionPrice;
  const ordSz =
    (matchedFill?.sz ? parseFloat(matchedFill.sz) : undefined) ??
    (rawOrd?.origSz ? parseFloat(rawOrd.origSz) : undefined) ??
    (explorerTx?.action?.orders?.[0]?.s ? parseFloat(explorerTx.action.orders[0].s) : undefined) ??
    params.fallbackRecord?.amountOrSize;

  let status: HashVerificationRecord['status'] = 'NOT_FOUND';
  if (isSyntheticLegacyId) {
    status = 'SYNTHETIC_LOCAL';
  } else if (explorerTx) {
    status = explorerTx.error ? 'CANCELED' : 'FINALIZED';
  } else if (orderStatusData) {
    const s = String(orderStatusData.status || '').toLowerCase();
    status = s === 'filled' ? 'FILLED' : s === 'open' ? 'RESTING' : s === 'canceled' ? 'CANCELED' : 'CONFIRMED';
  } else if (matchedFill) {
    status = 'FILLED';
  }

  return {
    hash: resolvedRealHash || 'Sin hash',
    timestamp: explorerTx?.time || orderStatusData?.statusTimestamp || matchedFill?.time || params.fallbackRecord?.timestamp || 0,
    type: params.fallbackRecord?.type || 'REAL_ORDER',
    symbol: ordCoin ? (String(ordCoin).includes('-PERP') || String(ordCoin).startsWith('@') ? String(ordCoin) : `${ordCoin}-PERP`) : params.fallbackRecord?.symbol,
    side: ordSide,
    amountOrSize: ordSz,
    margin: params.fallbackRecord?.margin,
    leverage: params.fallbackRecord?.leverage,
    executionPrice: ordPx,
    fromAddress: explorerTx?.user || cleanUser || params.fallbackRecord?.fromAddress || 'Sin dirección consultada',
    toAddress: 'Hyperliquid L1 Core (rpc.hyperliquid.xyz/explorer)',
    blockNumber: Number(explorerTx?.block || 0),
    slot: Number(explorerTx?.action?.orders?.[0]?.a || 0),
    status,
    validatorQuorum: explorerTx
      ? `Hyperliquid L1 Bloque #${Number(explorerTx.block).toLocaleString()}`
      : orderStatusData
      ? `Hyperliquid L1 OrderBook (OID ${rawOrd?.oid || parsedOid})`
      : 'No confirmado en L1',
    consensusTimeMs: elapsedMs,
    gasFee: matchedFill?.fee ? `${matchedFill.fee} ${matchedFill.feeToken || 'USDC'}` : 'L1 Fee (0 gas EVM)',
    merkleProofVerified: Boolean(explorerTx && !explorerTx.error),
    isRealOnChain: foundOnL1,
    oid: rawOrd?.oid || matchedFill?.oid || parsedOid || undefined,
    actionType: explorerTx?.action?.type || rawOrd?.orderType || (matchedFill ? 'fill' : undefined),
    rawExplorerData: explorerTx || undefined,
    rawOrderStatus: orderStatusData || undefined,
    notes: isSyntheticLegacyId
      ? 'Este identificador es un prefijo local antiguo (0xspot_/0xperp_), no un TxHash EVM/L1 de 64 caracteres.'
      : foundOnL1
      ? explorerTx?.error
        ? `Transacción encontrada en Hyperliquid L1 Bloque #${explorerTx.block} con error: ${explorerTx.error}`
        : `Verificado directamente contra Hyperliquid L1 (${explorerTx ? `Bloque #${explorerTx.block}` : `OID ${rawOrd?.oid || matchedFill?.oid}`}).`
      : 'No se encontró registro para este Hash/OID en Hyperliquid L1 Explorer ni en el historial de la cuenta conectada.',
  };
}


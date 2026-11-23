import QRCode from 'qrcode';
import { privateKeyToAccount } from 'viem/accounts';

const BIP39_WORDS = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse',
  'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act',
  'action', 'actor', 'actress', 'actual', 'adapt', 'add', 'addict', 'address', 'adjust', 'admit',
  'adult', 'advance', 'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol', 'alert',
  'alien', 'all', 'alley', 'allow', 'almost', 'alone', 'alpha', 'already', 'also', 'alter',
  'always', 'amateur', 'amazing', 'among', 'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger',
  'angle', 'angry', 'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april', 'arch', 'arctic',
  'area', 'arena', 'argue', 'arm', 'armed', 'armor', 'army', 'around', 'arrange', 'arrest',
  'arrive', 'arrow', 'art', 'artefact', 'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset',
  'assist', 'assume', 'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado', 'avoid', 'awake',
  'aware', 'away', 'awesome', 'awful', 'awkward', 'axis', 'baby', 'bachelor', 'bacon', 'badge',
  'bag', 'balance', 'balcony', 'ball', 'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain',
  'barrel', 'base', 'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
  'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt', 'bench', 'benefit',
  'best', 'betray', 'better', 'between', 'beyond', 'bicycle', 'bid', 'bike', 'bind', 'biology',
  'bird', 'birth', 'bitter', 'black', 'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless',
  'blind', 'blood', 'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
  'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring', 'borrow', 'boss',
  'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain', 'brand', 'brass', 'brave', 'bread',
  'breeze', 'brick', 'bridge', 'brief', 'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze',
  'broom', 'brother', 'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
  'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus', 'business', 'busy',
  'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable', 'cactus', 'cage', 'cake', 'call',
  'calm', 'camera', 'camp', 'can', 'canal', 'cancel', 'candy', 'cannon', 'canoe', 'canvas',
  'canyon', 'capable', 'capital', 'captain', 'car', 'carbon', 'card', 'cargo', 'carpet', 'carry',
  'cart', 'case', 'cash', 'casino', 'castle', 'casual', 'cat', 'catalog', 'catch', 'category',
  'cattle', 'caught', 'cause', 'caution', 'cave', 'ceiling', 'celery', 'cement', 'census', 'century',
  'cereal', 'certain', 'chair', 'chalk', 'champion', 'change', 'chaos', 'chapter', 'charge', 'chase',
  'chat', 'cheap', 'check', 'cheese', 'chef', 'cherry', 'chest', 'chicken', 'chief', 'child',
  'chimney', 'choice', 'choose', 'chronic', 'chuckle', 'chunk', 'churn', 'cigar', 'cinnamon', 'circle',
  'citizen', 'city', 'civil', 'claim', 'clap', 'clarify', 'claw', 'clay', 'clean', 'clerk',
  'clever', 'click', 'client', 'cliff', 'climb', 'clinic', 'clip', 'clock', 'clog', 'close',
  'cloth', 'cloud', 'clown', 'club', 'clump', 'cluster', 'clutch', 'coach', 'coast', 'coconut',
  'code', 'coffee', 'coil', 'coin', 'collect', 'color', 'column', 'combine', 'come', 'comfort',
  'comic', 'common', 'company', 'concert', 'conduct', 'confirm', 'congress', 'connect', 'consider', 'control',
  'convince', 'cook', 'cool', 'copper', 'copy', 'coral', 'core', 'corn', 'correct', 'cost',
  'cotton', 'couch', 'country', 'couple', 'course', 'cousin', 'cover', 'coyote', 'crack', 'cradle',
  'craft', 'cram', 'crane', 'crash', 'crater', 'crawl', 'crazy', 'cream', 'credit', 'creek',
  'crew', 'cricket', 'crime', 'crisp', 'critic', 'crop', 'cross', 'crouch', 'crowd', 'crucial',
  'cruel', 'cruise', 'crumble', 'crunch', 'crush', 'cry', 'crystal', 'cube', 'culture', 'cup'
];

function getRandomHex(bytesLength: number): string {
  const array = new Uint8Array(bytesLength);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < bytesLength; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateSeedPhrase(): string {
  const words: string[] = [];
  const indices = new Uint16Array(12);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(indices);
  }
  for (let i = 0; i < 12; i++) {
    const idx = (indices[i] || 0) % BIP39_WORDS.length;
    words.push(BIP39_WORDS[idx]);
  }
  return words.join(' ');
}

/**
 * Derive real cryptographic EVM / Hyperliquid address from hex private key via viem
 */
export function generateAddressFromPrivateKey(privateKey: string): string {
  let cleanKey = privateKey.trim();
  if (!cleanKey.startsWith('0x')) {
    cleanKey = `0x${cleanKey}`;
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(cleanKey)) {
    throw new Error('Clave privada inválida: debe contener 64 caracteres hexadecimales (0x...).');
  }
  const account = privateKeyToAccount(cleanKey as `0x${string}`);
  return account.address;
}

/**
 * Create a brand new cryptographic wallet (zero balances until funded on-chain)
 */
export function createNewWallet() {
  const seedPhrase = generateSeedPhrase();
  const privateKey = `0x${getRandomHex(32)}`;
  const address = generateAddressFromPrivateKey(privateKey);

  return {
    address,
    privateKey,
    seedPhrase,
    balances: {
      USDC: 0,
      ETH: 0,
      HYPE: 0,
      ARB: 0,
    },
  };
}

/**
 * Deterministic private key derivation from seed phrase (zero fake balances; synced live from RPC/L1)
 */
export function importFromSeedPhrase(seedPhrase: string) {
  const cleanSeed = seedPhrase.trim().toLowerCase();
  const words = cleanSeed.split(/\s+/);
  if (words.length < 12) {
    throw new Error('La frase semilla debe contener al menos 12 palabras.');
  }

  let acc = 0n;
  for (let i = 0; i < cleanSeed.length; i++) {
    acc = (acc * 131n + BigInt(cleanSeed.charCodeAt(i))) % ((1n << 256n) - 1n);
  }
  if (acc === 0n) acc = 1n;
  const privateKey = `0x${acc.toString(16).padStart(64, '0')}`;
  const address = generateAddressFromPrivateKey(privateKey);

  return {
    address,
    privateKey,
    seedPhrase: cleanSeed,
    balances: {
      USDC: 0,
      ETH: 0,
      HYPE: 0,
      ARB: 0,
    },
  };
}

/**
 * Import wallet or Hyperliquid API wallet from 64-char hex private key
 */
export function importFromPrivateKey(keyInput: string) {
  let cleanKey = keyInput.trim();
  if (!cleanKey.startsWith('0x')) {
    cleanKey = `0x${cleanKey}`;
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(cleanKey)) {
    throw new Error('La clave privada debe tener exactamente 64 caracteres hexadecimales (con prefijo 0x).');
  }

  const address = generateAddressFromPrivateKey(cleanKey);
  return {
    address,
    privateKey: cleanKey,
    seedPhrase: '(Importada directamente mediante clave privada)',
    balances: {
      USDC: 0,
      ETH: 0,
      HYPE: 0,
      ARB: 0,
    },
  };
}

export async function generateQrDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: 260,
      margin: 2,
      color: {
        dark: '#00f2fe',
        light: '#090d16',
      },
    });
  } catch (err) {
    console.error('Error generating QR code:', err);
    return '';
  }
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

export function isValidPrivateKey(key: string): boolean {
  const clean = key.trim().startsWith('0x') ? key.trim() : `0x${key.trim()}`;
  return /^0x[a-fA-F0-9]{64}$/.test(clean);
}

export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash.trim());
}

export function isNumericOid(value: string): boolean {
  const clean = value.trim();
  return /^\d+$/.test(clean) || /^0x(spot_|perp_)?\d+$/i.test(clean);
}

export function extractOidNumber(value: string): number | null {
  const clean = value.trim();
  const m = clean.match(/^(?:0x(?:spot_|perp_)?)?(\d+)$/i);
  return m ? Number(m[1]) : null;
}

export const HYPERLIQUID_API_WALLET = {
  address: '0x87ef24cF0bB41Ed4B2C158e326bBE65CE5491DbA',
  privateKey: '0x6dcd2d11df86d3e7450161a108217e2d66516aedd83b5160a65aaef399502291',
  seedPhrase: 'Hyperliquid Perps API Agent Signer (Sin frase semilla)',
  isConnected: true,
  type: 'HYPERLIQUID_API_WALLET' as const,
  balances: {
    USDC: 0,
    ETH: 0,
    HYPE: 0,
    ARB: 0,
  },
  masterAddress: '',
  apiWalletAddress: '0x87ef24cF0bB41Ed4B2C158e326bBE65CE5491DbA',
  apiWalletKey: '0x6dcd2d11df86d3e7450161a108217e2d66516aedd83b5160a65aaef399502291',
  apiWalletName: 'TonyMontana-AI-Perps',
  hyperliquidAccountValue: 0,
  hyperliquidWithdrawable: 0,
  hyperliquidMarginUsed: 0,
  hyperliquidUserRole: 'checking',
  isAgentAuthorized: false,
  arbitrumUsdc: 0,
};

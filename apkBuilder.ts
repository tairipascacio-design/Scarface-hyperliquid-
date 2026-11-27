import crypto from 'crypto';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { build as viteBuild } from 'vite';
import { transformSync as esbuildTransformSync } from 'esbuild';

// ============================================================================
// CRC-32 & Adler-32 Helpers
// ============================================================================
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf: Buffer): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function writeUleb128(val: number): Buffer {
  const bytes: number[] = [];
  let v = val >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function padTo4(buf: Buffer): Buffer {
  const rem = buf.length % 4;
  if (rem === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(4 - rem, 0)]);
}

function buildUtf16StringPoolChunk(strings: string[]): Buffer {
  const offsets: number[] = [];
  const dataChunks: Buffer[] = [];
  let cursor = 0;

  for (const s of strings) {
    offsets.push(cursor);
    const charLen = s.length;
    const strBuf = Buffer.alloc(2 + charLen * 2 + 2);
    strBuf.writeUInt16LE(charLen, 0);
    for (let i = 0; i < charLen; i++) {
      strBuf.writeUInt16LE(s.charCodeAt(i), 2 + i * 2);
    }
    strBuf.writeUInt16LE(0, 2 + charLen * 2);
    dataChunks.push(strBuf);
    cursor += strBuf.length;
  }

  const rawStrings = padTo4(Buffer.concat(dataChunks));
  const headerSize = 28;
  const stringsStart = headerSize + strings.length * 4;
  const totalSize = stringsStart + rawStrings.length;

  const out = Buffer.alloc(totalSize);
  out.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
  out.writeUInt16LE(headerSize, 2);
  out.writeUInt32LE(totalSize, 4);
  out.writeUInt32LE(strings.length, 8); // stringCount
  out.writeUInt32LE(0, 12); // styleCount
  out.writeUInt32LE(0, 16); // flags (UTF-16LE)
  out.writeUInt32LE(stringsStart, 20);
  out.writeUInt32LE(0, 24); // stylesStart

  for (let i = 0; i < offsets.length; i++) {
    out.writeUInt32LE(offsets[i], 28 + i * 4);
  }
  rawStrings.copy(out, stringsStart);
  return out;
}

// ============================================================================
// 1. Compiled Binary AndroidManifest.xml (AXML)
// ============================================================================
interface AxmlAttr {
  androidNs: boolean;
  name: string;
  dataType: number; // 0x03 string, 0x10 int_dec, 0x12 boolean, 0x01 reference
  valueStr?: string;
  valueInt?: number;
}

interface AxmlNode {
  tag: string;
  line: number;
  attrs: AxmlAttr[];
  children: AxmlNode[];
}

export const APK_VERSION = '2.6.0-PRO';
export const APK_VERSION_CODE = 20600;
export const APK_FILENAME = 'HyperLiquid-Pro-L1-v2.6.apk';

export function buildBinaryAndroidManifest(): Buffer {
  // Resource attributes mapped 1:1 at the start of the string pool
  const frameworkAttrs: Array<[string, number]> = [
    ['theme', 0x01010000],
    ['label', 0x01010001],
    ['name', 0x01010003],
    ['exported', 0x01010010],
    ['scheme', 0x01010027],
    ['minSdkVersion', 0x0101020c],
    ['versionCode', 0x0101021b],
    ['versionName', 0x0101021c],
    ['targetSdkVersion', 0x01010270],
    ['hardwareAccelerated', 0x010102d3],
    ['usesCleartextTraffic', 0x010104ec],
  ];

  const root: AxmlNode = {
    tag: 'manifest',
    line: 2,
    attrs: [
      { androidNs: false, name: 'package', dataType: 0x03, valueStr: 'com.hyperliquid.scarface.l1' },
      { androidNs: true, name: 'versionCode', dataType: 0x10, valueInt: APK_VERSION_CODE },
      { androidNs: true, name: 'versionName', dataType: 0x03, valueStr: APK_VERSION },
    ],
    children: [
      {
        tag: 'uses-sdk',
        line: 7,
        attrs: [
          { androidNs: true, name: 'minSdkVersion', dataType: 0x10, valueInt: 26 },
          { androidNs: true, name: 'targetSdkVersion', dataType: 0x10, valueInt: 34 },
        ],
        children: [],
      },
      {
        tag: 'uses-permission',
        line: 10,
        attrs: [{ androidNs: true, name: 'name', dataType: 0x03, valueStr: 'android.permission.INTERNET' }],
        children: [],
      },
      {
        tag: 'uses-permission',
        line: 11,
        attrs: [{ androidNs: true, name: 'name', dataType: 0x03, valueStr: 'android.permission.ACCESS_NETWORK_STATE' }],
        children: [],
      },
      {
        tag: 'uses-permission',
        line: 12,
        attrs: [{ androidNs: true, name: 'name', dataType: 0x03, valueStr: 'android.permission.VIBRATE' }],
        children: [],
      },
      {
        tag: 'uses-permission',
        line: 13,
        attrs: [{ androidNs: true, name: 'name', dataType: 0x03, valueStr: 'android.permission.WAKE_LOCK' }],
        children: [],
      },
      {
        tag: 'queries',
        line: 14,
        attrs: [],
        children: [
          {
            tag: 'intent',
            line: 14,
            attrs: [],
            children: [
              {
                tag: 'action',
                line: 14,
                attrs: [{ androidNs: true, name: 'name', dataType: 0x03, valueStr: 'android.intent.action.TTS_SERVICE' }],
                children: [],
              },
            ],
          },
        ],
      },
      {
        tag: 'application',
        line: 15,
        attrs: [
          { androidNs: true, name: 'label', dataType: 0x03, valueStr: 'HyperLiquid Pro L1' },
          { androidNs: true, name: 'hardwareAccelerated', dataType: 0x12, valueInt: 0xffffffff },
          { androidNs: true, name: 'usesCleartextTraffic', dataType: 0x12, valueInt: 0xffffffff },
          { androidNs: true, name: 'theme', dataType: 0x01, valueInt: 0x01030007 },
        ],
        children: [
          {
            tag: 'activity',
            line: 20,
            attrs: [
              { androidNs: true, name: 'name', dataType: 0x03, valueStr: 'com.hyperliquid.scarface.l1.MainActivity' },
              { androidNs: true, name: 'label', dataType: 0x03, valueStr: 'HyperLiquid Pro L1' },
              { androidNs: true, name: 'exported', dataType: 0x12, valueInt: 0xffffffff },
              { androidNs: true, name: 'theme', dataType: 0x01, valueInt: 0x01030007 },
            ],
            children: [
              {
                tag: 'intent-filter',
                line: 25,
                attrs: [],
                children: [
                  {
                    tag: 'action',
                    line: 26,
                    attrs: [{ androidNs: true, name: 'name', dataType: 0x03, valueStr: 'android.intent.action.MAIN' }],
                    children: [],
                  },
                  {
                    tag: 'category',
                    line: 27,
                    attrs: [{ androidNs: true, name: 'name', dataType: 0x03, valueStr: 'android.intent.category.LAUNCHER' }],
                    children: [],
                  },
                ],
              },
              {
                tag: 'intent-filter',
                line: 29,
                attrs: [],
                children: [
                  {
                    tag: 'action',
                    line: 30,
                    attrs: [{ androidNs: true, name: 'name', dataType: 0x03, valueStr: 'android.intent.action.VIEW' }],
                    children: [],
                  },
                  {
                    tag: 'category',
                    line: 31,
                    attrs: [{ androidNs: true, name: 'name', dataType: 0x03, valueStr: 'android.intent.category.DEFAULT' }],
                    children: [],
                  },
                  {
                    tag: 'category',
                    line: 32,
                    attrs: [{ androidNs: true, name: 'name', dataType: 0x03, valueStr: 'android.intent.category.BROWSABLE' }],
                    children: [],
                  },
                  {
                    tag: 'data',
                    line: 33,
                    attrs: [{ androidNs: true, name: 'scheme', dataType: 0x03, valueStr: 'hyperliquid' }],
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const strings: string[] = [];
  const strMap = new Map<string, number>();
  const intern = (s: string): number => {
    const existing = strMap.get(s);
    if (existing !== undefined) return existing;
    const idx = strings.length;
    strings.push(s);
    strMap.set(s, idx);
    return idx;
  };

  for (const [attrName] of frameworkAttrs) {
    intern(attrName);
  }
  const nsPrefixIdx = intern('android');
  const nsUriIdx = intern('http://schemas.android.com/apk/res/android');

  const collectNodeStrings = (node: AxmlNode) => {
    intern(node.tag);
    for (const a of node.attrs) {
      intern(a.name);
      if (a.dataType === 0x03 && a.valueStr !== undefined) {
        intern(a.valueStr);
      }
    }
    node.children.forEach(collectNodeStrings);
  };
  collectNodeStrings(root);

  const stringPoolChunk = buildUtf16StringPoolChunk(strings);

  const resMapChunk = Buffer.alloc(8 + frameworkAttrs.length * 4);
  resMapChunk.writeUInt16LE(0x0180, 0); // RES_XML_RESOURCE_MAP_TYPE
  resMapChunk.writeUInt16LE(8, 2);
  resMapChunk.writeUInt32LE(resMapChunk.length, 4);
  frameworkAttrs.forEach(([, resId], i) => {
    resMapChunk.writeUInt32LE(resId >>> 0, 8 + i * 4);
  });

  const chunks: Buffer[] = [stringPoolChunk, resMapChunk];

  const startNs = Buffer.alloc(24);
  startNs.writeUInt16LE(0x0100, 0);
  startNs.writeUInt16LE(16, 2);
  startNs.writeUInt32LE(24, 4);
  startNs.writeUInt32LE(1, 8);
  startNs.writeUInt32LE(0xffffffff, 12);
  startNs.writeUInt32LE(nsPrefixIdx, 16);
  startNs.writeUInt32LE(nsUriIdx, 20);
  chunks.push(startNs);

  const emitNode = (node: AxmlNode) => {
    const startSize = 36 + node.attrs.length * 20;
    const startBuf = Buffer.alloc(startSize);
    startBuf.writeUInt16LE(0x0102, 0); // RES_XML_START_ELEMENT_TYPE
    startBuf.writeUInt16LE(16, 2);
    startBuf.writeUInt32LE(startSize, 4);
    startBuf.writeUInt32LE(node.line, 8);
    startBuf.writeUInt32LE(0xffffffff, 12);
    startBuf.writeUInt32LE(0xffffffff, 16); // ns
    startBuf.writeUInt32LE(intern(node.tag), 20);
    startBuf.writeUInt16LE(0x0014, 24); // attributeStart
    startBuf.writeUInt16LE(0x0014, 26); // attributeSize
    startBuf.writeUInt16LE(node.attrs.length, 28);
    startBuf.writeUInt16LE(0, 30);
    startBuf.writeUInt16LE(0, 32);
    startBuf.writeUInt16LE(0, 34);

    node.attrs.forEach((a, i) => {
      const off = 36 + i * 20;
      const valStrIdx = a.dataType === 0x03 && a.valueStr !== undefined ? intern(a.valueStr) : 0xffffffff;
      const valData = a.dataType === 0x03 ? valStrIdx : (a.valueInt ?? 0) >>> 0;

      startBuf.writeUInt32LE(a.androidNs ? nsUriIdx : 0xffffffff, off);
      startBuf.writeUInt32LE(intern(a.name), off + 4);
      startBuf.writeUInt32LE(valStrIdx, off + 8);
      startBuf.writeUInt16LE(8, off + 12);
      startBuf.writeUInt8(0, off + 14);
      startBuf.writeUInt8(a.dataType, off + 15);
      startBuf.writeUInt32LE(valData, off + 16);
    });
    chunks.push(startBuf);

    node.children.forEach(emitNode);

    const endBuf = Buffer.alloc(24);
    endBuf.writeUInt16LE(0x0103, 0); // RES_XML_END_ELEMENT_TYPE
    endBuf.writeUInt16LE(16, 2);
    endBuf.writeUInt32LE(24, 4);
    endBuf.writeUInt32LE(node.line, 8);
    endBuf.writeUInt32LE(0xffffffff, 12);
    endBuf.writeUInt32LE(0xffffffff, 16);
    endBuf.writeUInt32LE(intern(node.tag), 20);
    chunks.push(endBuf);
  };
  emitNode(root);

  const endNs = Buffer.alloc(24);
  endNs.writeUInt16LE(0x0101, 0);
  endNs.writeUInt16LE(16, 2);
  endNs.writeUInt32LE(24, 4);
  endNs.writeUInt32LE(38, 8);
  endNs.writeUInt32LE(0xffffffff, 12);
  endNs.writeUInt32LE(nsPrefixIdx, 16);
  endNs.writeUInt32LE(nsUriIdx, 20);
  chunks.push(endNs);

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
  header.writeUInt16LE(8, 2);
  header.writeUInt32LE(8 + body.length, 4);

  return Buffer.concat([header, body]);
}

// ============================================================================
// 2. Compiled Binary resources.arsc (RES_TABLE_TYPE)
// ============================================================================
export function buildBinaryResourcesArsc(): Buffer {
  const globalPool = buildUtf16StringPoolChunk(['HyperLiquid Pro L1']);
  const typePool = buildUtf16StringPoolChunk(['string']);
  const keyPool = buildUtf16StringPoolChunk(['app_name']);

  // TypeSpec chunk (id = 1, 1 entry)
  const typeSpec = Buffer.alloc(20);
  typeSpec.writeUInt16LE(0x0202, 0); // RES_TABLE_TYPE_SPEC_TYPE
  typeSpec.writeUInt16LE(16, 2);
  typeSpec.writeUInt32LE(20, 4);
  typeSpec.writeUInt8(1, 8); // id
  typeSpec.writeUInt8(0, 9);
  typeSpec.writeUInt16LE(0, 10);
  typeSpec.writeUInt32LE(1, 12); // entryCount
  typeSpec.writeUInt32LE(0, 16); // specFlags[0]

  // Type chunk (id = 1, headerSize = 84 with 64-byte ResTable_config, 1 entry)
  const typeHeaderSize = 84;
  const entriesStart = typeHeaderSize + 4; // 88
  const entrySize = 16; // ResTable_entry (8) + Res_value (8)
  const typeTotalSize = entriesStart + entrySize; // 104
  const typeChunk = Buffer.alloc(typeTotalSize);
  typeChunk.writeUInt16LE(0x0201, 0); // RES_TABLE_TYPE_TYPE
  typeChunk.writeUInt16LE(typeHeaderSize, 2);
  typeChunk.writeUInt32LE(typeTotalSize, 4);
  typeChunk.writeUInt8(1, 8); // id
  typeChunk.writeUInt8(0, 9);
  typeChunk.writeUInt16LE(0, 10);
  typeChunk.writeUInt32LE(1, 12); // entryCount
  typeChunk.writeUInt32LE(entriesStart, 16);
  typeChunk.writeUInt32LE(64, 20); // ResTable_config.size
  // offsets[0] = 0 at offset 84 (already 0)
  // ResTable_entry at offset 88
  typeChunk.writeUInt16LE(8, 88); // size
  typeChunk.writeUInt16LE(0, 90); // flags
  typeChunk.writeUInt32LE(0, 92); // key = "app_name" (idx 0)
  // Res_value at offset 96
  typeChunk.writeUInt16LE(8, 96); // size
  typeChunk.writeUInt8(0, 98); // res0
  typeChunk.writeUInt8(0x03, 99); // TYPE_STRING
  typeChunk.writeUInt32LE(0, 100); // globalPool[0] = "HyperLiquid Pro L1"

  const pkgHeaderSize = 288;
  const typeStringsOffset = pkgHeaderSize;
  const keyStringsOffset = typeStringsOffset + typePool.length;
  const pkgBody = Buffer.concat([typePool, keyPool, typeSpec, typeChunk]);
  const pkgTotalSize = pkgHeaderSize + pkgBody.length;

  const pkgHeader = Buffer.alloc(pkgHeaderSize);
  pkgHeader.writeUInt16LE(0x0200, 0); // RES_TABLE_PACKAGE_TYPE
  pkgHeader.writeUInt16LE(pkgHeaderSize, 2);
  pkgHeader.writeUInt32LE(pkgTotalSize, 4);
  pkgHeader.writeUInt32LE(0x0000007f, 8); // package id
  const pkgName = 'com.hyperliquid.scarface.l1';
  for (let i = 0; i < pkgName.length; i++) {
    pkgHeader.writeUInt16LE(pkgName.charCodeAt(i), 12 + i * 2);
  }
  pkgHeader.writeUInt32LE(typeStringsOffset, 268);
  pkgHeader.writeUInt32LE(1, 272); // lastPublicType
  pkgHeader.writeUInt32LE(keyStringsOffset, 276);
  pkgHeader.writeUInt32LE(1, 280); // lastPublicKey
  pkgHeader.writeUInt32LE(0, 284); // typeIdOffset

  const pkgChunk = Buffer.concat([pkgHeader, pkgBody]);
  const tableTotalSize = 12 + globalPool.length + pkgChunk.length;
  const tableHeader = Buffer.alloc(12);
  tableHeader.writeUInt16LE(0x0002, 0); // RES_TABLE_TYPE
  tableHeader.writeUInt16LE(12, 2);
  tableHeader.writeUInt32LE(tableTotalSize, 4);
  tableHeader.writeUInt32LE(1, 8); // packageCount

  return Buffer.concat([tableHeader, globalPool, pkgChunk]);
}

// ============================================================================
// 3. Valid Dalvik classes.dex (DEX 035) with Full-Screen WebView MainActivity
// ============================================================================
export function buildCompiledClassesDex(appUrl: string): Buffer {
  const stringSet = new Set<string>([
    'I',
    'V',
    'Z',
    'Landroid/app/Activity;',
    'Landroid/content/Context;',
    'Landroid/os/Bundle;',
    'Landroid/speech/tts/TextToSpeech$OnInitListener;',
    'Landroid/speech/tts/TextToSpeech;',
    'Landroid/view/View;',
    'Landroid/webkit/JsPromptResult;',
    'Landroid/webkit/WebChromeClient;',
    'Landroid/webkit/WebSettings;',
    'Landroid/webkit/WebView;',
    'Landroid/webkit/WebViewClient;',
    'Lcom/hyperliquid/scarface/l1/BridgeChromeClient;',
    'Lcom/hyperliquid/scarface/l1/MainActivity;',
    'Ljava/lang/CharSequence;',
    'Ljava/lang/Object;',
    'Ljava/lang/String;',
    'Ljava/util/Locale;',
    'BridgeChromeClient.java',
    'MainActivity.java',
    '<init>',
    'confirm',
    'equals',
    'getSettings',
    'loadUrl',
    'onCreate',
    'onDestroy',
    'onInit',
    'onJsPrompt',
    'owner',
    'pendingSpeech',
    'setAllowFileAccess',
    'setAllowFileAccessFromFileURLs',
    'setAllowUniversalAccessFromFileURLs',
    'setContentView',
    'setDatabaseEnabled',
    'setDomStorageEnabled',
    'setJavaScriptEnabled',
    'setLanguage',
    'setMediaPlaybackRequiresUserGesture',
    'setWebChromeClient',
    'setWebViewClient',
    'shutdown',
    'speak',
    'speakNative',
    'stop',
    'stopNative',
    'tts',
    'ttsReady',
    'es',
    'MX',
    'hl',
    'OK',
    '__HL_TTS_SPEAK__',
    '__HL_TTS_STOP__',
    appUrl,
  ]);

  const typeStrings = [
    'I',
    'V',
    'Z',
    'Landroid/app/Activity;',
    'Landroid/content/Context;',
    'Landroid/os/Bundle;',
    'Landroid/speech/tts/TextToSpeech$OnInitListener;',
    'Landroid/speech/tts/TextToSpeech;',
    'Landroid/view/View;',
    'Landroid/webkit/JsPromptResult;',
    'Landroid/webkit/WebChromeClient;',
    'Landroid/webkit/WebSettings;',
    'Landroid/webkit/WebView;',
    'Landroid/webkit/WebViewClient;',
    'Lcom/hyperliquid/scarface/l1/BridgeChromeClient;',
    'Lcom/hyperliquid/scarface/l1/MainActivity;',
    'Ljava/lang/CharSequence;',
    'Ljava/lang/Object;',
    'Ljava/lang/String;',
    'Ljava/util/Locale;',
  ];

  interface ProtoDef {
    ret: string;
    params: string[];
    shorty: string;
  }
  const shortChar = (t: string) => (t.length === 1 ? t : 'L');
  const makeProto = (ret: string, params: string[]): ProtoDef => ({
    ret,
    params,
    shorty: shortChar(ret) + params.map(shortChar).join(''),
  });
  const rawProtos: ProtoDef[] = [
    makeProto('V', []),
    makeProto('V', ['I']),
    makeProto('V', ['Z']),
    makeProto('V', ['Landroid/content/Context;']),
    makeProto('V', ['Landroid/content/Context;', 'Landroid/speech/tts/TextToSpeech$OnInitListener;']),
    makeProto('V', ['Landroid/os/Bundle;']),
    makeProto('V', ['Landroid/view/View;']),
    makeProto('V', ['Landroid/webkit/WebChromeClient;']),
    makeProto('V', ['Landroid/webkit/WebViewClient;']),
    makeProto('V', ['Lcom/hyperliquid/scarface/l1/MainActivity;']),
    makeProto('V', ['Ljava/lang/String;']),
    makeProto('V', ['Ljava/lang/String;', 'Ljava/lang/String;']),
    makeProto('I', []),
    makeProto('I', ['Ljava/util/Locale;']),
    makeProto('I', ['Ljava/lang/CharSequence;', 'I', 'Landroid/os/Bundle;', 'Ljava/lang/String;']),
    makeProto('Z', ['Ljava/lang/Object;']),
    makeProto('Z', [
      'Landroid/webkit/WebView;',
      'Ljava/lang/String;',
      'Ljava/lang/String;',
      'Ljava/lang/String;',
      'Landroid/webkit/JsPromptResult;',
    ]),
    makeProto('Landroid/webkit/WebSettings;', []),
  ];
  for (const p of rawProtos) {
    stringSet.add(p.shorty);
  }

  const finalStrings = Array.from(stringSet).sort((a, b) =>
    Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  );
  const strId = (s: string): number => {
    const idx = finalStrings.indexOf(s);
    if (idx < 0) throw new Error(`Missing DEX string: ${s}`);
    return idx;
  };

  const sortedTypes = [...typeStrings].sort((a, b) => strId(a) - strId(b));
  const typeId = (t: string): number => {
    const idx = sortedTypes.indexOf(t);
    if (idx < 0) throw new Error(`Missing DEX type: ${t}`);
    return idx;
  };

  const compareProtos = (a: ProtoDef, b: ProtoDef): number => {
    const r = typeId(a.ret) - typeId(b.ret);
    if (r !== 0) return r;
    const minLen = Math.min(a.params.length, b.params.length);
    for (let i = 0; i < minLen; i++) {
      const d = typeId(a.params[i]) - typeId(b.params[i]);
      if (d !== 0) return d;
    }
    return a.params.length - b.params.length;
  };
  const sortedProtos = [...rawProtos].sort(compareProtos);
  const protoId = (ret: string, params: string[]): number => {
    const idx = sortedProtos.findIndex(
      (p) => p.ret === ret && p.params.length === params.length && p.params.every((x, i) => x === params[i])
    );
    if (idx < 0) throw new Error(`Missing DEX proto: (${params.join(',')})${ret}`);
    return idx;
  };

  interface FieldDef {
    cls: string;
    type: string;
    name: string;
  }
  const rawFields: FieldDef[] = [
    {
      cls: 'Lcom/hyperliquid/scarface/l1/MainActivity;',
      type: 'Landroid/speech/tts/TextToSpeech;',
      name: 'tts',
    },
    {
      cls: 'Lcom/hyperliquid/scarface/l1/MainActivity;',
      type: 'Z',
      name: 'ttsReady',
    },
    {
      cls: 'Lcom/hyperliquid/scarface/l1/MainActivity;',
      type: 'Ljava/lang/String;',
      name: 'pendingSpeech',
    },
    {
      cls: 'Lcom/hyperliquid/scarface/l1/BridgeChromeClient;',
      type: 'Lcom/hyperliquid/scarface/l1/MainActivity;',
      name: 'owner',
    },
  ];
  const sortedFields = [...rawFields].sort((a, b) => {
    const dc = typeId(a.cls) - typeId(b.cls);
    if (dc !== 0) return dc;
    const dn = strId(a.name) - strId(b.name);
    if (dn !== 0) return dn;
    return typeId(a.type) - typeId(b.type);
  });
  const fieldId = (cls: string, name: string, type: string): number => {
    const idx = sortedFields.findIndex((f) => f.cls === cls && f.name === name && f.type === type);
    if (idx < 0) throw new Error(`Missing DEX field: ${cls}.${name}:${type}`);
    return idx;
  };

  interface MethodDef {
    cls: string;
    name: string;
    ret: string;
    params: string[];
  }
  const rawMethods: MethodDef[] = [
    { cls: 'Landroid/app/Activity;', name: '<init>', ret: 'V', params: [] },
    { cls: 'Landroid/app/Activity;', name: 'onCreate', ret: 'V', params: ['Landroid/os/Bundle;'] },
    { cls: 'Landroid/app/Activity;', name: 'onDestroy', ret: 'V', params: [] },
    { cls: 'Landroid/app/Activity;', name: 'setContentView', ret: 'V', params: ['Landroid/view/View;'] },
    {
      cls: 'Landroid/speech/tts/TextToSpeech;',
      name: '<init>',
      ret: 'V',
      params: ['Landroid/content/Context;', 'Landroid/speech/tts/TextToSpeech$OnInitListener;'],
    },
    { cls: 'Landroid/speech/tts/TextToSpeech;', name: 'setLanguage', ret: 'I', params: ['Ljava/util/Locale;'] },
    { cls: 'Landroid/speech/tts/TextToSpeech;', name: 'shutdown', ret: 'V', params: [] },
    {
      cls: 'Landroid/speech/tts/TextToSpeech;',
      name: 'speak',
      ret: 'I',
      params: ['Ljava/lang/CharSequence;', 'I', 'Landroid/os/Bundle;', 'Ljava/lang/String;'],
    },
    { cls: 'Landroid/speech/tts/TextToSpeech;', name: 'stop', ret: 'I', params: [] },
    { cls: 'Landroid/webkit/JsPromptResult;', name: 'confirm', ret: 'V', params: ['Ljava/lang/String;'] },
    { cls: 'Landroid/webkit/WebChromeClient;', name: '<init>', ret: 'V', params: [] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setAllowFileAccess', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setAllowFileAccessFromFileURLs', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setAllowUniversalAccessFromFileURLs', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setDatabaseEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setDomStorageEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setJavaScriptEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setMediaPlaybackRequiresUserGesture', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebView;', name: '<init>', ret: 'V', params: ['Landroid/content/Context;'] },
    { cls: 'Landroid/webkit/WebView;', name: 'getSettings', ret: 'Landroid/webkit/WebSettings;', params: [] },
    { cls: 'Landroid/webkit/WebView;', name: 'loadUrl', ret: 'V', params: ['Ljava/lang/String;'] },
    { cls: 'Landroid/webkit/WebView;', name: 'setWebChromeClient', ret: 'V', params: ['Landroid/webkit/WebChromeClient;'] },
    { cls: 'Landroid/webkit/WebView;', name: 'setWebViewClient', ret: 'V', params: ['Landroid/webkit/WebViewClient;'] },
    { cls: 'Landroid/webkit/WebViewClient;', name: '<init>', ret: 'V', params: [] },
    { cls: 'Ljava/lang/String;', name: 'equals', ret: 'Z', params: ['Ljava/lang/Object;'] },
    { cls: 'Ljava/util/Locale;', name: '<init>', ret: 'V', params: ['Ljava/lang/String;'] },
    { cls: 'Ljava/util/Locale;', name: '<init>', ret: 'V', params: ['Ljava/lang/String;', 'Ljava/lang/String;'] },
    {
      cls: 'Lcom/hyperliquid/scarface/l1/BridgeChromeClient;',
      name: '<init>',
      ret: 'V',
      params: ['Lcom/hyperliquid/scarface/l1/MainActivity;'],
    },
    {
      cls: 'Lcom/hyperliquid/scarface/l1/BridgeChromeClient;',
      name: 'onJsPrompt',
      ret: 'Z',
      params: [
        'Landroid/webkit/WebView;',
        'Ljava/lang/String;',
        'Ljava/lang/String;',
        'Ljava/lang/String;',
        'Landroid/webkit/JsPromptResult;',
      ],
    },
    { cls: 'Lcom/hyperliquid/scarface/l1/MainActivity;', name: '<init>', ret: 'V', params: [] },
    { cls: 'Lcom/hyperliquid/scarface/l1/MainActivity;', name: 'onCreate', ret: 'V', params: ['Landroid/os/Bundle;'] },
    { cls: 'Lcom/hyperliquid/scarface/l1/MainActivity;', name: 'onDestroy', ret: 'V', params: [] },
    { cls: 'Lcom/hyperliquid/scarface/l1/MainActivity;', name: 'onInit', ret: 'V', params: ['I'] },
    { cls: 'Lcom/hyperliquid/scarface/l1/MainActivity;', name: 'speakNative', ret: 'V', params: ['Ljava/lang/String;'] },
    { cls: 'Lcom/hyperliquid/scarface/l1/MainActivity;', name: 'stopNative', ret: 'V', params: [] },
  ];
  const sortedMethods = [...rawMethods].sort((a, b) => {
    const dc = typeId(a.cls) - typeId(b.cls);
    if (dc !== 0) return dc;
    const dn = strId(a.name) - strId(b.name);
    if (dn !== 0) return dn;
    return protoId(a.ret, a.params) - protoId(b.ret, b.params);
  });
  const methodId = (cls: string, name: string, ret: string, params: string[]): number => {
    const idx = sortedMethods.findIndex(
      (m) =>
        m.cls === cls &&
        m.name === name &&
        m.ret === ret &&
        m.params.length === params.length &&
        m.params.every((x, i) => x === params[i])
    );
    if (idx < 0) throw new Error(`Missing DEX method: ${cls}.${name}(${params.join(',')})${ret}`);
    return idx;
  };

  // Tiny Dalvik branch assembler helper so offsets are always exact
  const assembleWithLabels = (
    build: (ctx: {
      insns: number[];
      label: (name: string) => void;
      ifEqz: (reg: number, label: string) => void;
      ifNez: (reg: number, label: string) => void;
      ifGez: (reg: number, label: string) => void;
    }) => void
  ): number[] => {
    const insns: number[] = [];
    const labels = new Map<string, number>();
    const fixups: Array<{ atWordIdx: number; branchStartIdx: number; label: string }> = [];
    build({
      insns,
      label: (name: string) => {
        labels.set(name, insns.length);
      },
      ifEqz: (reg: number, label: string) => {
        const start = insns.length;
        insns.push(((reg & 0xff) << 8) | 0x38, 0);
        fixups.push({ atWordIdx: start + 1, branchStartIdx: start, label });
      },
      ifNez: (reg: number, label: string) => {
        const start = insns.length;
        insns.push(((reg & 0xff) << 8) | 0x39, 0);
        fixups.push({ atWordIdx: start + 1, branchStartIdx: start, label });
      },
      ifGez: (reg: number, label: string) => {
        const start = insns.length;
        insns.push(((reg & 0xff) << 8) | 0x3b, 0);
        fixups.push({ atWordIdx: start + 1, branchStartIdx: start, label });
      },
    });
    for (const f of fixups) {
      const target = labels.get(f.label);
      if (target === undefined) throw new Error(`Missing branch label: ${f.label}`);
      insns[f.atWordIdx] = (target - f.branchStartIdx) & 0xffff;
    }
    return insns;
  };

  const buildCodeItem = (registersSize: number, insSize: number, outsSize: number, insnsUnits: number[]): Buffer => {
    const header = Buffer.alloc(16);
    header.writeUInt16LE(registersSize, 0);
    header.writeUInt16LE(insSize, 2);
    header.writeUInt16LE(outsSize, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt32LE(0, 8);
    header.writeUInt32LE(insnsUnits.length, 12);
    const body = Buffer.alloc(insnsUnits.length * 2);
    insnsUnits.forEach((u, i) => body.writeUInt16LE(u & 0xffff, i * 2));
    return padTo4(Buffer.concat([header, body]));
  };

  const ttsFieldIdx = fieldId(
    'Lcom/hyperliquid/scarface/l1/MainActivity;',
    'tts',
    'Landroid/speech/tts/TextToSpeech;'
  );
  const ttsReadyFieldIdx = fieldId('Lcom/hyperliquid/scarface/l1/MainActivity;', 'ttsReady', 'Z');
  const pendingSpeechFieldIdx = fieldId(
    'Lcom/hyperliquid/scarface/l1/MainActivity;',
    'pendingSpeech',
    'Ljava/lang/String;'
  );
  const ownerFieldIdx = fieldId(
    'Lcom/hyperliquid/scarface/l1/BridgeChromeClient;',
    'owner',
    'Lcom/hyperliquid/scarface/l1/MainActivity;'
  );

  // MainActivity.<init>()V
  const actInitIdx = methodId('Landroid/app/Activity;', '<init>', 'V', []);
  const mainInitCodeItem = buildCodeItem(1, 1, 1, [0x1070, actInitIdx, 0x0000, 0x000e]);

  // MainActivity.onCreate(Bundle)V
  const actOnCreateIdx = methodId('Landroid/app/Activity;', 'onCreate', 'V', ['Landroid/os/Bundle;']);
  const ttsTypeIdx = typeId('Landroid/speech/tts/TextToSpeech;');
  const ttsInitIdx = methodId('Landroid/speech/tts/TextToSpeech;', '<init>', 'V', [
    'Landroid/content/Context;',
    'Landroid/speech/tts/TextToSpeech$OnInitListener;',
  ]);
  const wvTypeIdx = typeId('Landroid/webkit/WebView;');
  const wvInitIdx = methodId('Landroid/webkit/WebView;', '<init>', 'V', ['Landroid/content/Context;']);
  const wvGetSettingsIdx = methodId('Landroid/webkit/WebView;', 'getSettings', 'Landroid/webkit/WebSettings;', []);
  const wsSetJsIdx = methodId('Landroid/webkit/WebSettings;', 'setJavaScriptEnabled', 'V', ['Z']);
  const wsSetDomIdx = methodId('Landroid/webkit/WebSettings;', 'setDomStorageEnabled', 'V', ['Z']);
  const wsSetFileAccessIdx = methodId('Landroid/webkit/WebSettings;', 'setAllowFileAccess', 'V', ['Z']);
  const wsSetFileFromFileIdx = methodId('Landroid/webkit/WebSettings;', 'setAllowFileAccessFromFileURLs', 'V', ['Z']);
  const wsSetUniversalIdx = methodId('Landroid/webkit/WebSettings;', 'setAllowUniversalAccessFromFileURLs', 'V', ['Z']);
  const wsSetDbIdx = methodId('Landroid/webkit/WebSettings;', 'setDatabaseEnabled', 'V', ['Z']);
  const wsSetMediaGestureIdx = methodId('Landroid/webkit/WebSettings;', 'setMediaPlaybackRequiresUserGesture', 'V', ['Z']);
  const wvcTypeIdx = typeId('Landroid/webkit/WebViewClient;');
  const wvcInitIdx = methodId('Landroid/webkit/WebViewClient;', '<init>', 'V', []);
  const wvSetWvcIdx = methodId('Landroid/webkit/WebView;', 'setWebViewClient', 'V', ['Landroid/webkit/WebViewClient;']);
  const bccTypeIdx = typeId('Lcom/hyperliquid/scarface/l1/BridgeChromeClient;');
  const bccInitIdx = methodId('Lcom/hyperliquid/scarface/l1/BridgeChromeClient;', '<init>', 'V', [
    'Lcom/hyperliquid/scarface/l1/MainActivity;',
  ]);
  const wvSetWccIdx = methodId('Landroid/webkit/WebView;', 'setWebChromeClient', 'V', ['Landroid/webkit/WebChromeClient;']);
  const urlStrIdx = strId(appUrl);
  const wvLoadUrlIdx = methodId('Landroid/webkit/WebView;', 'loadUrl', 'V', ['Ljava/lang/String;']);
  const actSetContentIdx = methodId('Landroid/app/Activity;', 'setContentView', 'V', ['Landroid/view/View;']);

  const mainOnCreateCodeItem = buildCodeItem(6, 2, 3, [
    // invoke-super {v4, v5}, Activity.onCreate(Bundle)
    0x206f, actOnCreateIdx, 0x0054,
    // new-instance v0, TextToSpeech
    0x0022, ttsTypeIdx,
    // invoke-direct {v0, v4, v4}, TextToSpeech.<init>(Context, OnInitListener)
    0x3070, ttsInitIdx, 0x0440,
    // iput-object v0, v4, MainActivity.tts
    0x405b, ttsFieldIdx,
    // new-instance v0, WebView
    0x0022, wvTypeIdx,
    // invoke-direct {v0, v4}, WebView.<init>(Context)
    0x2070, wvInitIdx, 0x0040,
    // invoke-virtual {v0}, WebView.getSettings()
    0x106e, wvGetSettingsIdx, 0x0000,
    // move-result-object v1
    0x010c,
    // const/4 v3, 1
    0x1312,
    0x206e, wsSetJsIdx, 0x0031,
    0x206e, wsSetDomIdx, 0x0031,
    0x206e, wsSetFileAccessIdx, 0x0031,
    0x206e, wsSetFileFromFileIdx, 0x0031,
    0x206e, wsSetUniversalIdx, 0x0031,
    0x206e, wsSetDbIdx, 0x0031,
    // const/4 v3, 0 -> setMediaPlaybackRequiresUserGesture(false)
    0x0312,
    0x206e, wsSetMediaGestureIdx, 0x0031,
    // new-instance v1, WebViewClient
    0x0122, wvcTypeIdx,
    0x1070, wvcInitIdx, 0x0001,
    0x206e, wvSetWvcIdx, 0x0010,
    // new-instance v1, BridgeChromeClient; invoke-direct {v1, v4}; webView.setWebChromeClient(v1)
    0x0122, bccTypeIdx,
    0x2070, bccInitIdx, 0x0041,
    0x206e, wvSetWccIdx, 0x0010,
    // const-string v1, appUrl; webView.loadUrl(v1)
    0x011a, urlStrIdx,
    0x206e, wvLoadUrlIdx, 0x0010,
    // invoke-virtual {v4, v0}, Activity.setContentView(View)
    0x206e, actSetContentIdx, 0x0004,
    0x000e,
  ]);

  // MainActivity.onDestroy()V
  const actOnDestroyIdx = methodId('Landroid/app/Activity;', 'onDestroy', 'V', []);
  const ttsStopIdx = methodId('Landroid/speech/tts/TextToSpeech;', 'stop', 'I', []);
  const ttsShutdownIdx = methodId('Landroid/speech/tts/TextToSpeech;', 'shutdown', 'V', []);
  const mainOnDestroyCodeItem = buildCodeItem(
    2,
    1,
    1,
    assembleWithLabels(({ insns, label, ifEqz }) => {
      insns.push(0x106f, actOnDestroyIdx, 0x0001);
      insns.push(0x1054, ttsFieldIdx);
      ifEqz(0, 'end');
      insns.push(0x106e, ttsStopIdx, 0x0000);
      insns.push(0x106e, ttsShutdownIdx, 0x0000);
      label('end');
      insns.push(0x000e);
    })
  );

  // MainActivity.onInit(I)V
  const localeTypeIdx = typeId('Ljava/util/Locale;');
  const localeLangOnlyInitIdx = methodId('Ljava/util/Locale;', '<init>', 'V', ['Ljava/lang/String;']);
  const localeInitIdx = methodId('Ljava/util/Locale;', '<init>', 'V', ['Ljava/lang/String;', 'Ljava/lang/String;']);
  const ttsSetLangIdx = methodId('Landroid/speech/tts/TextToSpeech;', 'setLanguage', 'I', ['Ljava/util/Locale;']);
  const mainSpeakMethodIdx = methodId('Lcom/hyperliquid/scarface/l1/MainActivity;', 'speakNative', 'V', [
    'Ljava/lang/String;',
  ]);
  const mainStopMethodIdx = methodId('Lcom/hyperliquid/scarface/l1/MainActivity;', 'stopNative', 'V', []);
  const esStrIdx = strId('es');
  const mxStrIdx = strId('MX');
  const mainOnInitCodeItem = buildCodeItem(
    5,
    2,
    3,
    assembleWithLabels(({ insns, label, ifEqz, ifNez, ifGez }) => {
      // v3 = this, v4 = status
      ifNez(4, 'end');
      insns.push(0x3054, ttsFieldIdx); // iget-object v0, v3, tts
      ifEqz(0, 'end');
      insns.push(0x1112); // const/4 v1, 1
      insns.push(0x315c, ttsReadyFieldIdx); // iput-boolean v1, v3, ttsReady
      insns.push(0x0122, localeTypeIdx);
      insns.push(0x021a, esStrIdx);
      insns.push(0x041a, mxStrIdx);
      insns.push(0x3070, localeInitIdx, 0x0421); // Locale.<init>(v1, v2, v4)
      insns.push(0x206e, ttsSetLangIdx, 0x0010); // tts.setLanguage(v0, v1)
      insns.push(0x010a); // move-result v1
      ifGez(1, 'checkPending');
      insns.push(0x0122, localeTypeIdx);
      insns.push(0x021a, esStrIdx);
      insns.push(0x2070, localeLangOnlyInitIdx, 0x0021); // Locale.<init>(v1, v2)
      insns.push(0x206e, ttsSetLangIdx, 0x0010); // tts.setLanguage(v0, v1)
      label('checkPending');
      insns.push(0x3054, pendingSpeechFieldIdx); // iget-object v0, v3, pendingSpeech
      ifEqz(0, 'end');
      insns.push(0x0112); // const/4 v1, 0 (null)
      insns.push(0x315b, pendingSpeechFieldIdx); // iput-object v1, v3, pendingSpeech
      insns.push(0x206e, mainSpeakMethodIdx, 0x0003); // this.speakNative(v0)
      label('end');
      insns.push(0x000e);
    })
  );

  // MainActivity.speakNative(String)V
  const ttsSpeakIdx = methodId('Landroid/speech/tts/TextToSpeech;', 'speak', 'I', [
    'Ljava/lang/CharSequence;',
    'I',
    'Landroid/os/Bundle;',
    'Ljava/lang/String;',
  ]);
  const hlStrIdx = strId('hl');
  const mainSpeakNativeCodeItem = buildCodeItem(
    6,
    2,
    5,
    assembleWithLabels(({ insns, label, ifEqz, ifNez }) => {
      // v4 = this, v5 = text
      ifEqz(5, 'end');
      insns.push(0x4054, ttsFieldIdx); // iget-object v0, v4, tts
      ifEqz(0, 'end');
      insns.push(0x4155, ttsReadyFieldIdx); // iget-boolean v1, v4, ttsReady
      ifNez(1, 'doSpeak');
      insns.push(0x455b, pendingSpeechFieldIdx); // iput-object v5, v4, pendingSpeech
      insns.push(0x000e);
      label('doSpeak');
      insns.push(0x5107); // move-object v1, v5
      insns.push(0x0212); // const/4 v2, 0 (QUEUE_FLUSH)
      insns.push(0x0312); // const/4 v3, 0 (null Bundle)
      insns.push(0x041a, hlStrIdx); // const-string v4, "hl"
      insns.push(0x546e, ttsSpeakIdx, 0x3210); // invoke-virtual {v0, v1, v2, v3, v4}
      label('end');
      insns.push(0x000e);
    })
  );

  // MainActivity.stopNative()V
  const mainStopNativeCodeItem = buildCodeItem(
    2,
    1,
    1,
    assembleWithLabels(({ insns, label, ifEqz }) => {
      insns.push(0x0012); // const/4 v0, 0
      insns.push(0x105b, pendingSpeechFieldIdx); // iput-object v0, v1, pendingSpeech
      insns.push(0x1054, ttsFieldIdx); // iget-object v0, v1, tts
      ifEqz(0, 'end');
      insns.push(0x106e, ttsStopIdx, 0x0000);
      label('end');
      insns.push(0x000e);
    })
  );

  // BridgeChromeClient.<init>(MainActivity)V
  const wccInitIdx = methodId('Landroid/webkit/WebChromeClient;', '<init>', 'V', []);
  const bccInitCodeItem = buildCodeItem(2, 2, 1, [
    0x1070, wccInitIdx, 0x0000,
    0x015b, ownerFieldIdx, // iput-object v1, v0, owner
    0x000e,
  ]);

  // BridgeChromeClient.onJsPrompt(WebView, String url, String message, String defaultValue, JsPromptResult)Z
  const strEqualsIdx = methodId('Ljava/lang/String;', 'equals', 'Z', ['Ljava/lang/Object;']);
  const confirmIdx = methodId('Landroid/webkit/JsPromptResult;', 'confirm', 'V', ['Ljava/lang/String;']);
  const speakKeyIdx = strId('__HL_TTS_SPEAK__');
  const stopKeyIdx = strId('__HL_TTS_STOP__');
  const okStrIdx = strId('OK');

  const bccOnJsPromptCodeItem = buildCodeItem(
    9,
    6,
    2,
    assembleWithLabels(({ insns, label, ifEqz }) => {
      // v3 = this, v4 = view, v5 = url, v6 = message, v7 = defaultValue, v8 = result
      ifEqz(6, 'retFalse');
      insns.push(0x001a, speakKeyIdx);
      insns.push(0x206e, strEqualsIdx, 0x0060); // equals(v0, v6)
      insns.push(0x010a); // move-result v1
      ifEqz(1, 'checkStop');
      insns.push(0x3254, ownerFieldIdx); // iget-object v2, v3, owner
      insns.push(0x206e, mainSpeakMethodIdx, 0x0072); // owner.speakNative(v7)
      insns.push(0x001a, okStrIdx);
      insns.push(0x206e, confirmIdx, 0x0008); // result.confirm("OK")
      insns.push(0x1012); // const/4 v0, 1
      insns.push(0x000f); // return v0

      label('checkStop');
      insns.push(0x001a, stopKeyIdx);
      insns.push(0x206e, strEqualsIdx, 0x0060);
      insns.push(0x010a);
      ifEqz(1, 'retFalse');
      insns.push(0x3254, ownerFieldIdx); // iget-object v2, v3, owner
      insns.push(0x106e, mainStopMethodIdx, 0x0002); // owner.stopNative()
      insns.push(0x001a, okStrIdx);
      insns.push(0x206e, confirmIdx, 0x0008);
      insns.push(0x1012);
      insns.push(0x000f);

      label('retFalse');
      insns.push(0x0012); // const/4 v0, 0
      insns.push(0x000f); // return v0
    })
  );

  // Class defs (BridgeChromeClient & MainActivity)
  const headerSize = 0x70;
  const stringIdsOff = headerSize;
  const stringIdsSize = finalStrings.length * 4;

  const typeIdsOff = stringIdsOff + stringIdsSize;
  const typeIdsSize = sortedTypes.length * 4;

  const protoIdsOff = typeIdsOff + typeIdsSize;
  const protoIdsSize = sortedProtos.length * 12;

  const fieldIdsOff = protoIdsOff + protoIdsSize;
  const fieldIdsSize = sortedFields.length * 8;

  const methodIdsOff = fieldIdsOff + fieldIdsSize;
  const methodIdsSize = sortedMethods.length * 8;

  const classDefsOff = methodIdsOff + methodIdsSize;
  const classDefsCount = 2;
  const classDefsSize = classDefsCount * 32;

  let cursor = classDefsOff + classDefsSize;

  // Type lists (proto parameter type_lists + MainActivity interfaces type_list)
  const paramTypeListOffsets = new Map<number, number>();
  const typeListBuffers: Buffer[] = [];
  let firstTypeListOff = 0;

  const allocTypeList = (types: string[]): number => {
    const off = cursor;
    if (firstTypeListOff === 0) firstTypeListOff = off;
    const tl = Buffer.alloc(4 + types.length * 2);
    tl.writeUInt32LE(types.length, 0);
    types.forEach((tp, j) => tl.writeUInt16LE(typeId(tp), 4 + j * 2));
    const padded = padTo4(tl);
    typeListBuffers.push(padded);
    cursor += padded.length;
    return off;
  };

  sortedProtos.forEach((p, idx) => {
    if (p.params.length === 0) {
      paramTypeListOffsets.set(idx, 0);
      return;
    }
    paramTypeListOffsets.set(idx, allocTypeList(p.params));
  });

  const mainInterfacesOff = allocTypeList(['Landroid/speech/tts/TextToSpeech$OnInitListener;']);

  // Code items (all 4-byte aligned, contiguous)
  const firstCodeOff = cursor;
  const codeItems = [
    mainInitCodeItem,
    mainOnCreateCodeItem,
    mainOnDestroyCodeItem,
    mainOnInitCodeItem,
    mainSpeakNativeCodeItem,
    mainStopNativeCodeItem,
    bccInitCodeItem,
    bccOnJsPromptCodeItem,
  ];
  const codeOffs: number[] = [];
  for (const ci of codeItems) {
    codeOffs.push(cursor);
    cursor += ci.length;
  }
  const [
    mainInitCodeOff,
    mainOnCreateCodeOff,
    mainOnDestroyCodeOff,
    mainOnInitCodeOff,
    mainSpeakNativeCodeOff,
    mainStopNativeCodeOff,
    bccInitCodeOff,
    bccOnJsPromptCodeOff,
  ] = codeOffs;

  // Helper to encode a class_data_item (unaligned bytes inside contiguous TYPE_CLASS_DATA_ITEM list)
  const encodeClassData = (
    instanceFields: Array<{ idx: number; access: number }>,
    directMethods: Array<{ idx: number; access: number; codeOff: number }>,
    virtualMethods: Array<{ idx: number; access: number; codeOff: number }>
  ): Buffer => {
    const sortedInst = [...instanceFields].sort((a, b) => a.idx - b.idx);
    const sortedDir = [...directMethods].sort((a, b) => a.idx - b.idx);
    const sortedVirt = [...virtualMethods].sort((a, b) => a.idx - b.idx);
    const parts: Buffer[] = [
      writeUleb128(0), // static_fields_size
      writeUleb128(sortedInst.length),
      writeUleb128(sortedDir.length),
      writeUleb128(sortedVirt.length),
    ];
    let prev = 0;
    sortedInst.forEach((f, i) => {
      const diff = i === 0 ? f.idx : f.idx - prev;
      prev = f.idx;
      parts.push(writeUleb128(diff), writeUleb128(f.access));
    });
    prev = 0;
    sortedDir.forEach((m, i) => {
      const diff = i === 0 ? m.idx : m.idx - prev;
      prev = m.idx;
      parts.push(writeUleb128(diff), writeUleb128(m.access), writeUleb128(m.codeOff));
    });
    prev = 0;
    sortedVirt.forEach((m, i) => {
      const diff = i === 0 ? m.idx : m.idx - prev;
      prev = m.idx;
      parts.push(writeUleb128(diff), writeUleb128(m.access), writeUleb128(m.codeOff));
    });
    return Buffer.concat(parts);
  };

  const mainClassDataRaw = encodeClassData(
    [
      { idx: ttsFieldIdx, access: 0x0002 },
      { idx: ttsReadyFieldIdx, access: 0x0002 },
      { idx: pendingSpeechFieldIdx, access: 0x0002 },
    ],
    [
      {
        idx: methodId('Lcom/hyperliquid/scarface/l1/MainActivity;', '<init>', 'V', []),
        access: 0x10001,
        codeOff: mainInitCodeOff,
      },
    ],
    [
      {
        idx: methodId('Lcom/hyperliquid/scarface/l1/MainActivity;', 'onCreate', 'V', ['Landroid/os/Bundle;']),
        access: 0x0001,
        codeOff: mainOnCreateCodeOff,
      },
      {
        idx: methodId('Lcom/hyperliquid/scarface/l1/MainActivity;', 'onDestroy', 'V', []),
        access: 0x0001,
        codeOff: mainOnDestroyCodeOff,
      },
      {
        idx: methodId('Lcom/hyperliquid/scarface/l1/MainActivity;', 'onInit', 'V', ['I']),
        access: 0x0001,
        codeOff: mainOnInitCodeOff,
      },
      {
        idx: methodId('Lcom/hyperliquid/scarface/l1/MainActivity;', 'speakNative', 'V', ['Ljava/lang/String;']),
        access: 0x0001,
        codeOff: mainSpeakNativeCodeOff,
      },
      {
        idx: methodId('Lcom/hyperliquid/scarface/l1/MainActivity;', 'stopNative', 'V', []),
        access: 0x0001,
        codeOff: mainStopNativeCodeOff,
      },
    ]
  );

  const bccClassDataRaw = encodeClassData(
    [{ idx: ownerFieldIdx, access: 0x0002 }],
    [
      {
        idx: methodId('Lcom/hyperliquid/scarface/l1/BridgeChromeClient;', '<init>', 'V', [
          'Lcom/hyperliquid/scarface/l1/MainActivity;',
        ]),
        access: 0x10001,
        codeOff: bccInitCodeOff,
      },
    ],
    [
      {
        idx: methodId('Lcom/hyperliquid/scarface/l1/BridgeChromeClient;', 'onJsPrompt', 'Z', [
          'Landroid/webkit/WebView;',
          'Ljava/lang/String;',
          'Ljava/lang/String;',
          'Ljava/lang/String;',
          'Landroid/webkit/JsPromptResult;',
        ]),
        access: 0x0001,
        codeOff: bccOnJsPromptCodeOff,
      },
    ]
  );

  const firstClassDataOff = cursor;
  const mainClassDataOff = cursor;
  cursor += mainClassDataRaw.length;
  const bccClassDataOff = cursor;
  cursor += bccClassDataRaw.length;
  // Pad after the contiguous class_data block before string_data
  const classDataPostPadLen = (4 - (cursor % 4)) % 4;
  const classDataPostPad = Buffer.alloc(classDataPostPadLen, 0);
  cursor += classDataPostPadLen;

  // String data items
  const stringDataOffsets: number[] = [];
  const stringDataBuffers: Buffer[] = [];
  for (const s of finalStrings) {
    stringDataOffsets.push(cursor);
    const utf8 = Buffer.from(s, 'utf8');
    const entry = Buffer.concat([writeUleb128(s.length), utf8, Buffer.from([0])]);
    stringDataBuffers.push(entry);
    cursor += entry.length;
  }

  const preMapPadLen = (4 - (cursor % 4)) % 4;
  if (preMapPadLen > 0) {
    stringDataBuffers.push(Buffer.alloc(preMapPadLen, 0));
    cursor += preMapPadLen;
  }

  const mapOff = cursor;
  const mapEntries: Array<[number, number, number]> = [
    [0x0000, 1, 0], // TYPE_HEADER_ITEM
    [0x0001, finalStrings.length, stringIdsOff],
    [0x0002, sortedTypes.length, typeIdsOff],
    [0x0003, sortedProtos.length, protoIdsOff],
    [0x0004, sortedFields.length, fieldIdsOff],
    [0x0005, sortedMethods.length, methodIdsOff],
    [0x0006, classDefsCount, classDefsOff],
    [0x1001, typeListBuffers.length, firstTypeListOff],
    [0x2001, codeItems.length, firstCodeOff],
    [0x2000, classDefsCount, firstClassDataOff],
    [0x2002, finalStrings.length, stringDataOffsets[0]],
    [0x1000, 1, mapOff], // TYPE_MAP_LIST
  ];
  mapEntries.sort((a, b) => a[2] - b[2]);

  const mapListBuf = Buffer.alloc(4 + mapEntries.length * 12);
  mapListBuf.writeUInt32LE(mapEntries.length, 0);
  mapEntries.forEach(([type, size, off], idx) => {
    const p = 4 + idx * 12;
    mapListBuf.writeUInt16LE(type, p);
    mapListBuf.writeUInt16LE(0, p + 2);
    mapListBuf.writeUInt32LE(size, p + 4);
    mapListBuf.writeUInt32LE(off, p + 8);
  });
  cursor += mapListBuf.length;

  const fileSize = cursor;
  const dex = Buffer.alloc(fileSize);

  // Header (112 bytes)
  Buffer.from([0x64, 0x65, 0x78, 0x0a, 0x30, 0x33, 0x35, 0x00]).copy(dex, 0);
  dex.writeUInt32LE(fileSize, 32);
  dex.writeUInt32LE(headerSize, 36);
  dex.writeUInt32LE(0x12345678, 40);
  dex.writeUInt32LE(0, 44);
  dex.writeUInt32LE(0, 48);
  dex.writeUInt32LE(mapOff, 52);
  dex.writeUInt32LE(finalStrings.length, 56);
  dex.writeUInt32LE(stringIdsOff, 60);
  dex.writeUInt32LE(sortedTypes.length, 64);
  dex.writeUInt32LE(typeIdsOff, 68);
  dex.writeUInt32LE(sortedProtos.length, 72);
  dex.writeUInt32LE(protoIdsOff, 76);
  dex.writeUInt32LE(sortedFields.length, 80);
  dex.writeUInt32LE(fieldIdsOff, 84);
  dex.writeUInt32LE(sortedMethods.length, 88);
  dex.writeUInt32LE(methodIdsOff, 92);
  dex.writeUInt32LE(classDefsCount, 96);
  dex.writeUInt32LE(classDefsOff, 100);
  dex.writeUInt32LE(fileSize - (classDefsOff + classDefsSize), 104);
  dex.writeUInt32LE(classDefsOff + classDefsSize, 108);

  stringDataOffsets.forEach((off, i) => dex.writeUInt32LE(off, stringIdsOff + i * 4));
  sortedTypes.forEach((t, i) => dex.writeUInt32LE(strId(t), typeIdsOff + i * 4));
  sortedProtos.forEach((p, i) => {
    const off = protoIdsOff + i * 12;
    dex.writeUInt32LE(strId(p.shorty), off);
    dex.writeUInt32LE(typeId(p.ret), off + 4);
    dex.writeUInt32LE(paramTypeListOffsets.get(i) || 0, off + 8);
  });
  sortedFields.forEach((f, i) => {
    const off = fieldIdsOff + i * 8;
    dex.writeUInt16LE(typeId(f.cls), off);
    dex.writeUInt16LE(typeId(f.type), off + 2);
    dex.writeUInt32LE(strId(f.name), off + 4);
  });
  sortedMethods.forEach((m, i) => {
    const off = methodIdsOff + i * 8;
    dex.writeUInt16LE(typeId(m.cls), off);
    dex.writeUInt16LE(protoId(m.ret, m.params), off + 2);
    dex.writeUInt32LE(strId(m.name), off + 4);
  });

  // ClassDef 0: MainActivity
  dex.writeUInt32LE(typeId('Lcom/hyperliquid/scarface/l1/MainActivity;'), classDefsOff);
  dex.writeUInt32LE(0x0001, classDefsOff + 4);
  dex.writeUInt32LE(typeId('Landroid/app/Activity;'), classDefsOff + 8);
  dex.writeUInt32LE(mainInterfacesOff, classDefsOff + 12);
  dex.writeUInt32LE(strId('MainActivity.java'), classDefsOff + 16);
  dex.writeUInt32LE(0, classDefsOff + 20);
  dex.writeUInt32LE(mainClassDataOff, classDefsOff + 24);
  dex.writeUInt32LE(0, classDefsOff + 28);

  // ClassDef 1: BridgeChromeClient
  const c1 = classDefsOff + 32;
  dex.writeUInt32LE(typeId('Lcom/hyperliquid/scarface/l1/BridgeChromeClient;'), c1);
  dex.writeUInt32LE(0x0001, c1 + 4);
  dex.writeUInt32LE(typeId('Landroid/webkit/WebChromeClient;'), c1 + 8);
  dex.writeUInt32LE(0, c1 + 12);
  dex.writeUInt32LE(strId('BridgeChromeClient.java'), c1 + 16);
  dex.writeUInt32LE(0, c1 + 20);
  dex.writeUInt32LE(bccClassDataOff, c1 + 24);
  dex.writeUInt32LE(0, c1 + 28);

  const dataPayload = Buffer.concat([
    ...typeListBuffers,
    ...codeItems,
    mainClassDataRaw,
    bccClassDataRaw,
    classDataPostPad,
    ...stringDataBuffers,
    mapListBuf,
  ]);
  dataPayload.copy(dex, classDefsOff + classDefsSize);

  const sha1 = crypto.createHash('sha1').update(dex.subarray(32)).digest();
  sha1.copy(dex, 12);

  const csum = adler32(dex.subarray(12));
  dex.writeUInt32LE(csum, 8);

  return dex;
}

// ============================================================================
// 4. Signing Keypair / X.509 Certificate (Cached in /tmp)
// ============================================================================
interface SigningIdentity {
  privateKeyPem: string;
  certPem: string;
  certDer: Buffer;
  spkiDer: Buffer;
  certSha256: string;
}

let cachedSigningIdentity: SigningIdentity | null = null;

function getOrCreateSigningIdentity(): SigningIdentity {
  if (cachedSigningIdentity) return cachedSigningIdentity;

  const keyDir = path.join(os.tmpdir(), 'hl_apk_signing_v2');
  fs.mkdirSync(keyDir, { recursive: true });
  const keyPath = path.join(keyDir, 'release.key.pem');
  const certPath = path.join(keyDir, 'release.cert.pem');

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '9125',
      '-sha256',
      '-subj',
      '/CN=HyperLiquid Pro L1/O=Scarface Quant/C=US',
    ]);
  }

  const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
  const certPem = fs.readFileSync(certPath, 'utf8');
  const x509 = new crypto.X509Certificate(certPem);
  const certDer = Buffer.from(x509.raw);
  const spkiDer = x509.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const certSha256 = crypto.createHash('sha256').update(certDer).digest('hex');

  cachedSigningIdentity = { privateKeyPem, certPem, certDer, spkiDer, certSha256 };
  return cachedSigningIdentity;
}

function signPkcs7DetachedDer(certSfBuffer: Buffer, identity: SigningIdentity): Buffer {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl_cms_'));
  try {
    const inFile = path.join(tmpDir, 'CERT.SF');
    const outFile = path.join(tmpDir, 'CERT.RSA');
    const keyFile = path.join(tmpDir, 'key.pem');
    const certFile = path.join(tmpDir, 'cert.pem');
    fs.writeFileSync(inFile, certSfBuffer);
    fs.writeFileSync(keyFile, identity.privateKeyPem);
    fs.writeFileSync(certFile, identity.certPem);

    execFileSync('openssl', [
      'cms',
      '-sign',
      '-binary',
      '-noattr',
      '-in',
      inFile,
      '-signer',
      certFile,
      '-inkey',
      keyFile,
      '-md',
      'sha256',
      '-outform',
      'DER',
      '-out',
      outFile,
    ]);
    return fs.readFileSync(outFile);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ============================================================================
// 5. Aligned ZIP Writer + APK Signature Scheme v2 Signing Block
// ============================================================================
interface ZipInputEntry {
  name: string;
  data: Buffer;
  store?: boolean; // true = STORE (method 0), false = DEFLATE (method 8)
  align4?: boolean; // align file data start to 4-byte boundary (required for resources.arsc)
}

function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function lp32(buf: Buffer): Buffer {
  return Buffer.concat([u32le(buf.length), buf]);
}

function computeApkV2ContentDigest(section1: Buffer, section3Cd: Buffer, section4Eocd: Buffer): Buffer {
  const CHUNK_SIZE = 1024 * 1024;
  const chunkDigests: Buffer[] = [];

  for (const sec of [section1, section3Cd, section4Eocd]) {
    if (sec.length === 0) {
      const h = crypto.createHash('sha256');
      h.update(Buffer.from([0xa5, 0, 0, 0, 0]));
      chunkDigests.push(h.digest());
      continue;
    }
    for (let off = 0; off < sec.length; off += CHUNK_SIZE) {
      const slice = sec.subarray(off, Math.min(off + CHUNK_SIZE, sec.length));
      const h = crypto.createHash('sha256');
      h.update(Buffer.from([0xa5]));
      h.update(u32le(slice.length));
      h.update(slice);
      chunkDigests.push(h.digest());
    }
  }

  const root = crypto.createHash('sha256');
  root.update(Buffer.from([0x5a]));
  root.update(u32le(chunkDigests.length));
  for (const d of chunkDigests) root.update(d);
  return root.digest();
}

function buildApkSigningBlockV2(
  section1: Buffer,
  section3Cd: Buffer,
  section4Eocd: Buffer,
  identity: SigningIdentity
): Buffer {
  // Algorithm ID 0x0103 = RSASSA-PKCS1-v1_5 with SHA-256
  const ALG_RSA_PKCS1_SHA256 = 0x0103;
  const contentDigest = computeApkV2ContentDigest(section1, section3Cd, section4Eocd);

  const digestItem = Buffer.concat([u32le(ALG_RSA_PKCS1_SHA256), lp32(contentDigest)]);
  const digestsSeq = lp32(lp32(digestItem));
  const certsSeq = lp32(lp32(identity.certDer));
  const attrsSeq = lp32(Buffer.alloc(0));

  const signedDataBytes = Buffer.concat([digestsSeq, certsSeq, attrsSeq]);
  const signatureBytes = crypto.sign('RSA-SHA256', signedDataBytes, identity.privateKeyPem);

  const sigItem = Buffer.concat([u32le(ALG_RSA_PKCS1_SHA256), lp32(signatureBytes)]);
  const signaturesSeq = lp32(lp32(sigItem));
  const publicKeyLp = lp32(identity.spkiDer);

  const signerBytes = Buffer.concat([lp32(signedDataBytes), signaturesSeq, publicKeyLp]);
  const v2Value = lp32(lp32(signerBytes)); // signers list containing 1 signer

  // ID-value pair: uint64 pairLen + uint32 ID (0x7109871a) + v2Value
  const pairLen = BigInt(4 + v2Value.length);
  const pairHeader = Buffer.alloc(12);
  pairHeader.writeBigUInt64LE(pairLen, 0);
  pairHeader.writeUInt32LE(0x7109871a, 8);
  const idValuePair = Buffer.concat([pairHeader, v2Value]);

  // Ensure total block size aligns nicely and matches APK Sig Block 42 layout:
  // sizeOfBlock (8) + pairs + sizeOfBlock (8) + magic (16)
  // Notice sizeOfBlock = pairs.length + 8 + 16
  const sizeOfBlock = BigInt(idValuePair.length + 8 + 16);
  const topSizeBuf = Buffer.alloc(8);
  topSizeBuf.writeBigUInt64LE(sizeOfBlock, 0);
  const bottomSizeAndMagic = Buffer.alloc(24);
  bottomSizeAndMagic.writeBigUInt64LE(sizeOfBlock, 0);
  Buffer.from('APK Sig Block 42', 'ascii').copy(bottomSizeAndMagic, 8);

  return Buffer.concat([topSizeBuf, idValuePair, bottomSizeAndMagic]);
}

function buildAlignedSignedZipApk(entries: ZipInputEntry[], identity: SigningIdentity): Buffer {
  const localRecords: Buffer[] = [];
  const cdRecords: Buffer[] = [];
  let offset = 0;

  // DOS timestamp (fixed deterministic)
  const dosTime = 0x5800;
  const dosDate = 0x5821;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const uncompressedSize = entry.data.length;
    const rawCrc = crc32(entry.data);
    const useStore = Boolean(entry.store);
    const compressedData = useStore ? entry.data : zlib.deflateRawSync(entry.data, { level: 9 });
    const method = useStore ? 0 : 8;

    // 4-byte alignment padding via valid PKZIP/AOSP 0xd935 extra field (minimum 4-byte record)
    let extraBuf: Buffer = Buffer.alloc(0);
    if (entry.align4) {
      const baseDataStart = offset + 30 + nameBuf.length;
      if (baseDataStart % 4 !== 0) {
        const padDataLen = (4 - ((baseDataStart + 4) % 4)) % 4;
        extraBuf = Buffer.alloc(4 + padDataLen, 0);
        extraBuf.writeUInt16LE(0xd935, 0);
        extraBuf.writeUInt16LE(padDataLen, 2);
      }
    }
    const extraLen = extraBuf.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(rawCrc, 14);
    localHeader.writeUInt32LE(compressedData.length, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(extraLen, 28);

    localRecords.push(localHeader, nameBuf, extraBuf, compressedData);

    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4); // version made by
    cdHeader.writeUInt16LE(20, 6); // version needed
    cdHeader.writeUInt16LE(0x0800, 8); // UTF-8
    cdHeader.writeUInt16LE(method, 10);
    cdHeader.writeUInt16LE(dosTime, 12);
    cdHeader.writeUInt16LE(dosDate, 14);
    cdHeader.writeUInt32LE(rawCrc, 16);
    cdHeader.writeUInt32LE(compressedData.length, 20);
    cdHeader.writeUInt32LE(uncompressedSize, 24);
    cdHeader.writeUInt16LE(nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30); // extra len
    cdHeader.writeUInt16LE(0, 32); // comment len
    cdHeader.writeUInt16LE(0, 34); // disk start
    cdHeader.writeUInt16LE(0, 36); // internal attrs
    cdHeader.writeUInt32LE(0, 38); // external attrs
    cdHeader.writeUInt32LE(offset, 42); // relative offset of local header

    cdRecords.push(cdHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + extraLen + compressedData.length;
  }

  const section1Entries = Buffer.concat(localRecords);
  const section3Cd = Buffer.concat(cdRecords);

  // Pre-signing EOCD pointing to section1Entries.length
  const preEocd = Buffer.alloc(22);
  preEocd.writeUInt32LE(0x06054b50, 0);
  preEocd.writeUInt16LE(0, 4);
  preEocd.writeUInt16LE(0, 6);
  preEocd.writeUInt16LE(entries.length, 8);
  preEocd.writeUInt16LE(entries.length, 10);
  preEocd.writeUInt32LE(section3Cd.length, 12);
  preEocd.writeUInt32LE(section1Entries.length, 16);
  preEocd.writeUInt16LE(0, 20);

  const signingBlock = buildApkSigningBlockV2(section1Entries, section3Cd, preEocd, identity);

  // Final EOCD shifts Central Directory offset past the APK Signing Block
  const finalEocd = Buffer.from(preEocd);
  finalEocd.writeUInt32LE(section1Entries.length + signingBlock.length, 16);

  return Buffer.concat([section1Entries, signingBlock, section3Cd, finalEocd]);
}

// ============================================================================
// 6. Public Builder
// ============================================================================
export interface BuiltApkArtifact {
  buffer: Buffer;
  sha256: string;
  signerSha256: string;
  sizeBytes: number;
  appUrl: string;
  sourceHash: string;
  builtAt: string;
}

const apkCacheByUrl = new Map<string, BuiltApkArtifact>();

export const APK_LOCAL_ENTRYPOINT = 'file:///android_asset/www/index.html';

interface EmbeddedWebAssets {
  indexHtml: Buffer;
  appJs: Buffer;
  appCss: Buffer;
  sourceHash: string;
  builtAt: string;
}

let cachedWebAssets: EmbeddedWebAssets | null = null;
let webAssetsBuildPromise: Promise<EmbeddedWebAssets> | null = null;

function computeLiveSourceFingerprint(): string {
  const root = process.cwd();
  const hash = crypto.createHash('sha256');
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const st = fs.statSync(fullPath);
        hash.update(`${path.relative(root, fullPath)}:${st.size}:${Math.floor(st.mtimeMs)}\n`);
      }
    }
  };
  walk(path.join(root, 'src'));
  for (const singleFile of ['index.html', 'package.json', 'vite.config.ts', 'apkBuilder.ts']) {
    const p = path.join(root, singleFile);
    if (fs.existsSync(p)) {
      const st = fs.statSync(p);
      hash.update(`${singleFile}:${st.size}:${Math.floor(st.mtimeMs)}\n`);
    }
  }
  return hash.digest('hex').slice(0, 12);
}

function buildApkIndexHtml(apiBaseUrl?: string): Buffer {
  const cleanApiBase = (apiBaseUrl || '').replace(/\/+$/, '');
  const indexHtmlStr = `<!doctype html>
<html lang="es" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>HyperLiquid Pro L1</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <script>window.__HL_ANDROID_APK__=true;window.__HL_NATIVE_TTS_BRIDGE__=true;window.__HL_API_BASE_URL__=${JSON.stringify(cleanApiBase)};</script>
    <link rel="stylesheet" href="./app.css" />
    <script defer src="./app.js"></script>
  </head>
  <body class="bg-[#090b10] text-[#e2e8f0] antialiased selection:bg-[#00f2fe]/30 selection:text-white">
    <div id="root"></div>
  </body>
</html>
`;
  return Buffer.from(indexHtmlStr, 'utf8');
}

async function buildStandaloneWebBundle(forceRebuild: boolean = false): Promise<EmbeddedWebAssets> {
  const liveFingerprint = computeLiveSourceFingerprint();
  if (!forceRebuild && cachedWebAssets && cachedWebAssets.sourceHash === liveFingerprint) {
    return cachedWebAssets;
  }
  if (cachedWebAssets && cachedWebAssets.sourceHash !== liveFingerprint) {
    standaloneApkCache.clear();
  }
  if (webAssetsBuildPromise) return webAssetsBuildPromise;

  webAssetsBuildPromise = (async () => {
    const tmpOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl_apk_www_'));
    try {
      await viteBuild({
        root: process.cwd(),
        logLevel: 'silent',
        build: {
          outDir: tmpOutDir,
          emptyOutDir: true,
          modulePreload: { polyfill: false },
          cssCodeSplit: false,
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
        },
      });

      const assetsDir = path.join(tmpOutDir, 'assets');
      const assetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
      const jsFiles = assetFiles.filter((f) => f.endsWith('.js')).sort();
      const cssFiles = assetFiles.filter((f) => f.endsWith('.css')).sort();

      if (jsFiles.length === 0) {
        throw new Error('Vite build did not produce an application JS bundle for APK');
      }

      const rawJs = jsFiles.map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf8')).join('\n');
      const iifeResult = esbuildTransformSync(rawJs, {
        format: 'iife',
        minify: true,
        loader: 'js',
      });

      const combinedCss = cssFiles
        .map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf8'))
        .join('\n');

      cachedWebAssets = {
        indexHtml: buildApkIndexHtml(),
        appJs: Buffer.from(iifeResult.code, 'utf8'),
        appCss: Buffer.from(combinedCss, 'utf8'),
        sourceHash: computeLiveSourceFingerprint(),
        builtAt: new Date().toISOString(),
      };
      return cachedWebAssets;
    } finally {
      fs.rmSync(tmpOutDir, { recursive: true, force: true });
      webAssetsBuildPromise = null;
    }
  })();

  return webAssetsBuildPromise;
}

const standaloneApkCache = new Map<string, BuiltApkArtifact>();

function assembleSignedApk(webAssets: EmbeddedWebAssets, launchUrl: string, apiBaseUrl?: string): BuiltApkArtifact {
  const identity = getOrCreateSigningIdentity();

  const manifestBin = buildBinaryAndroidManifest();
  const resourcesArscBin = buildBinaryResourcesArsc();
  const classesDexBin = buildCompiledClassesDex(launchUrl);
  const indexHtmlBuf = apiBaseUrl ? buildApkIndexHtml(apiBaseUrl) : webAssets.indexHtml;

  const appConfigJson = Buffer.from(
    JSON.stringify(
      {
        appId: 'com.hyperliquid.scarface.l1',
        appName: 'HyperLiquid Pro L1',
        version: APK_VERSION,
        versionCode: APK_VERSION_CODE,
        sourceHash: webAssets.sourceHash,
        builtAt: webAssets.builtAt,
        launchUrl,
        apiBaseUrl: (apiBaseUrl || '').replace(/\/+$/, ''),
        standaloneBundle: true,
        nativeTtsBridge: true,
        network: {
          l1Api: 'https://api.hyperliquid.xyz',
          wsApi: 'wss://api.hyperliquid.xyz/ws',
          arbitrumRpc: 'https://arb1.arbitrum.io/rpc',
          quoteCurrency: 'USDC',
        },
        strategy: 'UNIFIED_EV_PLUS_4_MTF_3X_CAP',
      },
      null,
      2
    ),
    'utf8'
  );

  const contentEntries: ZipInputEntry[] = [
    { name: 'AndroidManifest.xml', data: manifestBin },
    { name: 'resources.arsc', data: resourcesArscBin, store: true, align4: true },
    { name: 'classes.dex', data: classesDexBin },
    { name: 'assets/app_config.json', data: appConfigJson },
    { name: 'assets/www/index.html', data: indexHtmlBuf },
    { name: 'assets/www/app.js', data: webAssets.appJs },
    { name: 'assets/www/app.css', data: webAssets.appCss },
  ];

  let manifestText = 'Manifest-Version: 1.0\r\nCreated-By: 1.0 (HyperLiquid APK Builder)\r\n\r\n';
  for (const e of contentEntries) {
    const d = crypto.createHash('sha256').update(e.data).digest('base64');
    manifestText += `Name: ${e.name}\r\nSHA-256-Digest: ${d}\r\n\r\n`;
  }
  const manifestMfBuf = Buffer.from(manifestText, 'utf8');

  const manifestDigest = crypto.createHash('sha256').update(manifestMfBuf).digest('base64');
  let certSfText =
    `Signature-Version: 1.0\r\n` +
    `Created-By: 1.0 (HyperLiquid APK Signer)\r\n` +
    `SHA-256-Digest-Manifest: ${manifestDigest}\r\n` +
    `X-Android-APK-Signed: 2\r\n\r\n`;

  for (const e of contentEntries) {
    const entrySection = `Name: ${e.name}\r\nSHA-256-Digest: ${crypto.createHash('sha256').update(e.data).digest('base64')}\r\n\r\n`;
    const entrySectionDigest = crypto.createHash('sha256').update(Buffer.from(entrySection, 'utf8')).digest('base64');
    certSfText += `Name: ${e.name}\r\nSHA-256-Digest: ${entrySectionDigest}\r\n\r\n`;
  }
  const certSfBuf = Buffer.from(certSfText, 'utf8');
  const certRsaBuf = signPkcs7DetachedDer(certSfBuf, identity);

  const allEntries: ZipInputEntry[] = [
    ...contentEntries,
    { name: 'META-INF/MANIFEST.MF', data: manifestMfBuf },
    { name: 'META-INF/CERT.SF', data: certSfBuf },
    { name: 'META-INF/CERT.RSA', data: certRsaBuf },
  ];

  const buffer = buildAlignedSignedZipApk(allEntries, identity);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    buffer,
    sha256,
    signerSha256: identity.certSha256,
    sizeBytes: buffer.length,
    appUrl: launchUrl,
    sourceHash: webAssets.sourceHash,
    builtAt: webAssets.builtAt,
  };
}

export async function buildGenuineAndroidApkAsync(
  appUrl?: string,
  forceRebuild: boolean = false
): Promise<BuiltApkArtifact> {
  const launchUrl = APK_LOCAL_ENTRYPOINT;
  const cleanApiBase = (appUrl || '').replace(/\/+$/, '');
  const webAssets = await buildStandaloneWebBundle(forceRebuild);
  const cacheKey = `${launchUrl}|${cleanApiBase}|${webAssets.sourceHash}`;
  if (!forceRebuild) {
    const cached = standaloneApkCache.get(cacheKey);
    if (cached) return cached;
  }

  const artifact = assembleSignedApk(webAssets, launchUrl, cleanApiBase);
  standaloneApkCache.set(cacheKey, artifact);
  return artifact;
}

export function prewarmStandaloneApk(): void {
  buildGenuineAndroidApkAsync().catch((err) => {
    console.warn('APK prewarm warning:', err?.message || err);
  });
}

export function buildGenuineAndroidApk(appUrl: string = APK_LOCAL_ENTRYPOINT): BuiltApkArtifact {
  const cached = standaloneApkCache.get(`${APK_LOCAL_ENTRYPOINT}|`);
  if (cached) return cached;
  const normalizedUrl = appUrl.replace(/\/+$/, '');
  const fallbackCache = apkCacheByUrl.get(normalizedUrl);
  if (fallbackCache) return fallbackCache;

  // Minimal fallback only if called synchronously before async bundle completes
  const identity = getOrCreateSigningIdentity();
  const manifestBin = buildBinaryAndroidManifest();
  const resourcesArscBin = buildBinaryResourcesArsc();
  const classesDexBin = buildCompiledClassesDex(normalizedUrl);
  const emptyAssets: EmbeddedWebAssets = {
    indexHtml: Buffer.from('<!doctype html><html><body>Loading...</body></html>', 'utf8'),
    appJs: Buffer.from('', 'utf8'),
    appCss: Buffer.from('', 'utf8'),
    sourceHash: computeLiveSourceFingerprint(),
    builtAt: new Date().toISOString(),
  };
  const artifact = assembleSignedApk(
    cachedWebAssets || emptyAssets,
    cachedWebAssets ? APK_LOCAL_ENTRYPOINT : normalizedUrl
  );
  if (!cachedWebAssets) {
    // preserve exact classesDexBin/manifest/resources for fallback
    void manifestBin;
    void resourcesArscBin;
    void classesDexBin;
    void identity;
  }
  apkCacheByUrl.set(normalizedUrl, artifact);
  return artifact;
}

// 測試共用：從 index.html 抽出 <script id="group-logic"> 執行，另附最小解壓與 XML 結構檢查。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');

function loadGroupLogic(file) {
    const html = fs.readFileSync(path.join(ROOT, file || 'index.html'), 'utf8');
    const m = html.match(/<script id="group-logic">([\s\S]*?)<\/script>/);
    if (!m) throw new Error('index.html 找不到 <script id="group-logic">');
    const ctx = { TextEncoder, Uint8Array, Uint32Array, DataView, ArrayBuffer, Map, Set, Math, Date, JSON, Number, String, Array, Object, Error };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(m[1], ctx, { filename: 'group-logic' });
    return ctx.GroupLogic;
}

/* 只支援不壓縮（stored）的 zip，並檢查 CRC */
function unzip(u8, crc32) {
    const buf = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = buf.length - 22;
    while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
    if (e < 0) throw new Error('找不到 zip 結尾記錄');
    const count = buf.readUInt16LE(e + 10), cdOff = buf.readUInt32LE(e + 16);
    const out = new Map();
    let p = cdOff;
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('中央目錄格式錯誤');
        const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 20);
        const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
        if (method !== 0) throw new Error('不是 stored：' + name);
        if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error('本地檔頭錯誤：' + name);
        const ln = buf.readUInt16LE(lo + 26), lx = buf.readUInt16LE(lo + 28);
        const data = new Uint8Array(buf.slice(lo + 30 + ln + lx, lo + 30 + ln + lx + size));
        if (crc32(data) !== crc) throw new Error('CRC 不符：' + name);
        out.set(name, data);
        p += 46 + nlen + xlen + clen;
    }
    return out;
}

/* XML 結構檢查：標籤成對、只有一個根、沒有裸露的 < 或錯誤的 & */
function checkXml(text, label) {
    let s = text.replace(/^﻿/, '');
    s = s.replace(/^<\?xml[^?]*\?>\s*/, '');
    const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g;
    const stack = [];
    let last = 0, roots = 0, m;
    while ((m = re.exec(s))) {
        const between = s.slice(last, m.index);
        if (between.includes('<')) throw new Error(label + '：無法解析的標籤，在 ' + JSON.stringify(s.slice(last, last + 80)));
        if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(between + m[3])) throw new Error(label + '：未跳脫的 &');
        const [, close, name, , self] = m;
        if (close) {
            const top = stack.pop();
            if (top !== name) throw new Error(label + '：</' + name + '> 對不上 <' + top + '>');
        } else if (!self) {
            if (!stack.length) roots++;
            stack.push(name);
        } else if (!stack.length) roots++;
        last = re.lastIndex;
    }
    if (s.slice(last).trim()) throw new Error(label + '：結尾有多餘內容');
    if (stack.length) throw new Error(label + '：未關閉 <' + stack.join('><') + '>');
    if (roots !== 1) throw new Error(label + '：根元素數量 ' + roots);
    return true;
}

function openPackage(GL, bytes) {
    const files = unzip(bytes, GL.crc32);
    const text = new Map();
    files.forEach((data, name) => {
        if (/\.(xml|rels)$/.test(name)) {
            const t = Buffer.from(data).toString('utf8');
            checkXml(t, name);
            text.set(name, t);
        }
    });
    return { files, text };
}

function tinyPng(GL) {
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(GL.crc32(new Uint8Array(td)));
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.alloc((1 + 4 * 3) * 2, 0xCC); raw[0] = 0; raw[13] = 0;
    return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/* 虛構名單（全部假資料） */
const NAMES = '王小明 李小華 張小美 陳大文 林小安 黃志豪 吳雅婷 劉冠宇 蔡佳穎 楊承恩 許婉如 鄭宇軒 謝語彤 郭柏翰 洪慧君 曾思穎 邱品睿 廖若涵 賴冠廷 徐子晴 周柏宇 葉芷瑄 蘇冠霖 莊雅涵 江承翰 呂欣怡 何宥辰 蕭語嫣 羅子豪 高苡安 潘柏廷 簡妤潔'.split(' ');
function makeRoster(n, o) {
    o = o || {};
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push({
            cls: o.cls === 'multi' ? (i < n / 2 ? '3A' : '3B') : (o.cls === 'one' ? '3A' : ''),
            no: String(o.cls === 'multi' ? (i % Math.ceil(n / 2)) + 1 : i + 1),
            name: NAMES[i % NAMES.length] + (i >= NAMES.length ? String(i) : ''),
            score: o.scores === false ? '' : 50 + ((i * i * 5 + i * 17 + 3) % 49)
        });
    }
    return out;
}

module.exports = { ROOT, loadGroupLogic, unzip, checkXml, openPackage, tinyPng, makeRoster };

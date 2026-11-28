// Live "Redact me" demo. Runs the fine-tuned DistilBERT PII model in the
// visitor's browser with transformers.js, so no server (and no cost) is needed.
// The model files live in models/pii-distilbert-v5 (built by the GitHub Action
// in .github/workflows/build-pii-model.yml).
import { AutoTokenizer, AutoModelForTokenClassification, Tensor, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

import { parseRule, ruleSpans, isAllowed } from './english-rules.js?v=2026-11-28a';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('models/', location.href).href;
const MODEL_ID = 'pii-distilbert-v5';
// The model learned on short texts and finds much more in long ones when it
// reads them in short windows (see benchmarks/compare.md), so pack about 126 pieces.
const MAX_TOKENS = 126;

const SAMPLES = [
  "Hi team, my name is Sarah Johnson and I can't log in. You can reach me at sarah.johnson@example.com or 415-555-0198. My account was billed to the card 4111 1111 1111 1111 last week.",
  "Hi Daniel Okafor, your order #48213 has shipped! We'll text updates to (312) 555-0142. Payment: card 5500 0000 0000 0004. Questions? Reply to daniel.okafor@shopmail.com.",
  "New hire paperwork for Priya Raman: SSN 123-45-6789, personal email priya.raman88@gmail.com, cell 917-555-0133. Her laptop checked in from 192.168.4.27. Note: the test card 1234 5678 9012 3456 on file should be ignored.",
  "Hola, soy María García López. Escríbeme a maria.garcia@correo.es o llámame al 612 345 678. Para el reembolso, mi IBAN es ES91 2100 0418 4502 0005 1332 y mi pasaporte es PAA123456.",
];

// Friendly names and colors for the model's labels. Unknown labels still work.
const KNOWN = {
  NAME: ['Name', '#5cdbb6'], PERSON: ['Name', '#5cdbb6'], PER: ['Name', '#5cdbb6'],
  EMAIL: ['Email', '#7aabff'],
  PHONE: ['Phone', '#f0b75a'], PHONE_NUMBER: ['Phone', '#f0b75a'],
  CREDIT_CARD: ['Card number', '#ff7a9c'], CARD: ['Card number', '#ff7a9c'], CC: ['Card number', '#ff7a9c'], CREDIT_CARD_NUMBER: ['Card number', '#ff7a9c'],
  SSN: ['SSN', '#c792ff'], US_SSN: ['SSN', '#c792ff'],
  ADDRESS: ['Address', '#6fd3ff'], LOC: ['Location', '#6fd3ff'], LOCATION: ['Location', '#6fd3ff'],
  DATE: ['Date', '#e6e36a'], DOB: ['Date of birth', '#e6e36a'],
  IP: ['IP address', '#ffa26b'], IP_ADDRESS: ['IP address', '#ffa26b'],
  ACCOUNT: ['Account no.', '#b8e986'], BANK_ACCOUNT: ['Account no.', '#b8e986'],
  IBAN: ['IBAN', '#b8e986'], PASSPORT: ['Passport', '#9fd6ff'], DRIVER_LICENSE: ["Driver's license", '#a0f0c8'],
  API_KEY: ['API key', '#f78fe0'], ID_NUMBER: ['ID number', '#ffd27a'], DATE_OF_BIRTH: ['Date of birth', '#e6e36a'],
  USERNAME: ['Username', '#d6a2ff'], PASSWORD: ['Password', '#ff9f6b'],
};
const tokName = (t) => typeInfo(t).name.toUpperCase().replace(/'/g, '').replace(/[^A-Z]+/g, '_');
const EXTRA_COLORS = ['#ff9f6b', '#9fd6ff', '#d6a2ff', '#a0f0c8', '#ffd27a'];
const typeInfo = (t) => {
  const k = t.toUpperCase();
  if (KNOWN[k]) return { name: KNOWN[k][0], color: KNOWN[k][1] };
  let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { name: t.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), color: EXTRA_COLORS[h % EXTRA_COLORS.length] };
};
const isCard = (t) => /CARD|CREDIT|^CC$/i.test(t);
const isSsn = (t) => /SSN/i.test(t);
const isPhone = (t) => /PHONE/i.test(t);
const isIban = (t) => /IBAN/i.test(t);
function ibanOk(s) {
  const v = s.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  let r = 0;
  for (const c of v.slice(4) + v.slice(0, 4)) for (const d of String(parseInt(c, 36))) r = (r * 10 + +d) % 97;
  return r === 1;
}
// Well-known API key formats. Matches are redacted even if the model is unsure.
const API_KEY_RE = /\b(?:(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z_-]{35})/g;
const CARD_RE = /\b[2-6]\d{3}(?:[ -]?\d){9,15}\b/g;
const SSN_RE = /\b\d{3}([- ])\d{2}\1\d{4}\b/g;
const ssnOk = (v) => { const m = /^(\d{3})[- ]?(\d{2})[- ]?(\d{4})$/.exec(v.trim()); return !!m && m[1] !== '000' && m[1] !== '666' && m[1][0] !== '9' && m[2] !== '00' && m[3] !== '0000'; };
const DOB_RE = /\b(?:born(?: on)?|d\.?o\.?b\.?|date of birth|birth ?date|birthday|fecha de nacimiento|nacid[oa] el)\W{0,4}(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?,? \d{4}|\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,? \d{4}|\d{1,2} de [a-záéíóú]+ de \d{4})/gi;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;
// Area codes in use in the US and Canada (from Google's libphonenumber data).
const AREA_CODES = new Set('201 202 203 204 205 206 207 208 209 210 212 213 214 215 216 217 218 219 220 223 224 225 226 227 228 229 231 234 235 236 239 240 242 246 248 249 250 251 252 253 254 256 260 262 263 267 269 270 272 274 276 279 281 283 284 289 301 302 303 304 305 306 307 308 309 310 312 313 314 315 316 317 318 319 320 321 323 325 326 327 329 330 331 332 334 336 337 339 340 341 343 345 346 347 350 351 352 354 360 361 363 364 365 367 368 369 380 382 385 386 401 402 403 404 405 406 407 408 409 410 412 413 414 415 416 417 418 419 423 424 425 428 430 431 432 434 435 437 438 440 441 442 443 445 447 448 450 458 463 464 468 469 470 472 473 474 475 478 479 480 484 500 501 502 503 504 505 506 507 508 509 510 512 513 514 515 516 517 518 519 520 521 522 523 524 525 526 527 528 529 530 531 533 534 539 540 541 544 548 551 557 559 561 562 563 564 566 567 570 571 572 573 574 575 577 579 580 581 582 584 585 586 587 588 600 601 602 603 604 605 606 607 608 609 610 612 613 614 615 616 617 618 619 620 622 623 626 628 629 630 631 633 636 639 640 641 645 646 647 649 650 651 656 657 658 659 660 661 662 667 669 670 671 672 678 680 681 682 683 689 701 702 703 704 705 706 707 708 709 712 713 714 715 716 717 718 719 720 724 725 726 727 728 730 731 732 734 737 740 742 743 747 753 754 757 758 760 762 763 765 769 770 771 772 773 774 775 778 779 780 781 782 784 785 786 787 800 801 802 803 804 805 806 807 808 809 810 812 813 814 815 816 817 818 819 820 825 826 828 829 830 831 832 833 835 838 839 840 843 844 845 847 848 849 850 854 855 856 857 858 859 860 862 863 864 865 866 867 868 870 872 873 876 877 878 879 888 900 901 902 903 904 905 906 907 908 909 910 912 913 914 915 916 917 918 919 920 925 928 929 930 931 934 936 937 938 939 940 941 942 943 945 947 948 949 951 952 954 956 959 970 971 972 973 978 979 980 983 984 985 986 989'.split(' '));
const isUsPhone = (d) => d.length === 10 && AREA_CODES.has(d.slice(0, 3)) && /^[2-9]/.test(d[3]);
// Shapes used to grow a partly-found entity to its full extent.
const SHAPES = [
  [/EMAIL/i, /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu],
  [/PHONE/i, /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g],
  [/SSN/i, /\b\d{3}-\d{2}-\d{4}\b/g],
  [/CARD|CREDIT/i, /\b\d{4}(?:[ -]?\d{4}){2}[ -]?\d{1,7}\b/g],
  [/IP/i, /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  [/IBAN/i, IBAN_RE],
  [/API/i, API_KEY_RE],
  [/PASSWORD/i, /[^\s,;]+(?<![.!?])/g],   // the whole password, symbols included
];

const $ = (id) => document.getElementById(id);
const input = $('input'), output = $('output'), statusEl = $('status'), statusText = $('status-text'), statusBar = $('status-bar');
const threshold = $('threshold');
let tokenizer, model, id2label, id2labelTypes = {}, lastSpans = [], runId = 0, view = 'highlight';

// ---------- validators (same idea as the full service) ----------
function luhn(digits) {
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = +digits[i];
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}
function validate(span) {
  const digits = span.text.replace(/\D/g, '');
  if (isCard(span.type)) {
    if (digits.length < 13 || digits.length > 19) return { ok: false, msg: `✗ ${digits.length} digits, not a card number` };
    return luhn(digits) ? { ok: true, msg: '✓ Passes Luhn checksum' } : { ok: false, msg: '✗ Fails Luhn checksum' };
  }
  if (isSsn(span.type)) {
    if (!ssnOk(span.text)) return { ok: false, msg: '✗ Not a valid SSN format' };
    return { ok: true, msg: '✓ Valid SSN format' };
  }
  if (isPhone(span.type) && digits.length < 7) return { ok: false, msg: '✗ Too few digits for a phone number' };
  if (/EMAIL/i.test(span.type) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(span.text)) return { ok: false, msg: '✗ Not an email address' };
  if (isIban(span.type)) return ibanOk(span.text) ? { ok: true, msg: '✓ Passes IBAN checksum' } : { ok: false, msg: '✗ Fails IBAN checksum' };
  if (/IP/i.test(span.type)) {
    const parts = span.text.split('.');
    if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || +p > 255)) return { ok: false, msg: '✗ Not a valid IP address' };
  }
  return null;
}

// ---------- model ----------
// Split text into words the same way BERT's basic tokenizer does (whitespace and
// punctuation), keeping character offsets so results map back onto the text.
function words(text) {
  const out = [];
  for (const m of text.matchAll(/[\p{L}\p{N}\p{M}]+|[^\s\p{L}\p{N}\p{M}]/gu)) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}
const pieceCache = new Map();
function pieces(word) {
  let ids = pieceCache.get(word);
  if (!ids) { ids = tokenizer.encode(word, { add_special_tokens: false }); if (pieceCache.size > 20000) pieceCache.clear(); pieceCache.set(word, ids); }
  return ids;
}

// The model runs one call at a time (typing and file jobs share it).
let modelQueue = Promise.resolve();
function runModel(feeds) {
  const next = modelQueue.then(() => model(feeds));
  modelQueue = next.catch(() => {});
  return next;
}

async function classify(text) {
  const ws = words(text);
  const cls = tokenizer.cls_token_id ?? 101, sep = tokenizer.sep_token_id ?? 102;
  // Pack words into windows of at most MAX_TOKENS pieces.
  const windows = []; let cur = [], n = 0;
  for (const w of ws) {
    const ids = pieces(w.text);
    if (!ids.length) continue;
    // Start a new window when this one is full, or near full at a sentence end.
    const prev = cur[cur.length - 1];
    const atEnd = prev && /[.!?:;]$|\n/.test(prev.text + text.slice(prev.end, w.start));
    if (cur.length && (n + ids.length > MAX_TOKENS || (atEnd && n > MAX_TOKENS * 0.75))) { windows.push(cur); cur = []; n = 0; }
    cur.push({ ...w, ids: ids.slice(0, MAX_TOKENS) }); n += Math.min(ids.length, MAX_TOKENS);
  }
  if (cur.length) windows.push(cur);

  const labeled = [];
  for (const win of windows) {
    const ids = [cls]; const firstIdx = [];
    for (const w of win) { firstIdx.push(ids.length); ids.push(...w.ids); }
    ids.push(sep);
    const shape = [1, ids.length];
    const { logits } = await runModel({
      input_ids: new Tensor('int64', BigInt64Array.from(ids, BigInt), shape),
      attention_mask: new Tensor('int64', new BigInt64Array(ids.length).fill(1n), shape),
    });
    const L = logits.dims[2], data = logits.data;
    win.forEach((w, i) => {
      const off = firstIdx[i] * L;
      let max = -Infinity, arg = 0;
      for (let k = 0; k < L; k++) if (data[off + k] > max) { max = data[off + k]; arg = k; }
      let z = 0; for (let k = 0; k < L; k++) z += Math.exp(data[off + k] - max);
      labeled.push({ ...w, label: id2label[arg] ?? 'O', score: 1 / z });
    });
  }
  return mergeSpans(text, labeled);
}

// Turn per-word labels (B-EMAIL, I-EMAIL, O, ...) into whole entities.
function mergeSpans(text, labeled) {
  const spans = []; let open = null;
  for (const w of labeled) {
    if (w.label === 'O') { open = null; continue; }
    const m = /^([BIESLU])-(.+)$/.exec(w.label);
    const prefix = m ? m[1] : 'I', type = m ? m[2] : w.label;
    const gap = open ? text.slice(open.end, w.start) : '';
    // Continue the open entity for I- tags of the same type, or when the word is
    // glued to it with no space (e.g. the model splits "555-123-4567" across labels).
    const continues = open && !/\n/.test(gap) && ((open.type === type && !'BSU'.includes(prefix)) || gap === ''
      || (open.type === type && /PERSON|NAME/i.test(type) && gap === ' ')); // "José" + "Álvarez" is one name
    if (continues) { open.end = w.end; open.scores.push(w.score); open.votes[type] = (open.votes[type] || 0) + 1; }
    else { open = { type, start: w.start, end: w.end, scores: [w.score], votes: { [type]: 1 } }; spans.push(open); }
    if (prefix === 'E' || prefix === 'L' || prefix === 'S' || prefix === 'U') open = null;
  }
  for (const s of spans) s.type = Object.entries(s.votes).sort((a, b) => b[1] - a[1])[0][0];
  // Format rules: an entity grows to the full email/phone/etc. it is part of,
  // and phone vs SSN is settled by shape.
  const shapes = SHAPES.map(([t, re]) => [t, [...text.matchAll(re)].map((m) => [m.index, m.index + m[0].length])]);
  for (const s of spans) {
    for (const [t, ranges] of shapes) {
      if (!t.test(s.type)) continue;
      const r = ranges.find(([a, b]) => s.start < b && s.end > a);
      if (r) { s.start = Math.min(s.start, r[0]); s.end = Math.max(s.end, r[1]); }
    }
    if (isSsn(s.type) || isPhone(s.type)) {
      const t = text.slice(s.start, s.end).trim(), digits = t.replace(/\D/g, '');
      const ssnType = Object.keys(id2labelTypes).find(isSsn), phoneType = Object.keys(id2labelTypes).find(isPhone);
      if (/^\d{3}-\d{2}-\d{4}$/.test(t) && ssnType) s.type = ssnType;
      else if (digits.length >= 10 && digits.length <= 11 && phoneType) s.type = phoneType;
    }
  }
  // Safety net: a 10-digit number whose first three digits are a real US or
  // Canadian area code (e.g. 662 in "6626341142") is a phone number. It is
  // redacted even if the model missed it, called it something else, or was unsure.
  const phoneType = Object.keys(id2labelTypes).find(isPhone);
  if (phoneType) {
    for (const [a, b] of shapes.find(([t]) => t.test(phoneType))[1]) {
      const d = text.slice(a, b).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      if (!isUsPhone(d)) continue;
      const hits = spans.filter((s) => s.start < b && s.end > a);
      if (!hits.length) { spans.push({ type: phoneType, start: a, end: b, scores: [1], rule: 'found', area: d.slice(0, 3) }); continue; }
      for (const s of hits) {
        if (isPhone(s.type) || validate({ type: s.type, text: text.slice(s.start, s.end) })?.ok === false) {
          s.type = phoneType; s.rule = 'confirmed'; s.area = d.slice(0, 3);
          s.start = Math.min(s.start, a); s.end = Math.max(s.end, b);
        }
      }
    }
  }
  // Same idea for IBANs (with a valid checksum), well-known API key formats,
  // card numbers that pass Luhn and well-formed SSNs.
  const cardOk = (v) => luhn(v.replace(/\D/g, ''));
  for (const [type, re, ok, why] of [['IBAN', IBAN_RE, ibanOk, 'passes the IBAN checksum'], ['API_KEY', API_KEY_RE, () => true, 'matches a known API key format'],
    ['CREDIT_CARD', CARD_RE, cardOk, 'passes the Luhn checksum'], ['SSN', SSN_RE, ssnOk, 'valid SSN format'],
    ['EMAIL', /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, () => true, 'email address format'],
    ['IP_ADDRESS', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (v) => v.split('.').every((p) => +p <= 255), 'valid IP address'],
    ['DATE_OF_BIRTH', DOB_RE, () => true, "a date right after 'born' or 'DOB'"]]) {
    for (const m of text.matchAll(re)) {
      const v = re === DOB_RE ? m[1] : m[0];
      const a = m.index + m[0].length - v.length, b = a + v.length;
      if (!ok(v)) continue;
      const hits = spans.filter((s) => s.start < b && s.end > a);
      if (!hits.length) { spans.push({ type, start: a, end: b, scores: [1], rule: 'found', why }); continue; }
      for (const s of hits) {
        // A card, SSN, email or IP rule only relabels a find whose own label fails its check.
        if (['CREDIT_CARD', 'SSN', 'EMAIL', 'IP_ADDRESS'].includes(type) && s.type !== type && validate({ type: s.type, text: text.slice(s.start, s.end) })?.ok !== false) continue;
        s.type = type; s.rule = 'confirmed'; s.why = why; s.scores = [1]; s.start = Math.min(s.start, a); s.end = Math.max(s.end, b); }
    }
  }
  // Your own rules win where they overlap what the model or the rules found.
  for (const c of ruleSpans(text, userRules)) {
    const hits = spans.filter((s) => s.start < c.end && s.end > c.start);
    if (hits.some((h) => h.custom)) continue;            // an earlier rule of yours already has it
    for (const h of hits) { c.start = Math.min(c.start, h.start); c.end = Math.max(c.end, h.end); spans.splice(spans.indexOf(h), 1); }
    spans.push({ type: c.type, start: c.start, end: c.end, scores: [1], rule: 'found', why: c.why, custom: true });
  }
  // Drop entities swallowed by a grown one, then build the results.
  const kept = [];
  for (const s of spans.sort((a, b) => a.start - b.start)) {
    const prev = kept[kept.length - 1];
    if (prev && s.start < prev.end) { prev.end = Math.max(prev.end, s.end); prev.scores.push(...s.scores); }
    else kept.push(s);
  }
  return kept.map((s) => {
    const span = { type: s.type, start: s.start, end: s.end, text: text.slice(s.start, s.end), score: s.scores.reduce((a, b) => a + b, 0) / s.scores.length, rule: s.rule === 'found', sure: !!s.rule };
    span.check = s.why ? { ok: true, msg: s.rule === 'found' ? `✓ Caught by a rule (${s.why})` : `✓ ${s.why[0].toUpperCase()}${s.why.slice(1)}` }
      : s.rule === 'found' ? { ok: true, msg: `✓ Caught by the area code rule (${s.area} is a real area code)` }
      : s.rule === 'confirmed' ? { ok: true, msg: `✓ ${s.area} is a real area code` } : validate(span);
    return span;
  }).filter((sp) => !isAllowed(sp.text, userRules));
}

// ---------- rendering ----------
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const redactable = (s) => (s.sure || s.score >= +threshold.value) && !(s.check && !s.check.ok);

function render() {
  const text = input.value;
  if (!text.trim()) { output.innerHTML = '<span class="empty">Your highlighted text will appear here.</span>'; }
  else {
    let html = '', pos = 0; const tokens = tokenTable();
    for (const s of lastSpans) {
      const info = typeInfo(s.type), live = redactable(s);
      const tip = `${info.name} · ${s.rule ? 'format rule' : Math.round(s.score * 100) + '% confident'}${s.check ? ' · ' + s.check.msg.replace(/^[✓✗] /, '') : ''}${live ? '' : ' · not redacted'}`;
      html += esc(text.slice(pos, s.start));
      if (live && view === 'redact' && mode !== 'mask') html += `<mark class="pii swap" style="--c:${info.color}" title="${esc(info.name)}: replaced">${esc(replacementFor(s, tokens))}</mark>`;
      else html += `<mark class="pii${live ? '' : ' low'}" style="--c:${info.color}" title="${esc(tip)}">${esc(s.text)}<span class="lbl">${esc(info.name.toUpperCase())}${live ? '' : ' ?'}</span></mark>`;
      pos = s.end;
    }
    html += esc(text.slice(pos));
    output.innerHTML = html;
  }
  output.classList.toggle('redacted', view === 'redact' && mode === 'mask');
  renderTokenKey();

  const live = lastSpans.filter(redactable);
  const byType = {};
  for (const s of live) { const n = typeInfo(s.type).name; byType[n] = (byType[n] || 0) + 1; }
  $('mini').innerHTML = live.length
    ? 'Found: ' + Object.entries(byType).map(([n, c]) => `<b>${c} ${esc(n.toLowerCase())}${c > 1 ? 's' : ''}</b>`).join(', ')
    : (model && input.value.trim() ? 'Nothing personal found yet' : '');
  $('found-count').textContent = live.length;
  $('found-word').textContent = live.length === 1 ? 'item' : 'items';
  const types = [...new Set(lastSpans.map((s) => s.type))];
  $('legend').innerHTML = types.map((t) => { const i = typeInfo(t); return `<span style="--c:${i.color}">${esc(i.name)}</span>`; }).join('');
  $('entities').innerHTML = lastSpans.length ? lastSpans.map((s) => {
    const i = typeInfo(s.type), pct = Math.round(s.score * 100);
    const check = s.check ? `<span class="check ${s.check.ok ? 'ok' : 'bad'}">${esc(s.check.msg)}</span>` : '';
    const conf = s.rule ? '<span class="conf rule">Rule</span>' : `<span class="conf"><i><b style="width:${pct}%"></b></i>${pct}%</span>`;
    return `<li class="${redactable(s) ? '' : 'low'}" style="--c:${i.color}"><span class="type">${esc(i.name.toUpperCase())}</span><span class="val">${esc(s.text)}${check}</span>${conf}</li>`;
  }).join('') : `<li class="none">${model ? 'No personal data found yet. Try one of the examples.' : 'Waiting for the model to load…'}</li>`;
}

// ---------- redaction modes ----------
// mask: black bar · label: [NAME] · fake: realistic stand-in · token: <NAME_1>, reversible with the key
let mode = 'mask';
const hash = (str) => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const pick = (arr, h) => arr[h % arr.length];
const FAKE_FIRST = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Rowan', 'Drew', 'Skyler'];
const FAKE_LAST = ['Rivera', 'Brooks', 'Hayes', 'Bennett', 'Foster', 'Reed', 'Parker', 'Ellis', 'Morgan', 'Price', 'Shaw', 'Lane'];
const TEST_CARDS = ['4111 1111 1111 1111', '5500 0000 0000 0004', '3782 822463 10005', '6011 1111 1111 1117'];
function fakeFor(s) {
  const t = s.type.toUpperCase(), h = hash(t + '|' + s.text);
  const first = pick(FAKE_FIRST, h), last = pick(FAKE_LAST, h >>> 8);
  if (/USER/.test(t)) return `${first}${last}${h % 100}`.toLowerCase();
  if (/PERSON|NAME|PER$/.test(t)) return s.text.trim().includes(' ') ? `${first} ${last}` : first;
  if (/EMAIL/.test(t)) return `${first}.${last}@example.com`.toLowerCase();
  if (/PHONE/.test(t)) return `(202) 555-01${String(h % 100).padStart(2, '0')}`;     // 555-0100..0199 are reserved for fiction
  if (/SSN/.test(t)) return `9${String(h % 100).padStart(2, '0')}-${String((h >>> 7) % 90 + 10)}-${String((h >>> 3) % 9000 + 1000)}`; // SSNs never start with 9
  if (/CARD|CREDIT/.test(t)) { const c = TEST_CARDS.filter((x) => x.replace(/\D/g, '') !== s.text.replace(/\D/g, '')); return pick(c, h); } // public test card numbers
  if (/IP/.test(t)) return `203.0.113.${h % 254 + 1}`;                                   // documentation-only range
  if (/IBAN/.test(t)) return pick(['GB82 WEST 1234 5698 7654 32', 'DE89 3704 0044 0532 0130 00', 'FR14 2004 1010 0505 0001 3M02 606']
    .filter((x) => x.replace(/\s/g, '') !== s.text.replace(/\s/g, '')), h); // published example IBANs
  if (/PASSPORT/.test(t)) return `X${String(h % 1e8).padStart(8, '0')}`;
  if (/DRIVER|LICEN/.test(t)) return `D${String(h % 1e7).padStart(7, '0')}`;
  if (/DATE|DOB|BIRTH/.test(t)) return `01/01/19${String(h % 50 + 50)}`;
  if (/PASSWORD/.test(t)) return '••••••••';
  if (/ID_NUMBER/.test(t)) return `ID-${String(h % 1e8).padStart(8, '0')}`;
  if (/ADDRESS|LOC/.test(t)) return `${h % 900 + 100} Example Street`;
  if (/API/.test(t)) return `sk_example_${(h.toString(16) + (h >>> 5).toString(16)).padEnd(16, '0')}`;
  return `[${typeInfo(s.type).name.toUpperCase()}]`;
}
function tokenTable() {
  const byValue = new Map(), counts = {};
  for (const s of lastSpans) {
    if (!redactable(s)) continue;
    const key = s.type + '|' + s.text;
    if (byValue.has(key)) continue;
    const name = tokName(s.type);
    counts[name] = (counts[name] || 0) + 1;
    byValue.set(key, `<${name}_${counts[name]}>`);
  }
  return byValue;
}
function replacementFor(s, tokens) {
  if (mode === 'label') return `[${typeInfo(s.type).name.toUpperCase()}]`;
  if (mode === 'fake') return fakeFor(s);
  if (mode === 'token') return tokens.get(s.type + '|' + s.text);
  return '█'.repeat(s.text.length);
}
function redactedText() {
  const text = input.value, tokens = tokenTable(); let out = '', pos = 0;
  for (const s of lastSpans) { if (!redactable(s)) continue; out += text.slice(pos, s.start) + replacementFor(s, tokens); pos = s.end; }
  return out + text.slice(pos);
}
function renderTokenKey() {
  const box = $('token-key'), tokens = tokenTable();
  box.hidden = !(view === 'redact' && mode === 'token' && tokens.size);
  if (box.hidden) return;
  $('token-rows').innerHTML = [...tokens].map(([k, tok]) => `<tr><td><code>${esc(tok)}</code></td><td>${esc(k.slice(k.indexOf('|') + 1))}</td></tr>`).join('');
  restore();
}
function restore() {
  const tokens = tokenTable(), back = new Map([...tokens].map(([k, tok]) => [tok, k.slice(k.indexOf('|') + 1)]));
  const src = $('restore-in').value;
  $('restore-out').textContent = src ? src.replace(/<[A-Z_]+_\d+>/g, (m) => back.get(m) ?? m) : '';
}

let timer;
function schedule(delay = 250) { clearTimeout(timer); timer = setTimeout(run, delay); }
let busy = false, again = false;
async function run() {
  const count = $('count'); count.textContent = `${input.value.length} / 5000`;
  if (!model) { render(); return; }
  // One model call at a time; if text changed meanwhile, run once more after.
  if (busy) { again = true; return; }
  busy = true;
  try { await analyze(); } finally { busy = false; }
  if (again) { again = false; run(); }
}
async function analyze() {
  const id = ++runId, text = input.value, t0 = performance.now();
  try {
    const spans = text.trim() ? await classify(text) : [];
    if (id !== runId) return; // a newer edit is already running
    lastSpans = spans;
    $('timing').textContent = text.trim() ? `Analyzed in ${Math.round(performance.now() - t0)} ms on your device` : ' ';
  } catch (e) { console.error(e); $('timing').textContent = 'Something went wrong analyzing that text.'; }
  render();
}

// ---------- files: CSV, PDF and long text, all in the browser ----------
const MAX_FILE = 15 * 1024 * 1024;
const loadScript = (src) => new Promise((ok, fail) => {
  const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = () => fail(new Error('Could not load ' + src));
  document.head.appendChild(el);
});
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

function fileStatus(msg) { $('file-status').textContent = msg; }
function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const baseName = (n) => n.replace(/\.[^.]+$/, '');

// Replace the redactable spans of `text`, sharing one token table across a file.
function applyRedaction(text, spans, tokens, counts) {
  let out = '', pos = 0;
  for (const s of spans) {
    if (!redactable(s)) continue;
    const key = s.type + '|' + s.text;
    if (mode === 'token' && !tokens.has(key)) {
      const name = tokName(s.type);
      counts[name] = (counts[name] || 0) + 1; tokens.set(key, `<${name}_${counts[name]}>`);
    }
    out += text.slice(pos, s.start) + replacementFor(s, tokens); pos = s.end;
  }
  return out + text.slice(pos);
}

function parseCsv(src) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const csvCell = (v) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

async function redactCsv(file) {
  const rows = parseCsv(await file.text());
  if (!rows.length) throw new Error('That CSV looks empty.');
  const [header, ...body] = rows;
  // One cell per line, so entities never run across cells; the model reads them in big batches.
  const cells = []; body.forEach((r, ri) => r.forEach((v, ci) => { if (v.trim()) cells.push({ ri, ci, v: v.replace(/[\r\n]+/g, ' ') }); }));
  const out = body.map((r) => r.slice());
  const tokens = new Map(), counts = {}; let found = 0;
  const CHUNK = 300;
  for (let i = 0; i < cells.length; i += CHUNK) {
    fileStatus(`Checking cells ${i + 1} to ${Math.min(i + CHUNK, cells.length)} of ${cells.length}…`);
    const part = cells.slice(i, i + CHUNK), text = part.map((c) => c.v).join('\n');
    const spans = await classify(text);
    let off = 0;
    for (const c of part) {
      const end = off + c.v.length;
      const mine = spans.filter((s) => s.start >= off && s.end <= end).map((s) => ({ ...s, start: s.start - off, end: s.end - off }));
      found += mine.filter(redactable).length;
      out[c.ri][c.ci] = applyRedaction(c.v, mine, tokens, counts);
      off = end + 1;
    }
  }
  const csv = [header, ...out].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const preview = [header, ...out.slice(0, 15)];
  $('file-preview').innerHTML = `<div class="csv-wrap"><table class="csv">${preview.map((r, i) => `<tr>${r.map((v) => `<${i ? 'td' : 'th'}>${esc(v)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table></div>`
    + (out.length > 15 ? `<p class="file-note">Showing the first 15 of ${out.length} rows. The download has them all.</p>` : '');
  return { found, blob: new Blob([csv], { type: 'text/csv' }), name: baseName(file.name) + '-redacted.csv', tokens };
}

async function redactPdf(file) {
  fileStatus('Loading the PDF reader…');
  if (!window.pdfjsLib) await loadScript(PDFJS + 'pdf.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = []; let found = 0;
  $('file-preview').innerHTML = '<div class="pdf-pages" id="pdf-pages"></div>';
  for (let n = 1; n <= pdf.numPages; n++) {
    fileStatus(`Reading page ${n} of ${pdf.numPages}…`);
    const page = await pdf.getPage(n), viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    // Rebuild the page text and remember where each text piece sits.
    const tc = await page.getTextContent();
    const items = tc.items.filter((it) => it.str !== undefined);
    // Measure with the PDF's own font family so boxes land on the right characters.
    const meas = document.createElement('canvas').getContext('2d');
    const widthOf = (it, str) => { meas.font = `100px ${(tc.styles[it.fontName] || {}).fontFamily || 'sans-serif'}`; return meas.measureText(str).width; };
    let text = ''; const ranges = [];
    for (const it of items) { ranges.push([text.length, text.length + it.str.length, it]); text += it.str + (it.hasEOL ? '\n' : ' '); }
    const spans = text.trim() ? (await classify(text)).filter(redactable) : [];
    found += spans.length;
    ctx.fillStyle = '#000';
    for (const s of spans) {
      for (const [a, b, it] of ranges) {
        if (b <= s.start || a >= s.end || !it.str.length) continue;
        const from = Math.max(s.start, a) - a, to = Math.min(s.end, b) - a;
        const [, , , d, x, y] = it.transform, h = Math.abs(d) || it.height || 10;
        const full = widthOf(it, it.str) || 1, pad = h * 0.3;
        const x1 = x + it.width * (widthOf(it, it.str.slice(0, from)) / full) - pad;
        const x2 = x + it.width * (widthOf(it, it.str.slice(0, to)) / full) + pad;
        const [l, t, r, btm] = viewport.convertToViewportRectangle([x1, y - h * 0.25, x2, y + h * 0.95]);
        ctx.fillRect(Math.min(l, r) - 2, Math.min(t, btm) - 2, Math.abs(r - l) + 4, Math.abs(btm - t) + 4);
      }
    }
    canvas.className = 'pdf-page'; $('pdf-pages').appendChild(canvas);
    pages.push({ canvas, w: viewport.width / 2, h: viewport.height / 2 });
  }
  if (!pages.some((p) => p)) throw new Error('No pages found.');
  fileStatus('Building the redacted PDF…');
  if (!window.jspdf) await loadScript(JSPDF);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: [pages[0].w, pages[0].h], orientation: pages[0].w > pages[0].h ? 'l' : 'p' });
  pages.forEach((p, i) => {
    if (i) doc.addPage([p.w, p.h], p.w > p.h ? 'l' : 'p');
    doc.addImage(p.canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, p.w, p.h);
  });
  return { found, blob: doc.output('blob'), name: baseName(file.name) + '-redacted.pdf', pdf: true };
}

async function redactTextFile(file) {
  const text = await file.text();
  fileStatus('Checking the text…');
  const spans = await classify(text);
  const tokens = new Map(), out = applyRedaction(text, spans, tokens, {});
  $('file-preview').innerHTML = `<pre class="txt-preview">${esc(out.slice(0, 3000))}${out.length > 3000 ? '\n…' : ''}</pre>`;
  return { found: spans.filter(redactable).length, blob: new Blob([out], { type: 'text/plain' }), name: baseName(file.name) + '-redacted.txt', tokens };
}

let fileResult = null;
async function handleFile(file) {
  const panel = $('file-panel'); panel.hidden = false; $('file-name').textContent = file.name;
  $('file-download').hidden = true; $('file-preview').innerHTML = ''; fileResult = null;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    if (file.size > MAX_FILE) throw new Error('That file is over 15 MB. Try a smaller one.');
    if (!model) { fileStatus('Waiting for the model to finish loading…'); while (!model) await new Promise((r) => setTimeout(r, 300)); }
    const ext = file.name.toLowerCase().split('.').pop();
    const t0 = performance.now();
    if (ext === 'csv') fileResult = await redactCsv(file);
    else if (ext === 'pdf') fileResult = await redactPdf(file);
    else if (ext === 'txt' || ext === 'md' || file.type.startsWith('text/')) fileResult = await redactTextFile(file);
    else throw new Error('Please choose a PDF, CSV or text file.');
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    const how = fileResult.pdf ? 'blacked out (the PDF is rebuilt as images, so hidden text can\'t be copied back out)' : `redacted as “${document.querySelector('[data-mode][aria-checked="true"]').textContent}”`;
    fileStatus(`Found ${fileResult.found} item${fileResult.found === 1 ? '' : 's'} in ${secs} s, ${how}. Nothing left your device.`);
    $('file-download').hidden = false;
  } catch (e) { console.error(e); fileStatus(e.message || 'Something went wrong reading that file.'); }
}

// ---------- wiring ----------
$('file-input').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; });
$('file-download').addEventListener('click', () => { if (fileResult) download(fileResult.name, fileResult.blob); });
const drop = document.querySelector('.panes');
drop.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('dropping'); } });
drop.addEventListener('dragleave', () => drop.classList.remove('dropping'));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; drop.classList.remove('dropping'); if (f) { e.preventDefault(); handleFile(f); } });
// ---------- your own rules, in plain English ----------
let userRules = [];
const rulesInput = $('rules-input');
function readRules() {
  const lines = rulesInput.value.split('\n').map((l) => l.trim()).filter(Boolean);
  userRules = []; const items = [];
  for (const line of lines) {
    try { const r = parseRule(line); userRules.push(r); items.push(`<li class="ok">${esc(r.explain)}</li>`); }
    catch (e) { items.push(`<li class="bad">"${esc(line)}": ${esc(e.message)}</li>`); }
  }
  $('rules-read').innerHTML = items.join('');
  try { localStorage.setItem('scrubpii-rules', rulesInput.value); } catch (e) { /* storage off */ }
}
try { const saved = localStorage.getItem('scrubpii-rules'); if (saved) { rulesInput.value = saved; $('my-rules').open = true; } } catch (e) { /* storage off */ }
readRules();
rulesInput.addEventListener('input', () => { readRules(); schedule(); });

input.addEventListener('input', () => { $('count').textContent = `${input.value.length} / 5000`; schedule(); });
document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => { input.value = SAMPLES[+b.dataset.sample]; schedule(0); }));
$('clear').addEventListener('click', () => { input.value = ''; input.focus(); schedule(0); });
threshold.addEventListener('input', () => { $('threshold-value').textContent = `${Math.round(threshold.value * 100)}%`; render(); });
const setView = (v) => { view = v; $('view-highlight').setAttribute('aria-pressed', v === 'highlight'); $('view-redact').setAttribute('aria-pressed', v === 'redact'); render(); };
$('view-highlight').addEventListener('click', () => setView('highlight'));
$('view-redact').addEventListener('click', () => setView('redact'));
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
  mode = b.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-checked', x === b));
  setView('redact');
}));
$('restore-in').addEventListener('input', restore);
$('copy').addEventListener('click', async () => {
  const btn = $('copy');
  try { await navigator.clipboard.writeText(redactedText()); btn.textContent = 'Copied!'; }
  catch { btn.textContent = 'Copy failed'; }
  setTimeout(() => { btn.textContent = 'Copy redacted text'; }, 1600);
});

// "Try me": type an example in so people can watch it get caught live.
let typing = 0;
$('try').addEventListener('click', async () => {
  const me = ++typing, text = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
  document.querySelector('.panes').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setView('highlight');
  input.value = ''; schedule(0);
  const slow = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (let i = 0; i < text.length; i++) {
    if (me !== typing) return;
    input.value = text.slice(0, i + 1); $('count').textContent = `${input.value.length} / 5000`;
    if (/[\s.,]/.test(text[i])) run();
    if (slow) await new Promise((r) => setTimeout(r, 28));
  }
  await run();
  if (me === typing && slow) setTimeout(() => { if (me === typing) setView('redact'); }, 1400);
});
input.addEventListener('focus', () => { typing++; });

// Copy buttons on the "Use it in your own code" snippets.
document.querySelectorAll('.copy-code').forEach((b) => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.nextElementSibling.innerText); b.textContent = 'Copied!'; }
  catch { b.textContent = 'Copy failed'; }
  setTimeout(() => { b.textContent = 'Copy'; }, 1500);
}));

input.value = SAMPLES[0];
render();

(async () => {
  const files = {};
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = [p.loaded, p.total];
      const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
      statusBar.style.width = `${Math.min(100, (l / t) * 100).toFixed(1)}%`;
      statusText.textContent = `Loading the model… ${(l / 1e6).toFixed(0)} of ${(t / 1e6).toFixed(0)} MB (only the first time)`;
    }
  };
  try {
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback });
    model = await AutoModelForTokenClassification.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm', progress_callback });
    id2label = model.config.id2label;
    for (const l of Object.values(id2label)) if (l !== 'O') id2labelTypes[l.replace(/^[BIESLU]-/, '')] = true;
    statusEl.classList.add('ready');
    statusText.textContent = 'Model ready. Running privately in your browser, so nothing you type is sent anywhere.';
    schedule(0);
  } catch (e) {
    console.error(e);
    statusEl.classList.add('error');
    statusText.textContent = "Sorry, the model couldn't load in this browser. Try a recent Chrome, Edge, Firefox or Safari.";
  }
})();

// ---- Head-to-head with Presidio and spaCy (filled in by the benchmark workflow) ----
(async () => {
  try {
    const res = await fetch('benchmarks/compare.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const data = await res.json();
    const sets = Object.keys(data.results);
    const systems = Object.keys(data.results[sets[0]]).filter((n) => !/v2/.test(n));
    const short = (n) => n.replace(/^scrubpii( v3| \d[\d.]*)?$/, 'This model').replace(/ \(.*\)$/, '');
    $('bench-head').innerHTML = `<tr><th>Dataset</th>${systems.map((n) => `<th>${esc(short(n))}</th>`).join('')}</tr>`;
    $('bench-rows').innerHTML = sets.map((ds) => {
      const r = data.results[ds], best = Math.max(...systems.map((n) => r[n]?.f1 ?? 0));
      return `<tr><td>${esc(ds)}</td>${systems.map((n) => r[n] ? `<td>${r[n].f1 === best ? '<strong>' : ''}${r[n].f1.toFixed(2)}${r[n].f1 === best ? '</strong>' : ''}</td>` : '<td class="na">–</td>').join('')}</tr>`;
    }).join('');
    $('bench-lead').innerHTML = `Scored on up to ${data.meta.rows.toLocaleString()} texts from each of ${sets.length} public datasets, against <a href="https://microsoft.github.io/presidio/" target="_blank" rel="noreferrer">Microsoft Presidio</a> and <a href="https://spacy.io/" target="_blank" rel="noreferrer">spaCy</a>. None of these texts were used in training. The finance set comes from a dataset the model never saw any part of; the medical, ticket and log sets are the separate test split of NVIDIA's Nemotron-PII.`;
    $('bench').hidden = false;
  } catch (e) { /* no results yet */ }
})();

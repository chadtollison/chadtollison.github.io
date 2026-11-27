// Live "Redact me" demo. Runs the fine-tuned DistilBERT PII model in the
// visitor's browser with transformers.js, so no server (and no cost) is needed.
// The model files live in models/pii-distilbert-v2 (built by the GitHub Action
// in .github/workflows/build-pii-model.yml).
import { AutoTokenizer, AutoModelForTokenClassification, Tensor, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('models/', location.href).href;
const MODEL_ID = 'pii-distilbert-v2';
const MAX_TOKENS = 510; // 512 minus [CLS] and [SEP]

const SAMPLES = [
  "Hi team, my name is Sarah Johnson and I can't log in. You can reach me at sarah.johnson@example.com or 415-555-0198. My account was billed to the card 4111 1111 1111 1111 last week.",
  "Hi Daniel Okafor, your order #48213 has shipped! We'll text updates to (312) 555-0142. Payment: card 5500 0000 0000 0004. Questions? Reply to daniel.okafor@shopmail.com.",
  "New hire paperwork for Priya Raman: SSN 123-45-6789, personal email priya.raman88@gmail.com, cell 917-555-0133. Her laptop checked in from 192.168.4.27. Note: the test card 1234 5678 9012 3456 on file should be ignored.",
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
};
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
    const m = /^(\d{3})-?(\d{2})-?(\d{4})$/.exec(span.text.trim());
    if (!m || m[1] === '000' || m[1] === '666' || m[1][0] === '9' || m[2] === '00' || m[3] === '0000') return { ok: false, msg: '✗ Not a valid SSN format' };
    return { ok: true, msg: '✓ Valid SSN format' };
  }
  if (isPhone(span.type) && digits.length < 7) return { ok: false, msg: '✗ Too few digits for a phone number' };
  if (/EMAIL/i.test(span.type) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(span.text)) return { ok: false, msg: '✗ Not an email address' };
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

async function classify(text) {
  const ws = words(text);
  const cls = tokenizer.cls_token_id ?? 101, sep = tokenizer.sep_token_id ?? 102;
  // Pack words into windows of at most MAX_TOKENS pieces.
  const windows = []; let cur = [], n = 0;
  for (const w of ws) {
    const ids = pieces(w.text);
    if (!ids.length) continue;
    if (n + ids.length > MAX_TOKENS && cur.length) { windows.push(cur); cur = []; n = 0; }
    cur.push({ ...w, ids: ids.slice(0, MAX_TOKENS) }); n += Math.min(ids.length, MAX_TOKENS);
  }
  if (cur.length) windows.push(cur);

  const labeled = [];
  for (const win of windows) {
    const ids = [cls]; const firstIdx = [];
    for (const w of win) { firstIdx.push(ids.length); ids.push(...w.ids); }
    ids.push(sep);
    const shape = [1, ids.length];
    const { logits } = await model({
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
  // Drop entities swallowed by a grown one, then build the results.
  const kept = [];
  for (const s of spans.sort((a, b) => a.start - b.start)) {
    const prev = kept[kept.length - 1];
    if (prev && s.start < prev.end) { prev.end = Math.max(prev.end, s.end); prev.scores.push(...s.scores); }
    else kept.push(s);
  }
  return kept.map((s) => {
    const span = { type: s.type, start: s.start, end: s.end, text: text.slice(s.start, s.end), score: s.scores.reduce((a, b) => a + b, 0) / s.scores.length, rule: s.rule === 'found', sure: !!s.rule };
    span.check = s.rule === 'found' ? { ok: true, msg: `✓ Caught by the area code rule (${s.area} is a real area code)` }
      : s.rule === 'confirmed' ? { ok: true, msg: `✓ ${s.area} is a real area code` } : validate(span);
    return span;
  });
}

// ---------- rendering ----------
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const redactable = (s) => (s.sure || s.score >= +threshold.value) && !(s.check && !s.check.ok);

function render() {
  const text = input.value;
  if (!text.trim()) { output.innerHTML = '<span class="empty">Your highlighted text will appear here.</span>'; }
  else {
    let html = '', pos = 0;
    for (const s of lastSpans) {
      const info = typeInfo(s.type), live = redactable(s);
      const tip = `${info.name} · ${s.rule ? 'format rule' : Math.round(s.score * 100) + '% confident'}${s.check ? ' · ' + s.check.msg.replace(/^[✓✗] /, '') : ''}${live ? '' : ' · not redacted'}`;
      html += esc(text.slice(pos, s.start));
      html += `<mark class="pii${live ? '' : ' low'}" style="--c:${info.color}" title="${esc(tip)}">${esc(s.text)}<span class="lbl">${esc(info.name.toUpperCase())}${live ? '' : ' ?'}</span></mark>`;
      pos = s.end;
    }
    html += esc(text.slice(pos));
    output.innerHTML = html;
  }
  output.classList.toggle('redacted', view === 'redact');

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

function redactedText() {
  const text = input.value; let out = '', pos = 0;
  for (const s of lastSpans) { if (!redactable(s)) continue; out += text.slice(pos, s.start) + `[${typeInfo(s.type).name.toUpperCase()}]`; pos = s.end; }
  return out + text.slice(pos);
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

// ---------- wiring ----------
input.addEventListener('input', () => { $('count').textContent = `${input.value.length} / 5000`; schedule(); });
document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => { input.value = SAMPLES[+b.dataset.sample]; schedule(0); }));
$('clear').addEventListener('click', () => { input.value = ''; input.focus(); schedule(0); });
threshold.addEventListener('input', () => { $('threshold-value').textContent = `${Math.round(threshold.value * 100)}%`; render(); });
const setView = (v) => { view = v; $('view-highlight').setAttribute('aria-pressed', v === 'highlight'); $('view-redact').setAttribute('aria-pressed', v === 'redact'); render(); };
$('view-highlight').addEventListener('click', () => setView('highlight'));
$('view-redact').addEventListener('click', () => setView('redact'));
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

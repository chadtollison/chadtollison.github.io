// UI for the SAML & SCIM debugger. Everything runs locally; there are no network calls in this file.
import { analyzeSaml, relTime, NAMEID_FORMATS } from './saml.js';
import { analyzeScim, describeAttr } from './scim.js';
import { parseCertificate, shortAlg } from './xmldsig.js';
import { SAML_SAMPLES, SCIM_SAMPLES, SAMPLE_SETTINGS, DEMO_CERT } from './samples.js';
import { renderFlow } from './flow.js';
import { runAttacks } from './attacks.js';
import { fixFor, IDPS } from './fixes.js';
import { buildReport } from './report.js';
import * as idp from './fakeidp.js';
import { decodeInput } from './saml.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : String(c));
  return n;
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------- tabs ----------
const tabs = [...document.querySelectorAll('[role="tab"]')];
function showTab(name, focus = false) {
  for (const t of tabs) {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
    $(`#panel-${t.dataset.tab}`).hidden = !on;
    if (on && focus) t.focus();
  }
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => showTab(t.dataset.tab));
  t.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    showTab(next.dataset.tab, true);
  });
});
showTab(location.hash === '#scim' ? 'scim' : location.hash === '#idp' ? 'idp' : 'saml');
for (const a of document.querySelectorAll('.features a')) {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    showTab(a.getAttribute('href').slice(1));
    const target = a.dataset.jump ? $(`#${a.dataset.jump === 'report' ? 'saml-report' : a.dataset.jump}`) : $('.tabs');
    (target || $('.tabs')).scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

// ---------- fix guides ----------
const prefSel = $('#idp-pref');
prefSel.value = store.get('sso-debugger-idp-pref') || 'all';
prefSel.addEventListener('change', () => { store.set('sso-debugger-idp-pref', prefSel.value); rerender(); });
function fixNode(c) {
  const pref = prefSel.value;
  if (pref === 'none') return null;
  const f = fixFor(c);
  if (!f) return null;
  if (pref !== 'all') return f[pref] ? el('p', { class: 'fix' }, el('strong', { text: `Fix in ${IDPS[pref]}: ` }), f[pref]) : null;
  return el('details', { class: 'fix' }, el('summary', { text: `How to fix in ${Object.keys(f).map((k) => IDPS[k].replace('Microsoft ', '').replace(' Workspace', '')).join(', ')}` }),
    el('dl', {}, Object.entries(f).map(([k, v]) => [el('dt', { text: IDPS[k] }), el('dd', { text: v })])));
}
const fixText = (c) => { const f = fixFor(c); if (!f) return null; const p = prefSel.value; return p !== 'all' && p !== 'none' ? (f[p] || null) : Object.entries(f).map(([k, v]) => `${IDPS[k]}: ${v}`).join(' / '); };

// ---------- shared rendering ----------
const ICON = { error: '✕', warn: '!', ok: '✓', info: 'i' };
const ORDER = { error: 0, warn: 1, ok: 2, info: 3 };
function renderChecks(target, checks) {
  target.replaceChildren();
  const sorted = [...checks].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  for (const c of sorted) {
    target.append(el('li', { class: `check ${c.level}` },
      el('span', { class: 'ico', 'aria-hidden': 'true', text: ICON[c.level] }),
      el('div', {},
        el('div', { class: 'check-title' }, el('span', { class: 'sr-only', text: { error: 'Problem: ', warn: 'Warning: ', ok: 'Pass: ', info: 'Note: ' }[c.level] }), c.title, el('small', { text: c.area })),
        c.detail ? el('p', { text: c.detail }) : null,
        fixNode(c))));
  }
}
function renderVerdict(target, checks, subtitle) {
  const errors = checks.filter((c) => c.level === 'error').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  const passes = checks.filter((c) => c.level === 'ok').length;
  target.className = `verdict ${errors ? 'bad' : warns ? 'meh' : 'good'}`;
  const headline = errors ? `${errors} problem${errors === 1 ? '' : 's'} found` : warns ? 'Works, with warnings' : 'Looks good';
  const counts = [errors && `${errors} problem${errors === 1 ? '' : 's'}`, warns && `${warns} warning${warns === 1 ? '' : 's'}`, passes && `${passes} passed`].filter(Boolean).join(' · ');
  target.replaceChildren(
    el('span', { class: 'verdict-ico', 'aria-hidden': 'true', text: errors ? '✕' : warns ? '!' : '✓' }),
    el('div', {}, el('strong', { text: headline }), el('span', { text: [counts, subtitle].filter(Boolean).join(' · ') })),
  );
  target.hidden = false;
}
function showError(target, message) {
  target.className = 'verdict bad';
  target.replaceChildren(el('span', { class: 'verdict-ico', 'aria-hidden': 'true', text: '✕' }), el('div', {}, el('strong', { text: 'Could not read that' }), el('span', { text: message })));
  target.hidden = false;
}
const kv = (rows) => el('dl', { class: 'kv' }, rows.filter((r) => r[1] !== undefined && r[1] !== null && r[1] !== '').map(([k, v, hint]) => [
  el('dt', { text: k }), el('dd', {}, v instanceof Node ? v : el('span', { class: 'mono', text: String(v) }), hint ? el('small', { text: hint }) : null),
]));
const card = (title, ...body) => el('section', { class: 'rcard' }, el('h3', { text: title }), ...body);

function copyButton(getText, label = 'Copy') {
  const b = el('button', { type: 'button', class: 'mini-btn', text: label });
  b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(getText()); b.textContent = 'Copied'; } catch { b.textContent = 'Copy failed'; }
    setTimeout(() => { b.textContent = label; }, 1400);
  });
  return b;
}

// ---------- XML pretty printer ----------
const LONG = 90;
function prettyXml(node, depth = 0, out = el('code')) {
  const pad = '  '.repeat(depth);
  if (node.nodeType === 9) { for (const c of node.childNodes) prettyXml(c, 0, out); return out; }
  if (node.nodeType === 8) { out.append(pad, el('span', { class: 'x-com', text: `<!--${node.data}-->` }), '\n'); return out; }
  if (node.nodeType === 7) { out.append(pad, el('span', { class: 'x-com', text: `<?${node.target} ${node.data}?>` }), '\n'); return out; }
  if (node.nodeType !== 1) return out;
  const open = [el('span', { class: 'x-tag', text: `<${node.nodeName}` })];
  for (const a of node.attributes) {
    open.push(' ', el('span', { class: a.name.startsWith('xmlns') ? 'x-ns' : 'x-attr', text: a.name }), '=', el('span', { class: 'x-val', text: `"${a.value}"` }));
  }
  const kids = [...node.childNodes].filter((c) => !(c.nodeType === 3 && !c.data.trim()));
  const onlyText = kids.length > 0 && kids.every((c) => c.nodeType === 3 || c.nodeType === 4 || c.nodeType === 8);
  if (!kids.length) { out.append(pad, ...open, el('span', { class: 'x-tag', text: '/>' }), '\n'); return out; }
  if (onlyText) {
    out.append(pad, ...open, el('span', { class: 'x-tag', text: '>' }));
    for (const c of kids) {
      if (c.nodeType === 8) { out.append(el('span', { class: 'x-com x-alert', text: `<!--${c.data}-->` })); continue; }
      const t = c.data.trim();
      if (t.length > LONG && /^[A-Za-z0-9+/=\s]+$/.test(t)) {
        const s = el('span', { class: 'x-text x-long', title: 'Click to show all', tabindex: '0', role: 'button', text: `${t.slice(0, 48)}… (${t.replace(/\s/g, '').length.toLocaleString()} chars)` });
        const expand = () => { s.textContent = t; s.classList.remove('x-long'); s.removeAttribute('role'); };
        s.addEventListener('click', expand, { once: true });
        s.addEventListener('keydown', (e) => { if (e.key === 'Enter') expand(); }, { once: true });
        out.append(s);
      } else out.append(el('span', { class: 'x-text', text: c.data.trim() }));
    }
    out.append(el('span', { class: 'x-tag', text: `</${node.nodeName}>` }), '\n');
    return out;
  }
  out.append(pad, ...open, el('span', { class: 'x-tag', text: '>' }), '\n');
  for (const c of kids) {
    if (c.nodeType === 3 || c.nodeType === 4) out.append(pad, '  ', el('span', { class: 'x-text', text: c.data.trim() }), '\n');
    else prettyXml(c, depth + 1, out);
  }
  out.append(pad, el('span', { class: 'x-tag', text: `</${node.nodeName}>` }), '\n');
  return out;
}

// ---------- SAML ----------
const samlIn = $('#saml-input');
const samlOut = $('#saml-results');
const samlVerdict = $('#saml-verdict');
const settingIds = ['spEntityId', 'acsUrl', 'idpEntityId', 'idpCert', 'requiredAttrs', 'skewMinutes', 'requestId'];
const settingEl = (k) => $(`#set-${k}`);
function readSettings() {
  const s = {};
  for (const k of settingIds) s[k] = settingEl(k).value.trim();
  s.skewMinutes = Math.max(0, Math.min(60, Number(s.skewMinutes) || 0));
  return s;
}
function writeSettings(s) { for (const k of settingIds) if (s[k] !== undefined) settingEl(k).value = s[k]; }
writeSettings({ skewMinutes: 3, ...(store.get('sso-debugger-settings') || {}) });
for (const k of settingIds) {
  settingEl(k).addEventListener('input', () => { store.set('sso-debugger-settings', readSettings()); runSaml(); });
}

function timeline(r) {
  const pts = [];
  const add = (label, v, cls) => { const d = v && new Date(v); if (d && !Number.isNaN(d.getTime())) pts.push({ label, d, cls }); };
  add('Issued', r.assertionInfo?.issueInstant || r.responseInfo?.issueInstant, 'issued');
  add('Valid from', r.conditions?.notBefore, 'start');
  add('Use by', r.confirmation?.notOnOrAfter, 'useby');
  add('Valid until', r.conditions?.notOnOrAfter, 'end');
  if (!pts.length) return null;
  const now = r.now;
  const all = [...pts.map((p) => p.d.getTime()), now.getTime()];
  let lo = Math.min(...all), hi = Math.max(...all);
  const span = Math.max(hi - lo, 60000);
  lo -= span * 0.06; hi += span * 0.06;
  const pos = (d) => `${(((d.getTime ? d.getTime() : d) - lo) / (hi - lo)) * 100}%`;
  const track = el('div', { class: 'tl-track' });
  const start = r.conditions?.notBefore ? new Date(r.conditions.notBefore) : pts[0].d;
  const end = r.conditions?.notOnOrAfter ? new Date(r.conditions.notOnOrAfter) : null;
  if (end && !Number.isNaN(end.getTime())) {
    const bar = el('i', { class: 'tl-window' });
    bar.style.left = pos(start); bar.style.width = `calc(${pos(end)} - ${pos(start)})`;
    track.append(bar);
  }
  const useBy = r.confirmation?.notOnOrAfter ? new Date(r.confirmation.notOnOrAfter) : null;
  if (useBy && !Number.isNaN(useBy.getTime())) {
    const s2 = pts.find((p) => p.cls === 'issued')?.d || start;
    const bar = el('i', { class: 'tl-bearer' });
    bar.style.left = pos(s2); bar.style.width = `calc(${pos(useBy)} - ${pos(s2)})`;
    track.append(bar);
  }
  const inside = (!end || now < end) && (!useBy || now < useBy) && now >= start - (r.settings.skewMinutes || 0) * 60000;
  const nowMark = el('b', { class: `tl-now ${inside ? 'in' : 'out'}`, title: 'Now' }); nowMark.style.left = pos(now);
  track.append(nowMark);
  const labels = el('ul', { class: 'tl-legend' },
    el('li', { class: 'now' }, el('strong', { text: 'Now' }), el('span', { text: inside ? 'inside the window' : 'outside the window' })),
    ...pts.map((p) => el('li', { class: p.cls }, el('strong', { text: p.label }), el('span', { text: `${p.d.toISOString().replace('.000', '').replace('T', ' ')} (${relTime(p.d, now)})` }))));
  return el('div', { class: 'timeline' }, track, labels);
}

function certCard(c) {
  const now = new Date();
  return kv([
    ['Subject', c.subject], ['Issued by', c.issuer === c.subject ? 'Itself (self-signed, which is normal for SAML)' : c.issuer],
    ['Valid', `${c.notBefore.toISOString().slice(0, 10)} to ${c.notAfter.toISOString().slice(0, 10)}`, c.notAfter < now ? `Expired ${relTime(c.notAfter, now)}` : `Expires ${relTime(c.notAfter, now)}`],
    ['Key', `${c.keyType} ${c.keyBits}-bit${c.curve ? ` (${c.curve})` : ''}`],
    ['SHA-1 thumbprint', el('span', { class: 'mono fp' }, c.sha1, ' ', copyButton(() => c.sha1.replace(/:/g, '')))],
    ['SHA-256 thumbprint', el('span', { class: 'mono fp' }, c.sha256, ' ', copyButton(() => c.sha256))],
  ]);
}

let samlRun = 0;
let lastSaml = null, lastScim = null;
function rerender() { if (lastSaml) runSaml(); if (lastScim) runScim(); }
async function runSaml() {
  const raw = samlIn.value;
  const run = ++samlRun;
  if (!raw.trim()) { samlOut.hidden = true; samlVerdict.hidden = true; return; }
  let r;
  try { r = await analyzeSaml(raw, readSettings()); } catch (e) {
    if (run !== samlRun) return;
    samlOut.hidden = true; lastSaml = null; showError(samlVerdict, e.message); return;
  }
  if (run !== samlRun) return;
  const kindLabel = { Response: 'SAML Response', Assertion: 'SAML Assertion', AuthnRequest: 'AuthnRequest', LogoutRequest: 'LogoutRequest', LogoutResponse: 'LogoutResponse' }[r.kind] || `<${r.root?.nodeName}>`;
  renderVerdict(samlVerdict, r.checks, kindLabel);
  lastSaml = { r, raw };
  $('#saml-flow').replaceChildren(renderFlow(r, el) || '');
  $('#attacks').hidden = !(r.assertion && r.response && r.kind === 'Response');
  $('#attacks-out').replaceChildren();
  renderChecks($('#saml-checks'), r.checks);
  $('#saml-steps').replaceChildren(...[...r.decoded.steps.map((s) => el('li', { text: s })),
    r.decoded.binding ? el('li', { text: `Binding: ${r.decoded.binding}` }) : null,
    r.decoded.relayState ? el('li', {}, 'RelayState: ', el('span', { class: 'mono', text: r.decoded.relayState })) : null].filter(Boolean));

  const cards = $('#saml-cards');
  cards.replaceChildren();
  if (r.subject) {
    const [label, meaning] = NAMEID_FORMATS[r.subject.format] || ['Custom format', r.subject.format];
    cards.append(card('Who signed in', kv([['NameID', r.subject.nameId || '(empty)'], ['Format', label, meaning], ['Session index', r.authn?.sessionIndex],
      ['Signed in with', r.authn?.classLabel || (r.authn?.classRef ? shortAlg(r.authn.classRef) : undefined)], ['Signed in at', r.authn?.instant]])));
  }
  if (r.requestInfo) {
    const q = r.requestInfo;
    cards.append(card(`What the ${r.kind} asks for`, kv([['From (Issuer)', q.issuer, 'Your SP entity ID'], ['To (Destination)', q.destination], ['Send response to', q.acs, 'Must be a registered Reply / ACS URL'],
      ['Binding', q.binding && shortAlg(q.binding)], ['NameID format', q.nameIdPolicy && (NAMEID_FORMATS[q.nameIdPolicy] || [q.nameIdPolicy])[0]], ['Create users', q.allowCreate],
      ['Force sign-in', q.forceAuthn], ['Passive', q.isPassive], ['NameID', q.nameId], ['Session index', q.sessionIndex], ['Request ID', q.id, 'The response will say InResponseTo this'], ['Issued', q.issueInstant]])));
  }
  if (r.assertionInfo || r.responseInfo) {
    cards.append(card('From and to', kv([
      ['Issuer (IdP)', r.assertionInfo?.issuer || r.responseInfo?.issuer, 'Must equal the IdP entity ID your app trusts'],
      ['Audience (your app)', r.conditions?.audiences?.join(', '), 'Must equal your SP entity ID'],
      ['Destination', r.responseInfo?.destination, 'Must equal your ACS URL'],
      ['Recipient', r.confirmation?.recipient, 'Must equal your ACS URL'],
      ['In response to', r.responseInfo?.inResponseTo || (r.response ? 'Nothing: IdP-initiated sign-in' : undefined)],
      ['Status', r.status && [r.status.top, r.status.sub].filter(Boolean).join(' / '), r.status?.message],
    ])));
  }
  const tl = r.conditions || r.confirmation ? timeline(r) : null;
  if (tl) cards.append(card('When it is valid', tl));

  if (r.signatures?.length) {
    const body = el('div', { class: 'sigs' });
    for (const v of r.signatures) {
      const state = v.digestOk && v.signatureOk ? 'ok' : v.digestOk === false || v.signatureOk === false ? 'bad' : 'unk';
      body.append(el('div', { class: `sig ${state}` },
        el('strong', { text: `${v.where}: ${state === 'ok' ? 'valid' : state === 'bad' ? 'invalid' : 'not checked'}` }),
        kv([['Algorithm', `${shortAlg(v.algorithms?.signature)} / digest ${shortAlg(v.algorithms?.digest)}`], ['Canonicalization', shortAlg(v.algorithms?.c14n)], ['Signs', v.reference || '(whole document)'],
          ['Content unchanged', v.digestOk === null ? 'not checked' : v.digestOk ? 'yes' : 'no'], ['Signature matches key', v.signatureOk === null ? 'not checked' : v.signatureOk ? 'yes' : 'no']])));
    }
    cards.append(card('Signatures', body));
  }
  for (const c of r.certs || []) cards.append(card('Signing certificate', certCard(c)));

  const attrsWrap = $('#saml-attrs');
  if (r.attributes?.length) {
    attrsWrap.hidden = false;
    $('#saml-attr-rows').replaceChildren(...r.attributes.map((a) => el('tr', {},
      el('td', {}, el('span', { class: 'mono', text: a.friendly || a.name }), a.friendly ? el('small', { class: 'mono', text: a.name }) : null, a.meaning ? el('small', { text: a.meaning }) : null),
      el('td', {}, a.values.length ? el('ul', { class: 'vals' }, a.values.map((v) => el('li', { class: v.text ? 'mono' : 'mono empty', text: v.text || (v.nil ? '(nil)' : '(empty)') }))) : el('span', { class: 'empty', text: '(no values)' })))));
  } else attrsWrap.hidden = true;

  $('#saml-xml').replaceChildren(prettyXml(r.doc));
  $('#saml-xml-copy').replaceChildren(copyButton(() => r.decoded.xml, 'Copy XML'));
  samlOut.hidden = false;
}
const runSamlSoon = debounce(runSaml, 220);
samlIn.addEventListener('input', () => { $('#saml-note').textContent = ''; runSamlSoon(); });

let demoPrint = null;
const samlSamples = $('#saml-samples');
for (const s of SAML_SAMPLES) {
  samlSamples.append(el('button', {
    type: 'button', 'data-sample': s.id, text: s.label,
    onclick: async () => {
      demoPrint = demoPrint || (await parseCertificate(DEMO_CERT)).sha256;
      writeSettings({ ...SAMPLE_SETTINGS, idpCert: demoPrint, requestId: '' });
      samlIn.value = await s.make();
      $('#saml-note').textContent = `${s.note} The settings below were filled in for this example’s app, including the demo IdP’s certificate thumbprint.`;
      for (const b of samlSamples.children) b.setAttribute('aria-pressed', b.dataset.sample === s.id);
      runSaml();
    },
  }));
}

// ---------- SCIM ----------
const scimIn = $('#scim-input');
const scimOut = $('#scim-results');
const scimVerdict = $('#scim-verdict');
const dirSel = $('#scim-direction');
function runScim() {
  const raw = scimIn.value;
  if (!raw.trim()) { scimOut.hidden = true; scimVerdict.hidden = true; return; }
  let r;
  try { r = analyzeScim(raw, { direction: dirSel.value }); } catch (e) { scimOut.hidden = true; lastScim = null; showError(scimVerdict, e.message); return; }
  lastScim = { r, raw };
  const what = [r.http.method && `${r.http.method} ${r.http.path.replace(/\?.*$/, '')}`, r.http.status && `HTTP ${r.http.status}`, r.kind, r.direction && (r.direction === 'request' ? 'sent to your app' : 'sent by your app')].filter(Boolean).join(' · ');
  renderVerdict(scimVerdict, r.checks, what);
  renderChecks($('#scim-checks'), r.checks);
  const cards = $('#scim-cards');
  cards.replaceChildren();
  const rows = r.summary.filter((x) => x[1] !== undefined && x[1] !== null && x[1] !== '');
  if (rows.length) cards.append(card(r.kind === 'Error' ? 'What the error says' : r.kind === 'ListResponse' ? 'The page of results' : r.kind === 'Query' ? 'The query' : `What your app receives`, kv(rows)));
  if (r.operations.length) cards.append(card('What this PATCH does, in plain English', el('ol', { class: 'ops' }, r.operations.map((o) => el('li', { text: o })))));
  if (r.json && (r.kind === 'User' || r.kind === 'Group')) {
    const body = el('tbody');
    for (const [k, v] of Object.entries(r.json)) {
      if (k === 'schemas') continue;
      const desc = /^urn:/i.test(k) ? (/enterprise/i.test(k) ? 'Enterprise extension: HR data such as department, employee number and manager.' : 'A custom extension.') : describeAttr(r.kind, k);
      body.append(el('tr', {}, el('td', { class: 'mono', text: /^urn:/i.test(k) ? k.replace(/^.*:extension:/, 'extension:') : k }), el('td', { text: desc || 'Not a standard attribute.' })));
    }
    cards.append(card('Attribute guide', el('table', { class: 'guide' }, body)));
  }
  scimOut.hidden = false;
}
const runScimSoon = debounce(runScim, 200);
scimIn.addEventListener('input', () => { $('#scim-note').textContent = ''; runScimSoon(); });
dirSel.addEventListener('change', runScim);
const scimSamples = $('#scim-samples');
for (const s of SCIM_SAMPLES) {
  scimSamples.append(el('button', {
    type: 'button', 'data-sample': s.id, text: s.label,
    onclick: () => {
      scimIn.value = s.text; $('#scim-note').textContent = s.note; dirSel.value = 'auto';
      for (const b of scimSamples.children) b.setAttribute('aria-pressed', b.dataset.sample === s.id);
      runScim();
    },
  }));
}

// ---------- files, drag and drop, clear ----------
function wireFile(input, textarea, run) {
  const load = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alertInline(textarea, 'That file is over 2 MB, which is far bigger than any SAML or SCIM message.'); return; }
    textarea.value = await file.text();
    run();
  };
  input.addEventListener('change', () => load(input.files[0]));
  textarea.addEventListener('dragover', (e) => { e.preventDefault(); textarea.classList.add('drag'); });
  textarea.addEventListener('dragleave', () => textarea.classList.remove('drag'));
  textarea.addEventListener('drop', (e) => { e.preventDefault(); textarea.classList.remove('drag'); load(e.dataTransfer.files[0]); });
}
function alertInline(textarea, msg) { const n = textarea.closest('.pane').querySelector('.pane-note'); if (n) n.textContent = msg; }
wireFile($('#saml-file'), samlIn, runSaml);
wireFile($('#scim-file'), scimIn, runScim);
$('#saml-clear').addEventListener('click', () => { samlIn.value = ''; $('#saml-note').textContent = ''; runSaml(); samlIn.focus(); });
$('#scim-clear').addEventListener('click', () => { scimIn.value = ''; $('#scim-note').textContent = ''; runScim(); scimIn.focus(); });
$('#settings-reset').addEventListener('click', () => { writeSettings({ spEntityId: '', acsUrl: '', idpEntityId: '', idpCert: '', requiredAttrs: '', requestId: '', skewMinutes: 3 }); store.set('sso-debugger-settings', readSettings()); runSaml(); });

// Start with working examples so the page is never empty (unless the visitor saved their own settings).
scimSamples.querySelector('[data-sample="deactivate"]').click();
if (!store.get('sso-debugger-settings')) samlSamples.querySelector('[data-sample="valid"]').click();

// ---------- attack playground ----------
$('#attacks-run').addEventListener('click', async () => {
  if (!lastSaml) return;
  const btn = $('#attacks-run');
  btn.disabled = true; btn.textContent = 'Attacking…';
  const out = $('#attacks-out');
  try {
    const results = await runAttacks(lastSaml.r.decoded.xml, readSettings());
    const ran = results.filter((x) => !x.skipped);
    const caught = ran.filter((x) => x.caught).length;
    out.replaceChildren(
      el('p', { class: `score ${caught === ran.length ? 'good' : 'bad'}` }, el('strong', { text: `${caught} of ${ran.length} attacks caught` }),
        caught === ran.length ? ' Every forged or replayed version was rejected.' : ' The ones not caught show what your app must check on its own.'),
      el('ol', { class: 'attack-list' }, results.map((x) => el('li', { class: x.skipped ? 'skipped' : x.caught ? 'caught' : 'missed' },
        el('div', { class: 'atk-top' },
          el('span', { class: 'atk-badge', text: x.skipped ? 'Skipped' : x.caught ? 'Caught' : 'Not caught' }),
          el('strong', { text: x.atk.name })),
        el('p', { text: x.atk.what }),
        x.skipped ? el('p', { class: 'atk-why', text: x.error || 'This response has nothing this attack can use.' })
          : x.caught ? el('p', { class: 'atk-why' }, 'Caught by: ', el('em', { text: x.errors[0].title }), x.errors.length > 1 ? ` (and ${x.errors.length - 1} more)` : '')
            : el('p', { class: 'atk-why' }, x.atk.id === 'resign' ? 'Not caught, because no trusted IdP certificate is set. Paste your IdP’s certificate or thumbprint in the settings and run it again.' : x.atk.id === 'otherapp' ? 'Not caught, because the assertion has no audience to compare.' : 'Not caught.'),
        x.scenario ? el('p', { class: 'atk-why', text: x.scenario }) : null,
        x.skipped || x.atk.id === 'replay' ? null : el('button', {
          type: 'button', class: 'mini-btn', text: 'Open in the debugger',
          onclick: () => {
            samlIn.value = x.xml;
            if (x.atk.id === 'otherapp') writeSettings({ spEntityId: x.settings.spEntityId, acsUrl: x.settings.acsUrl });
            $('#saml-note').textContent = `Attacked version: ${x.atk.name}.`;
            for (const b of samlSamples.children) b.removeAttribute('aria-pressed');
            runSaml().then(() => samlVerdict.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          },
        })))));
  } catch (e) {
    out.replaceChildren(el('p', { class: 'atk-why', text: `The attacks could not run: ${e.message}` }));
  } finally { btn.disabled = false; btn.textContent = 'Attack it again'; }
});

// ---------- shareable report ----------
const dlg = $('#report-dialog');
let reportFor = null;
function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function makeReport() {
  const src = reportFor === 'saml' ? lastSaml : lastScim;
  if (!src) return;
  const status = $('#report-status');
  status.textContent = 'Redacting…';
  try {
    const { text, hidden, total } = await buildReport({ tool: reportFor, result: src.r, raw: src.raw, fixFor: fixText });
    $('#report-text').value = text;
    status.textContent = total ? `Hidden ${total} personal value${total === 1 ? '' : 's'}: ${Object.entries(hidden).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')}. Read it over before you share it.` : 'No personal data found. Read it over before you share it.';
  } catch (e) {
    status.textContent = `The report could not be made: ${e.message}`;
  }
}
for (const which of ['saml', 'scim']) {
  $(`#${which}-report`).addEventListener('click', () => { reportFor = which; $('#report-text').value = ''; dlg.showModal(); makeReport(); });
}
$('#report-close').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
$('#report-copy').addEventListener('click', async () => {
  const b = $('#report-copy');
  try { await navigator.clipboard.writeText($('#report-text').value); b.textContent = 'Copied'; } catch { $('#report-text').select(); b.textContent = 'Press Ctrl+C'; }
  setTimeout(() => { b.textContent = 'Copy report'; }, 1600);
});
$('#report-download').addEventListener('click', () => download(`${reportFor}-debug-report.md`, $('#report-text').value, 'text/markdown'));

// ---------- test IdP ----------
const idpField = (k) => $(`#idp-${k}`);
let lastSigned = null;
async function showIdpInfo() {
  const box = $('#idp-info');
  try {
    const me = await idp.getIdp();
    box.replaceChildren(kv([
      ['Entity ID (issuer)', me.entityId], ['Sign-in URL', `${location.origin}${location.pathname}`],
      ['Certificate', me.info.subject.replace(/^CN=/, '').replace(/, O=.*/, ''), `Valid until ${me.info.notAfter.toISOString().slice(0, 10)}`],
      ['SHA-256 thumbprint', el('span', { class: 'mono fp' }, me.info.sha256, ' ', copyButton(() => me.info.sha256))],
      ['SHA-1 thumbprint', el('span', { class: 'mono fp' }, me.info.sha1, ' ', copyButton(() => me.info.sha1.replace(/:/g, '')))],
    ]));
  } catch (e) { box.replaceChildren(el('p', { class: 'pane-note', text: `Could not make a key in this browser: ${e.message}` })); }
}
let idpShown = false;
const ensureIdp = () => { if (!idpShown) { idpShown = true; showIdpInfo(); } };
tabs.find((t) => t.dataset.tab === 'idp').addEventListener('click', ensureIdp);
if (location.hash === '#idp') ensureIdp();
for (const k of ['sp', 'acs']) {
  const saved = store.get('sso-debugger-idp-form') || {};
  if (saved[k]) idpField(k).value = saved[k];
  idpField(k).addEventListener('input', () => { const f = store.get('sso-debugger-idp-form') || {}; f[k] = idpField(k).value.trim(); store.set('sso-debugger-idp-form', f); });
}
$('#idp-generate').addEventListener('click', async () => {
  const sp = idpField('sp').value.trim(), acs = idpField('acs').value.trim();
  if (!sp || !acs) { (sp ? idpField('acs') : idpField('sp')).focus(); $('#idp-out').value = 'Fill in your SP entity ID and ACS URL first.'; return; }
  const res = await idp.buildResponse({
    spEntityId: sp, acsUrl: acs, nameId: idpField('nameid').value.trim(), nameIdFormat: idp.NAMEID[idpField('format').value],
    attrs: idp.parseAttrLines(idpField('attrs').value), minutes: Math.max(1, Math.min(1440, +idpField('minutes').value || 5)),
    sign: idpField('signmode').value, inResponseTo: idpField('irt').value.trim(),
  });
  lastSigned = res;
  $('#idp-out').value = res.b64;
  $('#idp-check').disabled = false; $('#idp-post').disabled = false;
  ensureIdp();
});
$('#idp-check').addEventListener('click', async () => {
  if (!lastSigned) return;
  const me = await idp.getIdp();
  writeSettings({ spEntityId: idpField('sp').value.trim(), acsUrl: idpField('acs').value.trim(), idpEntityId: me.entityId, idpCert: me.info.sha256, requestId: idpField('irt').value.trim() });
  samlIn.value = lastSigned.b64;
  $('#saml-note').textContent = 'Signed by your test IdP. The settings were filled in from the Test IdP tab.';
  for (const b of samlSamples.children) b.removeAttribute('aria-pressed');
  showTab('saml'); runSaml(); $('.tabs').scrollIntoView({ behavior: 'smooth' });
});
$('#idp-post').addEventListener('click', () => { if (lastSigned) idp.postToAcs(idpField('acs').value.trim(), lastSigned.b64, idpField('relay').value.trim(), incomingRequest ? '_self' : '_blank'); });
$('#idp-cert').addEventListener('click', async () => { const me = await idp.getIdp(); download('test-idp-certificate.pem', idp.pem(me.cert), 'application/x-pem-file'); });
$('#idp-meta').addEventListener('click', async () => download('test-idp-metadata.xml', await idp.metadata(`${location.origin}${location.pathname}`), 'application/samlmetadata+xml'));
$('#idp-rotate').addEventListener('click', async () => { await idp.getIdp({ fresh: true }); showIdpInfo(); $('#idp-out').value = ''; lastSigned = null; $('#idp-check').disabled = true; $('#idp-post').disabled = true; });

// SCIM test users
let lastGen = null;
$('#scimgen-go').addEventListener('click', () => {
  const n = Math.max(1, Math.min(50, +$('#scimgen-count').value || 1));
  const mode = $('#scimgen-mode').value;
  lastGen = idp.scimOutput(idp.fakeUsers(n, $('#scimgen-domain').value.trim().replace(/^@/, '') || 'example.com'), mode);
  $('#scimgen-out').value = lastGen;
  $('#scimgen-check').disabled = mode === 'curl';
});
$('#scimgen-check').addEventListener('click', () => {
  if (!lastGen) return;
  scimIn.value = $('#scimgen-mode').value === 'list' ? `HTTP/1.1 200 OK\nContent-Type: application/scim+json\n\n${lastGen}` : lastGen;
  $('#scim-note').textContent = 'Generated by the Test IdP tab.';
  for (const b of scimSamples.children) b.removeAttribute('aria-pressed');
  dirSel.value = 'auto'; showTab('scim'); runScim(); $('.tabs').scrollIntoView({ behavior: 'smooth' });
});

// SP-initiated sign-in: an app whose IdP sign-in URL is this page redirects here with ?SAMLRequest=...
let incomingRequest = null;
(async () => {
  const q = new URLSearchParams(location.search);
  if (!q.has('SAMLRequest')) return;
  const url = location.href;
  history.replaceState(null, '', `${location.pathname}#idp`); // keep the request out of the address bar and history
  try {
    const dec = await decodeInput(url);
    const doc = new DOMParser().parseFromString(dec.xml, 'application/xml');
    const req = doc.documentElement;
    if (req.localName !== 'AuthnRequest') throw new Error(`expected an AuthnRequest, got ${req.localName}`);
    const issuer = [...req.childNodes].find((n) => n.nodeType === 1 && n.localName === 'Issuer')?.textContent.trim() || '';
    incomingRequest = { id: req.getAttribute('ID'), acs: req.getAttribute('AssertionConsumerServiceURL'), issuer };
    if (issuer) idpField('sp').value = issuer;
    if (incomingRequest.acs) idpField('acs').value = incomingRequest.acs;
    idpField('irt').value = incomingRequest.id || '';
    idpField('relay').value = dec.relayState || '';
    showTab('idp'); ensureIdp();
    const banner = $('#idp-incoming');
    banner.replaceChildren(el('span', { class: 'verdict-ico', 'aria-hidden': 'true', text: '→' }),
      el('div', {}, el('strong', { text: `${issuer || 'An app'} asked this test IdP to sign someone in` }),
        el('span', { text: `Request ${incomingRequest.id}. Check who to sign in as, press Sign response, then Send it to my ACS URL.${incomingRequest.acs ? '' : ' The request has no ACS URL, so type yours.'}` })));
    banner.hidden = false;
    $('#idp-post').textContent = 'Send it to my ACS URL';
  } catch (e) {
    showTab('idp');
    const banner = $('#idp-incoming');
    banner.className = 'verdict bad';
    banner.replaceChildren(el('span', { class: 'verdict-ico', 'aria-hidden': 'true', text: '✕' }), el('div', {}, el('strong', { text: 'Got a sign-in request but could not read it' }), el('span', { text: e.message })));
    banner.hidden = false;
  }
})();

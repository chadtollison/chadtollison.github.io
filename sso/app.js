// UI for the SAML & SCIM debugger. Everything runs locally; there are no network calls in this file.
import { analyzeSaml, relTime, NAMEID_FORMATS } from './saml.js';
import { analyzeScim, describeAttr } from './scim.js';
import { parseCertificate, shortAlg } from './xmldsig.js';
import { SAML_SAMPLES, SCIM_SAMPLES, SAMPLE_SETTINGS, DEMO_CERT } from './samples.js';

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
showTab(location.hash === '#scim' ? 'scim' : 'saml');

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
        c.detail ? el('p', { text: c.detail }) : null)));
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
async function runSaml() {
  const raw = samlIn.value;
  const run = ++samlRun;
  if (!raw.trim()) { samlOut.hidden = true; samlVerdict.hidden = true; return; }
  let r;
  try { r = await analyzeSaml(raw, readSettings()); } catch (e) {
    if (run !== samlRun) return;
    samlOut.hidden = true; showError(samlVerdict, e.message); return;
  }
  if (run !== samlRun) return;
  const kindLabel = { Response: 'SAML Response', Assertion: 'SAML Assertion', AuthnRequest: 'AuthnRequest', LogoutRequest: 'LogoutRequest', LogoutResponse: 'LogoutResponse' }[r.kind] || `<${r.root?.nodeName}>`;
  renderVerdict(samlVerdict, r.checks, kindLabel);
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
  try { r = analyzeScim(raw, { direction: dirSel.value }); } catch (e) { scimOut.hidden = true; showError(scimVerdict, e.message); return; }
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

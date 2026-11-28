// Animated sign-in flow: a sequence diagram of the browser, your app and the IdP,
// with each step lit green, amber or red from the checks, so you can see where sign-in broke.

const LANES = ['Browser', 'Your app', 'Identity provider'];
const COL = { browser: 1, app: 2, idp: 3 };

const isTime = (c) => /expired|not valid yet|in the future|time window|NotOnOrAfter|NotBefore|can be used until|validity window|session ended|issued .* ago|time zone|not a valid date/i.test(c.title);
const isRecipient = (c) => /Recipient/.test(c.title);

function stepsForResponse(r) {
  const checks = r.checks;
  const pick = (fn) => checks.filter(fn);
  const spInitiated = !!r.responseInfo?.inResponseTo;
  return [
    spInitiated
      ? { from: 'browser', to: 'app', label: 'User opens your app', checks: [] }
      : { from: 'browser', to: 'idp', label: 'User starts at the IdP’s app portal', checks: [], note: 'IdP-initiated: no AuthnRequest' },
    spInitiated
      ? { from: 'app', to: 'idp', label: 'Your app sends an AuthnRequest', via: 'redirect', checks: pick((c) => c.area === 'Request'), note: `Request ${r.responseInfo.inResponseTo.slice(0, 14)}…` }
      : null,
    { at: 'idp', label: 'IdP signs the user in', checks: pick((c) => c.area === 'Status' || c.area === 'Authentication') },
    { from: 'idp', to: 'app', label: 'IdP posts the signed response to your ACS URL', via: 'form POST', checks: pick((c) => c.area === 'Destination' || isRecipient(c) || (c.area === 'Request' && !spInitiated)) },
    { at: 'app', label: 'Your app verifies the signature', checks: pick((c) => ['Signature', 'Certificate', 'Security'].includes(c.area)) },
    { at: 'app', label: 'Checks it is from your IdP and meant for your app', checks: pick((c) => c.area === 'Issuer' || c.area === 'Audience') },
    { at: 'app', label: 'Checks the time window', checks: pick((c) => (c.area === 'Conditions' || c.area === 'Message' || c.area === 'Subject') && isTime(c)) },
    { at: 'app', label: 'Finds the user and their attributes', checks: pick((c) => (c.area === 'Subject' && !isTime(c) && !isRecipient(c)) || c.area === 'Attributes' || c.area === 'Assertion') },
    { from: 'app', to: 'browser', label: 'User is signed in', final: true, checks: [] },
  ].filter(Boolean);
}

function stepsForRequest(r) {
  const pick = (fn) => r.checks.filter(fn);
  return [
    { from: 'browser', to: 'app', label: 'User opens your app', checks: [] },
    { at: 'app', label: `Your app builds the ${r.kind}`, checks: pick((c) => ['Message', 'Issuer', 'Signature', 'Subject', 'Authentication', 'Request'].includes(c.area)) },
    { from: 'app', to: 'idp', label: `Sends it to the IdP`, via: r.decoded.binding === 'HTTP-POST' ? 'form POST' : 'redirect', checks: pick((c) => c.area === 'Destination') },
    { at: 'idp', label: 'IdP signs the user in and replies', pending: true, checks: [], note: 'Paste the IdP’s response to see the rest' },
  ];
}

const levelOf = (checks) => (checks.some((c) => c.level === 'error') ? 'bad' : checks.some((c) => c.level === 'warn') ? 'warn' : 'ok');

/** Build the flow element for a SAML analysis result. Returns null for messages it cannot draw. */
export function renderFlow(r, el) {
  const isResponse = r.kind === 'Response' || r.kind === 'Assertion' || (r.assertion && r.kind !== 'AuthnRequest');
  const isRequest = /Request$/.test(r.kind) && !r.assertion;
  if (!isResponse && !isRequest) return null;
  const steps = isResponse ? stepsForResponse(r) : stepsForRequest(r);

  let broken = -1;
  steps.forEach((s, i) => {
    s.state = s.pending ? 'pending' : levelOf(s.checks);
    if (s.final) s.state = broken === -1 ? (steps.some((x) => x.state === 'warn') ? 'warn' : 'ok') : 'bad';
    if (s.final && s.state === 'bad') s.label = 'User is not signed in';
    if (s.state === 'bad' && broken === -1 && !s.final) broken = i;
  });

  const wrap = el('div', { class: 'flow-wrap' });
  const head = el('div', { class: 'flow-head' },
    el('div', {},
      el('h3', { text: 'Where sign-in breaks' }),
      el('p', { text: broken === -1 ? (isRequest ? 'The request looks fine so far.' : 'Every step passes, so the user gets in.') : `Sign-in stops at step ${broken + 1}: \u201c${steps[broken].label}\u201d.` })),
    el('button', { type: 'button', class: 'mini-btn', text: 'Replay', onclick: () => { wrap.classList.remove('play'); void wrap.offsetWidth; wrap.classList.add('play'); } }));
  const grid = el('ol', { class: 'seq', 'aria-label': 'Sign-in steps' });
  grid.append(...LANES.map((l, i) => el('li', { class: 'lane-head', 'aria-hidden': 'true', 'data-col': i + 1 }, el('span', { text: l }))));
  steps.forEach((s, i) => {
    const reached = broken === -1 || i <= broken || s.final;
    const state = reached ? s.state : 'skipped';
    const counts = s.checks.filter((c) => c.level === 'error' || c.level === 'warn');
    const first = s.checks.find((c) => c.level === 'error') || s.checks.find((c) => c.level === 'warn');
    const icon = { ok: '✓', warn: '!', bad: '✕', pending: '…', skipped: '' }[state];
    const srState = { ok: 'passed', warn: 'passed with warnings', bad: 'failed', pending: 'waiting', skipped: 'not reached' }[state];
    const row = el('li', { class: `step ${state}${s.at ? ` at-${s.at}` : ''}` });
    row.style.setProperty('--i', i);
    let a, b;
    if (s.at) { a = b = COL[s.at]; } else { a = Math.min(COL[s.from], COL[s.to]); b = Math.max(COL[s.from], COL[s.to]); }
    row.style.setProperty('--a', a);
    row.style.setProperty('--b', b + 1);
    const body = el('div', { class: `step-body ${s.at ? 'action' : COL[s.from] < COL[s.to] ? 'arrow right' : 'arrow left'}` },
      el('span', { class: 'step-ico', 'aria-hidden': 'true', text: icon }),
      el('span', { class: 'step-text' },
        el('strong', {}, el('span', { class: 'sr-only', text: `Step ${i + 1}, ${srState}: ` }), s.label, s.via ? el('em', { text: ` (${s.via})` }) : null),
        first && reached ? el('small', { text: first.title + (counts.length > 1 ? ` (+${counts.length - 1} more)` : '') }) : s.note ? el('small', { text: s.note }) : null,
        !reached && counts.length ? el('small', { text: `Not reached. Would also fail: ${first.title}` }) : null),
      s.at ? null : el('i', { class: 'packet', 'aria-hidden': 'true' }));
    row.append(body);
    grid.append(row);
  });
  wrap.append(head, grid);
  requestAnimationFrame(() => wrap.classList.add('play'));
  return wrap;
}

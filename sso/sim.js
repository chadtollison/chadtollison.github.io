// Guided incident simulator: broken SSO set-ups to diagnose and fix. Every replay is real:
// SAML responses are built and signed in this tab and checked by the same code as the debugger,
// and SCIM traffic is generated from the IdP settings and answered by a tiny pretend SCIM API.
// Nothing leaves the browser.
import { analyzeSaml } from './saml.js';
import { analyzeScim } from './scim.js';
import { renderFlow, drawSequence } from './flow.js';
import { buildResponse, makeKeyAndCert, NAMEID } from './fakeidp.js';
import { parseCertificate, normalizeFingerprint } from './xmldsig.js';

const DAY = 86400000;
const rid = () => '_' + [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
const stamp = (offsetSec = 0) => new Date(Date.now() + offsetSec * 1000).toISOString().slice(11, 19);

const APP = {
  name: 'your app',
  spEntityId: 'https://app.example.com/saml/metadata',
  acsUrl: 'https://app.example.com/saml/acs',
};
const IDP_ENTITY = 'https://idp.harborpine.example/saml';
const USER = { email: 'maya.lindqvist@harborpine.example', firstName: 'Maya', lastName: 'Lindqvist' };
const attrsFor = (u) => new Map([['email', [u.email]], ['firstName', [u.firstName]], ['lastName', [u.lastName]]]);

// The customer's two signing keys for the rollover scenario: made once per visit, in this tab.
let keysPromise = null;
function rolloverKeys() {
  if (!keysPromise) {
    keysPromise = (async () => {
      const now = Date.now();
      const make = async (cn, from, to) => {
        const k = await makeKeyAndCert({ cn, org: 'Harbor & Pine (fictional customer)', notBefore: new Date(from), notAfter: new Date(to) });
        return { ...k, info: await parseCertificate(k.cert) };
      };
      const [a, b] = await Promise.all([
        make('idp.harborpine.example signing 2023', now - 3 * 365 * DAY + 2 * DAY, now + 2 * DAY),
        make('idp.harborpine.example signing 2026', now - 0.4 * DAY, now + 3 * 365 * DAY),
      ]);
      return { a, b };
    })();
    keysPromise.catch(() => { keysPromise = null; });
  }
  return keysPromise;
}

// Turn the first problem the checks found into the line a real SP library would log.
function appLogFor(r, extra) {
  const first = r.checks.find((c) => c.level === 'error');
  const t = stamp();
  if (!first) {
    return [`${t} INFO  saml  Response ${r.responseInfo?.id?.slice(0, 12)}… accepted`, `${t} INFO  auth  Signed in ${r.subject?.nameId} (session created)`];
  }
  const lines = [`${t} INFO  saml  POST /saml/acs  SAMLResponse received (${r.decoded.xml.length.toLocaleString()} bytes)`];
  if (extra) lines.push(`${t} ERROR saml  ${extra}`);
  else if (first.area === 'Certificate' || first.area === 'Signature') {
    const got = r.certs?.[0]?.sha256;
    lines.push(`${t} ERROR saml  Signature validation failed: signing certificate is not trusted for issuer ${r.assertionInfo?.issuer || r.responseInfo?.issuer}`);
    if (got) lines.push(`${t} ERROR saml    certificate in response: SHA-256 ${got.slice(0, 23)}…`);
  } else if (first.area === 'Audience') {
    lines.push(`${t} ERROR saml  Audience validation failed: expected '${r.settings.spEntityId}', got '${(r.conditions?.audiences || []).join(', ')}'`);
  } else if (first.area === 'Destination') {
    lines.push(`${t} ERROR saml  Destination '${r.responseInfo?.destination}' does not match ACS URL '${r.settings.acsUrl}'`);
  } else if (first.area === 'Subject' && /Recipient/.test(first.title)) {
    lines.push(`${t} ERROR saml  SubjectConfirmationData Recipient '${r.confirmation?.recipient}' does not match ACS URL '${r.settings.acsUrl}'`);
  } else lines.push(`${t} ERROR saml  ${first.title}`);
  lines.push(`${t} WARN  auth  Sign-in rejected, showed error page SSO-401`);
  return lines;
}

const errorsIn = (r) => r.checks.filter((c) => c.level === 'error');

// ======================================================================
// Scenarios
// ======================================================================
const SCENARIOS = [
  // ------------------------------------------------------------------
  {
    id: 'rollover',
    kind: 'saml',
    title: 'The certificate rollover',
    level: 'Common',
    teaser: 'A customer rotated their signing certificate. Nobody at the company can sign in.',
    ticket: {
      from: 'IT admin, Harbor & Pine (fictional)',
      priority: 'Urgent',
      subject: 'Nobody can sign in since 9 this morning',
      body: 'Our security team rotated the SAML signing certificate in our identity provider this morning, because the old one expires this week. Since then every employee gets "Sorry, we couldn’t sign you in (SSO-401)" from your app. Our IdP’s sign-in log says every sign-in succeeded. Nothing else changed on our side.',
    },
    initial: async () => {
      const { a } = await rolloverKeys();
      return { activeCert: 'b', trustedCert: a.info.sha256 };
    },
    sides: async () => {
      const { a, b } = await rolloverKeys();
      const exp = (c) => Math.round((c.info.notAfter - Date.now()) / DAY);
      return [
        {
          id: 'idp', title: 'Customer’s identity provider', sub: 'Harbor & Pine’s admin console',
          fields: [
            { key: 'activeCert', label: 'Active signing certificate', type: 'select', options: [['a', `Certificate A (expires in ${exp(a)} days)`], ['b', 'Certificate B (new, made today)']] },
          ],
          extra: (ctx) => ctx.el('div', { class: 'sim-meta' },
            ctx.el('p', { class: 'sim-meta-title', text: 'Signing certificates in the IdP’s metadata' }),
            [['A', a], ['B', b]].map(([n, c]) => ctx.el('div', { class: 'sim-cert' },
              ctx.el('strong', { text: `Certificate ${n}` }),
              ctx.el('span', { text: `${c.info.subject.replace(/^CN=/, '').replace(/, O=.*/, '')} · valid ${c.info.notBefore.toISOString().slice(0, 10)} to ${c.info.notAfter.toISOString().slice(0, 10)}` }),
              ctx.el('span', { class: 'mono fp' }, `SHA-256 ${c.info.sha256}`, ' ', ctx.copyButton(() => c.info.sha256))))),
        },
        {
          id: 'app', title: 'Your app’s SSO settings', sub: 'For this customer',
          fields: [
            { key: 'idpEntityId', label: 'IdP entity ID', type: 'fixed', value: IDP_ENTITY },
            { key: 'trustedCert', label: 'Trusted IdP certificate (SHA-256 or SHA-1 thumbprint)', type: 'textarea', wide: true },
          ],
          actions: [
            { label: 'Re-import the IdP’s metadata', run: (s) => { s.trustedCert = (s.activeCert === 'a' ? a : b).info.sha256; return 'Imported the active signing certificate from the customer’s metadata.'; } },
          ],
        },
      ];
    },
    async run(state) {
      const keys = await rolloverKeys();
      const signer = keys[state.activeCert] || keys.b;
      const requestId = rid();
      const res = await buildResponse({
        spEntityId: APP.spEntityId, acsUrl: APP.acsUrl, nameId: USER.email, nameIdFormat: NAMEID.email, attrs: attrsFor(USER),
        minutes: 5, sign: 'assertion', inResponseTo: requestId, idp: { entityId: IDP_ENTITY, key: signer.key, cert: signer.cert },
      });
      const settings = { spEntityId: APP.spEntityId, acsUrl: APP.acsUrl, idpEntityId: IDP_ENTITY, idpCert: state.trustedCert.trim(), requestId, requiredAttrs: 'email, firstName, lastName', skewMinutes: 3 };
      const r = await analyzeSaml(res.b64, settings);
      let extra = null;
      if (!settings.idpCert) {
        r.checks.unshift({ level: 'error', area: 'Certificate', title: 'Your app has no trusted IdP certificate for this customer', detail: 'Without one it cannot tell a real response from a forged one, so it rejects everything. Never fall back to trusting the certificate inside the message.' });
        extra = 'No trusted certificate configured for this IdP; rejecting response';
      }
      const ok = !errorsIn(r).length;
      const a = keys.a.info;
      let outcome;
      if (ok && state.activeCert === 'a') {
        outcome = { solved: false, tone: 'meh', title: 'Sign-in works again, but only for a couple of days', text: `You switched the customer back to Certificate A, which expires on ${a.notAfter.toISOString().slice(0, 10)}. This buys time, it does not fix anything. Make your app trust Certificate B, then switch the IdP back to B.` };
      } else if (ok) {
        outcome = { solved: true };
      }
      return {
        r, b64: res.b64, settings, outcome,
        logs: {
          idp: [`${stamp(-2)} INFO  Sign-in succeeded for ${USER.email} (password + MFA)`, `${stamp(-1)} INFO  Sent SAML response to ${APP.acsUrl}, signed with Certificate ${state.activeCert.toUpperCase()}`],
          app: appLogFor(r, extra),
        },
        userSees: ok ? `Welcome back, ${USER.firstName}.` : 'Sorry, we couldn’t sign you in. (Error SSO-401)',
      };
    },
    hints: [
      'The IdP’s log says every sign-in succeeded, so the IdP is fine. Read your app’s log: it says exactly what it rejected.',
      'Your app trusts one certificate thumbprint. Compare it with the two certificates in the customer’s metadata.',
      'Copy Certificate B’s thumbprint into your app’s trusted certificate, or press “Re-import the IdP’s metadata”. Then replay.',
    ],
    async fix(state) { const { b } = await rolloverKeys(); state.activeCert = 'b'; state.trustedCert = b.info.sha256; },
    debrief: {
      what: 'The customer’s identity provider started signing with a new certificate. Your app still trusted only the old one, so it threw out every response, even though the IdP reported success. The user only saw a generic error, which is why these tickets are hard.',
      fix: 'Trust the new certificate in your app. Rolling the IdP back to the old certificate also works, but only until it expires.',
      prevent: [
        'Read the IdP’s metadata URL on a schedule instead of pasting a certificate once.',
        'Trust the old and new certificates side by side during a rollover.',
        'Warn the customer 30 days before the certificate you trust expires.',
        'Log the thumbprint you got next to the one you expected, so the cause is one log line away.',
      ],
    },
  },

  // ------------------------------------------------------------------
  {
    id: 'audience',
    kind: 'saml',
    title: 'The new customer',
    level: 'Very common',
    teaser: 'A customer set up SSO themselves. Every sign-in fails, and they say it is configured exactly like your guide.',
    ticket: {
      from: 'Systems admin, Brightwater Clinics (fictional)',
      priority: 'High',
      subject: 'SSO set up like your guide says, still fails',
      body: 'We finished setting up SAML today following your help page. When our staff click your app in our portal they get your error page. I copied the values from your guide, I promise! Can you check what is wrong on your end?',
    },
    initial: async () => ({ identifier: 'https://app.example.com', replyUrl: 'https://app.example.com/saml/acs/', spEntityId: APP.spEntityId, acsUrl: APP.acsUrl }),
    sides: async () => [
      {
        id: 'idp', title: 'Customer’s identity provider', sub: 'Brightwater’s app settings for you',
        fields: [
          { key: 'identifier', label: 'Identifier (entity ID)', type: 'text', required: true },
          { key: 'replyUrl', label: 'Reply URL (ACS URL)', type: 'text', required: true },
        ],
      },
      {
        id: 'app', title: 'Your app’s SAML settings', sub: 'Shared by all 40 customers',
        fields: [
          { key: 'spEntityId', label: 'SP entity ID (audience)', type: 'text', required: true },
          { key: 'acsUrl', label: 'ACS URL', type: 'text', required: true },
        ],
        extra: (ctx) => ctx.el('p', { class: 'sim-help', text: 'These are what your help page tells every customer to type in.' }),
      },
    ],
    async run(state) {
      const requestId = rid();
      const res = await buildResponse({
        spEntityId: state.identifier.trim(), acsUrl: state.replyUrl.trim(), nameId: USER.email, nameIdFormat: NAMEID.email, attrs: attrsFor(USER),
        minutes: 5, sign: 'assertion', inResponseTo: requestId, idp: await customerIdp(),
      });
      const settings = { spEntityId: state.spEntityId.trim(), acsUrl: state.acsUrl.trim(), idpEntityId: IDP_ENTITY, idpCert: (await customerIdp()).info.sha256, requestId, requiredAttrs: 'email, firstName, lastName', skewMinutes: 3 };
      const r = await analyzeSaml(res.b64, settings);
      const ok = !errorsIn(r).length;
      const appChanged = state.spEntityId.trim() !== APP.spEntityId || state.acsUrl.trim() !== APP.acsUrl;
      let outcome = null;
      if (ok && appChanged) outcome = { solved: false, tone: 'bad', title: 'Brightwater can sign in. The other 39 customers can’t.', text: 'You changed your app’s own settings to match this one customer’s typo. Every other customer’s IdP still sends the values from your help page, so you just broke all of them. Put your app back and fix the customer’s side instead.' };
      else if (ok) outcome = { solved: true };
      else if (appChanged) outcome = { solved: false, tone: 'bad', title: 'Careful: your app’s settings are shared', text: 'Changing them here changes them for all 40 customers. The fix almost always belongs in the one customer’s IdP.' };
      return {
        r, b64: res.b64, settings, outcome,
        logs: {
          idp: [`${stamp(-2)} INFO  Sign-in succeeded for ${USER.email}`, `${stamp(-1)} INFO  Sent SAML response to ${state.replyUrl.trim()} (audience ${state.identifier.trim()})`],
          app: appLogFor(r),
        },
        userSees: ok ? `Welcome back, ${USER.firstName}.` : 'Sorry, we couldn’t sign you in. (Error SSO-401)',
      };
    },
    hints: [
      'Two values have to match exactly, character for character: what the IdP sends, and what your app expects. Start with the step that fails first.',
      'Compare the customer’s Reply URL with your ACS URL, then their Identifier with your SP entity ID. One has an extra character, the other is missing a path.',
      'Set the customer’s Identifier to https://app.example.com/saml/metadata and their Reply URL to https://app.example.com/saml/acs. Leave your own settings alone.',
    ],
    async fix(state) { state.identifier = APP.spEntityId; state.replyUrl = APP.acsUrl; state.spEntityId = APP.spEntityId; state.acsUrl = APP.acsUrl; },
    debrief: {
      what: 'The customer typed your base URL as the Identifier and added a trailing slash to the Reply URL. SAML compares both as exact strings, so the responses were addressed to an app and URL that, to your app, do not exist.',
      fix: 'Correct the two values in the customer’s IdP. Not in your app: its settings are shared by every customer.',
      prevent: [
        'Give customers a metadata URL to import, so nobody types entity IDs by hand.',
        'Put copy buttons next to every value in the setup guide.',
        'Log the audience and URL you got next to the ones you expected.',
        'Add a “test connection” step that names the mismatched field.',
      ],
    },
  },

  // ------------------------------------------------------------------
  {
    id: 'scim',
    kind: 'scim',
    title: 'The new hire who doesn’t exist',
    level: 'Tricky',
    teaser: 'New hires never get an account, and the workaround made it worse.',
    ticket: {
      from: 'IT lead, Copperleaf Studio (fictional)',
      priority: 'High',
      subject: 'New hires never get an account in your app',
      body: 'Priya Raman started Monday. Our IdP should create her account in your app automatically (SCIM), like everyone else, but her account never appears and the IdP shows a provisioning error. Yesterday our helpdesk created her account by hand so she could work, and now the IdP shows a different error.',
    },
    initial: async () => ({ mapUserName: 'employeeNumber', mapFamilyName: 'lastName', mapEmail: 'email', onExisting: 'create', handMade: 'keep' }),
    sides: async () => [
      {
        id: 'idp', title: 'Customer’s identity provider', sub: 'Provisioning to your app',
        fields: [
          { key: 'mapUserName', label: 'userName ←', type: 'select', options: [['employeeNumber', 'user.employeeNumber'], ['email', 'user.email'], ['login', 'user.login'], ['displayName', 'user.displayName']] },
          { key: 'mapFamilyName', label: 'name.familyName ←', type: 'select', options: [['lastName', 'user.lastName'], ['none', '(not mapped)']] },
          { key: 'mapEmail', label: 'emails[work] ←', type: 'select', options: [['email', 'user.email'], ['none', '(not mapped)']] },
          { key: 'onExisting', label: 'If the user already exists in the app', type: 'select', wide: true, options: [['create', 'Create a new user anyway'], ['match', 'Match on userName and link the accounts']] },
        ],
        extra: (ctx) => ctx.el('p', { class: 'sim-help' }, 'Priya in the IdP: email ', ctx.el('span', { class: 'mono', text: PRIYA.email }), ', employeeNumber ', ctx.el('span', { class: 'mono', text: PRIYA.employeeNumber }), ', login ', ctx.el('span', { class: 'mono', text: PRIYA.login }), '.'),
      },
      {
        id: 'app', title: 'Your app’s SCIM API', sub: 'Rules every customer gets',
        fields: [
          { key: 'handMade', label: 'The account helpdesk made by hand', type: 'select', wide: true, options: [['keep', 'Keep it (Priya has been working in it)'], ['delete', 'Delete it']] },
        ],
        extra: (ctx) => ctx.el('ul', { class: 'sim-rules' },
          ctx.el('li', {}, ctx.el('strong', { text: 'userName must be the work email. ' }), 'SSO signs people in by matching the SAML NameID (their email) to userName.'),
          ctx.el('li', {}, ctx.el('strong', { text: 'name.familyName is required.' })),
          ctx.el('li', {}, ctx.el('strong', { text: 'userName is unique ' }), '(compared without case, as RFC 7643 says).')),
      },
    ],
    run: async (state) => runScim(state),
    hints: [
      'Open the request the IdP sends to POST /Users and the answer your API gives. The answer says what it didn’t like.',
      'Your app matches the SAML NameID (her email) to userName. What is the IdP putting in userName?',
      'Map userName to user.email. Then the hand-made account is in the way: either let the IdP match and link it, or delete it.',
    ],
    async fix(state) { state.mapUserName = 'email'; state.mapFamilyName = 'lastName'; state.mapEmail = 'email'; state.onExisting = 'match'; state.handMade = 'keep'; },
    debrief: {
      what: 'The IdP sent Priya’s employee number as her userName, so your API refused to create her. Then helpdesk created her by hand, so the next attempt collided with that account (409 Conflict). Two faults, one after the other, which is why the error changed.',
      fix: 'Map userName to her email, and let the IdP match on userName and link the existing account instead of creating a second one.',
      prevent: [
        'Make the API’s 400 errors name the field and the rule, as they do here.',
        'Answer duplicates with 409 and scimType “uniqueness” so IdPs know what happened.',
        'Tell customers to turn on matching before the first sync.',
        'Don’t create accounts by hand for SCIM-managed customers. Fix the sync instead.',
      ],
    },
  },
];

let customerIdpPromise = null;
function customerIdp() {
  if (!customerIdpPromise) {
    customerIdpPromise = (async () => {
      const now = Date.now();
      const k = await makeKeyAndCert({ cn: 'idp.brightwater.example signing', org: 'Brightwater Clinics (fictional customer)', notBefore: new Date(now - 30 * DAY), notAfter: new Date(now + 2 * 365 * DAY) });
      return { entityId: IDP_ENTITY, key: k.key, cert: k.cert, info: await parseCertificate(k.cert) };
    })();
    customerIdpPromise.catch(() => { customerIdpPromise = null; });
  }
  return customerIdpPromise;
}

// ======================================================================
// The SCIM scenario: a pretend IdP sync against a pretend SCIM API
// ======================================================================
const PRIYA = { email: 'priya.raman@copperleaf.example', firstName: 'Priya', lastName: 'Raman', employeeNumber: 'E10482', login: 'praman', displayName: 'Priya Raman', idpId: '00u8f3k2q9' };
const HAND_MADE_ID = '4f1c9a2e-77b0-4d2e-9a51-0c3e8b6d2f10';
const SCIM_USER = 'urn:ietf:params:scim:schemas:core:2.0:User';
const SCIM_ERROR = 'urn:ietf:params:scim:api:messages:2.0:Error';
const SCIM_LIST = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const SCIM_PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
const HOST = 'https://app.example.com/scim/v2';

function http(method, path, body, status) {
  const head = status ? `HTTP/1.1 ${status}` : `${method} ${path} HTTP/1.1\nHost: app.example.com\nAuthorization: Bearer ••••••`;
  return `${head}\nContent-Type: application/scim+json${body ? `\n\n${JSON.stringify(body, null, 2)}` : ''}`;
}
const scimError = (status, scimType, detail) => ({ schemas: [SCIM_ERROR], status: String(status), ...(scimType ? { scimType } : {}), detail });
const STATUS_TEXT = { 200: '200 OK', 201: '201 Created', 400: '400 Bad Request', 409: '409 Conflict' };

function runScim(state) {
  // The app's database before this sync
  const db = [];
  if (state.handMade === 'keep') db.push({ id: HAND_MADE_ID, userName: PRIYA.email, name: { givenName: 'Priya', familyName: 'Raman' }, active: true, externalId: null, by: 'helpdesk' });
  db.push({ id: 'a91d0f3c-5e2b-4c87-b1f4-2d6e9a0c7b35', userName: 'ava.okafor@copperleaf.example', name: { givenName: 'Ava', familyName: 'Okafor' }, active: true, externalId: '00u1a2b3c4' });
  const find = (u) => db.find((x) => x.userName.toLowerCase() === String(u).toLowerCase());

  const userName = PRIYA[state.mapUserName];
  const user = { schemas: [SCIM_USER], externalId: PRIYA.idpId, userName, active: true, displayName: PRIYA.displayName, name: { givenName: PRIYA.firstName } };
  if (state.mapFamilyName === 'lastName') user.name.familyName = PRIYA.lastName;
  if (state.mapEmail === 'email') user.emails = [{ value: PRIYA.email, type: 'work', primary: true }];

  const steps = [];
  const appLog = [], idpLog = [];
  const t0 = -6;
  let t = t0;
  const tick = () => stamp(t++);
  steps.push({ at: 'idp', label: 'Priya is assigned to your app in the IdP', state: 'ok', note: 'HR added her on Monday' });
  idpLog.push(`${tick()} INFO  Provisioning ${PRIYA.displayName} to your app`);

  const msgs = [];
  let linked = null;
  let failure = null;
  const addHttp = (dir, label, text, st, detail) => {
    const pre = (s) => { const n = document.createElement('pre'); n.className = 'xml sim-http'; n.textContent = s; return n; };
    steps.push({ from: dir === 'req' ? 'idp' : 'api', to: dir === 'req' ? 'api' : 'idp', label, state: st, detail, inspect: pre(text), inspectLabel: dir === 'req' ? 'Show the request' : 'Show the response' });
    msgs.push({ dir, text });
  };

  if (state.onExisting === 'match') {
    const filter = `userName eq "${userName}"`;
    const path = `/Users?filter=${encodeURIComponent(filter)}`;
    addHttp('req', `IdP asks: does ${userName} exist?`, http('GET', `/scim/v2${path}`), 'ok', `GET /Users?filter=${filter}`);
    const hit = find(userName);
    const list = { schemas: [SCIM_LIST], totalResults: hit ? 1 : 0, startIndex: 1, itemsPerPage: hit ? 1 : 0, Resources: hit ? [{ schemas: [SCIM_USER], id: hit.id, userName: hit.userName, active: hit.active }] : [] };
    addHttp('res', hit ? 'API: yes, here is the account' : 'API: no such user', http(null, null, list, STATUS_TEXT[200]), 'ok', `200 OK, totalResults ${list.totalResults}`);
    appLog.push(`${tick()} INFO  scim  GET /Users filter=${filter} -> 200 (${list.totalResults} found)`);
    if (hit) linked = hit;
  }

  let created = null;
  if (linked) {
    const patch = { schemas: [SCIM_PATCH], Operations: [{ op: 'replace', path: 'externalId', value: PRIYA.idpId }, { op: 'replace', path: 'active', value: true }, { op: 'replace', path: 'name.familyName', value: PRIYA.lastName }] };
    if (state.mapFamilyName !== 'lastName') patch.Operations.pop();
    addHttp('req', 'IdP links the existing account', http('PATCH', `/scim/v2/Users/${linked.id}`, patch), 'ok', `PATCH /Users/${linked.id.slice(0, 8)}…`);
    linked.externalId = PRIYA.idpId;
    const body = { schemas: [SCIM_USER], id: linked.id, externalId: linked.externalId, userName: linked.userName, active: true, name: linked.name, meta: { resourceType: 'User', location: `${HOST}/Users/${linked.id}` } };
    addHttp('res', 'API: linked', http(null, null, body, STATUS_TEXT[200]), 'ok', '200 OK');
    appLog.push(`${tick()} INFO  scim  PATCH /Users/${linked.id.slice(0, 8)}… -> 200 (linked externalId ${PRIYA.idpId})`);
    created = linked;
  } else {
    addHttp('req', `IdP creates ${userName}`, http('POST', '/scim/v2/Users', user), 'ok', 'POST /Users');
    let status = 201, err = null;
    if (!isEmail(userName)) { status = 400; err = scimError(400, 'invalidValue', `userName "${userName}" is not an email address. This app signs users in by matching the SAML NameID (their email) to userName.`); }
    else if (!user.name.familyName) { status = 400; err = scimError(400, 'invalidValue', 'name.familyName is required.'); }
    else if (find(userName)) { status = 409; err = scimError(409, 'uniqueness', `A user with userName "${userName}" already exists (id ${find(userName).id}). Link it instead of creating another.`); }
    if (err) {
      addHttp('res', `API refuses: ${STATUS_TEXT[status]}`, http(null, null, err, STATUS_TEXT[status]), 'bad', err.detail);
      appLog.push(`${tick()} WARN  scim  POST /Users -> ${status} ${err.scimType}: ${err.detail}`);
      idpLog.push(`${tick()} ERROR Could not create ${PRIYA.displayName}: ${STATUS_TEXT[status]}. ${err.detail}`);
      failure = { status, err };
    } else {
      created = { id: crypto.randomUUID(), userName, name: user.name, active: true, externalId: PRIYA.idpId };
      db.push(created);
      const body = { ...user, id: created.id, meta: { resourceType: 'User', created: new Date().toISOString(), location: `${HOST}/Users/${created.id}` } };
      addHttp('res', 'API: created', http(null, null, body, STATUS_TEXT[201]), 'ok', '201 Created');
      appLog.push(`${tick()} INFO  scim  POST /Users -> 201 (id ${created.id.slice(0, 8)}…)`);
    }
  }
  steps.push(failure
    ? { at: 'idp', label: 'IdP stores your app’s id for Priya', state: 'skipped', detail: 'Nothing to store: the sync failed' }
    : { at: 'idp', label: 'IdP stores your app’s id for Priya', state: 'ok', note: `id ${created.id.slice(0, 8)}… (updates and offboarding use it)` });
  if (!failure) idpLog.push(`${tick()} INFO  ${PRIYA.displayName} ${linked ? 'linked to existing account' : 'created'} (app id ${created.id.slice(0, 8)}…)`);

  // Sign-in: the IdP's NameID is always her email; the app looks for a matching userName.
  const account = find(PRIYA.email);
  steps.push({ from: 'emp', to: 'api', label: 'Priya signs in with SSO', via: 'SAML', state: 'ok', note: `NameID ${PRIYA.email}` });
  const signedIn = !!account;
  const managed = signedIn && account.externalId === PRIYA.idpId;
  steps.push({
    from: 'api', to: 'emp', final: true,
    label: signedIn ? 'Priya is signed in' : 'Priya is not signed in',
    state: signedIn ? (managed ? 'ok' : 'warn') : 'bad',
    detail: signedIn ? (managed ? null : 'Into the hand-made account, which the IdP does not manage') : `No user has userName ${PRIYA.email}`,
  });
  appLog.push(`${tick()} ${signedIn ? 'INFO ' : 'WARN '} auth  SAML sign-in for ${PRIYA.email}: ${signedIn ? `ok (user ${account.id.slice(0, 8)}…${managed ? '' : ', not managed by SCIM'})` : 'no matching user, showed error page SSO-404'}`);

  const broken = steps.findIndex((s) => s.state === 'bad');
  let summary;
  if (failure && signedIn) summary = `Provisioning fails at step ${broken + 1}. Priya can still sign in, but only to the hand-made account, so the IdP can never update or offboard her.`;
  else if (broken !== -1) summary = `It breaks at step ${broken + 1}: “${steps[broken].label}”.`;
  else summary = 'Every step passes: Priya is provisioned, linked to the IdP and signed in.';

  let outcome = null;
  if (!failure && managed) {
    outcome = state.handMade === 'delete'
      ? { solved: true, note: 'Solved, the blunt way. Deleting the hand-made account let the IdP create a fresh one, but anything Priya did in the old account this week is gone. Matching and linking would have kept it.' }
      : { solved: true };
  }
  const requests = msgs.filter((m) => m.dir === 'req').map((m) => m.text);
  return {
    kind: 'scim', steps, broken, summary, outcome, requests,
    logs: { idp: idpLog, app: appLog },
    userSees: signedIn ? `Welcome, Priya.${managed ? '' : ' (hand-made account)'}` : 'We couldn’t find your account. Ask your IT team to give you access. (Error SSO-404)',
  };
}

// ======================================================================
// UI
// ======================================================================
const SCIM_LANES = ['Employee', 'Identity provider', 'Your SCIM API'];
const SCIM_COLS = { emp: 1, idp: 2, api: 3 };

export function initSimulator({ el, $, renderChecks, copyButton, openSaml, store }) {
  const root = $('#sim');
  if (!root) return;
  const solved = new Set(store.get('sso-sim-solved') || []);
  let cur = null; // { sc, state, sides, hintsShown, last, startedAt, runs }

  const picker = el('div', { class: 'sim-picker', role: 'list' });
  const stage = el('div', { class: 'sim-stage' });
  root.replaceChildren(picker, stage);

  function drawPicker() {
    picker.replaceChildren(...SCENARIOS.map((sc, i) => el('button', {
      type: 'button', role: 'listitem', class: `sim-pick${cur?.sc === sc ? ' on' : ''}`, 'aria-current': cur?.sc === sc ? 'true' : null,
      onclick: () => start(sc, true),
    },
    el('span', { class: 'sim-pick-top' }, el('small', { text: `Incident ${String(i + 1).padStart(2, '0')} · ${sc.kind === 'scim' ? 'SCIM' : 'SAML'} · ${sc.level}` }), solved.has(sc.id) ? el('span', { class: 'sim-badge', text: 'Solved' }) : null),
    el('strong', { text: sc.title }),
    el('span', { text: sc.teaser }))));
  }

  async function start(sc, scroll = false) {
    let state, sides;
    try { state = await sc.initial(); sides = await sc.sides(); } catch (e) {
      stage.replaceChildren(el('p', { class: 'sim-note bad', text: `This incident needs the browser\u2019s WebCrypto to make its signing keys, and it failed here: ${e.message}. Try a current Chrome, Edge, Firefox or Safari.` }));
      return;
    }
    cur = { sc, state, sides, hintsShown: 0, last: null, startedAt: Date.now(), runs: 0, dirty: false, gaveUp: false };
    drawPicker();
    drawStage();
    if (scroll) stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await replay();
  }

  function fieldNode(f) {
    const s = cur.state;
    const id = `sim-${cur.sc.id}-${f.key}`;
    if (f.type === 'fixed') return el('div', { class: `sim-field${f.wide ? ' wide' : ''}` }, el('span', { class: 'sim-label', text: f.label }), el('span', { class: 'mono sim-fixed', text: f.value }));
    let input;
    if (f.type === 'select') {
      input = el('select', { id }, f.options.map(([v, label]) => el('option', { value: v, text: label, selected: s[f.key] === v })));
    } else if (f.type === 'textarea') {
      input = el('textarea', { id, rows: '2', spellcheck: 'false', autocomplete: 'off' });
      input.value = s[f.key];
    } else {
      input = el('input', { id, type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off' });
      input.value = s[f.key];
    }
    const onEdit = () => { s[f.key] = input.value; markDirty(); };
    input.addEventListener(f.type === 'select' ? 'change' : 'input', onEdit);
    if (f.type === 'text') input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); replay(); } });
    const err = el('span', { class: 'sim-err', 'aria-live': 'polite', id: `${id}-err` });
    input.setAttribute('aria-describedby', `${id}-err`);
    return el('label', { class: `sim-field${f.wide ? ' wide' : ''}`, for: id }, el('span', { class: 'sim-label', text: f.label }), input, err);
  }

  function drawStage() {
    const { sc } = cur;
    const ctx = { el, copyButton };
    const sideNodes = cur.sides.map((side) => el('section', { class: `sim-side side-${side.id}`, 'aria-labelledby': `sim-side-${side.id}` },
      el('div', { class: 'sim-side-head' }, el('h3', { id: `sim-side-${side.id}`, text: side.title }), el('small', { text: side.sub })),
      el('div', { class: 'sim-fields' }, side.fields.map(fieldNode)),
      side.extra ? side.extra(ctx) : null,
      side.actions ? el('div', { class: 'btn-row' }, side.actions.map((a) => el('button', {
        type: 'button', class: 'mini-btn', text: a.label,
        onclick: () => { const msg = a.run(cur.state); redrawFields(); markDirty(msg); },
      }))) : null));
    stage.replaceChildren(
      el('article', { class: 'sim-ticket', 'aria-label': 'Support ticket' },
        el('div', { class: 'sim-ticket-head' },
          el('span', { class: `sim-prio p-${sc.ticket.priority.toLowerCase()}`, text: sc.ticket.priority }),
          el('span', { class: 'sim-ticket-from', text: `From: ${sc.ticket.from}` })),
        el('h3', { text: sc.ticket.subject }),
        el('p', { text: sc.ticket.body })),
      el('p', { class: 'sim-task' }, el('strong', { text: 'Your job: ' }), 'change the settings below until the sign-in replay goes green. Every replay builds and checks real messages in your browser.'),
      el('div', { class: 'sim-sides' }, sideNodes),
      el('div', { class: 'sim-controls' },
        el('button', { type: 'button', class: 'try-attack', id: 'sim-replay', text: sc.kind === 'scim' ? 'Replay the sync and sign-in' : 'Replay sign-in', onclick: () => replay() }),
        el('span', { class: 'sim-dirty', id: 'sim-dirty', 'aria-live': 'polite' }),
        el('span', { class: 'sim-spacer' }),
        el('button', { type: 'button', class: 'mini-btn', id: 'sim-hint', onclick: showHint }),
        el('button', { type: 'button', class: 'mini-btn', text: 'Show me the fix', onclick: showFix }),
        el('button', { type: 'button', class: 'mini-btn', text: 'Start over', onclick: () => start(sc) })),
      el('ol', { class: 'sim-hints', id: 'sim-hints', 'aria-live': 'polite' }),
      el('div', { id: 'sim-out', class: 'sim-out', 'aria-live': 'polite' }));
    updateHintButton();
  }

  function redrawFields() {
    for (const side of cur.sides) for (const f of side.fields) {
      const n = document.getElementById(`sim-${cur.sc.id}-${f.key}`);
      if (n) n.value = cur.state[f.key];
    }
  }
  function markDirty(msg) {
    cur.dirty = true;
    const d = $('#sim-dirty');
    if (d) d.textContent = msg ? `${msg} Replay to test it.` : 'Settings changed. Replay to test them.';
  }
  function validate() {
    let ok = true;
    for (const side of cur.sides) for (const f of side.fields) {
      const errEl = document.getElementById(`sim-${cur.sc.id}-${f.key}-err`);
      if (!errEl) continue;
      const v = String(cur.state[f.key] ?? '');
      let msg = '';
      if (f.required && !v.trim()) msg = 'This can’t be empty. The console won’t save it.';
      else if (f.type === 'text' && /^https?:\/\//i.test(v.trim()) === false && /url|identifier|entity/i.test(f.label) && v.trim()) msg = 'Expected a URL starting with https://';
      errEl.textContent = msg;
      document.getElementById(`sim-${cur.sc.id}-${f.key}`)?.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg) ok = false;
    }
    return ok;
  }

  function updateHintButton() {
    const b = $('#sim-hint');
    if (!b) return;
    const n = cur.sc.hints.length;
    b.textContent = cur.hintsShown >= n ? 'No more hints' : `Hint ${cur.hintsShown + 1} of ${n}`;
    b.disabled = cur.hintsShown >= n;
  }
  function showHint() {
    if (cur.hintsShown >= cur.sc.hints.length) return;
    $('#sim-hints').append(el('li', { text: cur.sc.hints[cur.hintsShown] }));
    cur.hintsShown++;
    updateHintButton();
  }
  async function showFix() {
    await cur.sc.fix(cur.state);
    cur.gaveUp = true;
    redrawFields();
    markDirty('Applied the fix.');
    await replay();
  }

  let running = 0;
  async function replay() {
    if (!cur) return;
    const out = $('#sim-out');
    if (!validate()) { out.replaceChildren(el('p', { class: 'sim-note bad', text: 'Fix the highlighted setting first.' })); return; }
    const mine = ++running;
    const btn = $('#sim-replay');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Replaying…';
    try {
      const res = await cur.sc.run(cur.state);
      if (mine !== running) return;
      cur.runs++;
      cur.dirty = false;
      $('#sim-dirty').textContent = '';
      render(res);
    } catch (e) {
      out.replaceChildren(el('p', { class: 'sim-note bad', text: `The replay could not run: ${e.message}` }));
    } finally {
      if (mine === running) { btn.disabled = false; btn.textContent = label; }
    }
  }

  function brokenOf(res) {
    if (res.kind === 'scim') return res.broken;
    // the SAML flow: recompute from the drawn steps
    return res.flowBroken;
  }

  function render(res) {
    const { sc } = cur;
    const out = $('#sim-out');
    let flow;
    if (sc.kind === 'saml') {
      flow = renderFlow(res.r, el, { onReplay: () => replay(), title: 'Sign-in replay' });
      res.flowBroken = flow ? Number(flow.dataset.broken) : -1;
      const rb = flow?.querySelector('.flow-head .mini-btn'); if (rb) rb.textContent = 'Replay again';
    } else {
      flow = drawSequence(el, { lanes: SCIM_LANES, cols: SCIM_COLS, steps: res.steps, broken: -1, title: 'Provisioning and sign-in replay', summary: res.summary, onReplay: () => replay(), replayLabel: 'Replay again' });
    }
    const broken = brokenOf(res);
    const errs = sc.kind === 'saml' ? errorsIn(res.r).length : res.steps.filter((s) => s.state === 'bad').length;
    const shape = sc.kind === 'scim' ? res.steps.map((s) => s.label).join('|') : 'saml';
    const now = { broken, errs, ok: !!res.outcome?.solved, shape, label: broken === -1 ? null : (sc.kind === 'scim' ? res.steps[broken].label : null) };
    const progress = cur.last == null ? null : progressText(cur.last, now);
    cur.last = now;

    const pieces = [];
    if (progress) pieces.push(el('p', { class: `sim-progress ${progress.tone}`, text: progress.text }));
    if (res.outcome?.solved) {
      const first = !solved.has(sc.id);
      solved.add(sc.id); store.set('sso-sim-solved', [...solved]);
      drawPicker();
      pieces.push(solvedPanel(res, first));
    } else if (res.outcome) {
      pieces.push(el('div', { class: `verdict ${res.outcome.tone}` }, el('span', { class: 'verdict-ico', 'aria-hidden': 'true', text: res.outcome.tone === 'meh' ? '!' : '✕' }), el('div', {}, el('strong', { text: res.outcome.title }), el('span', { text: res.outcome.text }))));
    }
    pieces.push(flow);
    pieces.push(el('div', { class: 'sim-evidence' },
      el('section', { class: 'sim-ev user' }, el('h4', { text: 'What the user sees' }), el('p', { class: `sim-screen ${res.outcome?.solved ? 'ok' : 'bad'}`, text: res.userSees })),
      el('section', { class: 'sim-ev' }, el('h4', { text: 'IdP sign-in log' }), el('pre', { class: 'sim-log', text: res.logs.idp.join('\n') })),
      el('section', { class: 'sim-ev' }, el('h4', { text: 'Your app’s log' }), el('pre', { class: 'sim-log', text: res.logs.app.join('\n') }))));
    if (sc.kind === 'saml') {
      const list = el('ul', { class: 'checks' });
      renderChecks(list, res.r.checks);
      pieces.push(el('details', { class: 'sim-checks' }, el('summary', { text: `Every check on this response (${errorsIn(res.r).length} problem${errorsIn(res.r).length === 1 ? '' : 's'})` }), list,
        el('button', { type: 'button', class: 'mini-btn', text: 'Open this response in the full debugger', onclick: () => openSaml(res.b64, res.settings, `From incident “${sc.title}”. The settings were filled in from your app’s side of the incident.`) })));
    }
    out.replaceChildren(...pieces.filter(Boolean));
  }

  function progressText(prev, now) {
    if (now.ok) return null;
    if (prev.broken === -1 && prev.ok) return { tone: 'bad', text: 'That broke it again.' };
    if (prev.shape !== now.shape) return { tone: 'meh', text: now.label ? `The flow changed. It now fails at \u201c${now.label}\u201d.` : 'The flow changed.' };
    if (now.broken > prev.broken && prev.broken !== -1) return { tone: 'good', text: `Progress: it now gets past step ${prev.broken + 1}${now.broken === -1 ? '' : ` and stops at step ${now.broken + 1}`}.` };
    if (now.broken !== -1 && prev.broken !== -1 && now.broken < prev.broken) return { tone: 'bad', text: `Worse: it now fails earlier, at step ${now.broken + 1}.` };
    if (now.errs < prev.errs) return { tone: 'good', text: `Progress: ${prev.errs - now.errs} fewer problem${prev.errs - now.errs === 1 ? '' : 's'}.` };
    if (now.errs > prev.errs) return { tone: 'bad', text: `That added ${now.errs - prev.errs} problem${now.errs - prev.errs === 1 ? '' : 's'}.` };
    return { tone: 'meh', text: 'Same failure as before.' };
  }

  function solvedPanel(res, first) {
    const { sc } = cur;
    const secs = Math.round((Date.now() - cur.startedAt) / 1000);
    const took = secs < 90 ? `${secs} seconds` : `${Math.round(secs / 60)} minutes`;
    const idx = SCENARIOS.indexOf(sc);
    const next = SCENARIOS.slice(idx + 1).concat(SCENARIOS.slice(0, idx)).find((x) => !solved.has(x.id));
    const headline = cur.gaveUp ? 'Fixed (with the answer shown)' : `Solved in ${took}${cur.hintsShown ? ` with ${cur.hintsShown} hint${cur.hintsShown === 1 ? '' : 's'}` : ', no hints'}`;
    return el('section', { class: 'sim-solved', 'aria-label': 'Incident solved' },
      el('div', { class: 'sim-solved-head' },
        el('span', { class: 'verdict-ico', 'aria-hidden': 'true', text: '✓' }),
        el('div', {}, el('strong', { text: headline }), el('span', { text: first && !cur.gaveUp ? 'Every step is green.' : 'Every step is green again.' }))),
      res.outcome.note ? el('p', { class: 'sim-solved-note', text: res.outcome.note }) : null,
      el('div', { class: 'sim-debrief' },
        el('div', {}, el('h4', { text: 'What happened' }), el('p', { text: sc.debrief.what })),
        el('div', {}, el('h4', { text: 'The fix' }), el('p', { text: sc.debrief.fix })),
        el('div', {}, el('h4', { text: 'How to stop it happening again' }), el('ul', {}, sc.debrief.prevent.map((p) => el('li', { text: p }))))),
      next ? el('button', { type: 'button', class: 'try-attack', text: `Next incident: ${next.title} →`, onclick: () => start(next, true) })
        : el('p', { class: 'sim-all', text: 'You have solved every incident. Try your own SAML response or SCIM payload in the other tabs.' }));
  }

  drawPicker();
  const wanted = SCENARIOS.find((s) => location.hash === `#incident-${s.id}`) || SCENARIOS.find((s) => !solved.has(s.id)) || SCENARIOS[0];
  return {
    start: () => start(wanted),
    open: (id) => { const sc = SCENARIOS.find((s) => s.id === id); if (sc && cur?.sc !== sc) start(sc, true); },
    scenarios: SCENARIOS,
  };
}

// Exposed for tests.
export const _test = { SCENARIOS, runScim, rolloverKeys, customerIdp, normalizeFingerprint, analyzeScim };

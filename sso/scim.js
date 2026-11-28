// SCIM 2.0 (RFC 7643 / 7644) payload checker. Pure functions, no network.

export const URN = {
  user: 'urn:ietf:params:scim:schemas:core:2.0:User',
  group: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  enterprise: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',
  patch: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
  list: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  error: 'urn:ietf:params:scim:api:messages:2.0:Error',
  bulkReq: 'urn:ietf:params:scim:api:messages:2.0:BulkRequest',
  bulkRes: 'urn:ietf:params:scim:api:messages:2.0:BulkResponse',
  search: 'urn:ietf:params:scim:api:messages:2.0:SearchRequest',
};
const KNOWN_URNS = Object.values(URN);

// ---------- schema definitions (RFC 7643 section 4) ----------
const S = (description, extra = {}) => ({ type: 'string', description, ...extra });
const multi = (description, sub, extra = {}) => ({ type: 'complex', multiValued: true, description, sub, ...extra });
const MV_SUB = (valueDesc, types) => ({
  value: S(valueDesc), display: S('A readable label for this value.', { mutability: 'readOnly' }),
  type: S('A label such as "work" or "home".', types ? { canonical: types } : {}),
  primary: { type: 'boolean', description: 'Marks the main value. Only one value may be primary.' },
});
const COMMON = {
  id: S('The ID your app assigned to this resource. The identity provider uses it in later calls.', { mutability: 'readOnly', returned: 'always' }),
  externalId: S('The identity provider\u2019s own ID for this resource. Store it to match records later.'),
  meta: {
    type: 'complex', mutability: 'readOnly', description: 'Bookkeeping your app adds to responses.',
    sub: {
      resourceType: S('User or Group.'), created: { type: 'dateTime', description: 'When it was created.' },
      lastModified: { type: 'dateTime', description: 'When it last changed.' }, location: { type: 'reference', description: 'This resource\u2019s full URL.' },
      version: S('An ETag for optimistic locking.'),
    },
  },
};
export const USER = {
  ...COMMON,
  userName: S('The unique sign-in name. Required. Entra ID sends the user principal name by default.', { required: true, uniqueness: 'server' }),
  name: {
    type: 'complex', description: 'The user\u2019s name in parts.',
    sub: {
      formatted: S('The full name, ready to display.'), familyName: S('Last name.'), givenName: S('First name.'), middleName: S('Middle name.'),
      honorificPrefix: S('A title such as "Ms.".'), honorificSuffix: S('A suffix such as "III".'),
    },
  },
  displayName: S('The name to show in your app.'), nickName: S('A casual name.'), profileUrl: { type: 'reference', description: 'A profile page URL.' },
  title: S('Job title.'), userType: S('Employee, Contractor and so on.'), preferredLanguage: S('Language such as "en-US".'),
  locale: S('Region for formatting dates and numbers, such as "en-US".'), timezone: S('An IANA time zone such as "America/Chicago".'),
  active: { type: 'boolean', description: 'false means the user was disabled or unassigned. Your app should block sign-in, not delete.' },
  password: S('A password. Write-only: it must never be returned.', { mutability: 'writeOnly', returned: 'never' }),
  emails: multi('Email addresses.', MV_SUB('The email address.', ['work', 'home', 'other'])),
  phoneNumbers: multi('Phone numbers.', MV_SUB('The phone number.', ['work', 'home', 'mobile', 'fax', 'pager', 'other'])),
  ims: multi('Chat handles.', MV_SUB('The handle.')),
  photos: multi('Photo URLs.', { ...MV_SUB('The photo URL.', ['photo', 'thumbnail']), value: { type: 'reference', description: 'The photo URL.' } }),
  addresses: multi('Postal addresses.', {
    formatted: S('The full address.'), streetAddress: S('Street.'), locality: S('City.'), region: S('State or region.'),
    postalCode: S('ZIP or postal code.'), country: S('Two-letter ISO 3166-1 country code, such as "US".'),
    type: S('work, home or other.', { canonical: ['work', 'home', 'other'] }), primary: { type: 'boolean', description: 'The main address.' },
  }),
  groups: multi('Groups the user is in. Read-only: change membership through the Group instead.', {
    value: S('The group\u2019s id.'), $ref: { type: 'reference', description: 'The group\u2019s URL.' }, display: S('The group\u2019s name.'),
    type: S('direct or indirect.', { canonical: ['direct', 'indirect'] }),
  }, { mutability: 'readOnly' }),
  entitlements: multi('Things the user is entitled to.', MV_SUB('The entitlement.')),
  roles: multi('Roles assigned to the user.', MV_SUB('The role.')),
  x509Certificates: multi('Certificates for the user.', MV_SUB('A Base64 DER certificate.')),
};
export const ENTERPRISE = {
  employeeNumber: S('Employee number.'), costCenter: S('Cost center.'), organization: S('Organization.'),
  division: S('Division.'), department: S('Department.'),
  manager: {
    type: 'complex', description: 'The user\u2019s manager. An object with the manager\u2019s id in "value", not a plain string.',
    sub: { value: S('The manager\u2019s id in your app.'), $ref: { type: 'reference', description: 'The manager\u2019s URL.' }, displayName: S('The manager\u2019s name.', { mutability: 'readOnly' }) },
  },
};
export const GROUP = {
  ...COMMON,
  displayName: S('The group name. Required.', { required: true }),
  members: multi('Members of the group: users or other groups.', {
    value: S('The member\u2019s id in your app. Required.'), $ref: { type: 'reference', description: 'The member\u2019s URL.' },
    display: S('The member\u2019s name.', { mutability: 'readOnly' }), type: S('User or Group.', { canonical: ['User', 'Group'] }),
  }),
};
const DEFS = { User: USER, Group: GROUP };
const ENTERPRISE_ATTRS = new Set(Object.keys(ENTERPRISE).map((k) => k.toLowerCase()));
const SCIM_TYPES = ['invalidFilter', 'tooMany', 'uniqueness', 'mutability', 'invalidSyntax', 'invalidPath', 'noTarget', 'invalidValue', 'invalidVers', 'sensitive'];

// ---------- small helpers ----------
const lc = (s) => String(s).toLowerCase();
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
function findKey(def, key) {
  if (def[key]) return { name: key, def: def[key], exact: true };
  const k = Object.keys(def).find((x) => lc(x) === lc(key));
  return k ? { name: k, def: def[k], exact: false } : null;
}
function lev(a, b) {
  a = lc(a); b = lc(b);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const ALIASES = {
  first: 'givenName', firstname: 'givenName', fname: 'givenName', last: 'familyName', lastname: 'familyName', surname: 'familyName', lname: 'familyName',
  phone: 'phoneNumbers', phonenumber: 'phoneNumbers', mobile: 'phoneNumbers', email: 'emails', mail: 'emails', group: 'groups', member: 'members',
  enabled: 'active', disabled: 'active', isactive: 'active', login: 'userName', username: 'userName', upn: 'userName', fullname: 'displayName', jobtitle: 'title',
  address: 'addresses', employeeid: 'employeeNumber', dept: 'department', managerid: 'manager',
};
function suggest(key, names) {
  const norm = (s) => lc(s).replace(/[^a-z0-9$]/g, '');
  const alias = ALIASES[norm(key)];
  if (alias && names.includes(alias)) return alias;
  const exact = names.find((n) => norm(n) === norm(key));
  if (exact) return exact;
  let best = null, bestD = 99;
  for (const n of names) { const dd = lev(key, n); if (dd < bestD) { bestD = dd; best = n; } }
  return bestD <= Math.max(2, Math.floor(key.length / 4)) ? best : null;
}
const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const isDateTime = (s) => typeof s === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(s);

// ---------- input parsing ----------
/** Accepts bare JSON, or an HTTP request/response with a start line and headers above the JSON. */
export function parseInput(raw) {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('Paste a SCIM request or response first.');
  const http = { method: null, path: null, status: null, headers: {} };
  let body = text;
  const firstBrace = text.search(/[{[]/);
  const head = firstBrace === -1 ? text : text.slice(0, firstBrace);
  const lines = head.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length) {
    const start = lines[0];
    let m = start.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+?)(?:\s+HTTP\/[\d.]+)?$/i);
    if (m) { http.method = m[1].toUpperCase(); http.path = m[2]; }
    else if ((m = start.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/i))) http.status = +m[1];
    else if ((m = start.match(/^(\d{3})(\s|$)/))) http.status = +m[1];
    else if (firstBrace !== -1) throw new Error(`Could not read "${start.slice(0, 60)}" above the JSON. Paste bare JSON, or start with a line like "POST /scim/v2/Users".`);
    for (const l of lines.slice(1)) {
      const i = l.indexOf(':');
      if (i > 0) http.headers[lc(l.slice(0, i).trim())] = l.slice(i + 1).trim();
    }
    body = firstBrace === -1 ? '' : text.slice(firstBrace);
  }
  let json = null;
  if (body) {
    try { json = JSON.parse(body); } catch (e) {
      throw new Error(`The JSON is not valid: ${jsonErrorHint(body, e)}`);
    }
  } else if (http.method !== 'GET' && http.method !== 'DELETE') throw new Error('There is no JSON body to check.');
  return { http, json };
}
function jsonErrorHint(body, e) {
  const msg = e.message || String(e);
  const posM = msg.match(/position (\d+)/);
  let where = '';
  if (posM) {
    const pos = +posM[1];
    const line = body.slice(0, pos).split('\n').length;
    where = ` (line ${line})`;
  }
  if (/[\u201c\u201d]/.test(body)) return `it contains curly quotes (\u201c \u201d), probably from a word processor or chat app. Use straight quotes.${where}`;
  if (/,\s*[}\]]/.test(body)) return `there is a trailing comma before a closing bracket.${where}`;
  if (/'[^']*'\s*:/.test(body)) return `keys use single quotes. JSON needs double quotes.${where}`;
  return msg + where;
}

// ---------- filter parser (RFC 7644 section 3.4.2.2) ----------
const OPS = ['eq', 'ne', 'co', 'sw', 'ew', 'gt', 'lt', 'ge', 'le'];
export function parseFilter(src) {
  const toks = [];
  const re = /\s*(?:(\()|(\))|(\[)|(\])|("(?:[^"\\]|\\.)*")|('[^']*')|(==|!=|<=|>=|<|>)|([^\s()[\]"]+))/gy;
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < src.length) {
    const at = re.lastIndex;
    m = re.exec(src);
    if (!m) { if (/^\s*$/.test(src.slice(at))) break; throw new Error(`Unexpected text at position ${at + 1}: "${src.slice(at, at + 12)}"`); }
    if (m[6]) throw new Error(`Strings must use double quotes: ${m[6]} should be "${m[6].slice(1, -1)}".`);
    if (m[7]) throw new Error(`"${m[7]}" is not a SCIM operator. Use eq, ne, gt, ge, lt or le.`);
    toks.push(m[1] || m[2] || m[3] || m[4] ? { t: m[1] || m[2] || m[3] || m[4] } : m[5] ? { t: 'str', v: JSON.parse(m[5]) } : { t: 'word', v: m[8] });
  }
  let i = 0;
  const peek = () => toks[i];
  const word = (w) => peek() && peek().t === 'word' && lc(peek().v) === w;
  function expr() { let n = term(); while (word('or')) { i++; n = { or: [n, term()] }; } return n; }
  function term() { let n = factor(); while (word('and')) { i++; n = { and: [n, factor()] }; } return n; }
  function factor() {
    if (word('not')) { i++; if (!peek() || peek().t !== '(') throw new Error('"not" must be followed by parentheses.'); return { not: factor() }; }
    if (peek() && peek().t === '(') { i++; const n = expr(); if (!peek() || peek().t !== ')') throw new Error('Missing closing parenthesis.'); i++; return n; }
    const a = peek();
    if (!a || a.t !== 'word') throw new Error('Expected an attribute name.');
    i++;
    if (peek() && peek().t === '[') {
      i++; const inner = expr(); if (!peek() || peek().t !== ']') throw new Error('Missing closing ].'); i++;
      return { attr: a.v, filter: inner };
    }
    const op = peek();
    if (!op || op.t !== 'word') throw new Error(`Expected an operator after "${a.v}".`);
    if (lc(op.v) === 'pr') { i++; return { attr: a.v, op: 'pr' }; }
    if (!OPS.includes(lc(op.v))) throw new Error(`"${op.v}" is not a SCIM operator. Use eq, ne, co, sw, ew, gt, ge, lt, le or pr.`);
    i++;
    const v = peek();
    if (!v) throw new Error(`"${a.v} ${op.v}" needs a value.`);
    i++;
    if (v.t === 'str') return { attr: a.v, op: lc(op.v), value: v.v };
    if (v.t === 'word' && /^(true|false|null)$/i.test(v.v)) return { attr: a.v, op: lc(op.v), value: JSON.parse(lc(v.v)) };
    if (v.t === 'word' && /^-?\d+(\.\d+)?$/.test(v.v)) return { attr: a.v, op: lc(op.v), value: +v.v };
    throw new Error(`The value ${v.v} needs double quotes: "${v.v}".`);
  }
  const ast = expr();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i].v || toks[i].t}" after the end of the filter.`);
  return ast;
}
/** Split a PATCH path into schema, attribute, optional filter and sub-attribute. */
export function parsePath(path) {
  let schema = null, rest = path.trim();
  if (/^urn:/i.test(rest)) {
    const known = KNOWN_URNS.find((u) => lc(rest).startsWith(lc(u) + ':'));
    if (known) { schema = known; rest = rest.slice(known.length + 1); }
    else { const k = rest.lastIndexOf(':'); schema = rest.slice(0, k); rest = rest.slice(k + 1); }
  }
  const m = rest.match(/^([A-Za-z$][\w$-]*)(?:\[(.*)\])?(?:\.([A-Za-z$][\w$-]*))?$/s);
  const m2 = !m && rest.match(/^([A-Za-z$][\w$-]*)\.([A-Za-z$][\w$-]*)$/);
  if (!m && !m2) throw new Error(`"${path}" is not a valid SCIM path.`);
  const attr = (m || m2)[1];
  const filterSrc = m ? m[2] : undefined;
  const sub = m ? m[3] : m2[2];
  const filter = filterSrc !== undefined ? parseFilter(filterSrc) : null;
  return { schema, attr, filter, filterSrc, sub: sub || null };
}

// ---------- validation ----------
export function analyzeScim(raw, opts = {}) {
  const { http, json } = parseInput(raw);
  const checks = [];
  const add = (level, area, title, detail = '') => checks.push({ level, area, title, detail });
  const res = { http, json, checks, summary: [], operations: [] };

  let direction = opts.direction && opts.direction !== 'auto' ? opts.direction : null;
  if (!direction) direction = http.status ? 'response' : http.method ? 'request' : null;

  // Resource type from the URL, when we have one.
  const pathType = http.path ? (/\/Users(\/|\?|$)/i.test(http.path) ? 'User' : /\/Groups(\/|\?|$)/i.test(http.path) ? 'Group' : null) : null;
  const pathId = http.path ? (http.path.match(/\/(?:Users|Groups)\/([^/?#]+)/i) || [])[1] : null;

  // Headers
  if (http.headers.authorization) add('warn', 'Headers', 'You pasted an Authorization header', 'Nothing here leaves your browser, but treat that token as exposed if you paste it anywhere else. Rotate it if it is a real production secret.');
  const ct = http.headers['content-type'];
  if (ct && json && !/application\/(scim\+)?json/i.test(ct)) add('error', 'Headers', `Content-Type is ${ct}`, 'SCIM bodies are JSON. Use application/scim+json (application/json is widely accepted).');

  // GET with a filter
  if (http.method === 'GET' && http.path) {
    const q = http.path.includes('?') ? http.path.slice(http.path.indexOf('?') + 1) : '';
    const params = new URLSearchParams(q);
    const f = params.get('filter');
    if (f !== null) {
      try {
        const ast = parseFilter(f);
        const attrs = collectFilterAttrs(ast);
        add('ok', 'Filter', 'The filter is valid', `${f}`);
        res.summary.push(['Filter means', explainFilter(ast)]);
        checkAttrNames(attrs, pathType || 'User', add, 'Filter');
        if (pathType === 'User' && attrs.some((a) => lc(a) === 'username')) add('info', 'Filter', 'This is the identity provider\u2019s "does this user exist?" lookup', 'Entra ID and Okta call GET /Users?filter=userName eq "\u2026" before creating a user. Return a ListResponse with totalResults 0 (not a 404) when nobody matches.');
      } catch (e) { add('error', 'Filter', 'The filter is not valid SCIM', e.message); }
    }
    for (const k of ['startIndex', 'count']) {
      if (params.has(k) && !/^\d+$/.test(params.get(k))) add('error', 'Paging', `${k} must be a whole number`, `It is "${params.get(k)}".`);
    }
    if (params.get('startIndex') === '0') add('warn', 'Paging', 'startIndex is 0', 'SCIM paging is 1-based. Treat values below 1 as 1.');
    if (!json) { res.kind = 'Query'; return res; }
  }
  if (!json) { res.kind = http.method || 'Request'; add('info', 'Request', `${http.method} has no body`, http.method === 'DELETE' ? 'A successful DELETE returns 204 No Content.' : ''); return res; }
  if (typeOf(json) !== 'object') { add('error', 'Body', 'The body must be a JSON object', `It is ${typeOf(json) === 'array' ? 'an array. Wrap bulk data in a ListResponse or BulkRequest.' : 'a ' + typeOf(json)}.`); return res; }

  // Which kind of message is this?
  const schemas = Array.isArray(json.schemas) ? json.schemas : null;
  const has = (u) => schemas && schemas.some((s) => lc(s) === lc(u));
  let kind = has(URN.patch) ? 'PatchOp' : has(URN.list) ? 'ListResponse' : has(URN.error) ? 'Error' : has(URN.bulkReq) ? 'BulkRequest' : has(URN.bulkRes) ? 'BulkResponse' : has(URN.search) ? 'SearchRequest'
    : has(URN.group) ? 'Group' : has(URN.user) ? 'User' : null;
  if (!kind) {
    const keys = Object.keys(json).map(lc);
    kind = keys.includes('operations') ? 'PatchOp' : keys.includes('resources') || keys.includes('totalresults') ? 'ListResponse'
      : keys.includes('scimtype') || (keys.includes('status') && keys.includes('detail')) ? 'Error'
      : http.method === 'PATCH' ? 'PatchOp' : pathType || (keys.includes('members') ? 'Group' : keys.includes('username') ? 'User' : keys.includes('displayname') ? 'Group' : null);
  }
  res.kind = kind;
  if (!direction) direction = ['ListResponse', 'Error', 'BulkResponse'].includes(kind) || json.meta ? 'response' : 'request';
  res.direction = direction;

  if (!kind) {
    add('error', 'Schema', 'Could not tell what kind of SCIM message this is', 'Add a "schemas" array, for example ["urn:ietf:params:scim:schemas:core:2.0:User"].');
    return res;
  }
  checkSchemas(json, kind, add);

  if (http.method === 'PATCH' && kind !== 'PatchOp') add('error', 'Request', 'A PATCH body must be a PatchOp', `Expected {"schemas":["${URN.patch}"],"Operations":[\u2026]}. To replace the whole resource use PUT.`);
  if ((http.method === 'POST' || http.method === 'PUT') && kind === 'PatchOp') add('error', 'Request', `A PatchOp was sent with ${http.method}`, 'PatchOp bodies go with PATCH.');
  if (pathType && (kind === 'User' || kind === 'Group') && pathType !== kind) add('error', 'Request', `A ${kind} was sent to /${pathType}s`, `Send ${kind}s to /${kind}s.`);

  if (kind === 'User' || kind === 'Group') validateResource(json, kind, add, { direction, method: http.method, pathId, prefix: '' }, res);
  else if (kind === 'PatchOp') validatePatch(json, pathType || guessPatchType(json), add, res);
  else if (kind === 'ListResponse') validateList(json, add, res, direction);
  else if (kind === 'Error') validateError(json, add, res, http);
  else add('info', 'Schema', `${kind} messages are recognized but only lightly checked`);

  if (http.status && kind === 'User' && http.method === null && http.status !== 200 && http.status !== 201) add('warn', 'Response', `Status ${http.status} with a User body`, 'Creates return 201 and reads or updates return 200.');
  return res;
}

function checkSchemas(json, kind, add) {
  if (json.schemas === undefined) { add('error', 'Schema', 'The "schemas" attribute is missing', `Every SCIM message must list its schema URNs. This one needs "${kind === 'User' ? URN.user : kind === 'Group' ? URN.group : kind === 'PatchOp' ? URN.patch : kind === 'ListResponse' ? URN.list : URN.error}".`); return; }
  if (!Array.isArray(json.schemas)) { add('error', 'Schema', '"schemas" must be an array', `Use ["${json.schemas}"], not a plain string.`); return; }
  for (const s of json.schemas) {
    if (typeof s !== 'string') { add('error', 'Schema', 'Every entry in "schemas" must be a string'); continue; }
    const exact = KNOWN_URNS.includes(s);
    const ci = KNOWN_URNS.find((u) => lc(u) === lc(s));
    if (exact) continue;
    if (ci) add('warn', 'Schema', `Schema URN has the wrong case: ${s}`, `The standard spelling is ${ci}. Some servers compare URNs exactly.`);
    else if (/^urn:ietf:params:scim:schemas:extension:/i.test(s) || /^urn:[\w.-]+:/i.test(s) && !/ietf:params:scim:(schemas:core|api)/i.test(s)) add('info', 'Schema', `Custom extension: ${s}`, 'Its attributes are shown but not type-checked.');
    else {
      const near = KNOWN_URNS.map((u) => [u, lev(u, s)]).sort((a, b) => a[1] - b[1])[0];
      add('error', 'Schema', `Unknown schema URN: ${s}`, near[1] < 8 ? `Did you mean ${near[0]}?` : '');
    }
  }
  if (kind === 'User' && !json.schemas.some((s) => lc(s) === lc(URN.user))) add('error', 'Schema', `"schemas" does not include ${URN.user}`);
  if (kind === 'Group' && !json.schemas.some((s) => lc(s) === lc(URN.group))) add('error', 'Schema', `"schemas" does not include ${URN.group}`);
}

function validateValue(value, def, name, add, ctx, area) {
  const t = typeOf(value);
  if (value === null) return; // null means "unassigned" and is allowed
  if (def.multiValued) {
    if (t !== 'array') { add('error', area, `"${name}" must be an array`, `Wrap it in [ ]: SCIM sends ${name} as a list even when there is only one.`); if (t === 'object') validateComplex(value, def, name, add, ctx, area); return; }
    let primaries = 0;
    value.forEach((item, i) => {
      if (def.type === 'complex') {
        if (typeOf(item) !== 'object') add('error', area, `${name}[${i}] must be an object`, typeOf(item) === 'string' ? `Use {"value": "${item}"} instead of a bare string.` : '');
        else { validateComplex(item, def, `${name}[${i}]`, add, ctx, area); if (item.primary === true) primaries++; }
      }
    });
    if (primaries > 1) add('error', area, `More than one of "${name}" is marked primary`, 'Only one value can have "primary": true.');
    return;
  }
  if (t === 'array') { add('error', area, `"${name}" must not be an array`, `It holds a single ${def.type === 'complex' ? 'object' : def.type}.`); return; }
  switch (def.type) {
    case 'boolean':
      if (t === 'string' && /^(true|false)$/i.test(value)) add('error', area, `"${name}" is the string "${value}", not a boolean`, `Send ${lc(value)} without quotes.${value === 'False' || value === 'True' ? ' Microsoft Entra ID sends capitalized strings like "False" in PATCH unless the app uses the aadOptscim062020 feature flag, so accept both.' : ''}`);
      else if (t !== 'boolean') add('error', area, `"${name}" must be true or false`, `It is ${JSON.stringify(value)}.`);
      break;
    case 'complex':
      if (t !== 'object') add('error', area, `"${name}" must be an object`, name.endsWith('manager') && t === 'string' ? `Use {"value": "${value}"}: manager is an object holding the manager\u2019s id.` : `It is ${JSON.stringify(value)}.`);
      else validateComplex(value, def, name, add, ctx, area);
      break;
    case 'dateTime':
      if (!isDateTime(value)) add('error', area, `"${name}" is not an ISO 8601 date-time`, `It is ${JSON.stringify(value)}. Use a value like "2026-11-28T09:30:00Z".`);
      break;
    case 'integer':
      if (!Number.isInteger(value)) add('error', area, `"${name}" must be a whole number`, `It is ${JSON.stringify(value)}.`);
      break;
    default:
      if (t !== 'string') add('error', area, `"${name}" must be a string`, `It is ${JSON.stringify(value)}${t === 'number' ? '. Put quotes around it: IDs and codes are strings in SCIM.' : '.'}`);
      else if (def.canonical && value && !def.canonical.some((c) => lc(c) === lc(value))) add('info', area, `"${name}" is "${value}"`, `The usual values are ${def.canonical.join(', ')}.`);
  }
}

function validateComplex(obj, def, name, add, ctx, area) {
  const sub = def.sub || {};
  for (const [k, v] of Object.entries(obj)) {
    const f = findKey(sub, k);
    if (!f) {
      const s = suggest(k, Object.keys(sub));
      add('warn', area, `Unknown attribute "${name}.${k}"`, s ? `Did you mean "${s}"?` : `${name} allows ${Object.keys(sub).join(', ')}.`);
      continue;
    }
    validateValue(v, f.def, `${name}.${f.name}`, add, ctx, area);
  }
  const base = name.replace(/\[\d+\]$/, '');
  if (base === 'emails' && typeof obj.value === 'string' && !isEmail(obj.value)) add('error', 'Emails', `"${obj.value}" is not an email address`);
  if (/^(emails|phoneNumbers|ims|photos|members|roles|entitlements|x509Certificates)$/.test(base) && obj.value === undefined && def.sub?.value) add('error', area, `${name} has no "value"`);
  if (base === 'addresses' && typeof obj.country === 'string' && !/^[A-Z]{2}$/.test(obj.country)) add('warn', 'Addresses', `Country "${obj.country}" is not a two-letter code`, 'SCIM uses ISO 3166-1 alpha-2, for example "US" or "GB".');
  if (base === 'members' && obj.type && !/^(User|Group)$/.test(obj.type)) add('warn', 'Members', `Member type "${obj.type}"`, 'Use "User" or "Group".');
}

function validateResource(json, kind, add, ctx, res) {
  const def = DEFS[kind];
  const { direction, method } = ctx;
  const area = kind;
  const caseSlips = [];
  const declared = (json.schemas || []).map(lc);

  for (const [key, value] of Object.entries(json)) {
    if (key === 'schemas') continue;
    if (/^urn:/i.test(key)) {
      if (!declared.includes(lc(key))) add('error', 'Schema', `"${key}" is used but not listed in "schemas"`, 'Add the extension URN to the schemas array, or servers will ignore or reject it.');
      if (lc(key) === lc(URN.enterprise)) {
        if (typeOf(value) !== 'object') { add('error', 'Enterprise', 'The enterprise extension must be an object'); continue; }
        for (const [k, v] of Object.entries(value)) {
          const f = findKey(ENTERPRISE, k);
          if (!f) { const s = suggest(k, Object.keys(ENTERPRISE)); add('warn', 'Enterprise', `Unknown enterprise attribute "${k}"`, s ? `Did you mean "${s}"?` : `It allows ${Object.keys(ENTERPRISE).join(', ')}.`); continue; }
          if (!f.exact) caseSlips.push(`${k} \u2192 ${f.name}`);
          validateValue(v, f.def, f.name, add, ctx, 'Enterprise');
        }
      }
      continue;
    }
    const f = findKey(def, key);
    if (!f) {
      if (kind === 'User' && ENTERPRISE_ATTRS.has(lc(key))) add('warn', area, `"${key}" belongs in the enterprise extension`, `Move it under "${URN.enterprise}" and add that URN to schemas.`);
      else if (/\./.test(key)) add('warn', area, `"${key}" uses dot notation`, `Send nested objects instead, for example {"${key.split('.')[0]}": {"${key.split('.')[1]}": \u2026}}. Dotted keys are only allowed in PATCH values by some servers.`);
      else { const s = suggest(key, Object.keys(def)); add('warn', area, `Unknown attribute "${key}"`, s ? `Did you mean "${s}"? Servers usually ignore unknown attributes, so this value would be lost.` : 'Servers usually ignore unknown attributes, so this value would be lost. Custom data belongs in an extension schema.'); }
      continue;
    }
    if (!f.exact) caseSlips.push(`${key} \u2192 ${f.name}`);
    validateValue(value, f.def, f.name, add, ctx, area);
    if (direction === 'request' && f.def.mutability === 'readOnly' && value !== null) {
      if (f.name === 'id' && method === 'POST') add('warn', area, 'The request sets "id"', 'Your app assigns id when it creates the resource. Servers must ignore it; the identity provider\u2019s ID belongs in externalId.');
      else if (f.name === 'id' && method === 'PUT' && ctx.pathId && json.id !== ctx.pathId) add('error', area, '"id" in the body does not match the URL', `Body: ${json.id}, URL: ${ctx.pathId}.`);
      else if (f.name !== 'id') add('info', area, `"${f.name}" is read-only`, `Servers ignore it in requests.${f.name === 'groups' ? ' Change group membership by PATCHing the Group\u2019s members.' : ''}`);
    }
    if (direction === 'response' && f.def.returned === 'never') add('error', 'Security', `The response contains "${f.name}"`, 'Passwords must never be returned by a SCIM server. Strip it from your serializer.');
  }
  if (caseSlips.length) add('info', area, 'Some attribute names use different capitalization', `SCIM names are case-insensitive, so this is valid, but check your server handles it: ${caseSlips.join(', ')}.`);

  // Required attributes
  const reqName = kind === 'User' ? 'userName' : 'displayName';
  const reqKey = Object.keys(json).find((k) => lc(k) === lc(reqName));
  if (method !== 'PATCH') {
    if (!reqKey) add('error', area, `"${reqName}" is missing`, `${reqName} is required for every ${kind}.`);
    else if (typeof json[reqKey] === 'string' && !json[reqKey].trim()) add('error', area, `"${reqName}" is empty`);
    else if (typeof json[reqKey] === 'string' && json[reqKey] !== json[reqKey].trim()) add('warn', area, `"${reqName}" has leading or trailing spaces`, 'Trim it, or lookups by name will fail.');
    else if (reqKey) add('ok', area, `${reqName} is "${json[reqKey]}"`);
  }
  if (direction === 'response') {
    if (!json.id) add('error', area, 'The response has no "id"', 'The identity provider needs the id your app assigned to update or delete this resource later.');
    if (!json.meta) add('info', area, 'The response has no "meta"', 'meta.resourceType, created, lastModified and location are recommended.');
    else if (json.meta.resourceType && json.meta.resourceType !== kind) add('warn', area, `meta.resourceType is "${json.meta.resourceType}"`, `It should be "${kind}".`);
  }
  if (kind === 'User') {
    const emails = Array.isArray(json.emails) ? json.emails : [];
    const uname = json[reqKey];
    if (typeof uname === 'string' && uname.includes('@') && !isEmail(uname.trim())) add('warn', area, `userName "${uname}" looks like a broken email`);
    if (emails.length > 1 && !emails.some((e) => e && e.primary === true)) add('info', 'Emails', 'Several emails but none is primary', 'Mark one "primary": true so your app knows which to use.');
    const ext = json[Object.keys(json).find((k) => lc(k) === lc(URN.enterprise))];
    const active = json[Object.keys(json).find((k) => lc(k) === 'active')];
    const name = json.name || {};
    const primary = emails.find((e) => e && e.primary) || emails[0];
    res.summary.push(
      ['Signs in as', uname], ['Identity provider ID', json.externalId], ['Your app\u2019s ID', json.id],
      ['Name', [name.givenName, name.familyName].filter(Boolean).join(' ') || name.formatted || json.displayName],
      ['Email', primary && primary.value], ['Active', active === undefined ? undefined : String(active)],
      ['Job title', json.title], ['Department', ext && ext.department], ['Manager ID', ext && ext.manager && (ext.manager.value || ext.manager)],
    );
    if (active === false && direction === 'request') add('info', area, 'This user is being created or replaced as inactive', 'Your app should keep the account but block sign-in.');
  } else {
    const members = Array.isArray(json.members) ? json.members : [];
    res.summary.push(['Group name', json.displayName], ['Identity provider ID', json.externalId], ['Your app\u2019s ID', json.id], ['Members', String(members.length)]);
    if (members.length > 1000) add('warn', 'Members', `${members.length} members in one payload`, 'Large groups are slow to PUT. Identity providers usually page membership changes through PATCH.');
  }
}

function guessPatchType(json) {
  const ops = Array.isArray(json.Operations) ? json.Operations : Array.isArray(json.operations) ? json.operations : [];
  return ops.some((o) => o && typeof o.path === 'string' && /^members/i.test(o.path)) ? 'Group' : 'User';
}

function attrDef(type, schema, attr) {
  if (schema && lc(schema) === lc(URN.enterprise)) return findKey(ENTERPRISE, attr);
  if (schema && !KNOWN_URNS.some((u) => lc(u) === lc(schema))) return { name: attr, def: null, custom: true };
  return findKey(DEFS[type] || USER, attr);
}

function checkAttrNames(attrs, type, add, area) {
  for (const a of attrs) {
    if (!a) continue;
    let p;
    try { p = parsePath(a); } catch { continue; }
    const f = attrDef(type, p.schema, p.attr);
    if (!f && !(lc(p.attr) === 'meta')) {
      const s = suggest(p.attr, Object.keys(DEFS[type] || USER));
      add('warn', area, `"${a}" is not a standard ${type} attribute`, s ? `Did you mean "${s}"?` : '');
    } else if (f && f.def && p.sub && f.def.sub && !findKey(f.def.sub, p.sub)) add('warn', area, `"${p.attr}" has no sub-attribute "${p.sub}"`);
  }
}
function collectFilterAttrs(ast, out = []) {
  if (!ast) return out;
  if (ast.or || ast.and) (ast.or || ast.and).forEach((n) => collectFilterAttrs(n, out));
  else if (ast.not) collectFilterAttrs(ast.not, out);
  else if (ast.filter) { out.push(ast.attr); collectFilterAttrs(ast.filter, []).forEach((x) => out.push(`${ast.attr}.${x}`)); }
  else out.push(ast.attr);
  return out;
}
const OP_WORDS = { eq: 'is', ne: 'is not', co: 'contains', sw: 'starts with', ew: 'ends with', gt: 'is after/greater than', lt: 'is before/less than', ge: 'is at least', le: 'is at most' };
export function explainFilter(ast) {
  if (ast.or) return `${explainFilter(ast.or[0])} or ${explainFilter(ast.or[1])}`;
  if (ast.and) return `${explainFilter(ast.and[0])} and ${explainFilter(ast.and[1])}`;
  if (ast.not) return `not (${explainFilter(ast.not)})`;
  if (ast.filter) return `${ast.attr} where ${explainFilter(ast.filter)}`;
  if (ast.op === 'pr') return `${ast.attr} has a value`;
  return `${ast.attr} ${OP_WORDS[ast.op]} ${JSON.stringify(ast.value)}`;
}

function validatePatch(json, type, add, res) {
  const opsKey = Object.keys(json).find((k) => lc(k) === 'operations');
  if (!opsKey) { add('error', 'PatchOp', 'There is no "Operations" array', 'A PatchOp needs "Operations": [{"op": "replace", "path": "\u2026", "value": \u2026}].'); return; }
  if (opsKey !== 'Operations') add('info', 'PatchOp', `"${opsKey}" should be spelled "Operations"`, 'Names are case-insensitive, but most servers and SDKs look for "Operations".');
  const ops = json[opsKey];
  if (!Array.isArray(ops) || !ops.length) { add('error', 'PatchOp', '"Operations" must be a non-empty array'); return; }
  const capitalized = new Set();
  ops.forEach((o, i) => {
    const n = `Operation ${i + 1}`;
    if (typeOf(o) !== 'object') { add('error', 'PatchOp', `${n} is not an object`); return; }
    const op = typeof o.op === 'string' ? lc(o.op) : null;
    if (!op) { add('error', 'PatchOp', `${n} has no "op"`, 'Use "add", "remove" or "replace".'); return; }
    if (!['add', 'remove', 'replace'].includes(op)) { add('error', 'PatchOp', `${n}: "${o.op}" is not a PATCH operation`, 'Use "add", "remove" or "replace".'); return; }
    if (o.op !== op) capitalized.add(o.op);
    for (const k of Object.keys(o)) if (!['op', 'path', 'value'].includes(k)) add('warn', 'PatchOp', `${n} has an unknown member "${k}"`, 'Operations only have op, path and value.');

    let p = null, f = null;
    if (o.path !== undefined) {
      if (typeof o.path !== 'string') { add('error', 'PatchOp', `${n}: "path" must be a string`); return; }
      try { p = parsePath(o.path); } catch (e) { add('error', 'PatchOp', `${n}: invalid path`, `${e.message} Paths look like "active", "name.givenName", "emails[type eq \\"work\\"].value" or "members[value eq \\"123\\"]".`); return; }
      f = attrDef(type, p.schema, p.attr);
      if (!f) { const s = suggest(p.attr, Object.keys(DEFS[type])); add('error', 'PatchOp', `${n}: "${p.attr}" is not a ${type} attribute`, s ? `Did you mean "${s}"? Servers answer 400 invalidPath.` : 'Servers answer 400 invalidPath.'); }
      else if (f.def && f.def.mutability === 'readOnly') add('error', 'PatchOp', `${n}: "${f.name}" is read-only`, 'Servers answer 400 with scimType "mutability".');
      if (f && f.def && p.sub && f.def.sub && !findKey(f.def.sub, p.sub)) add('error', 'PatchOp', `${n}: "${f.name}" has no sub-attribute "${p.sub}"`);
      if (p.filter && f && f.def && f.def.sub) {
        for (const a of collectFilterAttrs(p.filter)) if (!findKey(f.def.sub, a)) add('warn', 'PatchOp', `${n}: the filter uses "${a}", which ${f.name} does not have`);
      }
    }

    if (op === 'remove') {
      if (!p) add('error', 'PatchOp', `${n}: "remove" needs a path`, 'Servers answer 400 with scimType "noTarget".');
      else if (o.value !== undefined && lc(p.attr) === 'members' && !p.filter) add('info', 'PatchOp', `${n}: removes members listed in "value"`, 'This is how Entra ID removes members. The RFC form is path members[value eq "id"] with no value. Support both.');
    } else if (o.value === undefined) add('error', 'PatchOp', `${n}: "${op}" needs a value`);

    // Value type checks
    if (o.value !== undefined && op !== 'remove') {
      if (!p) {
        if (typeOf(o.value) !== 'object') add('error', 'PatchOp', `${n}: without a path, "value" must be an object of attributes`);
        else for (const [k, v] of Object.entries(o.value)) {
          if (/^urn:/i.test(k) && k.lastIndexOf(':') > 40 && !KNOWN_URNS.some((u) => lc(u) === lc(k))) {
            add('info', 'PatchOp', `${n}: key "${k}" is a full attribute path`, 'Entra ID sends extension attributes this way. Treat it like the path form.');
            continue;
          }
          if (k.includes('.')) { add('warn', 'PatchOp', `${n}: key "${k}" uses dot notation inside value`, 'Older Entra ID apps send this. The standard form is a nested object or a path per operation.'); continue; }
          const fk = attrDef(type, /^urn:/i.test(k) ? k : null, k);
          if (/^urn:/i.test(k)) continue;
          if (!fk) add('warn', 'PatchOp', `${n}: unknown attribute "${k}" in value`);
          else if (fk.def) validateValue(v, fk.def, fk.name, add, {}, 'PatchOp');
        }
      } else if (f && f.def) {
        let d = f.def;
        if (p.sub && d.sub) d = (findKey(d.sub, p.sub) || {}).def || null;
        else if (p.filter && d.multiValued) d = { ...d, multiValued: false };
        if (d) {
          if (d.multiValued && op === 'add' && typeOf(o.value) === 'object') add('warn', 'PatchOp', `${n}: "value" for ${f.name} should be an array`, `Use [${JSON.stringify(o.value)}]. Many servers accept a single object, but the RFC uses an array.`);
          else validateValue(o.value, d, `${f.name}${p.sub ? '.' + p.sub : ''}`, add, {}, 'PatchOp');
        }
      }
    }
    res.operations.push(describeOp(op, o, p, f, type));
  });
  if (capitalized.size) add('info', 'PatchOp', `"op" is capitalized (${[...capitalized].join(', ')})`, 'Microsoft Entra ID sends "Add", "Replace" and "Remove". Compare op values case-insensitively.');
  add('ok', 'PatchOp', `${ops.length} operation${ops.length === 1 ? '' : 's'} read`);
}

function describeOp(op, o, p, f, type) {
  const v = o.value;
  const show = (x) => (typeof x === 'string' ? `"${x}"` : JSON.stringify(x));
  if (!p) {
    if (typeOf(v) === 'object') return `${op === 'add' ? 'Add' : 'Set'} ${Object.entries(v).map(([k, x]) => `${k} to ${show(x)}`).join(', ')}`;
    return `${op} ${show(v)}`;
  }
  const target = `${p.schema && lc(p.schema) === lc(URN.enterprise) ? 'enterprise ' : ''}${p.attr}${p.filter ? ` where ${explainFilter(p.filter)}` : ''}${p.sub ? ` \u2192 ${p.sub}` : ''}`;
  if (lc(p.attr) === 'active' && (v === false || lc(String(v)) === 'false')) return 'Deactivate the user (active = false). Block sign-in, keep the account.';
  if (lc(p.attr) === 'active' && (v === true || lc(String(v)) === 'true')) return 'Reactivate the user (active = true).';
  if (lc(p.attr) === 'members') {
    const ids = Array.isArray(v) ? v.map((m) => m && m.value).filter(Boolean) : [];
    if (op === 'add') return `Add ${ids.length} member${ids.length === 1 ? '' : 's'} to the group${ids.length ? `: ${ids.join(', ')}` : ''}`;
    if (op === 'remove') return p.filter ? `Remove the member where ${explainFilter(p.filter)}` : ids.length ? `Remove ${ids.join(', ')} from the group` : 'Remove every member from the group';
    return `Replace the whole member list with ${ids.length} member${ids.length === 1 ? '' : 's'}`;
  }
  if (op === 'remove') return `Clear ${target}`;
  return `${op === 'add' ? 'Add' : 'Set'} ${target} ${op === 'add' ? '' : 'to '}${show(v)}`.replace(/\s+/g, ' ');
}

function validateList(json, add, res, direction) {
  const g = (k) => json[Object.keys(json).find((x) => lc(x) === lc(k))];
  const total = g('totalResults');
  const resources = g('Resources');
  if (total === undefined) add('error', 'ListResponse', '"totalResults" is missing', 'It is required, even when it is 0.');
  else if (!Number.isInteger(total) || total < 0) add('error', 'ListResponse', '"totalResults" must be a whole number', `It is ${JSON.stringify(total)}.`);
  if (resources !== undefined && !Array.isArray(resources)) add('error', 'ListResponse', '"Resources" must be an array');
  const list = Array.isArray(resources) ? resources : [];
  if (Number.isInteger(total) && total > 0 && resources === undefined) add('error', 'ListResponse', `totalResults is ${total} but there is no "Resources" array`);
  if (Number.isInteger(total) && list.length > total) add('error', 'ListResponse', `"Resources" has ${list.length} items but totalResults says ${total}`);
  const si = g('startIndex');
  if (si !== undefined && (!Number.isInteger(si) || si < 1)) add('error', 'ListResponse', `startIndex is ${JSON.stringify(si)}`, 'It is 1-based, so the first page starts at 1.');
  const ipp = g('itemsPerPage');
  if (ipp !== undefined && ipp !== list.length) add('warn', 'ListResponse', `itemsPerPage is ${ipp} but this page has ${list.length}`);
  if (Number.isInteger(total) && list.length < total && si === undefined) add('warn', 'ListResponse', 'This is a partial page but startIndex is missing', 'The client cannot tell where to continue.');
  if (total === 0) add('ok', 'ListResponse', 'No matches (totalResults 0)', 'This is the right answer to "does this user exist?" when nobody matches. Do not return 404.');
  list.slice(0, 50).forEach((r, i) => {
    if (typeOf(r) !== 'object') { add('error', 'ListResponse', `Resource ${i + 1} is not an object`); return; }
    const sch = Array.isArray(r.schemas) ? r.schemas.map(lc) : [];
    const kind = sch.includes(lc(URN.group)) ? 'Group' : sch.includes(lc(URN.user)) ? 'User' : r.userName !== undefined ? 'User' : r.members !== undefined || r.displayName !== undefined ? 'Group' : null;
    if (!kind) { add('error', 'ListResponse', `Resource ${i + 1} has no recognizable schema`); return; }
    const sub = [];
    if (!r.schemas) sub.push({ level: 'error', area: kind, title: '"schemas" is missing', detail: '' });
    validateResource(r, kind, (level, area, title, detail) => sub.push({ level, area, title, detail }), { direction }, { summary: [] });
    for (const c of sub) if (c.level !== 'ok') add(c.level, `Resource ${i + 1}`, c.title, c.detail);
  });
  if (list.length > 50) add('info', 'ListResponse', `Checked the first 50 of ${list.length} resources`);
  res.summary.push(['Total results', total], ['On this page', String(list.length)], ['Start index', si]);
}

function validateError(json, add, res, http) {
  const status = json.status;
  if (status === undefined) add('error', 'Error', '"status" is missing', 'Repeat the HTTP status code here, as a string such as "409".');
  else if (typeof status === 'number') add('warn', 'Error', '"status" is a number', `RFC 7644 defines it as a string: "${status}". Most clients accept both.`);
  else if (!/^\d{3}$/.test(status)) add('error', 'Error', `"status" is "${status}"`, 'It should be an HTTP status code such as "400".');
  if (http.status && status && String(status) !== String(http.status)) add('warn', 'Error', `Body status ${status} differs from the HTTP status ${http.status}`);
  if (json.scimType !== undefined) {
    if (!SCIM_TYPES.includes(json.scimType)) add('error', 'Error', `Unknown scimType "${json.scimType}"`, `Use one of ${SCIM_TYPES.join(', ')}.`);
    else if (String(status) !== '400' && json.scimType !== 'uniqueness' && json.scimType !== 'tooMany' && json.scimType !== 'sensitive') add('warn', 'Error', `scimType "${json.scimType}" with status ${status}`, 'scimType values (other than uniqueness) go with 400 Bad Request.');
  }
  if (String(status) === '409' && json.scimType !== 'uniqueness') add('info', 'Error', '409 Conflict without scimType "uniqueness"', 'Entra ID and Okta treat 409 uniqueness as "user already exists" and will try to match the existing user instead.');
  if (!json.detail) add('info', 'Error', 'No "detail" message', 'A human-readable detail makes the provisioning logs in Entra ID and Okta far easier to read.');
  const meaning = { 400: 'Bad request: the body or filter is wrong.', 401: 'The bearer token is missing or wrong.', 403: 'The token is valid but not allowed to do this.', 404: 'That user or group does not exist in your app.', 409: 'A resource with that userName or externalId already exists.', 412: 'The ETag (If-Match) did not match.', 413: 'The payload is too large.', 429: 'Too many requests: the IdP will back off and retry.', 500: 'Your server hit an error.', 501: 'Not implemented.' }[+status];
  add('ok', 'Error', 'The error response is readable by identity providers');
  res.summary.push(['Status', status], ['Means', meaning], ['scimType', json.scimType], ['Detail', json.detail]);
}

export function verdict(checks) {
  return { errors: checks.filter((c) => c.level === 'error').length, warns: checks.filter((c) => c.level === 'warn').length };
}
export function describeAttr(kind, name) {
  const def = kind === 'Group' ? GROUP : USER;
  const f = findKey(def, name) || findKey(ENTERPRISE, name);
  return f ? f.def.description : '';
}

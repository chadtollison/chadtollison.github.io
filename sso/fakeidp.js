// A pretend identity provider that lives in your browser: it makes its own key and
// self-signed certificate, signs SAML responses with them and generates SCIM test users.
import { signElement, bytesToB64, b64ToBytes, parseCertificate } from './xmldsig.js';

// ---------- a tiny DER encoder, enough for one self-signed certificate ----------
const cat = (...parts) => { const n = parts.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
function len(n) { if (n < 128) return Uint8Array.of(n); const b = []; while (n) { b.unshift(n & 255); n >>= 8; } return Uint8Array.of(0x80 | b.length, ...b); }
const tlv = (tag, body) => cat(Uint8Array.of(tag), len(body.length), body);
const seq = (...p) => tlv(0x30, cat(...p));
const set = (...p) => tlv(0x31, cat(...p));
const int = (bytes) => tlv(0x02, bytes[0] & 0x80 ? cat(Uint8Array.of(0), bytes) : bytes);
const NULL = Uint8Array.of(5, 0);
const utf8 = (s) => tlv(0x0c, new TextEncoder().encode(s));
function oid(s) {
  const p = s.split('.').map(Number);
  const out = [p[0] * 40 + p[1]];
  for (const v of p.slice(2)) { const b = [v & 127]; let x = Math.floor(v / 128); while (x) { b.unshift((x & 127) | 128); x = Math.floor(x / 128); } out.push(...b); }
  return tlv(0x06, Uint8Array.from(out));
}
function time(d) {
  const z = (n, w = 2) => String(n).padStart(w, '0');
  const body = `${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}${z(d.getUTCHours())}${z(d.getUTCMinutes())}${z(d.getUTCSeconds())}Z`;
  return d.getUTCFullYear() < 2050 ? tlv(0x17, new TextEncoder().encode(z(d.getUTCFullYear() % 100) + body)) : tlv(0x18, new TextEncoder().encode(d.getUTCFullYear() + body));
}
const SHA256_RSA = seq(oid('1.2.840.113549.1.1.11'), NULL);
const name = (cn, o) => seq(set(seq(oid('2.5.4.3'), utf8(cn))), set(seq(oid('2.5.4.10'), utf8(o))));

const ALG = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
/** A fresh RSA key and self-signed certificate. Dates are Date objects. */
export async function makeKeyAndCert({ cn, org, notBefore, notAfter }) {
  const pair = await crypto.subtle.generateKey({ ...ALG, modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1) }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const serial = crypto.getRandomValues(new Uint8Array(16)); serial[0] &= 0x7f;
  const subject = name(cn, org);
  const tbs = seq(tlv(0xa0, int(Uint8Array.of(2))), int(serial), SHA256_RSA, subject, seq(time(notBefore), time(notAfter)), subject, spki);
  const sig = new Uint8Array(await crypto.subtle.sign(ALG, pair.privateKey, tbs));
  const cert = seq(tbs, SHA256_RSA, tlv(0x03, cat(Uint8Array.of(0), sig)));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return { pkcs8: bytesToB64(pkcs8), cert: bytesToB64(cert), key: pair.privateKey };
}

async function makeIdp() {
  const tag = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const now = new Date();
  const { pkcs8, cert } = await makeKeyAndCert({ cn: `test-idp-${tag}`, org: 'SSO Debugger test IdP (not for production)', notBefore: new Date(now.getTime() - 86400000), notAfter: new Date(now.getTime() + 3 * 365 * 86400000) });
  return { pkcs8, cert, entityId: `https://chadtollison.github.io/sso/test-idp/${tag}`, created: now.toISOString() };
}

const STORE = 'sso-debugger-test-idp';
let cached = null;
/** The visitor's own test IdP. Its key stays in this browser (localStorage) and is never sent anywhere. */
export async function getIdp({ fresh = false } = {}) {
  if (cached && !fresh) return cached;
  let saved = null;
  if (!fresh) { try { saved = JSON.parse(localStorage.getItem(STORE)); } catch { /* private mode */ } }
  const idp = saved && saved.pkcs8 && saved.cert ? saved : await makeIdp();
  try { localStorage.setItem(STORE, JSON.stringify(idp)); } catch { /* the key then lasts for this visit only */ }
  idp.key = await crypto.subtle.importKey('pkcs8', b64ToBytes(idp.pkcs8), ALG, false, ['sign']);
  idp.info = await parseCertificate(idp.cert);
  cached = idp;
  return idp;
}
export const pem = (b64) => `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;

// ---------- SAML ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const iso = (d) => d.toISOString().replace(/\.\d+Z$/, 'Z');
const rid = () => '_' + [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
export const NAMEID = {
  email: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  persistent: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  unspecified: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
  transient: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
};

/** Parse "name = value" lines (repeat a name for several values). */
export function parseAttrLines(text) {
  const out = new Map();
  for (const line of text.split('\n')) {
    const i = line.indexOf('=');
    if (i < 1) continue;
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    if (!k) continue;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(v);
  }
  return out;
}

/**
 * Build and sign a SAML response.
 * o: { spEntityId, acsUrl, nameId, nameIdFormat, attrs (Map), minutes, sign: 'assertion'|'response'|'both'|'none', inResponseTo,
 *      recipient (defaults to acsUrl), idp ({ entityId, key, cert }; defaults to this browser's test IdP) }
 */
export async function buildResponse(o) {
  const idp = o.idp || await getIdp();
  const now = new Date();
  const t = (min) => iso(new Date(now.getTime() + min * 60000));
  const aId = rid(), rId = rid();
  const irt = o.inResponseTo ? ` InResponseTo="${esc(o.inResponseTo)}"` : '';
  const attrs = [...(o.attrs || new Map())].map(([k, vals]) => `<saml:Attribute Name="${esc(k)}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">${vals.map((v) => `<saml:AttributeValue>${esc(v)}</saml:AttributeValue>`).join('')}</saml:Attribute>`).join('');
  const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${rId}" Version="2.0" IssueInstant="${t(0)}" Destination="${esc(o.acsUrl)}"${irt}>`
    + `<saml:Issuer>${esc(idp.entityId)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>`
    + `<saml:Assertion ID="${aId}" Version="2.0" IssueInstant="${t(0)}"><saml:Issuer>${esc(idp.entityId)}</saml:Issuer>`
    + `<saml:Subject><saml:NameID Format="${esc(o.nameIdFormat || NAMEID.email)}">${esc(o.nameId)}</saml:NameID>`
    + `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${t(Math.min(5, o.minutes || 5))}" Recipient="${esc(o.recipient || o.acsUrl)}"${irt}/></saml:SubjectConfirmation></saml:Subject>`
    + `<saml:Conditions NotBefore="${t(-1)}" NotOnOrAfter="${t(o.minutes || 5)}"><saml:AudienceRestriction><saml:Audience>${esc(o.spEntityId)}</saml:Audience></saml:AudienceRestriction></saml:Conditions>`
    + `<saml:AuthnStatement AuthnInstant="${t(0)}" SessionIndex="${aId}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>`
    + (attrs ? `<saml:AttributeStatement>${attrs}</saml:AttributeStatement>` : '')
    + '</saml:Assertion></samlp:Response>';
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const sign = o.sign || 'assertion';
  if (sign === 'assertion' || sign === 'both') await signElement(doc.getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:assertion', 'Assertion')[0], idp.key, idp.cert);
  if (sign === 'response' || sign === 'both') await signElement(doc.documentElement, idp.key, idp.cert);
  const out = new XMLSerializer().serializeToString(doc);
  return { xml: out, b64: bytesToB64(new TextEncoder().encode(out)) };
}

export async function metadata(ssoUrl) {
  const idp = await getIdp();
  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${esc(idp.entityId)}">
  <md:IDPSSODescriptor WantAuthnRequestsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>${idp.cert}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:NameIDFormat>${NAMEID.email}</md:NameIDFormat>
    <md:NameIDFormat>${NAMEID.persistent}</md:NameIDFormat>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${esc(ssoUrl)}"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>
`;
}

/** POST a response to an ACS URL the way a real IdP does: an auto-submitted HTML form. */
export function postToAcs(acsUrl, b64, relayState, target = '_self') {
  const f = document.createElement('form');
  f.method = 'POST'; f.action = acsUrl; f.target = target; f.hidden = true;
  const add = (n, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = v; f.appendChild(i); };
  add('SAMLResponse', b64);
  if (relayState) add('RelayState', relayState);
  document.body.appendChild(f);
  f.submit();
  f.remove();
}

// ---------- SCIM test users ----------
const FIRST = ['Ava', 'Noah', 'Mia', 'Liam', 'Zoe', 'Mateo', 'Priya', 'Kenji', 'Amara', 'Lucas', 'Sofia', 'Omar', 'Hana', 'Diego', 'Nora', 'Kwame', 'Elena', 'Ravi', 'Chloe', 'Yusuf', 'Ingrid', 'Tomás', 'Aisha', 'Finn'];
const LAST = ['Okafor', 'Lindqvist', 'Moreno', 'Tanaka', 'Fischer', 'Haddad', 'Novak', 'Reyes', 'Kowalski', 'Mensah', 'O’Brien', 'Nguyen', 'Patel', 'Rossi', 'Dubois', 'Sato', 'Bianchi', 'Ivanova', 'Castillo', 'Byrne'];
const DEPTS = ['Engineering', 'Finance', 'Sales', 'Support', 'Marketing', 'People', 'Legal', 'Data'];
const TITLES = ['Engineer', 'Analyst', 'Manager', 'Designer', 'Account Executive', 'Specialist', 'Director'];
const pick = (a) => a[crypto.getRandomValues(new Uint32Array(1))[0] % a.length];
const uuid = () => crypto.randomUUID();
const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toLowerCase();

export function fakeUsers(n, domain = 'example.com') {
  const users = [];
  const seen = new Set();
  const manager = uuid();
  while (users.length < n) {
    const given = pick(FIRST), family = pick(LAST);
    let user = `${ascii(given)}.${ascii(family)}`;
    while (seen.has(user)) user += Math.floor(Math.random() * 10);
    seen.add(user);
    const email = `${user}@${domain}`;
    users.push({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User', 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'],
      externalId: uuid(),
      userName: email,
      active: true,
      displayName: `${given} ${family}`,
      title: pick(TITLES),
      name: { givenName: given, familyName: family, formatted: `${given} ${family}` },
      emails: [{ value: email, type: 'work', primary: true }],
      phoneNumbers: [{ value: `+1 555 01${String(10 + users.length).slice(-2)}`, type: 'work' }],
      'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': { department: pick(DEPTS), employeeNumber: String(100000 + Math.floor(Math.random() * 900000)), manager: { value: manager } },
    });
  }
  return users;
}

const shq = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
export function scimOutput(users, mode) {
  if (mode === 'list') {
    return JSON.stringify({ schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'], totalResults: users.length, startIndex: 1, itemsPerPage: users.length,
      Resources: users.map((u) => ({ ...u, id: uuid(), meta: { resourceType: 'User', created: iso(new Date()), lastModified: iso(new Date()) } })) }, null, 2);
  }
  if (mode === 'curl') {
    const lines = ['# Set these two first:', 'SCIM_URL="https://your-app.example.com/scim/v2"', 'SCIM_TOKEN="paste-a-test-token"', '', '# Create the users (what Entra ID and Okta send when users are assigned)'];
    for (const u of users) lines.push(`curl -sS -X POST "$SCIM_URL/Users" -H "Authorization: Bearer $SCIM_TOKEN" -H "Content-Type: application/scim+json" \\\n  -d ${shq(JSON.stringify(u))}`);
    lines.push('', '# The lookup an IdP makes before creating a user. Expect a ListResponse with totalResults 1:',
      `curl -sS -G "$SCIM_URL/Users" -H "Authorization: Bearer $SCIM_TOKEN" --data-urlencode ${shq(`filter=userName eq "${users[0].userName}"`)}`,
      '', '# Deactivate a user the way Entra ID does (replace USER_ID with the id your app returned):',
      `curl -sS -X PATCH "$SCIM_URL/Users/USER_ID" -H "Authorization: Bearer $SCIM_TOKEN" -H "Content-Type: application/scim+json" \\\n  -d ${shq(JSON.stringify({ schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'Replace', path: 'active', value: 'False' }] }))}`);
    return lines.join('\n');
  }
  return `POST /scim/v2/Users HTTP/1.1\nContent-Type: application/scim+json\n\n${JSON.stringify(users[0], null, 2)}`;
}

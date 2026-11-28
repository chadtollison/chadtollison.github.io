// SAML 2.0 decoder and checker. Pure browser code: DOMParser, DecompressionStream and WebCrypto.
import { NS, b64ToBytes, verifySignature, parseCertificate, normalizeFingerprint, isSha1, shortAlg, idIndex, idOf } from './xmldsig.js';

export const SAMLP = 'urn:oasis:names:tc:SAML:2.0:protocol';
export const SAML = 'urn:oasis:names:tc:SAML:2.0:assertion';
const XENC = 'http://www.w3.org/2001/04/xmlenc#';

// ---------- plain-English reference tables ----------
export const STATUS = {
  Success: 'The identity provider signed the user in.',
  Requester: 'The identity provider rejected the request it received from your app (often a bad AuthnRequest, an unknown SP entity ID or a wrong ACS URL).',
  Responder: 'The identity provider hit an error on its side.',
  VersionMismatch: 'The SAML version was not 2.0.',
  AuthnFailed: 'The user could not be authenticated (wrong password, cancelled MFA, locked account).',
  InvalidAttrNameOrValue: 'An attribute in the request had an invalid name or value.',
  InvalidNameIDPolicy: 'The identity provider cannot give the NameID format your app asked for. Change NameIDPolicy in the request or the NameID setting at the IdP.',
  NoAuthnContext: 'The identity provider cannot meet the RequestedAuthnContext (for example, your app demanded a password but the user signed in another way).',
  NoAvailableIDP: 'No identity provider was available for a proxied request.',
  NoPassive: 'Your app asked for IsPassive (no user interaction) but the user would have had to sign in.',
  NoSupportedIDP: 'None of the identity providers in the request are supported.',
  PartialLogout: 'Logout did not finish at every service.',
  ProxyCountExceeded: 'Too many identity-provider hops.',
  RequestDenied: 'The identity provider refused (often: the user is not assigned to this application).',
  RequestUnsupported: 'The identity provider does not support this kind of request.',
  RequestVersionDeprecated: 'The request used a deprecated SAML version.',
  RequestVersionTooHigh: 'The request used a newer SAML version than the IdP supports.',
  RequestVersionTooLow: 'The request used an older SAML version than the IdP supports.',
  ResourceNotRecognized: 'The identity provider did not recognize a resource in the request.',
  TooManyResponses: 'The response would hold more elements than the IdP can return.',
  UnknownAttrProfile: 'The identity provider does not know the attribute profile requested.',
  UnknownPrincipal: 'The identity provider does not know this user.',
  UnsupportedBinding: 'The identity provider cannot reply on the binding your app asked for (check ProtocolBinding).',
};

export const NAMEID_FORMATS = {
  'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified': ['Unspecified', 'Any string the IdP chooses. Agree with the IdP on what it holds.'],
  'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress': ['Email address', 'The user\u2019s email. Readable, but it changes if the user\u2019s email changes.'],
  'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent': ['Persistent', 'An opaque ID that stays the same for this user at this app. The safest key to link accounts on.'],
  'urn:oasis:names:tc:SAML:2.0:nameid-format:transient': ['Transient', 'A one-time ID that changes on every sign-in. Never use it to look up or create users.'],
  'urn:oasis:names:tc:SAML:1.1:nameid-format:X509SubjectName': ['X.509 subject', 'The subject name of the user\u2019s certificate.'],
  'urn:oasis:names:tc:SAML:1.1:nameid-format:WindowsDomainQualifiedName': ['Windows domain name', 'DOMAIN\\user form.'],
  'urn:oasis:names:tc:SAML:2.0:nameid-format:kerberos': ['Kerberos principal', 'user@REALM form.'],
  'urn:oasis:names:tc:SAML:2.0:nameid-format:entity': ['Entity', 'Names a SAML system, not a user.'],
};

const AUTHN_CONTEXT = {
  'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport': 'Password over HTTPS',
  'urn:oasis:names:tc:SAML:2.0:ac:classes:Password': 'Password',
  'urn:oasis:names:tc:SAML:2.0:ac:classes:X509': 'Certificate (smart card or client cert)',
  'urn:oasis:names:tc:SAML:2.0:ac:classes:Kerberos': 'Kerberos (signed in to Windows)',
  'urn:oasis:names:tc:SAML:2.0:ac:classes:TimeSyncToken': 'One-time code token',
  'urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract': 'Phone-based two-factor',
  'urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified': 'Not stated',
  'http://schemas.microsoft.com/ws/2008/06/identity/authenticationmethod/windows': 'Windows integrated sign-in (Microsoft)',
  'http://schemas.microsoft.com/claims/multipleauthn': 'Multi-factor (Microsoft)',
  'urn:oasis:names:tc:SAML:2.0:ac:classes:Smartcard': 'Smart card',
  'urn:oasis:names:tc:SAML:2.0:ac:classes:SmartcardPKI': 'Smart card with PKI',
};

const ATTR_NAMES = {
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'Email (Microsoft / ADFS claim)',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname': 'First name (Microsoft claim)',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname': 'Last name (Microsoft claim)',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name': 'Username, usually the UPN (Microsoft claim)',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn': 'User principal name (Microsoft claim)',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': 'User identifier (Microsoft claim)',
  'http://schemas.microsoft.com/identity/claims/objectidentifier': 'Entra ID object ID: stable, never reused. A good key for users.',
  'http://schemas.microsoft.com/identity/claims/tenantid': 'Entra ID tenant (directory) ID',
  'http://schemas.microsoft.com/identity/claims/displayname': 'Display name (Entra ID)',
  'http://schemas.microsoft.com/identity/claims/identityprovider': 'Who authenticated the user (Entra ID)',
  'http://schemas.microsoft.com/claims/authnmethodsreferences': 'How the user signed in, for example password or MFA (Entra ID)',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups': 'Group IDs the user belongs to (Entra ID sends object IDs, not names)',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'App roles assigned to the user (Entra ID)',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/wids': 'Directory role template IDs (Entra ID)',
  'urn:oid:0.9.2342.19200300.100.1.3': 'mail (email address)',
  'urn:oid:2.5.4.42': 'givenName (first name)',
  'urn:oid:2.5.4.4': 'sn (last name)',
  'urn:oid:2.5.4.3': 'cn (common name)',
  'urn:oid:2.16.840.1.113730.3.1.241': 'displayName',
  'urn:oid:0.9.2342.19200300.100.1.1': 'uid (username)',
  'urn:oid:1.3.6.1.4.1.5923.1.1.1.6': 'eduPersonPrincipalName (scoped username)',
  'urn:oid:1.3.6.1.4.1.5923.1.1.1.7': 'eduPersonEntitlement',
  'urn:oid:1.3.6.1.4.1.5923.1.1.1.9': 'eduPersonScopedAffiliation',
  'urn:oid:1.3.6.1.4.1.5923.1.1.1.10': 'eduPersonTargetedID (opaque per-app ID)',
};
export function explainAttribute(name) {
  if (ATTR_NAMES[name]) return ATTR_NAMES[name];
  const n = name.toLowerCase().replace(/[^a-z]/g, '');
  if (/^(email|mail|emailaddress)$/.test(n)) return 'Email address';
  if (/^(firstname|givenname|fname)$/.test(n)) return 'First name';
  if (/^(lastname|surname|sn|lname|familyname)$/.test(n)) return 'Last name';
  if (/^(groups?|memberof)$/.test(n)) return 'Groups the user belongs to';
  if (/^roles?$/.test(n)) return 'Roles assigned to the user';
  if (/^(displayname|name|fullname)$/.test(n)) return 'Display name';
  if (/^(department|dept)$/.test(n)) return 'Department';
  if (/^(uid|username|login)$/.test(n)) return 'Username';
  return '';
}

// ---------- decoding ----------
async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const looksXml = (s) => /^\s*(\uFEFF)?\s*</.test(s);

/** Turn whatever the user pasted (XML, base64, URL-encoded, a redirect URL, a form body) into XML text. */
export async function decodeInput(raw) {
  const steps = [];
  let text = raw.trim();
  let param = null, binding = null, relayState = null, hasQuerySignature = false;
  if (!text) throw new Error('Paste a SAML response, assertion or request first.');

  if (!looksXml(text) && /(^https?:\/\/|[?&]?SAML(Response|Request)=)/i.test(text)) {
    const query = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text;
    const params = {};
    for (const part of query.split(/[&\n]/)) {
      const i = part.indexOf('=');
      if (i > 0) params[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    param = params.SAMLResponse !== undefined ? 'SAMLResponse' : params.SAMLRequest !== undefined ? 'SAMLRequest' : null;
    if (!param) throw new Error('That looks like a URL, but it has no SAMLResponse or SAMLRequest parameter.');
    text = params[param];
    if (params.RelayState) relayState = safeDecode(params.RelayState);
    if (params.Signature) hasQuerySignature = true;
    binding = /^https?:\/\//i.test(raw.trim()) ? 'HTTP-Redirect' : 'HTTP-POST';
    steps.push(`Took the ${param} parameter out of the ${/^https?:/i.test(raw.trim()) ? 'URL' : 'form body'}`);
  }
  if (!looksXml(text) && /%[0-9a-f]{2}/i.test(text)) {
    text = safeDecode(text);
    steps.push('URL-decoded it');
  }
  if (!looksXml(text)) {
    let bytes;
    try { bytes = b64ToBytes(text); } catch { throw new Error('This is not XML, and it is not valid Base64 either. Copy the whole SAMLResponse value.'); }
    steps.push(`Base64-decoded it (${bytes.length.toLocaleString()} bytes)`);
    let decoded = new TextDecoder().decode(bytes);
    if (!looksXml(decoded)) {
      try {
        decoded = new TextDecoder().decode(await inflateRaw(bytes));
        steps.push('Inflated it (DEFLATE, as the HTTP-Redirect binding uses)');
        binding = binding || 'HTTP-Redirect';
      } catch {
        throw new Error('The Base64 decoded to binary data that is not compressed XML. Make sure you copied the full value.');
      }
    }
    text = decoded;
  } else if (!steps.length) {
    steps.push('Read it as plain XML');
  }
  return { xml: text.replace(/^\uFEFF/, '').trim(), steps, param, binding, relayState, hasQuerySignature };
}
function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

// ---------- helpers ----------
const kids = (el, local, ns = SAML) => (el ? [...el.childNodes].filter((n) => n.nodeType === 1 && n.localName === local && n.namespaceURI === ns) : []);
const kid = (el, local, ns = SAML) => kids(el, local, ns)[0] || null;
const txt = (el) => (el ? el.textContent.trim() : '');
const attr = (el, name) => (el && el.hasAttribute(name) ? el.getAttribute(name) : null);

export function parseTime(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? 'invalid' : d;
}
export function relTime(d, now = new Date()) {
  if (!(d instanceof Date)) return '';
  const s = Math.round((d - now) / 1000);
  const a = Math.abs(s);
  const fmt = a < 60 ? `${a} second${a === 1 ? '' : 's'}` : a < 3600 ? `${Math.round(a / 60)} minute${Math.round(a / 60) === 1 ? '' : 's'}`
    : a < 86400 * 2 ? `${Math.round(a / 3600)} hour${Math.round(a / 3600) === 1 ? '' : 's'}` : `${Math.round(a / 86400)} days`;
  return s >= 0 ? `in ${fmt}` : `${fmt} ago`;
}
const sameUrl = (a, b) => (a || '').trim().replace(/\/+$/, '').toLowerCase() === (b || '').trim().replace(/\/+$/, '').toLowerCase();
const exactUrl = (a, b) => (a || '').trim() === (b || '').trim();

// ---------- analysis ----------
/**
 * Analyze a SAML message.
 * settings: { spEntityId, acsUrl, idpEntityId, idpCert, requestId, requiredAttrs, skewMinutes, now }
 */
export async function analyzeSaml(raw, settings = {}) {
  const decoded = await decodeInput(raw);
  const checks = [];
  const add = (level, area, title, detail = '') => checks.push({ level, area, title, detail });
  const now = settings.now || new Date();
  const skew = (Number(settings.skewMinutes) || 0) * 60000;

  if (/<!DOCTYPE/i.test(decoded.xml)) {
    add('error', 'Security', 'The message contains a DOCTYPE', 'SAML messages never need one, and DOCTYPEs enable entity-expansion and XXE attacks. A safe service provider must reject this message.');
  }
  const doc = new DOMParser().parseFromString(decoded.xml, 'application/xml');
  const perr = doc.getElementsByTagName('parsererror')[0];
  if (perr) {
    const msg = perr.textContent.replace(/\s+/g, ' ').replace(/^.*?error[^:]*:\s*/i, '').slice(0, 240);
    throw new Error(`The XML is not well formed: ${msg}`);
  }
  const root = doc.documentElement;
  const result = { decoded, doc, root, checks, kind: root.localName, now, settings };

  if (root.namespaceURI === 'urn:oasis:names:tc:SAML:1.0:protocol' || root.namespaceURI === 'urn:oasis:names:tc:SAML:1.0:assertion') {
    add('warn', 'Message', 'This is a SAML 1.x message', 'This debugger checks SAML 2.0. The structure is shown, but the checks below do not apply.');
    return result;
  }

  const isProtocol = root.namespaceURI === SAMLP;
  const isAssertionRoot = root.namespaceURI === SAML && root.localName === 'Assertion';
  if (!isProtocol && !isAssertionRoot) {
    // e.g. a WS-Federation RequestSecurityTokenResponse wrapping an assertion
    const inner = doc.getElementsByTagNameNS(SAML, 'Assertion')[0];
    if (!inner) {
      add('error', 'Message', `Not a SAML 2.0 message (root element is <${root.nodeName}>)`, 'Expected samlp:Response, saml:Assertion, samlp:AuthnRequest or a logout message.');
      return result;
    }
    add('info', 'Message', `Found a SAML 2.0 assertion inside <${root.nodeName}>`, 'This looks like WS-Federation. The assertion inside is checked below.');
  }

  // ----- requests -----
  if (isProtocol && root.localName !== 'Response') {
    await analyzeRequest(result, add, now, skew);
    return result;
  }

  // ----- response / assertion -----
  const response = isProtocol ? root : null;
  const allAssertions = [...doc.getElementsByTagNameNS(SAML, 'Assertion')];
  const encrypted = [...doc.getElementsByTagNameNS(SAML, 'EncryptedAssertion')];
  const assertion = isAssertionRoot ? root : response ? kid(response, 'Assertion') : allAssertions[0] || null;
  result.response = response;
  result.assertion = assertion;
  result.encrypted = encrypted.length > 0;

  // Response-level fields
  if (response) {
    result.responseInfo = {
      id: attr(response, 'ID'), version: attr(response, 'Version'),
      issueInstant: attr(response, 'IssueInstant'), destination: attr(response, 'Destination'),
      inResponseTo: attr(response, 'InResponseTo'), issuer: txt(kid(response, 'Issuer')),
    };
    if (attr(response, 'Version') !== '2.0') add('error', 'Message', `Version is "${attr(response, 'Version') || 'missing'}"`, 'SAML 2.0 responses must say Version="2.0".');
    if (!attr(response, 'ID')) add('error', 'Message', 'The response has no ID', 'Every SAML message needs a unique ID.');
    const status = kid(response, 'Status', SAMLP);
    const code = kid(status, 'StatusCode', SAMLP);
    const top = (attr(code, 'Value') || '').replace(/^.*:/, '');
    const sub = (attr(kid(code, 'StatusCode', SAMLP), 'Value') || '').replace(/^.*:/, '');
    const message = txt(kid(status, 'StatusMessage', SAMLP));
    result.status = { top, sub, message };
    if (!code) add('error', 'Status', 'The response has no StatusCode');
    else if (top === 'Success') add('ok', 'Status', 'Status is Success', STATUS.Success);
    else {
      add('error', 'Status', `Sign-in failed: ${top}${sub ? ` / ${sub}` : ''}`,
        [STATUS[sub] || STATUS[top] || '', message ? `The IdP says: \u201c${message}\u201d` : ''].filter(Boolean).join(' '));
    }
    checkTime(add, 'Message', 'IssueInstant', attr(response, 'IssueInstant'), now, skew, 'issued');
    if (settings.acsUrl) {
      const dest = attr(response, 'Destination');
      if (!dest) add('warn', 'Destination', 'The response has no Destination', 'A signed response sent over HTTP-POST must have a Destination equal to your ACS URL (SAML bindings spec, 3.5.5.2).');
      else if (exactUrl(dest, settings.acsUrl)) add('ok', 'Destination', 'Destination matches your ACS URL');
      else add('error', 'Destination', 'Destination does not match your ACS URL', `Response says ${dest}, your ACS URL is ${settings.acsUrl}.${sameUrl(dest, settings.acsUrl) ? ' They differ only by case or a trailing slash, which strict SPs still reject.' : ''}`);
    }
    if (settings.requestId) {
      const irt = attr(response, 'InResponseTo');
      if (!irt) add('warn', 'Request', 'No InResponseTo, so this was IdP-initiated', `You expected a reply to request ${settings.requestId}. SPs that only allow SP-initiated sign-in will reject it.`);
      else if (irt === settings.requestId) add('ok', 'Request', 'InResponseTo matches your request ID');
      else add('error', 'Request', 'InResponseTo does not match your request ID', `Response answers ${irt}, but you sent ${settings.requestId}. This is often a stale tab or a second sign-in attempt.`);
    }
  }

  if (allAssertions.length > 1) add('error', 'Security', `The message holds ${allAssertions.length} assertions`, 'SAML responses normally carry one. Extra assertions are how signature wrapping attacks hide a forged one.');
  if (response) {
    const stray = allAssertions.filter((a) => a.parentNode !== response);
    if (stray.length) add('error', 'Security', 'An assertion is hidden somewhere unusual', `Found an assertion inside <${stray[0].parentNode.nodeName}>. Assertions belong directly under the Response. This is a signature wrapping pattern.`);
  }
  if (encrypted.length) {
    add('info', 'Assertion', 'The assertion is encrypted', 'Only your service provider\u2019s private key can decrypt it, so its contents cannot be checked here. Use the IdP\u2019s test mode without encryption to see them, or check the outer response.');
    const alg = attr(doc.getElementsByTagNameNS(XENC, 'EncryptionMethod')[0], 'Algorithm') || '';
    if (/rsa-1_5|aes\d+-cbc/.test(alg)) add('warn', 'Security', `Weak encryption algorithm (${shortAlg(alg)})`, 'RSA 1.5 and AES-CBC have known padding-oracle attacks. Prefer RSA-OAEP and AES-GCM.');
  }
  if (!assertion && !encrypted.length && (!result.status || result.status.top === 'Success')) {
    add('error', 'Assertion', 'There is no assertion', 'A successful response needs an assertion saying who the user is.');
  }

  if (assertion) analyzeAssertion(result, assertion, add, now, skew);
  await analyzeSignatures(result, add, now);
  return result;
}

function checkTime(add, area, label, value, now, skew, verb) {
  const t = parseTime(value);
  if (!value) { add('error', area, `${label} is missing`); return; }
  if (t === 'invalid') { add('error', area, `${label} is not a valid date: ${value}`); return; }
  if (!/Z$|[+-]\d\d:\d\d$/.test(value)) add('warn', area, `${label} has no time zone`, 'SAML times must be UTC and end in "Z".');
  if (t - now > skew) add('error', area, `${label} is in the future (${relTime(t, now)})`, 'The IdP and SP clocks disagree. Sync both with NTP, or allow a few minutes of clock skew.');
  else if (now - t > 30 * 60000 + skew) add('info', area, `This message was ${verb} ${relTime(t, now)}`, 'Old messages fail time checks. Capture a fresh one if you are debugging a live sign-in.');
}

function analyzeAssertion(result, a, add, now, skew) {
  const s = result.settings;
  const info = {
    id: attr(a, 'ID'), version: attr(a, 'Version'), issueInstant: attr(a, 'IssueInstant'), issuer: txt(kid(a, 'Issuer')),
  };
  result.assertionInfo = info;
  if (!info.id) add('error', 'Assertion', 'The assertion has no ID');
  if (!result.response) checkTime(add, 'Assertion', 'IssueInstant', info.issueInstant, now, skew, 'issued');

  // Issuer
  if (!info.issuer) add('error', 'Issuer', 'The assertion has no Issuer', 'Your SP uses the Issuer to pick which IdP certificate to trust.');
  else {
    const ri = result.responseInfo?.issuer;
    if (ri && ri !== info.issuer) add('error', 'Issuer', 'Response and assertion issuers differ', `Response: ${ri}. Assertion: ${info.issuer}.`);
    if (s.idpEntityId) {
      if (info.issuer === s.idpEntityId.trim()) add('ok', 'Issuer', 'Issuer matches your IdP entity ID');
      else add('error', 'Issuer', 'Issuer does not match your IdP entity ID', `The message says ${info.issuer}, you expect ${s.idpEntityId}.${sameUrl(info.issuer, s.idpEntityId) ? ' Only a trailing slash or case differs, but entity IDs are compared exactly.' : ''}`);
    }
  }

  // Subject
  const subject = kid(a, 'Subject');
  const nameId = kid(subject, 'NameID');
  const fmt = attr(nameId, 'Format') || 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified';
  result.subject = { nameId: txt(nameId), format: fmt, spNameQualifier: attr(nameId, 'SPNameQualifier'), nameQualifier: attr(nameId, 'NameQualifier') };
  if (!subject) add('error', 'Subject', 'The assertion has no Subject', 'Without a Subject your app cannot tell who signed in.');
  else if (kid(subject, 'EncryptedID')) add('info', 'Subject', 'The NameID is encrypted', 'Only your SP\u2019s private key can read it.');
  else if (!nameId) add('warn', 'Subject', 'No NameID', 'Your app will have to find the user from an attribute instead.');
  else {
    const hasComment = [...nameId.childNodes].some((n) => n.nodeType === 8);
    if (hasComment) {
      add('error', 'Security', 'The NameID contains an XML comment', `Some SAML libraries read only the text before the comment (CVE-2017-11427 and friends), so "${nameId.textContent}" could be read as "${nameId.firstChild?.textContent || ''}". Reject this message.`);
    }
    if (!txt(nameId)) add('error', 'Subject', 'The NameID is empty');
    const [label, meaning] = NAMEID_FORMATS[fmt] || ['Custom', 'A format agreed between your IdP and app.'];
    if (fmt.endsWith(':transient')) add('warn', 'Subject', 'NameID is transient', meaning + ' If users get a new account every sign-in, this is why.');
    else if (fmt.endsWith(':emailAddress') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(txt(nameId))) add('error', 'Subject', 'NameID format says email, but the value is not an email', `Value: ${txt(nameId)}`);
    else add('ok', 'Subject', `NameID is ${label.toLowerCase()}: ${txt(nameId)}`, meaning);
    if (s.spEntityId && attr(nameId, 'SPNameQualifier') && attr(nameId, 'SPNameQualifier') !== s.spEntityId) {
      add('warn', 'Subject', 'SPNameQualifier is not your SP entity ID', `It says ${attr(nameId, 'SPNameQualifier')}.`);
    }
  }

  // SubjectConfirmation
  const confs = kids(subject, 'SubjectConfirmation');
  const bearer = confs.find((c) => attr(c, 'Method') === 'urn:oasis:names:tc:SAML:2.0:cm:bearer');
  if (subject && !bearer) add('error', 'Subject', 'No bearer SubjectConfirmation', 'Web browser SSO requires Method="urn:oasis:names:tc:SAML:2.0:cm:bearer".');
  if (bearer) {
    const scd = kid(bearer, 'SubjectConfirmationData');
    result.confirmation = { recipient: attr(scd, 'Recipient'), notOnOrAfter: attr(scd, 'NotOnOrAfter'), notBefore: attr(scd, 'NotBefore'), inResponseTo: attr(scd, 'InResponseTo'), address: attr(scd, 'Address') };
    const c = result.confirmation;
    if (!scd) add('error', 'Subject', 'The bearer confirmation has no SubjectConfirmationData');
    else {
      if (!c.recipient) add('error', 'Subject', 'SubjectConfirmationData has no Recipient', 'The profile requires Recipient set to your ACS URL.');
      else if (s.acsUrl) {
        if (exactUrl(c.recipient, s.acsUrl)) add('ok', 'Subject', 'Recipient matches your ACS URL');
        else add('error', 'Subject', 'Recipient does not match your ACS URL', `Assertion says ${c.recipient}, your ACS URL is ${s.acsUrl}. Fix the Reply URL / ACS URL at the IdP.`);
      }
      if (!c.notOnOrAfter) add('error', 'Subject', 'SubjectConfirmationData has no NotOnOrAfter', 'Without it, a stolen assertion could be replayed forever.');
      else {
        const t = parseTime(c.notOnOrAfter);
        if (t === 'invalid') add('error', 'Subject', `SubjectConfirmationData NotOnOrAfter is not a date: ${c.notOnOrAfter}`);
        else if (now - t >= skew) add('error', 'Subject', `The assertion expired ${relTime(t, now)}`, `SubjectConfirmationData NotOnOrAfter was ${t.toISOString()}. Bearer assertions are short-lived (usually 5 minutes), so a captured assertion stops working quickly. If this is a live failure, check clock sync.`);
        else add('ok', 'Subject', `The assertion can be used until ${t.toISOString().replace('.000', '')} (${relTime(t, now)})`);
      }
      if (c.notBefore) add('warn', 'Subject', 'SubjectConfirmationData has NotBefore', 'The Web SSO profile says bearer confirmations must not have NotBefore. Some SPs reject it.');
      const rirt = result.responseInfo?.inResponseTo;
      if ((rirt || '') !== (c.inResponseTo || '') && (rirt || c.inResponseTo)) add('error', 'Request', 'InResponseTo differs between the response and the assertion', `Response: ${rirt || '(none)'}. Assertion: ${c.inResponseTo || '(none)'}.`);
    }
  }

  // Conditions
  const cond = kid(a, 'Conditions');
  const audiences = cond ? kids(cond, 'AudienceRestriction').flatMap((r) => kids(r, 'Audience').map(txt)) : [];
  result.conditions = { notBefore: attr(cond, 'NotBefore'), notOnOrAfter: attr(cond, 'NotOnOrAfter'), audiences, oneTimeUse: !!kid(cond, 'OneTimeUse') };
  if (!cond) add('warn', 'Conditions', 'The assertion has no Conditions', 'No time window or audience restriction, so any app trusting this IdP would accept it.');
  else {
    const nb = parseTime(attr(cond, 'NotBefore'));
    const na = parseTime(attr(cond, 'NotOnOrAfter'));
    if (nb === 'invalid' || na === 'invalid') add('error', 'Conditions', 'A Conditions time is not a valid date');
    if (nb instanceof Date && nb - now > skew) add('error', 'Conditions', `The assertion is not valid yet (starts ${relTime(nb, now)})`, 'The IdP clock is ahead of yours. Sync clocks or allow a little skew.');
    if (na instanceof Date) {
      if (now - na >= skew) add('error', 'Conditions', `Conditions expired ${relTime(na, now)}`, `NotOnOrAfter was ${na.toISOString()}.`);
      else if (!(nb instanceof Date) || nb - now <= skew) add('ok', 'Conditions', `Inside the valid time window (ends ${relTime(na, now)})`, `${nb instanceof Date ? nb.toISOString() : 'no start'} to ${na.toISOString()}, allowing ${result.settings.skewMinutes || 0} min of clock skew.`);
      if (nb instanceof Date && na - nb > 24 * 3600000) add('warn', 'Conditions', 'The validity window is over a day long', 'Long-lived assertions are easier to replay if stolen. A few minutes is typical.');
    }
    if (!audiences.length) add('warn', 'Audience', 'No AudienceRestriction', 'The assertion is not tied to your app, so it could be replayed to another app that trusts the same IdP.');
    else if (s.spEntityId) {
      if (audiences.includes(s.spEntityId.trim())) add('ok', 'Audience', 'Audience matches your SP entity ID');
      else {
        const near = audiences.find((x) => sameUrl(x, s.spEntityId));
        add('error', 'Audience', 'Audience does not match your SP entity ID', `The assertion is for ${audiences.join(', ')}, but your SP entity ID is ${s.spEntityId}.${near ? ' They differ only by case or a trailing slash. Entity IDs must match exactly.' : ' Set the Identifier (Entity ID) at the IdP to your SP entity ID.'}`);
      }
    } else add('info', 'Audience', `Audience: ${audiences.join(', ')}`, 'Add your SP entity ID in the settings to check it.');
  }

  // AuthnStatement
  const authn = kid(a, 'AuthnStatement');
  const classRef = txt(kid(kid(authn, 'AuthnContext'), 'AuthnContextClassRef'));
  result.authn = { instant: attr(authn, 'AuthnInstant'), sessionIndex: attr(authn, 'SessionIndex'), sessionNotOnOrAfter: attr(authn, 'SessionNotOnOrAfter'), classRef, classLabel: AUTHN_CONTEXT[classRef] || '' };
  if (!authn) add('warn', 'Authentication', 'No AuthnStatement', 'Web browser SSO assertions should say when and how the user signed in.');
  else {
    const snoa = parseTime(attr(authn, 'SessionNotOnOrAfter'));
    if (snoa instanceof Date && snoa < now) add('warn', 'Authentication', `The IdP session ended ${relTime(snoa, now)}`, 'SessionNotOnOrAfter is in the past, so the SP should end the session.');
    if (!attr(authn, 'SessionIndex')) add('info', 'Authentication', 'No SessionIndex', 'Single logout needs a SessionIndex to know which session to end.');
  }

  // Attributes
  const attrs = [];
  for (const st of kids(a, 'AttributeStatement')) {
    for (const at of kids(st, 'Attribute')) {
      const values = kids(at, 'AttributeValue').map((v) => ({ text: txt(v), nil: v.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'nil') === 'true' }));
      attrs.push({ name: attr(at, 'Name') || '', friendly: attr(at, 'FriendlyName') || '', format: attr(at, 'NameFormat') || '', values, meaning: explainAttribute(attr(at, 'Name') || attr(at, 'FriendlyName') || '') });
    }
  }
  result.attributes = attrs;
  const seen = new Set();
  for (const at of attrs) {
    if (seen.has(at.name)) add('warn', 'Attributes', `Attribute "${at.name}" appears twice`, 'Merge it into one Attribute with several values. Many SPs only read the first.');
    seen.add(at.name);
    if (!at.values.length || at.values.every((v) => !v.text && !v.nil)) add('warn', 'Attributes', `Attribute "${at.friendly || at.name}" is empty`, 'The IdP sent the attribute with no value. Check the user\u2019s profile has that field filled in, or the claim mapping at the IdP.');
  }
  if (attrs.some((x) => x.name === 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups') && attrs.find((x) => x.name.endsWith('/groups')).values.length >= 150) {
    add('warn', 'Attributes', 'The groups claim hit Entra ID\u2019s 150-group limit', 'Past 150 groups Entra ID stops sending them and sends a link to Graph instead. Filter groups to those assigned to the app.');
  }
  const required = (s.requiredAttrs || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  for (const r of required) {
    const hit = attrs.find((x) => x.name === r || x.friendly === r || x.name.toLowerCase() === r.toLowerCase() || x.friendly.toLowerCase() === r.toLowerCase() || x.name.toLowerCase().endsWith('/' + r.toLowerCase()));
    if (!hit) add('error', 'Attributes', `Missing required attribute "${r}"`, `The IdP did not send it. Attribute names sent: ${attrs.map((x) => x.friendly || x.name).join(', ') || 'none'}. Add a claim mapping at the IdP.`);
    else if (hit.values.every((v) => !v.text)) add('error', 'Attributes', `Required attribute "${r}" has no value`);
    else add('ok', 'Attributes', `Required attribute "${r}" is present`, hit.name !== r ? `Sent as ${hit.name}` : '');
  }
}

async function analyzeSignatures(result, add, now) {
  const { doc, response, assertion, settings: s } = result;
  const sigs = [...doc.getElementsByTagNameNS(NS.ds, 'Signature')];
  result.signatures = [];

  // The user's trusted IdP certificate: a full certificate verifies with it, a bare thumbprint is compared.
  let pinned = null, pinnedPrint = '';
  const pin = (s.idpCert || '').trim();
  if (pin) {
    const bare = normalizeFingerprint(pin);
    if (/^([0-9A-F]{40}|[0-9A-F]{64})$/.test(bare) && pin.length < 120) pinnedPrint = bare;
    else {
      try { pinned = await parseCertificate(pin); } catch { add('error', 'Certificate', 'The IdP certificate in the settings could not be read', 'Paste the PEM text (-----BEGIN CERTIFICATE-----) or a SHA-1 / SHA-256 thumbprint.'); }
    }
  }

  // Duplicate IDs anywhere are a wrapping red flag.
  for (const [id, els] of idIndex(doc)) {
    if (els.length > 1) add('error', 'Security', `Two elements share the ID "${id}"`, 'IDs must be unique. Duplicates let an attacker make the signature check one element while your app reads another (XML signature wrapping).');
  }

  for (const sig of sigs) {
    const v = await verifySignature(sig, pinned);
    const parent = sig.parentNode;
    v.where = parent === response ? 'Response' : parent === assertion ? 'Assertion' : parent.localName === 'Assertion' ? 'Hidden assertion' : `<${parent.nodeName}>`;
    result.signatures.push(v);
  }
  const responseSig = result.signatures.find((x) => x.where === 'Response');
  const assertionSig = result.signatures.find((x) => x.where === 'Assertion');
  for (const v of result.signatures) {
    if (v.where !== 'Response' && v.where !== 'Assertion' && v.where !== 'Hidden assertion') add('warn', 'Signature', `A signature sits inside ${v.where}`, 'Only the Response and the Assertion should be signed in SAML Web SSO.');
  }

  if (!result.signatures.length) {
    if (result.encrypted) add('warn', 'Signature', 'The outer response is not signed', 'The encrypted assertion may be signed inside, which cannot be checked here.');
    else if (assertion || response) add('error', 'Signature', 'Nothing in this message is signed', 'Anyone could have written this. A service provider must reject unsigned SAML responses.');
    return;
  }

  for (const v of result.signatures) {
    const label = v.where === 'Response' ? 'Response signature' : v.where === 'Assertion' ? 'Assertion signature' : v.where === 'Hidden assertion' ? 'The hidden assertion\u2019s signature' : `Signature in ${v.where}`;
    for (const p of v.problems) add('error', 'Signature', `${label}: ${p.replace(/\.$/, '')}`);
    if (v.digestOk === false) add('error', 'Signature', `${label}: the content was changed after signing`, 'The digest of the signed XML does not match. Something edited the message, or a proxy re-encoded it (pretty-printing, re-ordering attributes). Copy the raw Base64 value instead of copying from a formatted view.');
    if (v.digestOk && v.signatureOk === false) add('error', 'Signature', `${label}: the signature value is wrong for this certificate`, pinned ? 'The message was not signed by the IdP certificate you pasted. The IdP may have rotated its certificate: download fresh metadata.' : 'The signature does not match the certificate inside the message.');
    if (v.digestOk && v.signatureOk) {
      add('ok', 'Signature', `${label} is valid`, `${shortAlg(v.algorithms.signature)}, digest ${shortAlg(v.algorithms.digest)}, checked against ${pinned ? 'the IdP certificate you pasted' : 'the certificate inside the message'}.`);
    }
    if (isSha1(v.algorithms.signature) || isSha1(v.algorithms.digest)) add('warn', 'Signature', `${label} uses SHA-1`, 'SHA-1 is deprecated and Microsoft, Okta and Google all default to SHA-256. Switch the signing algorithm at the IdP.');
    if (v.signedEl && v.signedEl !== v.sigEl.parentNode) add('error', 'Security', `${label} signs a different element than the one it sits in`, 'This is a signature wrapping pattern.');
  }

  const valid = (v) => v && v.digestOk && v.signatureOk && v.signedEl === v.sigEl.parentNode && !v.problems.length;
  if (assertion && !valid(assertionSig) && !valid(responseSig)) {
    add('error', 'Signature', 'The assertion your app would read is not covered by a valid signature', 'Either the assertion or the whole response must carry a valid signature.');
  } else if (assertion && valid(responseSig) && !assertionSig) {
    add('info', 'Signature', 'Only the response is signed, not the assertion', 'That is allowed, but some SPs (and many libraries by default) require a signed assertion. Entra ID calls this "Sign SAML response" vs "Sign SAML assertion".');
  }

  // Certificate checks, once per distinct certificate.
  const certs = new Map();
  for (const v of result.signatures) if (v.embeddedCert) certs.set(v.embeddedCert.sha256, v.embeddedCert);
  result.certs = [...certs.values()];
  for (const c of result.certs) {
    if (c.notAfter < now) add('warn', 'Certificate', `The signing certificate expired ${relTime(c.notAfter, now)}`, `It was valid until ${c.notAfter.toISOString().slice(0, 10)}. Many SPs ignore certificate dates for SAML, but some reject expired ones. Rotate it at the IdP.`);
    else if (c.notAfter - now < 30 * 86400000) add('warn', 'Certificate', `The signing certificate expires ${relTime(c.notAfter, now)}`, 'Plan the rotation now: update the SP with the new certificate before the IdP switches.');
    if (c.keyType === 'RSA' && c.keyBits < 2048) add('warn', 'Certificate', `The signing key is only ${c.keyBits} bits`, 'Use at least a 2048-bit RSA key.');
    if (pinnedPrint) {
      const match = pinnedPrint === normalizeFingerprint(pinnedPrint.length === 40 ? c.sha1 : c.sha256);
      if (match) add('ok', 'Certificate', 'The certificate thumbprint matches the one you trust');
      else add('error', 'Certificate', 'The certificate is not the one you trust', `Thumbprint in message: ${pinnedPrint.length === 40 ? c.sha1 : c.sha256}. If your IdP rotated its certificate, update your SP; otherwise someone else signed this.`);
    } else if (pinned) {
      if (pinned.sha256 !== c.sha256) add('info', 'Certificate', 'The certificate inside the message differs from the one you pasted', 'The signature was checked with yours, which is what matters. SPs should ignore the certificate a message carries.');
    }
  }
  if (!pin && result.signatures.some((v) => v.signatureOk)) {
    add('info', 'Certificate', 'Not yet checked against your IdP\u2019s certificate', 'A valid signature only proves the message is intact. Anyone can sign with their own certificate, so your SP must trust only the certificate from the IdP\u2019s metadata. Paste it (or its thumbprint) in the settings to check.');
  }
}

async function analyzeRequest(result, add, now, skew) {
  const r = result.root;
  const s = result.settings;
  const info = {
    id: attr(r, 'ID'), version: attr(r, 'Version'), issueInstant: attr(r, 'IssueInstant'), destination: attr(r, 'Destination'),
    issuer: txt(kid(r, 'Issuer')), acs: attr(r, 'AssertionConsumerServiceURL'), acsIndex: attr(r, 'AssertionConsumerServiceIndex'),
    binding: attr(r, 'ProtocolBinding'), forceAuthn: attr(r, 'ForceAuthn'), isPassive: attr(r, 'IsPassive'),
    nameIdPolicy: attr(kid(r, 'NameIDPolicy', SAMLP), 'Format'), allowCreate: attr(kid(r, 'NameIDPolicy', SAMLP), 'AllowCreate'),
    authnContext: kids(kid(r, 'RequestedAuthnContext', SAMLP), 'AuthnContextClassRef').map(txt),
    comparison: attr(kid(r, 'RequestedAuthnContext', SAMLP), 'Comparison'),
    nameId: txt(kid(r, 'NameID')), sessionIndex: txt(kid(r, 'SessionIndex', SAMLP)),
    statusCode: (attr(kid(kid(r, 'Status', SAMLP), 'StatusCode', SAMLP), 'Value') || '').replace(/^.*:/, ''),
  };
  result.requestInfo = info;
  if (info.version !== '2.0') add('error', 'Message', `Version is "${info.version || 'missing'}"`, 'Must be 2.0.');
  if (!info.id) add('error', 'Message', 'The request has no ID');
  else if (/^\d/.test(info.id)) add('error', 'Message', 'The ID starts with a digit', 'SAML IDs are xs:ID values and must not start with a number. Many IdPs reject these. Prefix it, for example with an underscore.');
  checkTime(add, 'Message', 'IssueInstant', info.issueInstant, now, skew, 'issued');
  if (!info.issuer) add('error', 'Issuer', 'The request has no Issuer', 'The IdP uses it to find your app\u2019s configuration. Set it to your SP entity ID.');
  else if (s.spEntityId) {
    if (info.issuer === s.spEntityId.trim()) add('ok', 'Issuer', 'Issuer matches your SP entity ID');
    else add('error', 'Issuer', 'Issuer does not match your SP entity ID', `Request says ${info.issuer}. The IdP will answer "application not found" (for Entra ID, AADSTS700016).`);
  }
  if (r.localName === 'AuthnRequest') {
    if (info.acs && s.acsUrl && !exactUrl(info.acs, s.acsUrl)) add('error', 'Destination', 'AssertionConsumerServiceURL is not your ACS URL', `Request asks for ${info.acs}. The IdP only sends responses to registered reply URLs (Entra ID: AADSTS50011).`);
    else if (info.acs) add('ok', 'Destination', `Responses will go to ${info.acs}`, 'This URL must be registered at the IdP as a Reply / ACS URL.');
    if (info.binding && !/HTTP-POST$/.test(info.binding)) add('warn', 'Request', `ProtocolBinding is ${shortAlg(info.binding)}`, 'Most IdPs only send responses with HTTP-POST.');
    if (info.isPassive === 'true') add('info', 'Request', 'IsPassive is on', 'The IdP must not prompt the user. If they are not already signed in, expect a NoPassive error.');
    if (info.forceAuthn === 'true') add('info', 'Request', 'ForceAuthn is on', 'The user must sign in again even if they have an IdP session.');
    if (info.nameIdPolicy) {
      const [label] = NAMEID_FORMATS[info.nameIdPolicy] || ['Custom'];
      add('info', 'Subject', `Asks for this NameID format: ${label}`, 'If the IdP cannot provide it you will get InvalidNameIDPolicy.');
    }
    if (info.authnContext.length) add('info', 'Authentication', `Requires sign-in by ${info.authnContext.map((x) => AUTHN_CONTEXT[x] || shortAlg(x)).join(' or ')} (${info.comparison || 'exact'})`, 'Requiring a specific method is a common cause of NoAuthnContext errors, for example demanding a password from a user who signs in with Windows Hello.');
  }
  const sig = [...result.doc.getElementsByTagNameNS(NS.ds, 'Signature')][0];
  result.signatures = [];
  if (sig) {
    const v = await verifySignature(sig);
    v.where = r.localName;
    result.signatures.push(v);
    if (v.digestOk && v.signatureOk) add('ok', 'Signature', 'The request signature is valid', 'Checked against the certificate inside the request.');
    else add('error', 'Signature', 'The request signature does not verify', v.problems.join(' '));
    if (v.embeddedCert) result.certs = [v.embeddedCert];
  } else if (result.decoded.hasQuerySignature) {
    add('info', 'Signature', 'Signed in the URL (HTTP-Redirect binding)', 'The signature covers the exact query string, so it can only be checked with your SP certificate and the original, unmodified URL.');
  } else {
    add('info', 'Signature', 'The request is not signed', 'That is fine unless the IdP is set to require signed requests.');
  }
}

/** Compact verdict for the banner. */
export function verdict(checks) {
  const errors = checks.filter((c) => c.level === 'error').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  return { errors, warns };
}

export { idOf };

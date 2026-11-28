// XML Signature (XMLDSig) for SAML, written from the W3C specs so it runs in any browser
// with no libraries: exclusive and inclusive canonicalization, a small DER/X.509 reader,
// and verify + sign through WebCrypto. Nothing here touches the network.

export const NS = {
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  xmlns: 'http://www.w3.org/2000/xmlns/',
  xml: 'http://www.w3.org/XML/1998/namespace',
};

export const ALG = {
  excC14n: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  excC14nC: 'http://www.w3.org/2001/10/xml-exc-c14n#WithComments',
  c14n: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  c14nC: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments',
  enveloped: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
  sha1: 'http://www.w3.org/2000/09/xmldsig#sha1',
  sha256: 'http://www.w3.org/2001/04/xmlenc#sha256',
  sha384: 'http://www.w3.org/2001/04/xmldsig-more#sha384',
  sha512: 'http://www.w3.org/2001/04/xmlenc#sha512',
  rsaSha1: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  rsaSha256: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  rsaSha384: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha384',
  rsaSha512: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512',
  ecSha256: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256',
  ecSha384: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384',
  ecSha512: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512',
};

const DIGESTS = {
  [ALG.sha1]: 'SHA-1', [ALG.sha256]: 'SHA-256', [ALG.sha384]: 'SHA-384', [ALG.sha512]: 'SHA-512',
};
const SIGS = {
  [ALG.rsaSha1]: { kind: 'RSA', hash: 'SHA-1' },
  [ALG.rsaSha256]: { kind: 'RSA', hash: 'SHA-256' },
  [ALG.rsaSha384]: { kind: 'RSA', hash: 'SHA-384' },
  [ALG.rsaSha512]: { kind: 'RSA', hash: 'SHA-512' },
  [ALG.ecSha256]: { kind: 'EC', hash: 'SHA-256' },
  [ALG.ecSha384]: { kind: 'EC', hash: 'SHA-384' },
  [ALG.ecSha512]: { kind: 'EC', hash: 'SHA-512' },
};
export const isSha1 = (uri) => uri === ALG.sha1 || uri === ALG.rsaSha1;
const ALG_NAMES = {
  [ALG.excC14n]: 'exclusive C14N', [ALG.excC14nC]: 'exclusive C14N with comments', [ALG.c14n]: 'inclusive C14N', [ALG.c14nC]: 'inclusive C14N with comments',
  [ALG.enveloped]: 'enveloped signature',
};
export const shortAlg = (uri) => ALG_NAMES[uri] || (uri || '').replace(/^.*[#/:]/, '') || 'unknown';

// ---------- base64 helpers ----------
export function b64ToBytes(b64) {
  const clean = b64.replace(/[\s\r\n]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = clean.length % 4 ? '='.repeat(4 - (clean.length % 4)) : '';
  const bin = atob(clean + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64(bytes) {
  let s = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
const utf8 = (s) => new TextEncoder().encode(s);
export const hex = (bytes, sep = ':') => [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(sep);

// ---------- canonicalization ----------
function escText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
}
function escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');
}

// Every namespace prefix in scope at element el (prefix '' is the default namespace).
function inScopeNamespaces(el) {
  const chain = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) chain.unshift(n);
  const map = {};
  for (const n of chain) {
    for (const a of n.attributes) {
      if (a.namespaceURI === NS.xmlns) map[a.prefix === 'xmlns' ? a.localName : ''] = a.value;
    }
  }
  return map;
}

/**
 * Canonicalize an element subtree.
 * opts.exclusive: exclusive C14N (default true); opts.prefixes: InclusiveNamespaces PrefixList;
 * opts.comments: keep comments; opts.skip: node to leave out (the enveloped Signature).
 */
export function canonicalize(apex, opts = {}) {
  const exclusive = opts.exclusive !== false;
  const inclusive = new Set((opts.prefixes || []).map((p) => (p === '#default' ? '' : p)));
  const out = [];

  function render(el, rendered, scope) {
    // Namespace scope at this element: parent's scope plus this element's own declarations.
    const here = { ...scope };
    for (const a of el.attributes) {
      if (a.namespaceURI === NS.xmlns) here[a.prefix === 'xmlns' ? a.localName : ''] = a.value;
    }
    // Elements built with createElementNS carry their namespace without an xmlns attribute.
    here[el.prefix || ''] = el.namespaceURI || '';
    for (const a of el.attributes) if (a.prefix && a.prefix !== 'xmlns' && a.prefix !== 'xml') here[a.prefix] = a.namespaceURI;
    let wanted;
    if (exclusive) {
      wanted = new Set([el.prefix || '']);
      for (const a of el.attributes) {
        if (a.namespaceURI !== NS.xmlns && a.prefix && a.prefix !== 'xml') wanted.add(a.prefix);
      }
      for (const p of inclusive) if (p in here) wanted.add(p);
    } else {
      wanted = new Set(Object.keys(here));
    }
    const decls = [];
    const nextRendered = { ...rendered };
    for (const p of [...wanted].sort()) {
      const uri = p in here ? here[p] : '';
      if (p === 'xml') continue;
      if (p === '') {
        const prev = rendered[''] ?? '';
        if (uri === prev) continue;
      } else if (rendered[p] === uri) continue;
      if (p !== '' && uri === '') continue;
      decls.push(p === '' ? ` xmlns="${escAttr(uri)}"` : ` xmlns:${p}="${escAttr(uri)}"`);
      nextRendered[p] = uri;
    }
    const attrs = [];
    for (const a of el.attributes) {
      if (a.namespaceURI === NS.xmlns) continue;
      attrs.push({ ns: a.namespaceURI || '', local: a.localName, name: a.name, value: a.value });
    }
    attrs.sort((x, y) => (x.ns === y.ns ? (x.local < y.local ? -1 : x.local > y.local ? 1 : 0) : x.ns < y.ns ? -1 : 1));
    const qname = el.prefix ? `${el.prefix}:${el.localName}` : el.localName;
    out.push('<', qname, ...decls);
    for (const a of attrs) out.push(' ', a.name, '="', escAttr(a.value), '"');
    out.push('>');
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c === opts.skip) continue;
      if (c.nodeType === 1) render(c, nextRendered, here);
      else if (c.nodeType === 3 || c.nodeType === 4) out.push(escText(c.data));
      else if (c.nodeType === 8 && opts.comments) out.push('<!--', c.data, '-->');
      else if (c.nodeType === 7) out.push('<?', c.target, c.data ? ' ' + c.data : '', '?>');
    }
    out.push('</', qname, '>');
  }

  const parentScope = apex.parentNode && apex.parentNode.nodeType === 1 ? inScopeNamespaces(apex.parentNode) : {};
  render(apex, {}, parentScope);
  return out.join('');
}

function c14nOptsFrom(methodEl, alg) {
  const prefixes = [];
  if (methodEl) {
    const inc = [...methodEl.getElementsByTagName('*')].find((e) => e.localName === 'InclusiveNamespaces');
    if (inc) prefixes.push(...(inc.getAttribute('PrefixList') || '').split(/\s+/).filter(Boolean));
  }
  return {
    exclusive: alg === ALG.excC14n || alg === ALG.excC14nC,
    comments: alg === ALG.excC14nC || alg === ALG.c14nC,
    prefixes,
  };
}
const KNOWN_C14N = new Set([ALG.excC14n, ALG.excC14nC, ALG.c14n, ALG.c14nC]);

// ---------- DER / X.509 ----------
function derRead(buf, pos) {
  const tag = buf[pos];
  let len = buf[pos + 1];
  let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[pos + 2 + i];
    hdr = 2 + n;
  }
  return { tag, start: pos, hdr, len, end: pos + hdr + len, body: buf.subarray(pos + hdr, pos + hdr + len) };
}
function derChildren(node) {
  const kids = [];
  let p = 0;
  while (p < node.body.length) {
    const k = derRead(node.body, p);
    kids.push(k);
    p = k.end;
  }
  return kids;
}
function oidString(bytes) {
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let v = 0;
  for (let i = 1; i < bytes.length; i++) {
    v = v * 128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) { parts.push(v); v = 0; }
  }
  return parts.join('.');
}
const NAME_OIDS = { '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '1.2.840.113549.1.9.1': 'E' };
function derName(node) {
  const parts = [];
  for (const set of derChildren(node)) {
    for (const atv of derChildren(set)) {
      const [oid, val] = derChildren(atv);
      const key = NAME_OIDS[oidString(oid.body)] || oidString(oid.body);
      parts.push(`${key}=${new TextDecoder().decode(val.body)}`);
    }
  }
  return parts.join(', ');
}
function derTime(node) {
  const s = new TextDecoder().decode(node.body);
  let y, rest;
  if (node.tag === 0x17) { y = +s.slice(0, 2); y += y < 50 ? 2000 : 1900; rest = s.slice(2); } else { y = +s.slice(0, 4); rest = s.slice(4); }
  const [mo, d, h, mi, se] = [0, 2, 4, 6, 8].map((i) => +rest.slice(i, i + 2));
  return new Date(Date.UTC(y, mo - 1, d, h, mi, se || 0));
}

/** Parse a base64 or PEM X.509 certificate into the fields a SAML debugger cares about. */
export async function parseCertificate(text) {
  const b64 = text.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');
  const der = b64ToBytes(b64);
  const cert = derRead(der, 0);
  const [tbs] = derChildren(cert);
  let f = derChildren(tbs);
  if (f[0].tag === 0xa0) f = f.slice(1);
  const [serial, , issuer, validity, subject, spki] = f;
  const [nb, na] = derChildren(validity);
  const [algSeq, bits] = derChildren(spki);
  const algKids = derChildren(algSeq);
  const keyOid = oidString(algKids[0].body);
  let keyType = 'unknown', keyBits = 0, curve = null;
  if (keyOid === '1.2.840.113549.1.1.1') {
    keyType = 'RSA';
    const rsa = derRead(bits.body.subarray(1), 0);
    const [mod] = derChildren(rsa);
    let m = mod.body;
    while (m[0] === 0) m = m.subarray(1);
    keyBits = m.length * 8;
  } else if (keyOid === '1.2.840.10045.2.1') {
    keyType = 'EC';
    const c = oidString(algKids[1].body);
    curve = { '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521' }[c] || c;
    keyBits = { 'P-256': 256, 'P-384': 384, 'P-521': 521 }[curve] || 0;
  }
  const [sha1, sha256] = await Promise.all([crypto.subtle.digest('SHA-1', der), crypto.subtle.digest('SHA-256', der)]);
  return {
    der, b64,
    serial: hex(serial.body, ''),
    issuer: derName(issuer), subject: derName(subject),
    notBefore: derTime(nb), notAfter: derTime(na),
    keyType, keyBits, curve,
    spki: der.slice(tbsOffset(cert, tbs) + spki.start, tbsOffset(cert, tbs) + spki.end),
    sha1: hex(sha1), sha256: hex(sha256),
  };
}
function tbsOffset(cert, tbs) { return cert.hdr + tbs.start + tbs.hdr; }

/** Turn "AB:CD:..." / "abcd..." / "SHA256 Fingerprint=AB:..." into bare uppercase hex. */
export const normalizeFingerprint = (s) => (s || '').replace(/^.*=/, '').replace(/[^0-9a-f]/gi, '').toUpperCase();

async function importPublicKey(cert, sigAlg) {
  const info = SIGS[sigAlg];
  if (info.kind === 'RSA') {
    return crypto.subtle.importKey('spki', cert.spki, { name: 'RSASSA-PKCS1-v1_5', hash: info.hash }, false, ['verify']);
  }
  return crypto.subtle.importKey('spki', cert.spki, { name: 'ECDSA', namedCurve: cert.curve }, false, ['verify']);
}

// ---------- signatures ----------
const childEl = (el, local, ns = NS.ds) => [...el.childNodes].find((n) => n.nodeType === 1 && n.localName === local && n.namespaceURI === ns) || null;
const descEl = (el, local, ns = NS.ds) => [...el.getElementsByTagNameNS(ns, local)][0] || null;
export const idOf = (el) => el.getAttribute('ID') || el.getAttribute('Id') || el.getAttribute('AssertionID') || el.getAttribute('id') || '';

/** Every element carrying an ID-type attribute, keyed by value (for wrapping detection). */
export function idIndex(doc) {
  const index = new Map();
  for (const el of doc.getElementsByTagName('*')) {
    const id = idOf(el);
    if (!id) continue;
    if (!index.has(id)) index.set(id, []);
    index.get(id).push(el);
  }
  return index;
}

/**
 * Verify one ds:Signature element.
 * Returns { signedEl, reference, digestOk, signatureOk, cert, algorithms, problems[] }.
 * certOverride: a parsed certificate to verify with instead of the one inside the message.
 */
export async function verifySignature(sigEl, certOverride = null) {
  const res = { sigEl, problems: [], digestOk: null, signatureOk: null, cert: null, embeddedCert: null, signedEl: null };
  const doc = sigEl.ownerDocument;
  const signedInfo = childEl(sigEl, 'SignedInfo');
  if (!signedInfo) { res.problems.push('The signature has no SignedInfo element.'); return res; }
  const cm = childEl(signedInfo, 'CanonicalizationMethod');
  const sm = childEl(signedInfo, 'SignatureMethod');
  const refs = [...signedInfo.childNodes].filter((n) => n.nodeType === 1 && n.localName === 'Reference');
  res.algorithms = {
    c14n: cm?.getAttribute('Algorithm') || '',
    signature: sm?.getAttribute('Algorithm') || '',
    digest: '', transforms: [],
  };
  if (refs.length !== 1) res.problems.push(`SignedInfo has ${refs.length} references; SAML signatures must have exactly one.`);
  const ref = refs[0];
  if (ref) {
    const uri = ref.getAttribute('URI') || '';
    res.reference = uri;
    const dm = childEl(ref, 'DigestMethod');
    res.algorithms.digest = dm?.getAttribute('Algorithm') || '';
    const transforms = childEl(ref, 'Transforms');
    const tEls = transforms ? [...transforms.childNodes].filter((n) => n.nodeType === 1 && n.localName === 'Transform') : [];
    res.algorithms.transforms = tEls.map((t) => t.getAttribute('Algorithm'));

    // Resolve the reference: "#id" must point at exactly one element, and for SAML that is the signature's parent.
    const id = uri.replace(/^#/, '');
    const matches = id ? (idIndex(doc).get(id) || []) : [doc.documentElement];
    if (!uri.startsWith('#') && uri !== '') res.problems.push(`The reference URI "${uri}" is not a same-document "#ID" reference.`);
    if (matches.length === 0) res.problems.push(`The signature points at ID "${id}", but no element has that ID.`);
    if (matches.length > 1) res.problems.push(`${matches.length} elements share the ID "${id}". That is a signature wrapping pattern.`);
    const target = matches[0] || null;
    res.signedEl = target;
    if (target && target !== sigEl.parentNode) res.problems.push('The signature does not sit inside the element it signs (it is not an enveloped signature).');

    if (target) {
      let c14nAlg = ALG.c14n, c14nEl = null, enveloped = false;
      for (const t of tEls) {
        const a = t.getAttribute('Algorithm');
        if (a === ALG.enveloped) enveloped = true;
        else if (KNOWN_C14N.has(a)) { c14nAlg = a; c14nEl = t; } else res.problems.push(`Unsupported transform ${a}.`);
      }
      const hash = DIGESTS[res.algorithms.digest];
      if (!hash) res.problems.push(`Unsupported digest algorithm ${res.algorithms.digest || '(none)'}.`);
      else {
        const c = canonicalize(target, { ...c14nOptsFrom(c14nEl, c14nAlg), skip: enveloped ? sigEl : null });
        const digest = bytesToB64(await crypto.subtle.digest(hash, utf8(c)));
        const expected = (childEl(ref, 'DigestValue')?.textContent || '').replace(/\s+/g, '');
        res.digestOk = digest === expected;
        res.canonical = c;
      }
    }
  }

  // Key: the embedded X509Certificate, unless the user gave the real IdP certificate.
  const x5 = descEl(sigEl, 'X509Certificate');
  if (x5) {
    try { res.embeddedCert = await parseCertificate(x5.textContent); } catch { res.problems.push('The certificate inside KeyInfo could not be read.'); }
  }
  res.cert = certOverride || res.embeddedCert;
  const sigInfo = SIGS[res.algorithms.signature];
  if (!sigInfo) res.problems.push(`Unsupported signature algorithm ${res.algorithms.signature || '(none)'}.`);
  else if (!res.cert) res.problems.push('No certificate to check the signature with. Paste your IdP certificate in the settings.');
  else if (!KNOWN_C14N.has(res.algorithms.c14n)) res.problems.push(`Unsupported canonicalization ${res.algorithms.c14n}.`);
  else {
    try {
      const key = await importPublicKey(res.cert, res.algorithms.signature);
      const c = canonicalize(signedInfo, c14nOptsFrom(cm, res.algorithms.c14n));
      const sigBytes = b64ToBytes(childEl(sigEl, 'SignatureValue')?.textContent || '');
      const algo = sigInfo.kind === 'RSA' ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'ECDSA', hash: sigInfo.hash };
      res.signatureOk = await crypto.subtle.verify(algo, key, sigBytes, utf8(c));
    } catch (e) {
      res.signatureOk = false;
      res.problems.push(`The signature could not be checked: ${e.message || e}.`);
    }
  }
  return res;
}

/**
 * Sign element el in place with an enveloped RSA-SHA256 signature, inserted after its Issuer.
 * Used to build fresh, genuinely signed sample messages with a published demo key.
 */
export async function signElement(el, privateKey, certB64) {
  const doc = el.ownerDocument;
  const ds = (name) => doc.createElementNS(NS.ds, `ds:${name}`);
  const id = idOf(el);
  const digest = bytesToB64(await crypto.subtle.digest('SHA-256', utf8(canonicalize(el))));
  const sig = ds('Signature');
  const si = ds('SignedInfo');
  const cm = ds('CanonicalizationMethod'); cm.setAttribute('Algorithm', ALG.excC14n);
  const sm = ds('SignatureMethod'); sm.setAttribute('Algorithm', ALG.rsaSha256);
  const ref = ds('Reference'); ref.setAttribute('URI', `#${id}`);
  const tr = ds('Transforms');
  for (const a of [ALG.enveloped, ALG.excC14n]) { const t = ds('Transform'); t.setAttribute('Algorithm', a); tr.appendChild(t); }
  const dm = ds('DigestMethod'); dm.setAttribute('Algorithm', ALG.sha256);
  const dv = ds('DigestValue'); dv.textContent = digest;
  ref.append(tr, dm, dv);
  si.append(cm, sm, ref);
  const sv = ds('SignatureValue');
  const ki = ds('KeyInfo'); const xd = ds('X509Data'); const xc = ds('X509Certificate');
  xc.textContent = certB64; xd.appendChild(xc); ki.appendChild(xd);
  sig.append(si, sv, ki);
  const issuer = [...el.childNodes].find((n) => n.nodeType === 1 && n.localName === 'Issuer');
  el.insertBefore(sig, issuer ? issuer.nextSibling : el.firstChild);
  const value = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, utf8(canonicalize(si)));
  sv.textContent = bytesToB64(value);
  return sig;
}

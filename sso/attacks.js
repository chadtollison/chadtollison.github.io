// Attack playground: real attacks against SAML service providers, applied to the response
// on screen, then fed back through the debugger to see whether it catches them.
import { NS, signElement } from './xmldsig.js';
import { SAML, SAMLP, analyzeSaml } from './saml.js';
import { otherSigner } from './samples.js';

const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
const ser = (doc) => new XMLSerializer().serializeToString(doc);
const first = (doc, ns, local) => doc.getElementsByTagNameNS(ns, local)[0] || null;
const rid = () => '_' + [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');

export const ATTACKS = [
  {
    id: 'tamper', name: 'Edit a signed value',
    what: 'The attacker changes the NameID to an admin’s email and hopes nobody re-checks the digest.',
    run(doc) {
      const n = first(doc, SAML, 'NameID');
      if (!n) return null;
      n.textContent = 'admin@' + ((n.textContent.split('@')[1]) || 'example.com');
      return { doc };
    },
  },
  {
    id: 'strip', name: 'Strip the signature',
    what: 'The attacker deletes every signature and edits freely, betting your app only checks signatures when one is present.',
    run(doc) {
      const sigs = [...doc.getElementsByTagNameNS(NS.ds, 'Signature')];
      if (!sigs.length) return null;
      sigs.forEach((s) => s.parentNode.removeChild(s));
      const n = first(doc, SAML, 'NameID');
      if (n) n.textContent = 'admin@example.com';
      return { doc };
    },
  },
  {
    id: 'wrap', name: 'Signature wrapping (XSW)',
    what: 'The genuine signed assertion is hidden inside Extensions and a forged, unsigned admin assertion takes its place. Libraries that verify one element but read another fall for it.',
    run(doc) {
      const resp = doc.documentElement;
      const a = first(doc, SAML, 'Assertion');
      if (!a || resp.localName !== 'Response' || !a.getElementsByTagNameNS(NS.ds, 'Signature').length) return null;
      const forged = a.cloneNode(true);
      forged.setAttribute('ID', rid());
      const s = [...forged.childNodes].find((n) => n.nodeType === 1 && n.localName === 'Signature');
      if (s) forged.removeChild(s);
      const n = forged.getElementsByTagNameNS(SAML, 'NameID')[0];
      if (n) n.textContent = 'admin@example.com';
      const ext = doc.createElementNS(SAMLP, 'samlp:Extensions');
      ext.appendChild(a);
      const status = first(doc, SAMLP, 'Status');
      resp.insertBefore(ext, status || resp.firstChild);
      resp.appendChild(forged);
      return { doc };
    },
  },
  {
    id: 'comment', name: 'Comment injection',
    what: 'An XML comment is slipped into the NameID. Canonicalization ignores comments, so the signature stays valid, but some parsers then read only the text before the comment (CVE-2017-11427).',
    run(doc) {
      const n = first(doc, SAML, 'NameID');
      if (!n || n.textContent.length < 3) return null;
      const v = n.textContent;
      const k = v.includes('@') ? v.indexOf('@') + 1 : Math.floor(v.length / 2);
      n.textContent = '';
      n.append(doc.createTextNode(v.slice(0, k)), doc.createComment(''), doc.createTextNode(v.slice(k)));
      return { doc };
    },
  },
  {
    id: 'resign', name: 'Sign it with my own key',
    what: 'The attacker edits the response and re-signs it with their own certificate, which they put in KeyInfo. The signature is mathematically valid. Only pinning your IdP’s certificate stops this.',
    async run(doc) {
      const a = first(doc, SAML, 'Assertion');
      if (!a) return null;
      [...doc.getElementsByTagNameNS(NS.ds, 'Signature')].forEach((s) => s.parentNode.removeChild(s));
      const n = a.getElementsByTagNameNS(SAML, 'NameID')[0];
      if (n) n.textContent = 'admin@example.com';
      const { key, cert } = await otherSigner();
      await signElement(a, key, cert);
      return { doc };
    },
  },
  {
    id: 'otherapp', name: 'Replay to another app',
    what: 'The attacker takes a response meant for one app and sends it to a different app that trusts the same IdP. Nothing is edited, so the signature is valid.',
    run(doc, settings) {
      if (!first(doc, SAML, 'Assertion')) return null;
      return { doc, settings: { ...settings, spEntityId: 'https://other-app.example.org/saml', acsUrl: 'https://other-app.example.org/acs' }, scenario: 'Checked as if your app were https://other-app.example.org.' };
    },
  },
  {
    id: 'replay', name: 'Replay it later',
    what: 'The attacker captured the response (from a log, a proxy or browser history) and sends it again two hours later.',
    run(doc, settings) {
      const a = first(doc, SAML, 'Assertion');
      if (!a) return null;
      const t = new Date(a.getAttribute('IssueInstant') || Date.now());
      return { doc, settings: { ...settings, now: new Date(t.getTime() + 2 * 3600000) }, scenario: 'The clock was moved to two hours after the response was issued.' };
    },
  },
  {
    id: 'doctype', name: 'Entity expansion (DOCTYPE)',
    what: 'The attacker adds a DOCTYPE with entities. On a vulnerable parser this reads local files (XXE) or eats all memory ("billion laughs").',
    run(doc) {
      const xml = ser(doc).replace(/^<\?xml[^>]*\?>\s*/, '');
      return { xml: `<!DOCTYPE r [<!ENTITY x "xx"><!ENTITY y "&x;&x;&x;&x;&x;">]>\n${xml}` };
    },
  },
];

/** Run every attack against the given XML. Each result says whether the debugger caught it. */
export async function runAttacks(xml, settings) {
  const out = [];
  for (const atk of ATTACKS) {
    const doc = parse(xml);
    let res;
    try { res = await atk.run(doc, settings); } catch (e) { res = { error: e.message }; }
    if (!res) { out.push({ atk, skipped: true }); continue; }
    if (res.error) { out.push({ atk, skipped: true, error: res.error }); continue; }
    const attackedXml = res.xml || ser(res.doc);
    const s = res.settings || settings;
    const r = await analyzeSaml(attackedXml, s);
    const errors = r.checks.filter((c) => c.level === 'error');
    out.push({ atk, xml: attackedXml, settings: s, scenario: res.scenario, caught: errors.length > 0, errors, result: r });
  }
  return out;
}

// Sample messages for the debugger. SAML samples are built fresh with the current time and
// genuinely signed in your browser with a PUBLIC DEMO KEY (below). It is published on purpose:
// it only exists to sign these examples, and no real system trusts it.
import { signElement, bytesToB64, b64ToBytes } from './xmldsig.js';

const DEMO_KEY_PKCS8 = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDES8EldJvEM2QTWKgtHpJXbRTe6ZHsty58FTQ5yq05qIVZ0qAcj536L57z+EVex3ocAswas0PevFg2dhCfoyiOSrZut9GezgqpCFhbw1Y9qrPwpg2SPKa3LyD4iKSR8U4dYWjVftyWx7T1GVfBvTPu/ac/sz2F3u6QI3EGV94piX0BhY8cUFrmzsgZtZmOiZEkuJAuJabxiYXpCZqLY4nmfVN8cdn+B6+vwzLo0lIktc/Em90qPvAcEOw/yKjSgM3i5ku9q5d5gPexOy5dzTPdsS//hNznmFwzyR3qO0ykqFaUHI+F5CzpsvHZ3EwPs/QE3imLEdEMbVRN7acBOswvAgMBAAECggEAMSCMfGVMvrPl7fmYTYKDOaIxQQDP5qCJ38Amy/fvlqiYhzxxmfRPo1fbvk96fRgLdYs1rdEDwXD92tN9oZZiBgqo0djre4UxodBW3NBsew6H7kiAyQKo7tu6srjwBx6PYEcKx7PyXUIqBdWL4w8JOlz9SLIBScnbhvN3zBCdp2MyqgTtyHqf3xOZeSF+tOrBQZtGNmHn4hkNGAcSWEM0nW7fmGCmFIpn9VxMpbtm7lZoW5nRgNJjjB91Qv2pZFEanz/E0TT0wzfPXkxKtuNwpBYZ8H3pLNJJo4TxxON0BaYJUO6gSQm1y23AkqMWyh4+EJJYhTTg/GVA5ihDXimy0QKBgQD50trC4ie36iMTMebZSsTTU2tXU8kQtuK0HeQvC91hwtNzGHFIvbBtNcrIKgab1Uexv7rpoEytMiSEL34iwdIBZ18cEn5SjP/YrpZWBOrjAOLx8Pn3AbiE67gBSx/wwrEOpMAFIkxsfGOexViG2slipcj9c1ROhhj/FbY7CFogkwKBgQDJJh7UYju8NsV7dQsn7PdO5wz7pPMi0xg1IuQUYrAQ16lMcJwLsSWWc0lD+ZL7nPrzoMRnJt6O+nu6N2PVanORYryYYdLOfR4of4sTi4N1bGrh5hbf3KSWGytoEo3//2bEuGQ7Wyoj7MVJ5YpVp3Y5XJQ7/Q9qt+1s++O9aEUTdQKBgEu0jf6IsiiVl1N1x9MJSWQQ33JzPXcHNOQIOuHW4puBgrpaKdo1QYWWy4Ck26PVmghPZcDuhs3laBN2oO6/dXhfbv7+y7EQcWekYIJosxVfa2aN8/HaX6RIGlaqAV/gX+9kFZx4rFgjybyPaShUnLp8KtBDZsT09hY26iYxfb5pAoGBAMPwvldk2YueTwDUIunhi4bwy1TWeYGS4CHiuwqgl6HQcrpjd55sEZFc/CGbG/K+GDb6hFd3JZVhquTa0AU0jR8yb0SBBjje6GHK3E9Nt+DKm9Mxr1aiODGAhef7KxgUUqeOdxTa2VHlcslpMDf/yMpXxI4rFLmAMWfYdyAqUh+BAoGAbz+k52KnFZwAO/91pAC3669kFoX1mOadjEtZJ5wlmD9ML3BGQXppwnRocd+MfTej40iwqrbK4RpddxBIZqMMcYKfH9hGI8OxPZ0D4MSIN/3EHVa6lvUQr1EWcH+b2izCiNznZc3KJYSJlZbk6v+J2ddlFASkAHDR9InOb9wHnmA=';
export const DEMO_CERT = 'MIIDgzCCAmugAwIBAgIUD2P2V7CI+8zTlLUPzjAnJapuDKYwDQYJKoZIhvcNAQELBQAwUTEdMBsGA1UEAwwUZGVtby1pZHAuZXhhbXBsZS5jb20xMDAuBgNVBAoMJ1NTTyBEZWJ1Z2dlciBEZW1vIElkUCAocHVibGljIHRlc3Qga2V5KTAeFw0yNjExMjgwMTMxMTNaFw0zNjExMjUwMTMxMTNaMFExHTAbBgNVBAMMFGRlbW8taWRwLmV4YW1wbGUuY29tMTAwLgYDVQQKDCdTU08gRGVidWdnZXIgRGVtbyBJZFAgKHB1YmxpYyB0ZXN0IGtleSkwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDES8EldJvEM2QTWKgtHpJXbRTe6ZHsty58FTQ5yq05qIVZ0qAcj536L57z+EVex3ocAswas0PevFg2dhCfoyiOSrZut9GezgqpCFhbw1Y9qrPwpg2SPKa3LyD4iKSR8U4dYWjVftyWx7T1GVfBvTPu/ac/sz2F3u6QI3EGV94piX0BhY8cUFrmzsgZtZmOiZEkuJAuJabxiYXpCZqLY4nmfVN8cdn+B6+vwzLo0lIktc/Em90qPvAcEOw/yKjSgM3i5ku9q5d5gPexOy5dzTPdsS//hNznmFwzyR3qO0ykqFaUHI+F5CzpsvHZ3EwPs/QE3imLEdEMbVRN7acBOswvAgMBAAGjUzBRMB0GA1UdDgQWBBTREpmIAdcSEWPNf4Xcxy2WT8GSZTAfBgNVHSMEGDAWgBTREpmIAdcSEWPNf4Xcxy2WT8GSZTAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQA/TKZqfi3xPCjgLSxDDZH7Z9bD/uO43mrwqznpAhXYrz+cgj27bTI41rEuofPSkRE0AMZ3Xtw/71+jMYD+NncXMQMahJgS76h6+aTqkk/Oy+wcj38WglGfClDG/Ua+wReR/cPTPeU9X8Iy1DJYNG9oOZf8FbyP5vbzSi99QzZ9ZKsm9g5UacyvRIcz2m3KPti/w0pwiCfD9ppfT1hVuVWsBgCr7Pxfb56em6JAjRVYTGyDHuQHjxtLIh9TtpRoxnkmYX+d1Dxtec8Vl6b0KLVpXpafZAMACNiQwDfi85SwrLVpfEArYDkzCX5Xc51sKomsFlYxQrNt6ALpGPxMnA8w';
// A second, unrelated key: "someone else" signing a message.
const OTHER_KEY_PKCS8 = 'MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCwtyCSR74e+QMfdY+7aLbTSgWoUuOUf6CX6IWCEonDZRW9aLlB45FOZp4FpoCGMamHX76bG4tdpR9r542EV7LUo7JtqdujX0MT7gMGRSiZbE2yvVi7RNyS4Jt08IIT/O2c2WPVpMfa6LX9VQocgtwBxQrSt7S00LGDJt++qvehNzsj9hH4XYBuE5NVblD0q2DJEiEHjvKBQiKJ4346kQBIV0J9FewXTTOlM/g4tPZMgT8vQrSDzxMoPreG5G++E2Y25FVhg/ebjDTW33ZmL17y1bJZPgmThbu4fOo89+3EHusllSx4gxSWnK9ZcEnjnPcaIgZ4kbllu4v8TbhCjrXFAgMBAAECggEAGQ/XrDdFhOH+6eLD4CnRJ/ULCVy8Du7syS5+ZLyZUh9Pbn3gLDKIhIx0I8wB1UZMyziucRP+d2j4JFcCEH9ZiuOuZfQdhLV5b2WlgymiwOOFv3AwGdsBx0jYc0S6xffsgP6ptH56o5a2XLfHR9TdO9kEmG7aT3x7eGS2fbWEihXtJOHmnifkHCqWHyY4gTwvNZDBKGitBk7aUWIlBia0I9EMlPoQY6IryABkkGCmf/nkk/XNK6HvrS/MdsQRY8G5lhxg3Yrci8co2L5z82VHPr6KQjypN9vb+jyNZ5+SvxeYvmmb/klLhray8rLeZzvXIwhl6yaLIGT0O24IgClLUQKBgQDmZubTrKrdKnoC0bomrEx0b4tNn521YX3K9cBMQM/gl+dJEw+9tCATtlAWix4CchDPlsaBYboe7BAIWwk4UO/f85c0GdeYNCo0dIrVuzlN1Gw1tJVtINJ16XK8Kkhu84QJVRB0d6ly+KTVUDvvus/qWHhZC33Dl8MDlTC6ZXXKmQKBgQDEWUT3XtcOZ8lC57Qeno/a74AOzGISOd4T5gnC+3Su992LNpVQH1JvLxMhS5zZpHin8/keQdmXChT/AN/TYW4E8D7uoVj/Py2KxwUpArwnSllt29Doc/AGDrR5uq+KT0C5WnVrztnwgB5y8dbTmCpCbYf+VTL3Vb4fwXYYgZ5MDQKBgQCJrKl3iPDckXow3xOl8kUJOnH6I0vAy424Tprmtb/By+NHdh1s1Qpp3QIERoLbIT/MW6MoQrZNre9ynrtmrG552vvaBSsf5uPlTlJ7npGCYVF70fmMKRW5oZKOv5Fiwx592RepEKvvaIZOdNAr0uxUcyMOymAPFUtRg7+HUgNN2QKBgQCM21mteH0hGXV5qM0/lhKvRleAxkCowJi/f6yLE2deyfRGFY9CHmY92vCHVz4bqHDiVBToDudxAkuTsGXht6h8pHkRKfC1k/Yw85uREyQ1r5G+TQ5uZBXR0qTIGxQpTbeqAOnxwD/6136AiVvLCgNvCjKgUzCv3PP6xgfZhssv1QKBgQCPOdQqdEYb6ns73ds27K0WnOjDDdvq9fBUKN3fq9C8yqOnFQWP3mgik/4T+wfDYIU0/FqSUNTL2MK3VYWlAaViirrDATJcIv2dWwtVhFIA8WdKzY7PyEc1OhPeecAsnTNRIvcpycCyiLNqIV/y6gjV5fHtxDj3kQFlYgCOOvTZAQ==';
const OTHER_CERT = 'MIIDHzCCAgegAwIBAgIUTnhbSrAu8hjU5Zl364lJHQrUzhYwDQYJKoZIhvcNAQELBQAwHzEdMBsGA1UEAwwUYXR0YWNrZXIuZXhhbXBsZS5uZXQwHhcNMjYxMTI4MDEzMTEzWhcNMzYxMTI1MDEzMTEzWjAfMR0wGwYDVQQDDBRhdHRhY2tlci5leGFtcGxlLm5ldDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALC3IJJHvh75Ax91j7tottNKBahS45R/oJfohYISicNlFb1ouUHjkU5mngWmgIYxqYdfvpsbi12lH2vnjYRXstSjsm2p26NfQxPuAwZFKJlsTbK9WLtE3JLgm3TwghP87ZzZY9Wkx9rotf1VChyC3AHFCtK3tLTQsYMm376q96E3OyP2EfhdgG4Tk1VuUPSrYMkSIQeO8oFCIonjfjqRAEhXQn0V7BdNM6Uz+Di09kyBPy9CtIPPEyg+t4bkb74TZjbkVWGD95uMNNbfdmYvXvLVslk+CZOFu7h86jz37cQe6yWVLHiDFJacr1lwSeOc9xoiBniRuWW7i/xNuEKOtcUCAwEAAaNTMFEwHQYDVR0OBBYEFEFduWbb2foPxbK1EYYn5WaKspa4MB8GA1UdIwQYMBaAFEFduWbb2foPxbK1EYYn5WaKspa4MA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB/vjGTHQMexwlEEszlENhXWZCCt0nlduvHlBnnFa2H4ohNm93gbPo2sF2XFwcysP2aZb9jqgL6tY7UYBXZf+6OjOoDngtUALxfuBp2lH95tBnOS2sNg0aveyAgBR//sUeRflQVoT/ahm0yk3Ndypswaalg9Y2c5icaezi7kCazy7d48tJmtVMLyaQAfX8DFEnbZHzttX+KduoPGirFqEeIUjRztq1qWRFRXs93mmjeE7sxozUBs7p2KOMv7bRRsGQ2xgXt4es62UXuSYEbERptg3jJYS9xW9zvHmwh2AZOjm6c549oicdawSVURLHC2mPfbmeihOMzX8GOxuEOP1pU=';

export const SAMPLE_SETTINGS = {
  spEntityId: 'https://app.example.com/saml/metadata',
  acsUrl: 'https://app.example.com/saml/acs',
  idpEntityId: 'https://idp.example.com/metadata',
  requiredAttrs: 'email, firstName, lastName',
  skewMinutes: 3,
};

const rid = () => '_' + [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const iso = (d) => d.toISOString().replace(/\.\d+Z$/, 'Z');
const keyCache = {};
async function key(pkcs8) {
  if (!keyCache[pkcs8]) keyCache[pkcs8] = crypto.subtle.importKey('pkcs8', b64ToBytes(pkcs8), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  return keyCache[pkcs8];
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function responseXml(o) {
  const now = o.now;
  const t = (min) => iso(new Date(now.getTime() + min * 60000));
  const attrs = Object.entries(o.attrs || {}).map(([name, vals]) => `
      <saml:Attribute Name="${name}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">${[].concat(vals).map((v) => `
        <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">${esc(v)}</saml:AttributeValue>`).join('')}
      </saml:Attribute>`).join('');
  const status = o.status
    ? `<samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:${o.status[0]}">
      <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:${o.status[1]}"/>
    </samlp:StatusCode>
    <samlp:StatusMessage>${esc(o.status[2])}</samlp:StatusMessage>
  </samlp:Status>`
    : `<samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
  </samlp:Status>`;
  const assertion = o.status ? '' : `
  <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${o.assertionId}" Version="2.0" IssueInstant="${t(0)}">
    <saml:Issuer>${o.idp}</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:${o.nameIdFormat || '1.1:nameid-format:emailAddress'}">${esc(o.nameId)}</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData InResponseTo="${o.requestId}" NotOnOrAfter="${t(5)}" Recipient="${o.recipient || o.acs}"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="${t(-1)}" NotOnOrAfter="${t(60)}">
      <saml:AudienceRestriction>
        <saml:Audience>${o.audience || o.sp}</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="${t(-0.2)}" SessionIndex="${o.assertionId}" SessionNotOnOrAfter="${t(480)}">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
      </saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>${attrs}
    </saml:AttributeStatement>
  </saml:Assertion>`;
  return `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${o.responseId}" Version="2.0" IssueInstant="${t(0)}" Destination="${o.acs}" InResponseTo="${o.requestId}">
  <saml:Issuer>${o.idp}</saml:Issuer>
  ${status}${assertion}
</samlp:Response>`;
}

const JANE = { email: 'jane.doe@example.com', firstName: 'Jane', lastName: 'Doe', groups: ['Engineering', 'SSO-Admins'] };

async function build(o, { sign = true, signer = 'demo', mutate } = {}) {
  const base = {
    now: new Date(), responseId: rid(), assertionId: rid(), requestId: rid(),
    idp: SAMPLE_SETTINGS.idpEntityId, sp: SAMPLE_SETTINGS.spEntityId, acs: SAMPLE_SETTINGS.acsUrl,
    nameId: JANE.email, attrs: JANE, ...o,
  };
  const doc = new DOMParser().parseFromString(responseXml(base), 'application/xml');
  const assertion = doc.getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:assertion', 'Assertion')[0];
  if (sign && assertion) {
    const k = signer === 'demo' ? [DEMO_KEY_PKCS8, DEMO_CERT] : [OTHER_KEY_PKCS8, OTHER_CERT];
    await signElement(assertion, await key(k[0]), k[1]);
  }
  if (mutate) mutate(doc, base);
  let xml = new XMLSerializer().serializeToString(doc);
  if (o.textMutate) xml = o.textMutate(xml);
  return xml;
}
const toB64 = (xml) => bytesToB64(new TextEncoder().encode(xml));

export const SAML_SAMPLES = [
  { id: 'valid', label: 'Valid response', note: 'A correct, signed sign-in for Jane Doe. Everything should pass.', make: async () => toB64(await build({})) },
  { id: 'expired', label: 'Expired', note: 'The same response captured three hours ago.', make: async () => toB64(await build({ now: new Date(Date.now() - 3 * 3600000) })) },
  { id: 'audience', label: 'Wrong audience', note: 'The IdP has the wrong Identifier and Reply URL for the app.', make: async () => toB64(await build({ audience: 'https://app.example.com/', recipient: 'http://app.example.com/saml/acs' })) },
  { id: 'missing', label: 'Missing attributes', note: 'Transient NameID and no first or last name sent.', make: async () => toB64(await build({ nameIdFormat: '2.0:nameid-format:transient', nameId: rid().slice(1, 25), attrs: { email: JANE.email, department: '' } })) },
  { id: 'tampered', label: 'Tampered', note: 'Someone edited the email after the IdP signed it.', make: async () => toB64(await build({ textMutate: (x) => x.replace('>jane.doe@example.com</saml:AttributeValue>', '>ceo@example.com</saml:AttributeValue>') })) },
  { id: 'unsigned', label: 'Unsigned', note: 'Nothing is signed, so anyone could have written it.', make: async () => toB64(await build({}, { sign: false })) },
  { id: 'othercert', label: 'Wrong certificate', note: 'Validly signed, but by a key that is not your IdP’s.', make: async () => toB64(await build({}, { signer: 'other' })) },
  {
    id: 'wrapping', label: 'Signature wrapping attack', note: 'A real signed assertion is tucked away and a forged admin assertion put in its place.',
    make: async () => toB64(await build({}, {
      mutate: (doc) => {
        const P = 'urn:oasis:names:tc:SAML:2.0:protocol', A = 'urn:oasis:names:tc:SAML:2.0:assertion';
        const resp = doc.documentElement;
        const signed = doc.getElementsByTagNameNS(A, 'Assertion')[0];
        const forged = signed.cloneNode(true);
        forged.setAttribute('ID', rid());
        forged.removeChild(forged.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0]);
        forged.getElementsByTagNameNS(A, 'NameID')[0].textContent = 'admin@example.com';
        const ext = doc.createElementNS(P, 'samlp:Extensions');
        ext.appendChild(signed);
        resp.insertBefore(ext, doc.getElementsByTagNameNS(P, 'Status')[0]);
        resp.appendChild(forged);
      },
    })),
  },
  { id: 'comment', label: 'Comment trick', note: 'A comment splits the NameID so a buggy parser reads "admin@example.com".', make: async () => toB64(await build({ nameId: 'admin@example.com.attacker.net', textMutate: (x) => x.replace('>admin@example.com.attacker.net<', '>admin@example.com<!---->.attacker.net<') })) },
  { id: 'denied', label: 'IdP error', note: 'The IdP refused because the user is not assigned to the app.', make: async () => toB64(await build({ status: ['Requester', 'RequestDenied', 'AADSTS50105: The signed in user is not assigned to a role for the application.'] }, { sign: false })) },
  {
    id: 'request', label: 'AuthnRequest', note: 'An SP-initiated sign-in request, as it appears in the redirect URL.',
    make: async () => {
      const xml = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${rid()}" Version="2.0" IssueInstant="${iso(new Date())}" Destination="https://idp.example.com/sso" AssertionConsumerServiceURL="${SAMPLE_SETTINGS.acsUrl}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"><saml:Issuer>${SAMPLE_SETTINGS.spEntityId}</saml:Issuer><samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/><samlp:RequestedAuthnContext Comparison="exact"><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></samlp:RequestedAuthnContext></samlp:AuthnRequest>`;
      const deflated = await new Response(new Blob([new TextEncoder().encode(xml)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
      return `https://idp.example.com/sso?SAMLRequest=${encodeURIComponent(bytesToB64(deflated))}&RelayState=${encodeURIComponent('/dashboard')}`;
    },
  },
];

export const SCIM_SAMPLES = [
  {
    id: 'create', label: 'Create user', note: 'A typical create from an identity provider. It should pass.',
    text: `POST /scim/v2/Users HTTP/1.1
Content-Type: application/scim+json

{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
  ],
  "externalId": "5b2f7c1e-8d3a-4c6b-9e1f-2a7d4c8b6e10",
  "userName": "jane.doe@example.com",
  "active": true,
  "displayName": "Jane Doe",
  "title": "Staff Engineer",
  "name": { "givenName": "Jane", "familyName": "Doe", "formatted": "Jane Doe" },
  "emails": [{ "value": "jane.doe@example.com", "type": "work", "primary": true }],
  "phoneNumbers": [{ "value": "+1 555 0100", "type": "work" }],
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
    "department": "Engineering",
    "employeeNumber": "100482",
    "manager": { "value": "7d0c4e2a-1b5f-4a8e-b3c9-6f2e1d0a9b87" }
  }
}`,
  },
  {
    id: 'broken', label: 'Broken create', note: 'Ten common mistakes in one payload.',
    text: `POST /scim/v2/Users HTTP/1.1
Content-Type: application/scim+json

{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "id": "123",
  "username": "  jane.doe@example.com",
  "active": "true",
  "emails": { "value": "jane.doe@example", "primary": true },
  "phone": "+1 555 0100",
  "department": "Engineering",
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": { "manager": "7d0c4e2a" },
  "name": { "first": "Jane", "familyName": "Doe" }
}`,
  },
  {
    id: 'deactivate', label: 'Deactivate (Entra ID)', note: 'How Microsoft Entra ID disables a user, quirks included.',
    text: `PATCH /scim/v2/Users/2819c223-7f76-453a-919d-413861904646 HTTP/1.1
Content-Type: application/scim+json

{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "Replace", "path": "active", "value": "False" }
  ]
}`,
  },
  {
    id: 'patchuser', label: 'Update user', note: 'Replace an email by filter, set the manager and clear a field.',
    text: `PATCH /scim/v2/Users/2819c223-7f76-453a-919d-413861904646 HTTP/1.1
Content-Type: application/scim+json

{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "emails[type eq \\"work\\"].value", "value": "jane@example.com" },
    { "op": "replace", "path": "name.givenName", "value": "Janet" },
    { "op": "add", "path": "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager", "value": { "value": "7d0c4e2a-1b5f-4a8e-b3c9-6f2e1d0a9b87" } },
    { "op": "remove", "path": "title" }
  ]
}`,
  },
  {
    id: 'members', label: 'Group members', note: 'Add one member and remove another.',
    text: `PATCH /scim/v2/Groups/e9e30dba-f08f-4109-8486-d5c6a331660a HTTP/1.1
Content-Type: application/scim+json

{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "Add", "path": "members", "value": [{ "value": "2819c223-7f76-453a-919d-413861904646" }] },
    { "op": "Remove", "path": "members[value eq \\"902c246b-6245-4190-8e05-00816be7344a\\"]" }
  ]
}`,
  },
  { id: 'lookup', label: 'User lookup', note: 'The "does this user exist?" call identity providers make first.', text: 'GET /scim/v2/Users?filter=userName eq "jane.doe@example.com"&startIndex=1&count=100 HTTP/1.1' },
  { id: 'badfilter', label: 'Bad filter', note: 'A filter written like code, not SCIM.', text: "GET /scim/v2/Users?filter=userName == 'jane.doe@example.com' HTTP/1.1" },
  {
    id: 'list', label: 'Bad list response', note: 'A server reply that leaks a password and pages from 0.',
    text: `HTTP/1.1 200 OK
Content-Type: application/scim+json

{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
  "totalResults": 1,
  "startIndex": 0,
  "itemsPerPage": 1,
  "Resources": [
    {
      "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
      "id": "2819c223-7f76-453a-919d-413861904646",
      "userName": "jane.doe@example.com",
      "password": "Winter2026!",
      "active": true,
      "meta": { "resourceType": "User", "created": "2026-11-01T10:00:00Z", "location": "https://app.example.com/scim/v2/Users/2819c223-7f76-453a-919d-413861904646" }
    }
  ]
}`,
  },
  {
    id: 'conflict', label: 'Conflict error', note: 'The right way to say "that user already exists".',
    text: `HTTP/1.1 409 Conflict
Content-Type: application/scim+json

{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:Error"],
  "status": "409",
  "scimType": "uniqueness",
  "detail": "A user with userName jane.doe@example.com already exists."
}`,
  },
];

/** An unrelated "attacker" key pair, used by the attack playground. */
export async function otherSigner() { return { key: await key(OTHER_KEY_PKCS8), cert: OTHER_CERT }; }

// Shareable report: the findings plus the message, with personal data swapped for
// placeholders like <EMAIL_1> before anything is copied or downloaded.
import { SAML } from './saml.js';
import { findPii } from './scrub.js';

const PAGE = 'https://chadtollison.github.io/sso-debugger.html';
const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const KEEP_ATTR = /groups|role|tenantid|identityprovider|authnmethods|wids|entitlement|affiliation/i;
const NAME_ATTR = /givenname|surname|firstname|lastname|displayname|\/name$|^name$|fullname|cn$|2\.5\.4\.(42|4|3)$|113730\.3\.1\.241$/i;
const LEVEL = { error: '\u2715 Problem', warn: '! Warning', ok: '\u2713 Passed', info: 'i Note' };

function prettyXml(node, depth = 0) {
  const pad = '  '.repeat(depth);
  if (node.nodeType === 9) return [...node.childNodes].map((c) => prettyXml(c, 0)).join('');
  if (node.nodeType === 8) return `${pad}<!--${node.data}-->\n`;
  if (node.nodeType !== 1) return '';
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const open = `<${node.nodeName}${[...node.attributes].map((a) => ` ${a.name}="${esc(a.value)}"`).join('')}`;
  const kids = [...node.childNodes].filter((c) => !(c.nodeType === 3 && !c.data.trim()));
  if (!kids.length) return `${pad}${open}/>\n`;
  if (kids.every((c) => c.nodeType === 3 || c.nodeType === 4 || c.nodeType === 8)) {
    return `${pad}${open}>${kids.map((c) => (c.nodeType === 8 ? `<!--${c.data}-->` : esc(c.data.trim()))).join('')}</${node.nodeName}>\n`;
  }
  return `${pad}${open}>\n${kids.map((c) => (c.nodeType === 1 || c.nodeType === 8 ? prettyXml(c, depth + 1) : `${pad}  ${esc(c.data.trim())}\n`)).join('')}${pad}</${node.nodeName}>\n`;
}

// ---------- what counts as personal data ----------
function samlValues(r) {
  const found = [];
  const doc = r.doc;
  for (const n of doc.getElementsByTagNameNS(SAML, 'NameID')) {
    const v = n.textContent.trim();
    if (v) found.push([isEmail(v) ? 'EMAIL' : 'USER', v]);
    // pieces split by an injected comment, too
    for (const c of n.childNodes) if (c.nodeType === 3 && c.data.trim().length > 2) found.push([isEmail(c.data.trim()) ? 'EMAIL' : 'USER', c.data.trim()]);
  }
  for (const a of doc.getElementsByTagNameNS(SAML, 'Attribute')) {
    const name = `${a.getAttribute('Name') || ''} ${a.getAttribute('FriendlyName') || ''}`;
    if (KEEP_ATTR.test(name)) continue;
    for (const v of a.getElementsByTagNameNS(SAML, 'AttributeValue')) {
      const t = v.textContent.trim();
      if (t) found.push([isEmail(t) ? 'EMAIL' : NAME_ATTR.test(name.trim()) ? 'NAME' : 'VALUE', t]);
    }
  }
  for (const s of doc.getElementsByTagNameNS(SAML, 'SubjectConfirmationData')) if (s.getAttribute('Address')) found.push(['IP', s.getAttribute('Address')]);
  return found;
}
const SCIM_PII = { userName: 'USER', displayName: 'NAME', nickName: 'NAME', formatted: 'NAME', givenName: 'NAME', familyName: 'NAME', middleName: 'NAME', streetAddress: 'ADDRESS', locality: 'ADDRESS', postalCode: 'ADDRESS', region: 'ADDRESS', display: 'NAME', password: 'SECRET' };
function scimValues(r) {
  const found = [];
  const walk = (v, key, parent) => {
    if (Array.isArray(v)) { v.forEach((x) => walk(x, key, parent)); return; }
    if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) walk(x, k, key); return; }
    if (typeof v !== 'string' || !v) return;
    const k = key || '';
    if (parent === 'name' || /^(first|last|firstname|lastname|fname|lname|fullname|surname)$/i.test(k)) found.push(['NAME', v]);
    else if (/^(phone|mobile|phonenumber)$/i.test(k)) found.push(['PHONE', v]);
    else if (SCIM_PII[k]) found.push([k === 'userName' && isEmail(v) ? 'EMAIL' : SCIM_PII[k], v]);
    else if (k === 'value' && /^(emails|phoneNumbers|ims|photos)$/.test(parent || '')) found.push([parent === 'emails' ? 'EMAIL' : parent === 'phoneNumbers' ? 'PHONE' : 'VALUE', v]);
    else if (k === 'displayName' && parent === 'manager') found.push(['NAME', v]);
    else if (isEmail(v)) found.push(['EMAIL', v]);
  };
  if (r.json) walk(r.json, '', '');
  if (r.http?.headers?.authorization) found.push(['SECRET', r.http.headers.authorization.replace(/^Bearer\s+/i, '')]);
  for (const m of (r.http?.path || '').matchAll(/"([^"]+)"/g)) found.push([isEmail(m[1]) ? 'EMAIL' : 'VALUE', m[1]]);
  return found;
}
function freeTexts(tool, r) {
  if (tool === 'saml') {
    const out = [];
    const walker = r.doc.createTreeWalker(r.doc, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.data.trim();
      if (t.length > 2 && !/^[A-Za-z0-9+/=\s]{60,}$/.test(t) && !/^(urn:|https?:\/\/|_)/.test(t)) out.push(t);
    }
    return out;
  }
  const out = [];
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); else if (typeof v === 'string' && v.length > 2 && !/^(urn:|https?:)/.test(v)) out.push(v); };
  walk(r.json);
  return out;
}

/**
 * Build a redacted Markdown report.
 * opts: { tool: 'saml'|'scim', result, raw, deep, onProgress, fixes: check => text }
 */
export async function buildReport({ tool, result: r, raw, deep = false, onProgress, fixFor }) {
  const lines = [];
  const errors = r.checks.filter((c) => c.level === 'error').length;
  const warns = r.checks.filter((c) => c.level === 'warn').length;
  lines.push(`# ${tool === 'saml' ? 'SAML sign-in' : 'SCIM provisioning'} debug report`, '',
    `Made with the [SAML & SCIM debugger](${PAGE}) on ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}. Personal data was replaced with placeholders such as \`<EMAIL_1>\` in the browser before this report was made.`, '',
    `**Result:** ${errors ? `${errors} problem${errors === 1 ? '' : 's'}` : 'no problems'}, ${warns} warning${warns === 1 ? '' : 's'} \u00b7 ${tool === 'saml' ? r.kind : [r.http?.method, r.kind].filter(Boolean).join(' ')}`, '');
  for (const lvl of ['error', 'warn', 'info', 'ok']) {
    const cs = r.checks.filter((c) => c.level === lvl);
    if (!cs.length) continue;
    lines.push(`## ${{ error: 'Problems', warn: 'Warnings', info: 'Notes', ok: 'Passed' }[lvl]}`, '');
    for (const c of cs) {
      lines.push(`- ${LEVEL[lvl].slice(0, 1)} **${c.title}** (${c.area})${c.detail ? `. ${c.detail}` : ''}`);
      const fix = fixFor?.(c);
      if (fix) lines.push(`  - How to fix: ${fix}`);
    }
    lines.push('');
  }
  if (tool === 'saml') {
    const rows = [
      ['Issuer', r.assertionInfo?.issuer || r.responseInfo?.issuer || r.requestInfo?.issuer], ['Audience', r.conditions?.audiences?.join(', ')],
      ['Destination', r.responseInfo?.destination || r.requestInfo?.destination], ['Recipient', r.confirmation?.recipient], ['ACS URL requested', r.requestInfo?.acs],
      ['InResponseTo', r.responseInfo?.inResponseTo], ['Status', r.status && [r.status.top, r.status.sub].filter(Boolean).join(' / ')],
      ['NameID format', r.subject?.format], ['Valid from', r.conditions?.notBefore], ['Valid until', r.conditions?.notOnOrAfter], ['Use by', r.confirmation?.notOnOrAfter],
      ...(r.signatures || []).map((v) => [`${v.where} signature`, `${v.digestOk && v.signatureOk ? 'valid' : 'invalid'} (${(v.algorithms?.signature || '').replace(/^.*[#/]/, '')})`]),
      ...(r.certs || []).map((c) => ['Signing certificate', `${c.subject}, valid to ${c.notAfter.toISOString().slice(0, 10)}, SHA-256 ${c.sha256}`]),
    ].filter((x) => x[1]);
    if (rows.length) lines.push('## Message summary', '', '| Field | Value |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | \`${String(v).replace(/\|/g, '\\|')}\` |`), '');
    if (r.attributes?.length) lines.push('## Attributes sent', '', ...r.attributes.map((a) => `- \`${a.name}\`: ${a.values.map((v) => `\`${v.text}\``).join(', ') || '(no value)'}`), '');
    lines.push('## Decoded message', '', '```xml', prettyXml(r.doc).trimEnd(), '```', '');
  } else {
    const rows = r.summary.filter((x) => x[1] !== undefined && x[1] !== null && x[1] !== '');
    if (rows.length) lines.push('## Summary', '', ...rows.map(([k, v]) => `- ${k}: \`${v}\``), '');
    if (r.operations.length) lines.push('## What the PATCH does', '', ...r.operations.map((o, i) => `${i + 1}. ${o}`), '');
    lines.push('## Message', '', '```', raw.trim(), '```', '');
  }
  let text = lines.join('\n');

  // ---------- redact ----------
  const values = tool === 'saml' ? samlValues(r) : scimValues(r);
  if (deep) {
    const texts = [...new Set(freeTexts(tool, r))];
    if (texts.length) {
      const joined = texts.join('\n');
      for (const s of await findPii(joined, onProgress)) {
        const t = /PERSON|NAME/i.test(s.type) ? 'NAME' : /EMAIL/i.test(s.type) ? 'EMAIL' : /PHONE/i.test(s.type) ? 'PHONE' : /ADDRESS|LOC/i.test(s.type) ? 'ADDRESS' : /IP/i.test(s.type) ? 'IP' : /USER/i.test(s.type) ? 'USER' : /PASS|KEY/i.test(s.type) ? 'SECRET' : 'VALUE';
        values.push([t, s.text.trim()]);
      }
    }
  }
  for (const m of text.matchAll(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu)) values.push(['EMAIL', m[0]]);
  for (const m of text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) if (m[0].split('.').every((p) => +p <= 255)) values.push(['IP', m[0]]);

  const tokens = new Map(); const counts = {};
  for (const [type, v] of values) {
    if (!v || v.length < 2 || tokens.has(v)) continue;
    counts[type] = (counts[type] || 0) + 1;
    tokens.set(v, `<${type}_${counts[type]}>`);
  }
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  for (const [v, tok] of [...tokens].sort((a, b) => b[0].length - a[0].length)) {
    for (const form of new Set([v, esc(v)])) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
      text = text.replace(re, tok);
    }
  }
  return { text, hidden: counts, total: tokens.size };
}

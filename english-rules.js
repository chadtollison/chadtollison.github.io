// Plain-English redaction rules, read in the browser with no AI model.
// The same reader as scrubpii's teach() in Python (scrubpii/src/scrubpii/_english.py).
//   redact any ###-#####-##-RC as an RC code     (# digit, @ letter, ? letter or digit, * any run)
//   hide codes like AB-1234 as order number
//   redact 8 digit numbers after "member" as member id
//   redact Globex, Initech and Umbrella as client
//   never redact support@acme.com

const REDACT = /^(?:please\s+)?(?:redact|hide|mask|remove|scrub|block|blank out|black out|censor|flag|catch|find|treat)(?:\s+|$)/i;
const ALLOW = /^(?:(?:never|don'?t|do not|please don'?t)\s+(?:redact|hide|mask|remove|scrub|touch|flag)|keep|allow|ignore|skip|leave)(?:\s+|$)/i;
const QUOTES = /^["'“”‘’`]+|["'“”‘’`]+$/g;
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');
const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;

export class RuleError extends Error {
  constructor(why) { super(`${why}. Try something like: redact any ###-#####-##-RC as an RC code (# is a digit, @ a letter)`); }
}

const typeName = (label) => (label.replace(/\b(?:please|thanks?|thank you)\b/gi, '').replace(/[^A-Za-z]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase()) || 'CUSTOM';
const splitList = (s) => s.trim().split(/\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/).map((p) => p.trim().replace(QUOTES, '').trim()).filter(Boolean);

function shape(t, example = false) {
  const rx = [], said = [];
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    let j = i; while (j < t.length && t[j] === c) j++;
    let k = j - i;
    if (c === '#' || (example && /\d/.test(c))) {
      if (example) { j = i; while (j < t.length && /\d/.test(t[j])) j++; k = j - i; }
      rx.push(k === 1 ? '\\d' : `\\d{${k}}`); said.push(n(k, 'digit', 'digits'));
    } else if (c === '@' && !example) {
      rx.push(k === 1 ? '[A-Za-z]' : `[A-Za-z]{${k}}`); said.push(n(k, 'letter', 'letters'));
    } else if (c === '?' && !example) {
      rx.push(k === 1 ? '[A-Za-z0-9]' : `[A-Za-z0-9]{${k}}`); said.push(n(k, 'letter or digit', 'letters or digits'));
    } else if (c === '*' && !example) {
      rx.push('[A-Za-z0-9]+'); said.push('any letters or digits'); j = i + 1;
    } else if (/\s/.test(c)) {
      while (j < t.length && /\s/.test(t[j])) j++;
      rx.push('\\s+'); said.push('a space');
    } else {
      const special = example ? /[\s0-9]/ : /[#@?*\s]/;
      j = i; while (j < t.length && !special.test(t[j])) j++;
      const lit = t.slice(i, j); rx.push(reEsc(lit)); said.push(`"${lit}"`);
    }
    i = j;
  }
  return [`(?<![A-Za-z0-9])${rx.join('')}(?![A-Za-z0-9])`, said.join(', then ')];
}

function what(rest) {
  let r = rest.trim().replace(QUOTES, '');
  const m0 = /^(?:any|all|every|each|the)\s+/i.exec(r);
  const anyWord = !!m0; if (m0) r = r.slice(m0[0].length);
  let m = /^(?:\w+\s+){0,3}?(?:that\s+)?(?:look(?:s|ing)?\s+like|shaped\s+like|formatted\s+like|like|such\s+as|in\s+the\s+form(?:at)?\s+(?:of\s+)?)\s*(.+)$/i.exec(r);
  if (m && !/[#@?*]/.test(m[1])) {
    const ex = m[1].trim().replace(QUOTES, ''); const [rx, said] = shape(ex, true);
    return { rx, said: `anything shaped like ${ex}: ${said}` };
  }
  if (m) r = m[1].trim().replace(QUOTES, '');
  m = /^(\d+)\s*(?:-|to|or)\s*(\d+)[\s-]*digits?(?:\s+\w+)?$/i.exec(r) || /^(?:\w+\s+)?(?:with|of)\s+(\d+)\s*(?:-|to|or)\s*(\d+)\s+digits$/i.exec(r);
  if (m) { const [a, b] = [+m[1], +m[2]].sort((x, y) => x - y); return { rx: `(?<!\\d)\\d{${a},${b}}(?!\\d)`, said: `any number with ${a} to ${b} digits` }; }
  m = /^(\d+)[\s-]*digits?(?:\s+\w+)?$/i.exec(r) || /^(?:\w+\s+)?(?:with|of)\s+(\d+)\s+digits$/i.exec(r);
  if (m) return { rx: `(?<!\\d)\\d{${+m[1]}}(?!\\d)`, said: `any ${+m[1]}-digit number` };
  if (/^(?:numbers?|digits)$/i.test(r)) return { rx: '(?<!\\d)\\d+(?!\\d)', said: 'any number' };
  m = /^(?:e-?mails?|e-?mail addresses)\s+(?:at|from|ending\s+(?:in|with)|on|@)\s+@?(\S+)$/i.exec(r);
  if (m) { const d = m[1].replace(QUOTES, '').replace(/^@/, ''); return { rx: `[\\w.%+-]+@(?:[\\w-]+\\.)*${reEsc(d)}(?![\\w.-]*\\w)`, said: `any email address at ${d}` }; }
  m = /^(?:\w+\s+)?(?:that\s+)?(?:starts?|starting|begins?|beginning)\s+with\s+(\S+)$/i.exec(r);
  if (m) { const p = m[1].replace(QUOTES, ''); return { rx: `(?<![A-Za-z0-9])${reEsc(p)}[A-Za-z0-9_-]+`, said: `anything starting with ${p}` }; }
  m = /^(?:\w+\s+)?(?:that\s+)?(?:ends?|ending)\s+(?:with|in)\s+(\S+)$/i.exec(r);
  if (m) { const p = m[1].replace(QUOTES, ''); return { rx: `[A-Za-z0-9_-]+${reEsc(p)}(?![A-Za-z0-9])`, said: `anything ending with ${p}` }; }
  if (/^(?:[\w.%+-]+@[\w-]+(?:\.[\w-]+)+|https?:\/\/\S+|www\.\S+)$/.test(r)) return { words: [r], said: `"${r}"` };
  if ((/[#@?*]/.test(r) && !/\s/.test(r.trim())) || /#/.test(r)) { const [rx, said] = shape(r); return { rx, said }; }
  if (anyWord && /\d/.test(r) && !/\s/.test(r)) { const [rx, said] = shape(r, true); return { rx, said: `anything shaped like ${r}: ${said}` }; }
  const words = splitList(r);
  if (!words.length) throw new RuleError("I couldn't find what to redact");
  return { words, said: `the exact words ${words.map((w) => `"${w}"`).join(', ')} (any case)` };
}

export function parseRule(sentence) {
  let s = sentence.trim().replace(/[.!]+$/, '');
  if (!s) throw new RuleError('the rule is empty');
  let action = 'redact', m = ALLOW.exec(s);
  if (m) { action = 'allow'; s = s.slice(m[0].length); }
  else if ((m = REDACT.exec(s))) s = s.slice(m[0].length);
  let label = null;
  m = /\s+(?:as|label(?:l)?ed(?:\s+as)?|called|named|with the label)\s+(?:an?\s+|the\s+)?([^"]+?)\s*$/i.exec(s);
  if (m && action === 'redact') { label = m[1]; s = s.slice(0, m.index); }
  let context = [];
  m = /\s+(?:that\s+comes?\s+|when\s+(?:it\s+)?(?:comes?\s+)?|if\s+(?:it\s+)?(?:comes?\s+)?)?(?:right\s+|just\s+)?(?:after|following|next\s+to|near|preceded\s+by|behind)\s+(?:the\s+)?(?:words?\s+|phrases?\s+|labels?\s+)?(.+)$/i.exec(s);
  if (m) { context = splitList(m[1]).map((c) => c.toLowerCase()); s = s.slice(0, m.index); }
  const w = what(s);
  const type = label ? typeName(label) : 'CUSTOM';
  const source = w.rx || `(?<![\\w])(?:${[...w.words].sort((a, b) => b.length - a.length).map(reEsc).join('|')})(?![\\w])`;
  const explain = action === 'allow' ? `Never redact ${w.said}`
    : `Redact ${w.said}${context.length ? ` when it comes right after ${context.map((c) => `'${c}'`).join(' or ')}` : ''}, labeled [${type}]`;
  return { action, type, re: new RegExp(source, 'gi'), context, explain, sentence: sentence.trim() };
}

const contextOk = (rule, low, start) => {
  const before = low.slice(Math.max(0, start - 40), start);
  return rule.context.some((c) => new RegExp(`${reEsc(c)}[\\s:#.\\-]*(?:[a-z.]{1,6}[\\s:#.\\-]+){0,2}$`).test(before));
};

// Spans the rules find: { type, start, end, why }.
export function ruleSpans(text, rules) {
  const low = text.toLowerCase(), out = [];
  for (const r of rules) {
    if (r.action !== 'redact') continue;
    for (const m of text.matchAll(r.re)) {
      if (!m[0]) continue;
      if (r.context.length && !contextOk(r, low, m.index)) continue;
      out.push({ type: r.type, start: m.index, end: m.index + m[0].length, why: `your rule: "${r.sentence}"` });
    }
  }
  return out;
}

export function isAllowed(value, rules) {
  return rules.some((r) => r.action === 'allow' && new RegExp(`^(?:${r.re.source})$`, 'i').test(value.trim()));
}

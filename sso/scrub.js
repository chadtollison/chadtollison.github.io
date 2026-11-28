// scrubpii in the browser: the same fine-tuned DistilBERT model as the "Redact me" demo
// (models/pii-distilbert-v3), loaded only when someone asks for a deep scan.
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const MODEL_ID = 'pii-distilbert-v3';
const MAX_TOKENS = 126;
let loading = null;

async function load(onProgress) {
  const { AutoTokenizer, AutoModelForTokenClassification, Tensor, env } = await import(TRANSFORMERS);
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = new URL('models/', location.href).href;
  const progress_callback = (p) => { if (p.status === 'progress' && /onnx/.test(p.file || '')) onProgress?.(p.progress || 0); };
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback });
  const model = await AutoModelForTokenClassification.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm', progress_callback });
  return { tokenizer, model, Tensor, id2label: model.config.id2label };
}

/** Find personal data in free text with the model. Returns [{ type, text, start, end, score }]. */
export async function findPii(text, onProgress) {
  loading = loading || load(onProgress);
  const { tokenizer, model, Tensor, id2label } = await loading;
  const words = [...text.matchAll(/[\p{L}\p{N}\p{M}]+|[^\s\p{L}\p{N}\p{M}]/gu)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
  const cls = tokenizer.cls_token_id ?? 101, sep = tokenizer.sep_token_id ?? 102;
  const windows = []; let cur = [], n = 0;
  for (const w of words) {
    const ids = tokenizer.encode(w.text, { add_special_tokens: false }).slice(0, MAX_TOKENS);
    if (!ids.length) continue;
    if (cur.length && n + ids.length > MAX_TOKENS) { windows.push(cur); cur = []; n = 0; }
    cur.push({ ...w, ids }); n += ids.length;
  }
  if (cur.length) windows.push(cur);
  const labeled = [];
  for (const win of windows) {
    const ids = [cls], firstIdx = [];
    for (const w of win) { firstIdx.push(ids.length); ids.push(...w.ids); }
    ids.push(sep);
    const shape = [1, ids.length];
    const { logits } = await model({
      input_ids: new Tensor('int64', BigInt64Array.from(ids, BigInt), shape),
      attention_mask: new Tensor('int64', new BigInt64Array(ids.length).fill(1n), shape),
    });
    const L = logits.dims[2], d = logits.data;
    win.forEach((w, i) => {
      const off = firstIdx[i] * L;
      let max = -Infinity, arg = 0;
      for (let k = 0; k < L; k++) if (d[off + k] > max) { max = d[off + k]; arg = k; }
      let z = 0; for (let k = 0; k < L; k++) z += Math.exp(d[off + k] - max);
      labeled.push({ ...w, label: id2label[arg] ?? 'O', score: 1 / z });
    });
  }
  const spans = []; let open = null;
  for (const w of labeled) {
    if (w.label === 'O' || w.score < 0.5) { open = null; continue; }
    const m = /^([BI])-(.+)$/.exec(w.label);
    const prefix = m ? m[1] : 'I', type = m ? m[2] : w.label;
    const gap = open ? text.slice(open.end, w.start) : '';
    if (open && open.type === type && prefix === 'I' && !/\n/.test(gap) && gap.length <= 1) { open.end = w.end; open.scores.push(w.score); }
    else { open = { type, start: w.start, end: w.end, scores: [w.score] }; spans.push(open); }
  }
  return spans.map((s) => ({ type: s.type, start: s.start, end: s.end, text: text.slice(s.start, s.end), score: s.scores.reduce((a, b) => a + b, 0) / s.scores.length }))
    .filter((s) => s.text.trim().length > 1);
}

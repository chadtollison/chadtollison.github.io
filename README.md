# Michael C. Tollison — Engineering Portfolio

Static professional portfolio built for GitHub Pages.

## Publish
Copy all files to the root of the `chadtollison.github.io` repository, commit, and push to `main`.

In GitHub open **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then choose **main** and **/(root)**.

The site will publish at `https://chadtollison.github.io`.

## Important
Professional case studies are intentionally sanitized. Do not publish employer source code, customer information, credentials, internal screenshots, or confidential schemas.

## Live PII demo (`redact.html`)
`redact.html`, `redact.css` and `redact.js` are a live demo of the PII Detector. The model runs in the visitor's browser with [transformers.js](https://huggingface.co/docs/transformers.js), so there is no server and nothing to pay for. The model files in `models/pii-distilbert-v2/` are an 8-bit ONNX copy of [ChadTollison/pii-distilbert-v2](https://huggingface.co/ChadTollison/pii-distilbert-v2).

If you retrain the model on Hugging Face, open **Actions → Build in-browser PII model → Run workflow**. It rebuilds the files and commits them for you.

# Michael C. Tollison — Engineering Portfolio

Static professional portfolio built for GitHub Pages.

## Publish
Copy all files to the root of the `chadtollison.github.io` repository, commit, and push to `main`.

In GitHub open **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then choose **main** and **/(root)**.

The site will publish at `https://chadtollison.github.io`.

## Important
Professional case studies are intentionally sanitized. Do not publish employer source code, customer information, credentials, internal screenshots, or confidential schemas.

## Live PII demo (`redact.html`)
`redact.html`, `redact.css` and `redact.js` are a live demo of the PII Detector. The model runs in the visitor's browser with [transformers.js](https://huggingface.co/docs/transformers.js), so there is no server and nothing to pay for. The model files in `models/pii-distilbert-v3/` are an 8-bit ONNX copy of [ChadTollison/pii-distilbert-v3](https://huggingface.co/ChadTollison/pii-distilbert-v3).

If you retrain the model on Hugging Face, open **Actions → Build in-browser PII model → Run workflow**. It rebuilds the files and commits them for you.

## SAML & SCIM debugger (`sso-debugger.html`)
`sso-debugger.html`, `sso.css` and the `sso/` folder are a free debugger for SAML sign-in and SCIM provisioning. Everything runs in the visitor's browser (no libraries, no server); a Content-Security-Policy stops the page from sending pasted data anywhere.

- `sso/xmldsig.js`: XML Signature verify and sign (exclusive and inclusive C14N, X.509 parsing, WebCrypto).
- `sso/saml.js`: decoding (Base64, URL, DEFLATE) and SAML 2.0 checks.
- `sso/scim.js`: SCIM 2.0 checks, filter and PATCH path parser.
- `sso/samples.js`: examples. SAML examples are signed live with a **public demo key** that no real system should trust.

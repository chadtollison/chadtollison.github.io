# Michael C. Tollison — Engineering Portfolio

Static professional portfolio built for GitHub Pages.

## Publish
Copy all files to the root of the `chadtollison.github.io` repository, commit, and push to `main`.

In GitHub open **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then choose **main** and **/(root)**.

The site will publish at `https://chadtollison.github.io`.

## Important
Professional case studies are intentionally sanitized. Do not publish employer source code, customer information, credentials, internal screenshots, or confidential schemas.

## Live PII demo (`/pii/`)
`pii/index.html`, `redact.css` and `redact.js` are a live demo of the PII Detector. The model runs in the visitor's browser with [transformers.js](https://huggingface.co/docs/transformers.js), so there is no server and nothing to pay for. The model files in `models/pii-distilbert-v3/` are an 8-bit ONNX copy of [ChadTollison/pii-distilbert-v3](https://huggingface.co/ChadTollison/pii-distilbert-v3).

If you retrain the model on Hugging Face, open **Actions → Build in-browser PII model → Run workflow**. It rebuilds the files and commits them for you.

## SAML & SCIM debugger (`/sso/`)
`sso/index.html`, `sso.css` and the rest of the `sso/` folder are a free debugger for SAML sign-in and SCIM provisioning. Everything runs in the visitor's browser (no libraries, no server); a Content-Security-Policy stops the page from sending pasted data anywhere.

- `sso/xmldsig.js`: XML Signature verify and sign (exclusive and inclusive C14N, X.509 parsing, WebCrypto).
- `sso/saml.js`: decoding (Base64, URL, DEFLATE) and SAML 2.0 checks.
- `sso/scim.js`: SCIM 2.0 checks, filter and PATCH path parser.
- `sso/flow.js`: the animated sign-in flow. `sso/attacks.js`: the attack playground. `sso/fixes.js`: Entra ID, Okta and Google fix guides.
- `sso/fakeidp.js`: the Test IdP tab. It makes its own key and self-signed certificate in the visitor's browser (kept in localStorage), signs responses and posts them to an ACS URL. An app that uses this page as its IdP sign-in URL can start SP-initiated sign-in here.
- `sso/report.js`: redacted reports (rule-based, using what each field means).
- `sso/samples.js`: examples. SAML examples are signed live with a **public demo key** that no real system should trust.

`redact.html` and `sso-debugger.html` are redirects to the new addresses, so old links keep working.

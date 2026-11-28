# Michael C. Tollison — Engineering Portfolio

Static professional portfolio built for GitHub Pages.

## Publish
Copy all files to the root of the `chadtollison.github.io` repository, commit, and push to `main`.

In GitHub open **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then choose **main** and **/(root)**.

The site will publish at `https://chadtollison.github.io`.

## Important
Professional case studies are intentionally sanitized. Do not publish employer source code, customer information, credentials, internal screenshots, or confidential schemas.

## Privacy tools (moved)
The live PII demo and the scrubpii docs now live on their own site, [chadtollison.github.io/privacy-tools](https://chadtollison.github.io/privacy-tools/) (repo [chadtollison/privacy-tools](https://github.com/chadtollison/privacy-tools)). `pii/`, `redact.html`, `scrubpii/index.html` and `chad-pii/` here are redirects so old links keep working.

The scrubpii package source (`scrubpii/`), the model files in `models/` and the training and benchmark workflows stay in this repo. After a new model is shipped to `models/pii-distilbert-v5/`, copy that folder to the privacy-tools repo too so the demo uses it.

## SAML & SCIM debugger (`/sso/`)
`sso/index.html`, `sso.css` and the rest of the `sso/` folder are a free debugger for SAML sign-in and SCIM provisioning. Everything runs in the visitor's browser (no libraries, no server); a Content-Security-Policy stops the page from sending pasted data anywhere.

- `sso/xmldsig.js`: XML Signature verify and sign (exclusive and inclusive C14N, X.509 parsing, WebCrypto).
- `sso/saml.js`: decoding (Base64, URL, DEFLATE) and SAML 2.0 checks.
- `sso/scim.js`: SCIM 2.0 checks, filter and PATCH path parser.
- `sso/flow.js`: the animated sign-in flow. `sso/attacks.js`: the attack playground. `sso/fixes.js`: Entra ID, Okta and Google fix guides.
- `sso/fakeidp.js`: the Test IdP tab. It makes its own key and self-signed certificate in the visitor's browser (kept in localStorage), signs responses and posts them to an ACS URL. An app that uses this page as its IdP sign-in URL can start SP-initiated sign-in here.
- `sso/report.js`: redacted reports (rule-based, using what each field means).
- `sso/samples.js`: examples. SAML examples are signed live with a **public demo key** that no real system should trust.

`sso-debugger.html` is a redirect to the new address, so old links keep working.

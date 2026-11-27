# scrubpii: install size, start-up time and speed

Measured on a GitHub Actions runner (Linux, CPU only). Each system is installed into a fresh virtual environment.

| System | Install size | Install time | First run (downloads model) | Later cold start |
|---|---:|---:|---:|---:|
| Microsoft Presidio + spaCy lg | 815 MB | 26 s | 1.5 s | 1.5 s |
| scrubpii with PyTorch (0.3 setup) | 1,558 MB | 39 s | 8.0 s | 3.4 s |
| scrubpii 0.4 (ONNX, default) | 288 MB | 8 s | 2.3 s | 0.6 s |

Install size counts the installed packages plus the downloaded model (spaCy's model is a package).
"Later cold start" is a new process with everything already downloaded: import, load, first answer.

## Accuracy and speed (F1, ms per text)

| Dataset | scrubpii 0.4 (ONNX 8-bit) | scrubpii (PyTorch) | Microsoft Presidio |
|---|---:|---:|---:|
| ai4privacy (English) | 0.992 (12 ms) | 0.993 (37 ms) | 0.814 (9 ms) |
| ai4privacy (Spanish) | 0.992 (17 ms) | 0.991 (47 ms) | 0.629 (9 ms) |
| Gretel PII (English) | 0.992 (30 ms) | 0.992 (72 ms) | 0.852 (17 ms) |
| Gretel finance (English, never trained on) | 0.796 (195 ms) | 0.798 (415 ms) | 0.521 (75 ms) |

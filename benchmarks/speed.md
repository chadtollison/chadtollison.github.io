# scrubpii: install size, start-up time and speed

Measured on a GitHub Actions runner (Linux, CPU only). Each system is installed into a fresh virtual environment.

| System | Install size | Install time | First run (downloads model) | Later cold start |
|---|---:|---:|---:|---:|
| Microsoft Presidio + spaCy lg | 815 MB | 22 s | 1.4 s | 1.5 s |
| scrubpii with PyTorch (0.3 setup) | 1,558 MB | 41 s | 8.6 s | 3.2 s |
| scrubpii 0.4 (ONNX, default) | 288 MB | 7 s | 1.6 s | 0.6 s |

Install size counts the installed packages plus the downloaded model (spaCy's model is a package).
"Later cold start" is a new process with everything already downloaded: import, load, first answer.

## Accuracy and speed (F1, ms per text)

| Dataset | scrubpii 0.4 (ONNX 8-bit) | scrubpii (PyTorch) | Microsoft Presidio |
|---|---:|---:|---:|
| ai4privacy (English) | 0.992 (8 ms) | 0.993 (26 ms) | 0.814 (11 ms) |
| ai4privacy (Spanish) | 0.991 (11 ms) | 0.991 (32 ms) | 0.629 (10 ms) |
| Gretel PII (English) | 0.992 (17 ms) | 0.992 (46 ms) | 0.852 (18 ms) |
| Gretel finance (English, never trained on) | 0.787 (147 ms) | 0.790 (256 ms) | 0.521 (75 ms) |

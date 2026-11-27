"""Build benchmarks/speed.md from the install/cold-start numbers and the
accuracy + speed comparison of scrubpii's two backends with Presidio."""
import json
from pathlib import Path

B = Path(__file__).resolve().parent.parent / "benchmarks"
setup = [json.loads(l) for l in Path("setup.jsonl").read_text().splitlines() if l.strip()]
acc = json.loads((B / "compare-backends.json").read_text())["results"]
L = ["# scrubpii: install size, start-up time and speed", "",
     "Measured on a GitHub Actions runner (Linux, CPU only). Each system is installed into a fresh virtual environment.", "",
     "| System | Install size | Install time | First run (downloads model) | Later cold start |", "|---|---:|---:|---:|---:|"]
for r in setup:
    L.append(f"| {r['name']} | {r['mb']:,} MB | {r['install_s']:.0f} s | {r['first_s']:.1f} s | {r['warm_s']:.1f} s |")
L += ["", "Install size counts the installed packages plus the downloaded model (spaCy's model is a package).",
      "\"Later cold start\" is a new process with everything already downloaded: import, load, first answer.", "",
      "## Accuracy and speed (F1, ms per text)", ""]
systems = list(next(iter(acc.values())).keys())
L += ["| Dataset | " + " | ".join(systems) + " |", "|---|" + "---:|" * len(systems)]
for ds, res in acc.items():
    L.append(f"| {ds} | " + " | ".join(f"{res[s]['f1']:.3f} ({res[s]['ms_per_text']:.0f} ms)" for s in systems) + " |")
(B / "speed.md").write_text("\n".join(L) + "\n")
(B / "speed.json").write_text(json.dumps({"setup": setup, "accuracy": acc}, indent=2) + "\n")
print((B / "speed.md").read_text())

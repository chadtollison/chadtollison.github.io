"""Does v3 do better on long texts when it reads them in shorter windows?

v3 trained on texts cut to 256 tokens, but chad-pii reads long text in
512-token windows. This scores the never-trained-on finance set (long
documents) and Gretel PII with several window sizes.

  python training/window_test.py --model build/v3 --window 512 --window 256 --window 128
"""
import argparse
import compare
import chad_pii


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--window", type=int, action="append", required=True)
    ap.add_argument("--rows", type=int, default=400)
    a = ap.parse_args()
    find = lambda t: [(e.start, e.end, e.type) for e in chad_pii.find(t, model=a.model)]
    pipe = chad_pii._get_pipeline(a.model)
    for ds in ("Gretel finance (English, never trained on)", "Gretel PII (English)"):
        rows = compare.DATASETS[ds](a.rows)
        lens = sorted(len(pipe.tokenizer(t)["input_ids"]) for t, _ in rows)
        print(f"{ds}: median {lens[len(lens) // 2]} tokens, longest {lens[-1]}", flush=True)
        for w in a.window:
            pipe.tokenizer.model_max_length = w
            r = compare.score(find, rows)
            worst = {t: v["caught"] for t, v in r["by_type"].items()}
            print(f"  window {w}: caught {r['caught']:.1%}, personal {r['was_personal']:.1%}, F1 {r['f1']:.3f}, "
                  f"{r['ms_per_text']:.0f} ms | {worst}", flush=True)


if __name__ == "__main__":
    main()

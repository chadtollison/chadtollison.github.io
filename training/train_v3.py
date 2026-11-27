"""Train piiguard v3: real public PII data plus generated data, 15 types.

Starts from the current model (or another base), grows its output layer to
the 15 types in pii_data.TYPES, and trains on a mix of:
  * ai4privacy open-pii-masking-500k (English + Spanish), CC BY 4.0
  * gretel-pii-masking-en-v1, Apache 2.0
  * the generated sentences from retrain_pii.py (phones in every format,
    look-alikes that are NOT personal data, passports, API keys, IBANs ...)
  * your own examples from training/examples.txt
Personal data a dataset marks but piiguard has no type for is ignored during
training, never taught as "not personal".

Training stops cleanly when --minutes runs out, so it always fits in a
GitHub Actions job.

  python training/train_v3.py --out build/v3
  python training/train_v3.py --base microsoft/deberta-v3-small --out build/v3-large   # fresh head
"""
import argparse
import json
import os
import random
import time
from pathlib import Path

import torch
from transformers import (AutoModelForTokenClassification, AutoTokenizer, Trainer, TrainerCallback,
                          TrainingArguments)

import pii_data
import retrain_pii


class TimeLimit(TrainerCallback):
    def __init__(self, minutes):
        self.deadline = time.time() + minutes * 60

    def on_step_end(self, args, state, control, **kw):
        if time.time() > self.deadline:
            print(f"Time budget used up at step {state.global_step}; stopping and saving.")
            control.should_training_stop = True


def label_names(base_cfg):
    """Keep the base model's label ids (so it keeps what it knows) and add the rest."""
    names = []
    if base_cfg is not None and getattr(base_cfg, "id2label", None) and "O" in base_cfg.label2id:
        names = [base_cfg.id2label[i] for i in range(len(base_cfg.id2label))]
    if "O" not in names:
        names = ["O"] + names
    for t in pii_data.TYPES:
        for p in "BI":
            if f"{p}-{t}" not in names:
                names.append(f"{p}-{t}")
    return names


def encode(tok, label2id, text, spans, max_len):
    enc = tok(text, truncation=True, max_length=max_len, return_offsets_mapping=True)
    labels = []
    for a, b in enc.pop("offset_mapping"):
        if a == b:
            labels.append(-100)
            continue
        lab = "O"
        for s, e, t in spans:
            if a < e and b > s:                  # token touches this item
                lab = None if t is None else ("B-" if a <= s else "I-") + t
                break
        labels.append(-100 if lab is None else label2id[lab])
    enc["labels"] = labels
    return enc


def join_rows(rows, frac, rng):
    """Make long documents by joining 2-5 short texts, so the model also learns
    to read long text (v3 trained on short texts slipped on long documents)."""
    out = []
    for _ in range(int(len(rows) * frac)):
        text, spans = "", []
        for t, sp in rng.sample(rows, rng.randint(2, 5)):
            if text:
                text += rng.choice(["\n\n", "\n", " "])
            spans += [(s + len(text), e + len(text), ty) for s, e, ty in sp]
            text += t
        out.append((text, spans))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="ChadTollison/pii-distilbert-v2")
    ap.add_argument("--out", default="build/v3")
    ap.add_argument("--openpii", type=int, default=60000)
    ap.add_argument("--gretel", type=int, default=20000)
    ap.add_argument("--synthetic", type=int, default=20000)
    ap.add_argument("--epochs", type=float, default=1)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--max-len", type=int, default=256)
    ap.add_argument("--minutes", type=float, default=270)
    ap.add_argument("--max-steps", type=int, default=-1)
    ap.add_argument("--join", type=float, default=0, help="add this share of long texts made by joining short ones")
    a = ap.parse_args()

    torch.set_num_threads(os.cpu_count() or 4)
    random.seed(13); torch.manual_seed(13)
    tok = AutoTokenizer.from_pretrained(a.base, model_input_names=["input_ids", "attention_mask"])

    print("Loading data ...")
    rows = []
    if a.openpii:
        rows += pii_data.openpii("train", n=a.openpii, seed=1)
    if a.gretel:
        rows += pii_data.gretel_en("train", n=a.gretel, seed=1)
    retrain_pii.R.seed(5)
    rows += [retrain_pii.make_example(retrain_pii.TRAIN_TEMPLATES) for _ in range(a.synthetic)]
    mine = retrain_pii.load_examples()
    rows += mine * 10
    if a.join:
        rows += join_rows(rows, a.join, random.Random(3))
    random.shuffle(rows)
    print(f"{len(rows)} training texts. Items by type:", dict(pii_data.label_counts(rows).most_common()))

    try:
        base = AutoModelForTokenClassification.from_pretrained(a.base)
        base_cfg = base.config if "O" in getattr(base.config, "label2id", {}) else None
    except Exception:
        base, base_cfg = None, None
    names = label_names(base_cfg)
    label2id = {n: i for i, n in enumerate(names)}
    model = AutoModelForTokenClassification.from_pretrained(
        a.base, num_labels=len(names), id2label=dict(enumerate(names)), label2id=label2id,
        ignore_mismatched_sizes=True)
    if base_cfg is not None:
        with torch.no_grad():
            n = len(base_cfg.id2label)
            model.classifier.weight[:n] = base.classifier.weight
            model.classifier.bias[:n] = base.classifier.bias
            model.classifier.weight[n:] = torch.randn_like(model.classifier.weight[n:]) * 0.02
            model.classifier.bias[n:] = base.classifier.bias.min() - 2
        print(f"Labels: {n} kept, {len(names) - n} added")
    del base

    data = retrain_pii.ListDataset([encode(tok, label2id, t, s, a.max_len) for t, s in rows])
    args = TrainingArguments(
        output_dir="build/checkpoints", per_device_train_batch_size=a.batch, learning_rate=a.lr,
        num_train_epochs=a.epochs, max_steps=a.max_steps, warmup_ratio=0.06, weight_decay=0.01,
        lr_scheduler_type="linear", logging_steps=100, save_strategy="no", report_to=[], seed=13,
        group_by_length=True, dataloader_num_workers=0)
    trainer = Trainer(model=model, args=args, train_dataset=data,
                      data_collator=lambda b: retrain_pii.collate(b, tok.pad_token_id),
                      callbacks=[TimeLimit(a.minutes)])
    t0 = time.time()
    trainer.train()
    model.save_pretrained(a.out)
    tok.save_pretrained(a.out)
    Path(a.out, "training.json").write_text(json.dumps({
        "base": a.base, "texts": len(rows), "joined_share": a.join, "max_len": a.max_len, "steps": trainer.state.global_step,
        "minutes": round((time.time() - t0) / 60, 1), "types": pii_data.TYPES,
        "data": ["ai4privacy/open-pii-masking-500k-ai4privacy (CC BY 4.0)", "gretelai/gretel-pii-masking-en-v1 (Apache 2.0)",
                 "generated sentences (training/retrain_pii.py)"]}, indent=2))
    print("Saved to", a.out)


if __name__ == "__main__":
    main()

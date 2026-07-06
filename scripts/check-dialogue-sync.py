#!/usr/bin/env python3
"""Verify screenplay.html (reading draft) dialogue matches index.html (working draft).

The working draft is canonical. This compares the two documents' dialogue as
normalized token streams — punctuation, <br> positions, (parentheticals), and
cue merges don't matter; word changes do.

Usage: python3 scripts/check-dialogue-sync.py   (exit 0 = in sync)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def dialogue_tokens(path):
    src = (ROOT / path).read_text(encoding="utf-8")
    blocks = re.findall(r'<p class="dialogue">(.*?)</p>', src, re.S)
    text = " ".join(blocks)
    text = re.sub(r'<span class="parenthetical">.*?</span>', " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    # strip the relish-hyphens (ad-sorb == adsorb) and all other punctuation
    return re.findall(r"[a-z0-9']+", text.lower().replace("-", ""))


def main():
    a = dialogue_tokens("index.html")
    b = dialogue_tokens("screenplay.html")
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            ctx_a = " ".join(a[max(0, i - 8): i + 8])
            ctx_b = " ".join(b[max(0, i - 8): i + 8])
            print(f"DRIFT at token {i}: working='{x}' vs reading='{y}'")
            print(f"  working draft: …{ctx_a}…")
            print(f"  reading draft: …{ctx_b}…")
            sys.exit(1)
    if len(a) != len(b):
        longer, name = (a, "working") if len(a) > len(b) else (b, "reading")
        tail = " ".join(longer[min(len(a), len(b)): min(len(a), len(b)) + 16])
        print(f"DRIFT: {name} draft has {abs(len(a) - len(b))} extra tokens: …{tail}…")
        sys.exit(1)
    print(f"In sync: {len(a)} dialogue tokens match.")


if __name__ == "__main__":
    main()

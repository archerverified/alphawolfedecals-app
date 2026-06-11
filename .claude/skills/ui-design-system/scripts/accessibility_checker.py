#!/usr/bin/env python3
"""
accessibility_checker.py — WCAG 2.x contrast checking for UI color decisions.

Two modes:

1) Pair check — one foreground on one background:
       python accessibility_checker.py "#1F2937" "#FFFFFF"
   Reports the exact contrast ratio and AA/AAA pass/fail for normal and large
   text, plus UI-component contrast (the 3:1 rule for borders, icons, focus rings).
   If a pairing fails, it suggests the nearest passing foreground (same hue,
   nudged lighter/darker) so you don't have to guess.

2) Palette audit — check many pairings from a JSON file:
       python accessibility_checker.py --audit pairs.json
   pairs.json: [{"name": "Body text", "fg": "#475569", "bg": "#FFFFFF",
                 "level": "AA", "size": "normal"}, ...]
   Prints a table and exits non-zero if anything fails (handy in CI).

Why this exists: contrast is the single most common accessibility failure in
design systems, and the math is unforgiving — eyeballing it doesn't work. This
gives you the real numbers and a fix, fast. Stdlib only.

Thresholds (WCAG 2.1):
  Normal text  — AA 4.5:1, AAA 7:1
  Large text   — AA 3:1,   AAA 4.5:1   (>=24px, or >=18.66px bold)
  UI components / graphics — 3:1 (non-text contrast, 1.4.11)
"""

import sys
import json


def hex_to_rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6 or any(c not in "0123456789abcdefABCDEF" for c in h):
        raise ValueError(f"'{h}' is not a valid hex color.")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return "#" + "".join(f"{max(0,min(255,round(c))):02X}" for c in rgb)


def _linear(channel):
    c = channel / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(rgb):
    r, g, b = (_linear(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(fg, bg):
    l1 = relative_luminance(hex_to_rgb(fg))
    l2 = relative_luminance(hex_to_rgb(bg))
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def grade(ratio):
    return {
        "ratio": round(ratio, 2),
        "normal_AA": ratio >= 4.5,
        "normal_AAA": ratio >= 7.0,
        "large_AA": ratio >= 3.0,
        "large_AAA": ratio >= 4.5,
        "ui_component": ratio >= 3.0,
    }


def suggest_passing(fg, bg, target=4.5):
    """Walk the foreground toward black or white (whichever helps) until it
    clears `target`. Keeps hue by scaling RGB toward 0 or 255 in small steps."""
    fg_rgb = list(hex_to_rgb(fg))
    bg_lum = relative_luminance(hex_to_rgb(bg))
    # Decide direction: darken if the background is light, else lighten.
    toward = 0 if bg_lum > 0.5 else 255
    best = None
    for step in range(1, 101):
        t = step / 100
        cand = [round(c + (toward - c) * t) for c in fg_rgb]
        if contrast_ratio(rgb_to_hex(cand), bg) >= target:
            best = rgb_to_hex(cand)
            break
    return best


def check_mark(ok):
    return "PASS" if ok else "FAIL"


def pair_report(fg, bg):
    r = contrast_ratio(fg, bg)
    g = grade(r)
    print(f"\nContrast: {fg} on {bg}")
    print(f"  Ratio: {g['ratio']}:1\n")
    print(f"  Normal text   AA (4.5:1)   {check_mark(g['normal_AA'])}")
    print(f"  Normal text   AAA (7:1)    {check_mark(g['normal_AAA'])}")
    print(f"  Large text    AA (3:1)     {check_mark(g['large_AA'])}")
    print(f"  Large text    AAA (4.5:1)  {check_mark(g['large_AAA'])}")
    print(f"  UI / graphics (3:1)        {check_mark(g['ui_component'])}")
    if not g["normal_AA"]:
        fix = suggest_passing(fg, bg, 4.5)
        if fix:
            nr = round(contrast_ratio(fix, bg), 2)
            print(f"\n  Suggested fix for AA normal text: {fix} ({nr}:1)")
        else:
            print("\n  No same-hue fix reaches 4.5:1 on this background — "
                  "consider changing the background instead.")
    print()


def audit(path):
    with open(path) as f:
        pairs = json.load(f)
    failures = 0
    print(f"\n{'Name':<24}{'FG':<10}{'BG':<10}{'Ratio':<8}{'Need':<7}{'Result'}")
    print("-" * 70)
    for p in pairs:
        level = p.get("level", "AA")
        size = p.get("size", "normal")
        need = {("AA", "normal"): 4.5, ("AAA", "normal"): 7.0,
                ("AA", "large"): 3.0, ("AAA", "large"): 4.5,
                ("AA", "ui"): 3.0}.get((level, size), 4.5)
        r = contrast_ratio(p["fg"], p["bg"])
        ok = r >= need
        failures += 0 if ok else 1
        print(f"{p.get('name','')[:23]:<24}{p['fg']:<10}{p['bg']:<10}"
              f"{round(r,2):<8}{need:<7}{check_mark(ok)}")
    print("-" * 70)
    print(f"{len(pairs)} pairings, {failures} failing.\n")
    sys.exit(1 if failures else 0)


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    try:
        if args[0] == "--audit":
            if len(args) < 2:
                sys.exit("Usage: accessibility_checker.py --audit pairs.json")
            audit(args[1])
        else:
            if len(args) < 2:
                sys.exit("Usage: accessibility_checker.py <fg_hex> <bg_hex>")
            pair_report(args[0], args[1])
    except (ValueError, FileNotFoundError, KeyError, json.JSONDecodeError) as e:
        sys.exit(f"Error: {e}")


if __name__ == "__main__":
    main()

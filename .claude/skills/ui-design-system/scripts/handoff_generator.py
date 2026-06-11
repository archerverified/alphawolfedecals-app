#!/usr/bin/env python3
"""
handoff_generator.py — Assemble a single developer handoff document.

The handoff is where design systems leak: tokens live in one file, component
docs in another, and the dev ends up reconstructing intent from screenshots.
This script stitches a token set (from design_token_generator.py) and any
number of component specs into one self-contained Markdown handoff so the
engineer has tokens, usage, and implementation notes in one scroll.

Usage:
    python handoff_generator.py --tokens tokens.json \
        [--components button.json card.json ...] \
        [--title "Acme Design System v1"] > HANDOFF.md

  --tokens       JSON produced by design_token_generator.py (json format).
  --components   Zero or more component spec JSON files (see
                 component_doc_generator.py for the shape).
  --title        Document title (default derived from token meta).

It prints a tokens reference (colors, type scale, spacing, radius, shadow,
motion, breakpoints), then a contents-style component index, then each
component's full doc — reusing the same rendering as the component generator
so everything stays consistent. Stdlib only.
"""

import sys
import json

# Reuse the component renderer so handoff docs match standalone component docs.
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
try:
    from component_doc_generator import build_doc as build_component_doc
except Exception:
    build_component_doc = None


def parse_args(argv):
    opts = {"tokens": None, "components": [], "title": None}
    i = 0
    while i < len(argv):
        if argv[i] == "--tokens":
            opts["tokens"] = argv[i + 1]; i += 2
        elif argv[i] == "--title":
            opts["title"] = argv[i + 1]; i += 2
        elif argv[i] == "--components":
            i += 1
            while i < len(argv) and not argv[i].startswith("--"):
                opts["components"].append(argv[i]); i += 1
        else:
            i += 1
    return opts


def color_section(color):
    lines = ["## Color\n",
             "Each family is a 50–950 tonal ramp. 500 is the base; use 600/700 "
             "for hover/active, 50–200 for surfaces and tints.\n"]
    for family, ramp in color.items():
        lines.append(f"\n### {family.capitalize()}\n")
        lines.append("| Stop | Hex |")
        lines.append("| --- | --- |")
        for stop, hexv in ramp.items():
            lines.append(f"| {stop} | `{hexv}` |")
    return "\n".join(lines) + "\n"


def type_section(typ):
    lines = [f"## Typography\n",
             f"Modular scale, ratio **{typ.get('scale_ratio','?')}**, 16px base.\n",
             "| Token | rem | px |", "| --- | --- | --- |"]
    for name, val in typ.get("font_size", {}).items():
        lines.append(f"| {name} | {val['rem']} | {val['px']} |")
    weights = ", ".join(f"{k} {v}" for k, v in typ.get("font_weight", {}).items())
    lhs = ", ".join(f"{k} {v}" for k, v in typ.get("line_height", {}).items())
    lines.append(f"\n**Weights:** {weights}")
    lines.append(f"\n**Line heights:** {lhs}\n")
    return "\n".join(lines) + "\n"


def kv_table(title, intro, data, fmt=lambda v: f"`{v}`"):
    lines = [f"## {title}\n"]
    if intro:
        lines.append(intro + "\n")
    lines.append("| Token | Value |")
    lines.append("| --- | --- |")
    for k, v in data.items():
        if isinstance(v, dict):
            v = v.get("px", v.get("rem", v))
        lines.append(f"| {k} | {fmt(v)} |")
    return "\n".join(lines) + "\n"


def build_handoff(tokens, components, title):
    meta = tokens.get("$meta", {})
    if not title:
        title = f"Design System Handoff — {meta.get('style','').capitalize()} ({meta.get('brand','')})"
    out = [f"# {title}\n",
           f"Generated tokens for brand `{meta.get('brand','')}`, "
           f"style `{meta.get('style','')}`. Implement tokens first, then components.\n",
           "---\n", "# Tokens\n"]

    out.append(color_section(tokens.get("color", {})))
    out.append(type_section(tokens.get("typography", {})))
    out.append(kv_table("Spacing", "8pt grid. Values in px.",
                        tokens.get("spacing", {})))
    out.append(kv_table("Radius", "", tokens.get("radius", {})))
    out.append(kv_table("Shadow", "Elevation scale.", tokens.get("shadow", {})))
    motion = tokens.get("motion", {})
    out.append(kv_table("Duration", "", motion.get("duration", {})))
    out.append(kv_table("Easing", "", motion.get("easing", {})))
    out.append(kv_table("Breakpoints", "Min-width breakpoints.",
                        tokens.get("breakpoint", {})))

    if components:
        out.append("---\n# Components\n")
        out.append("Index: " + ", ".join(c.get("name", "?") for c in components) + "\n")
        for spec in components:
            out.append("\n---\n")
            if build_component_doc:
                out.append(build_component_doc(spec))
            else:
                out.append(f"## {spec.get('name','Component')}\n{spec.get('summary','')}\n")
    return "\n".join(out)


def main():
    opts = parse_args(sys.argv[1:])
    if not opts["tokens"]:
        print(__doc__)
        sys.exit(1)
    try:
        with open(opts["tokens"]) as f:
            tokens = json.load(f)
        components = []
        for path in opts["components"]:
            with open(path) as f:
                components.append(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError) as e:
        sys.exit(f"Error: {e}")
    print(build_handoff(tokens, components, opts["title"]))


if __name__ == "__main__":
    main()

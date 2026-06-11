#!/usr/bin/env python3
"""
component_doc_generator.py — Turn a component spec into clean Markdown docs.

The hard part of component documentation isn't writing prose, it's keeping
every component's docs consistent: same sections, same prop-table shape, same
place for accessibility notes and do/don't guidance. This script enforces that
structure so a 40-component library reads like one author wrote it.

Modes:

  scaffold [name]
      Print a blank spec template (JSON) to fill in. Pipe it to a file:
          python component_doc_generator.py scaffold Button > button.json

  build <spec.json>
      Read a filled spec and print Markdown documentation to stdout.
          python component_doc_generator.py build button.json > Button.md

Spec shape (all fields optional except "name"):
{
  "name": "Button",
  "summary": "One-line description.",
  "status": "stable | beta | deprecated",
  "anatomy": ["Container", "Label", "Optional leading icon"],
  "props": [
    {"name": "variant", "type": "primary | secondary | ghost",
     "default": "primary", "required": false, "description": "Visual emphasis."}
  ],
  "variants": [{"name": "Primary", "when": "The main action on a screen."}],
  "states": ["default", "hover", "focus", "active", "disabled", "loading"],
  "guidelines": {"do": ["Use one primary button per view."],
                 "dont": ["Don't stack three primaries in a row."]},
  "accessibility": ["Hit target >= 44x44px.", "Focus ring must meet 3:1."],
  "tokens": ["color.primary.500", "radius.md", "spacing.16"]
}

Stdlib only.
"""

import sys
import json


SCAFFOLD = {
    "name": "ComponentName",
    "summary": "One sentence on what it is and when to reach for it.",
    "status": "beta",
    "anatomy": ["Part one", "Part two"],
    "props": [
        {"name": "variant", "type": "primary | secondary", "default": "primary",
         "required": False, "description": "What this controls."}
    ],
    "variants": [{"name": "Primary", "when": "Describe the use case."}],
    "states": ["default", "hover", "focus", "active", "disabled"],
    "guidelines": {"do": ["A thing to do."], "dont": ["A thing to avoid."]},
    "accessibility": ["An a11y requirement."],
    "tokens": ["color.primary.500", "radius.md"],
}


def _esc(s):
    # Pipes break Markdown table columns — escape them in cell content.
    return str(s).replace("|", "\\|")


def md_table(props):
    if not props:
        return "_No props._\n"
    rows = ["| Prop | Type | Default | Required | Description |",
            "| --- | --- | --- | --- | --- |"]
    for p in props:
        default = p.get("default")
        rows.append("| `{name}` | `{type}` | {default} | {req} | {desc} |".format(
            name=_esc(p.get("name", "")),
            type=_esc(p.get("type", "")),
            default=f"`{_esc(default)}`" if default not in (None, "") else "—",
            req="Yes" if p.get("required") else "No",
            desc=_esc(p.get("description", "")),
        ))
    return "\n".join(rows) + "\n"


def bullet(items):
    return "\n".join(f"- {i}" for i in items) + "\n" if items else "_None specified._\n"


def build_doc(spec):
    name = spec.get("name", "Component")
    status = spec.get("status", "")
    badge = f"  `{status}`" if status else ""
    out = [f"# {name}{badge}\n"]
    if spec.get("summary"):
        out.append(spec["summary"] + "\n")

    out.append("## Anatomy\n")
    out.append(bullet(spec.get("anatomy", [])))

    out.append("\n## Props\n")
    out.append(md_table(spec.get("props", [])))

    if spec.get("variants"):
        out.append("\n## Variants\n")
        for v in spec["variants"]:
            out.append(f"**{v.get('name','')}** — {v.get('when','')}\n")

    if spec.get("states"):
        out.append("\n## States\n")
        out.append(", ".join(f"`{s}`" for s in spec["states"]) + "\n")

    g = spec.get("guidelines", {})
    if g.get("do") or g.get("dont"):
        out.append("\n## Usage guidelines\n")
        out.append("**Do**\n")
        out.append(bullet(g.get("do", [])))
        out.append("\n**Don't**\n")
        out.append(bullet(g.get("dont", [])))

    out.append("\n## Accessibility\n")
    out.append(bullet(spec.get("accessibility", [])))

    if spec.get("tokens"):
        out.append("\n## Design tokens used\n")
        out.append(bullet([f"`{t}`" for t in spec["tokens"]]))

    return "\n".join(out)


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        sys.exit(1)
    try:
        if a[0] == "scaffold":
            spec = dict(SCAFFOLD)
            if len(a) > 1:
                spec["name"] = a[1]
            print(json.dumps(spec, indent=2))
        elif a[0] == "build":
            if len(a) < 2:
                sys.exit("Usage: component_doc_generator.py build spec.json")
            with open(a[1]) as f:
                spec = json.load(f)
            print(build_doc(spec))
        else:
            sys.exit(f"Unknown mode '{a[0]}'. Use 'scaffold' or 'build'.")
    except (FileNotFoundError, json.JSONDecodeError) as e:
        sys.exit(f"Error: {e}")


if __name__ == "__main__":
    main()

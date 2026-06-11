#!/usr/bin/env python3
"""
responsive_calc.py — Responsive design math for design systems.

Subcommands:

  fluid <min_px> <max_px> [min_vw=375] [max_vw=1440]
      Generate a CSS clamp() that scales a value linearly between two
      viewport widths. Use it for fluid type, fluid spacing, fluid gaps —
      anything that should grow with the viewport instead of snapping at
      breakpoints. Output is copy-paste-ready and never exceeds the bounds.

  scale <base_px> <ratio> [steps=6]
      Print a modular type scale (e.g. ratio 1.25 = major third) as px + rem.

  rem <px> [root=16]            Convert px -> rem.
  px  <rem> [root=16]           Convert rem -> px.

  grid <container_px> <columns> [gutter_px=24] [margin_px=24]
      Compute usable width and exact column width for a fixed grid — the
      numbers you hand a dev so a 12-col layout lines up to the pixel.

Examples:
  python responsive_calc.py fluid 18 24            # body copy 18->24px
  python responsive_calc.py fluid 32 64 375 1440   # hero heading
  python responsive_calc.py scale 16 1.25 7
  python responsive_calc.py grid 1200 12 24 32

Why clamp() over breakpoint steps: fluid values remove the awkward jumps
where text suddenly resizes at 768px. The formula below produces the
slope/intercept so the value tracks the viewport smoothly, then clamps so
it never gets smaller than min or larger than max. Stdlib only.
"""

import sys


def fluid(min_px, max_px, min_vw=375.0, max_vw=1440.0, root=16.0):
    """Return a clamp() string scaling min_px@min_vw to max_px@max_vw."""
    if max_vw == min_vw:
        raise ValueError("min viewport and max viewport must differ.")
    min_rem = min_px / root
    max_rem = max_px / root
    # preferred = slope * 100vw + intercept(rem)
    slope = (max_px - min_px) / (max_vw - min_vw)
    slope_vw = round(slope * 100, 4)
    intercept_rem = round((min_px - slope * min_vw) / root, 4)
    lo, hi = (min_rem, max_rem) if min_rem <= max_rem else (max_rem, min_rem)
    preferred = f"{intercept_rem}rem + {slope_vw}vw"
    return f"clamp({round(lo,4)}rem, {preferred}, {round(hi,4)}rem)"


def scale(base_px, ratio, steps=6, root=16.0):
    out = []
    # Center the scale so we get a couple steps below the base too.
    start = -1
    for i in range(start, steps - 1):
        px = round(base_px * (ratio ** i), 1)
        out.append((i, px, round(px / root, 4)))
    return out


def grid(container, columns, gutter=24.0, margin=24.0):
    usable = container - 2 * margin
    total_gutter = gutter * (columns - 1)
    col = (usable - total_gutter) / columns
    return {
        "container_px": container,
        "usable_px": round(usable, 2),
        "columns": columns,
        "gutter_px": gutter,
        "margin_px": margin,
        "column_px": round(col, 2),
    }


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        sys.exit(1)
    cmd = a[0]
    try:
        if cmd == "fluid":
            min_px, max_px = float(a[1]), float(a[2])
            min_vw = float(a[3]) if len(a) > 3 else 375.0
            max_vw = float(a[4]) if len(a) > 4 else 1440.0
            print(fluid(min_px, max_px, min_vw, max_vw))
            print(f"  // {min_px}px @ {min_vw}px  ->  {max_px}px @ {max_vw}px")
        elif cmd == "scale":
            base, ratio = float(a[1]), float(a[2])
            steps = int(a[3]) if len(a) > 3 else 6
            print(f"\nModular scale — base {base}px, ratio {ratio}")
            print(f"{'step':<6}{'px':<10}{'rem'}")
            for i, px, rem in scale(base, ratio, steps):
                print(f"{i:<6}{px:<10}{rem}rem")
            print()
        elif cmd == "rem":
            px = float(a[1]); root = float(a[2]) if len(a) > 2 else 16.0
            print(f"{round(px/root, 4)}rem")
        elif cmd == "px":
            rem = float(a[1]); root = float(a[2]) if len(a) > 2 else 16.0
            print(f"{round(rem*root, 2)}px")
        elif cmd == "grid":
            container = float(a[1]); columns = int(a[2])
            gutter = float(a[3]) if len(a) > 3 else 24.0
            margin = float(a[4]) if len(a) > 4 else 24.0
            g = grid(container, columns, gutter, margin)
            print(f"\n{columns}-column grid in {g['container_px']}px container")
            print(f"  Usable width : {g['usable_px']}px "
                  f"(after {margin}px margins each side)")
            print(f"  Gutter       : {g['gutter_px']}px x {columns-1}")
            print(f"  Column width : {g['column_px']}px\n")
        else:
            sys.exit(f"Unknown subcommand '{cmd}'. See --help / run with no args.")
    except (IndexError, ValueError) as e:
        sys.exit(f"Error: {e}. Run with no arguments to see usage.")


if __name__ == "__main__":
    main()

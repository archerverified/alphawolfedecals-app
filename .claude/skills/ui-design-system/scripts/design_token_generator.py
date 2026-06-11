#!/usr/bin/env python3
"""
design_token_generator.py — Generate a complete design system token set from a single brand color.

Produces a tonal color ramp (50–950), semantic status colors, a neutral ramp,
a modular type scale, an 8pt spacing grid, radius / shadow / motion tokens, and
responsive breakpoints. Exports to JSON, CSS custom properties, or SCSS.

Usage:
    python design_token_generator.py <brand_color> [style] [format]

    brand_color   Hex (#3B82F6 or 3b82f6) — the seed for the primary ramp.
    style         modern | classic | playful   (default: modern)
    format        json | css | scss            (default: json)

Examples:
    python design_token_generator.py "#6D28D9" playful css
    python design_token_generator.py 0F766E classic scss
    python design_token_generator.py "#3B82F6"            # modern, json

The "style" knob changes opinionated defaults (type-scale ratio, corner
radius, shadow softness, accent harmony) so the same brand color can feel
buttoned-up or friendly without you hand-tuning every value.

Stdlib only — no pip installs required.
"""

import sys
import json
import colorsys

# ---------------------------------------------------------------------------
# Style presets: the personality knobs. Each preset is a coherent set of
# decisions a designer would otherwise make by feel.
# ---------------------------------------------------------------------------
STYLES = {
    "modern": {
        "type_ratio": 1.250,          # major third — clean, contemporary
        "radius_base": 8,             # px at the "md" step
        "radius_curve": "moderate",
        "shadow_alpha": 0.10,         # softer, diffuse elevation
        "shadow_spread": 1.0,
        "accent_offset": 150,         # hue degrees for the secondary accent
        "neutral_temp": 220,          # cool-grey hue (slightly blue)
        "neutral_chroma": 0.06,       # how much brand bleeds into the greys
    },
    "classic": {
        "type_ratio": 1.200,          # minor third — tighter, editorial
        "radius_base": 4,             # restrained corners
        "radius_curve": "tight",
        "shadow_alpha": 0.14,         # crisper shadows
        "shadow_spread": 0.85,
        "accent_offset": 30,          # analogous, conservative
        "neutral_temp": 35,           # warm-grey hue
        "neutral_chroma": 0.04,
    },
    "playful": {
        "type_ratio": 1.333,          # perfect fourth — bold size jumps
        "radius_base": 14,            # round, friendly
        "radius_curve": "round",
        "shadow_alpha": 0.18,         # punchy, colorful shadows
        "shadow_spread": 1.25,
        "accent_offset": 200,         # near-complementary pop
        "neutral_temp": 280,          # faintly violet greys
        "neutral_chroma": 0.09,
    },
}

# Lightness stops for a tonal ramp (Tailwind-like). Higher = lighter.
RAMP_STOPS = {
    50: 0.97, 100: 0.94, 200: 0.86, 300: 0.75, 400: 0.63,
    500: 0.52, 600: 0.44, 700: 0.36, 800: 0.28, 900: 0.20, 950: 0.13,
}


# ---------------------------------------------------------------------------
# Color helpers (stdlib colorsys works in HLS; we keep HSL semantics here).
# ---------------------------------------------------------------------------
def hex_to_rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6 or any(c not in "0123456789abcdefABCDEF" for c in h):
        raise ValueError(f"'{h}' is not a valid hex color (need 3 or 6 hex digits, e.g. #3B82F6).")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return "#" + "".join(f"{max(0, min(255, round(c))):02X}" for c in rgb)


def rgb_to_hsl(rgb):
    r, g, b = (c / 255 for c in rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return (h * 360, s, l)


def hsl_to_rgb(h, s, l):
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, l, s)
    return (r * 255, g * 255, b * 255)


def hsl_to_hex(h, s, l):
    return rgb_to_hex(hsl_to_rgb(h, s, l))


def build_ramp(seed_hex, sat_boost=0.0):
    """Generate a 50–950 tonal ramp that keeps the seed's hue.

    We anchor lightness at the RAMP_STOPS and gently bend saturation:
    light tints lose a little chroma (so they don't look neon-washed),
    deep shades keep most of it. This mirrors how good hand-built ramps read.
    """
    h, s, _ = rgb_to_hsl(hex_to_rgb(seed_hex))
    s = min(1.0, s + sat_boost)
    ramp = {}
    for stop, light in RAMP_STOPS.items():
        # Saturation curve: pull chroma down toward the light end, keep it dark end.
        if light > 0.5:
            sat = s * (1 - (light - 0.5) * 0.55)
        else:
            sat = min(1.0, s * (1 + (0.5 - light) * 0.35))
        ramp[str(stop)] = hsl_to_hex(h, max(0.0, min(1.0, sat)), light)
    return ramp


def build_neutral_ramp(brand_hex, temp_hue, chroma):
    """Greys that carry a whisper of the brand so the UI feels cohesive."""
    bh, _, _ = rgb_to_hsl(hex_to_rgb(brand_hex))
    # Blend the requested neutral temperature with the brand hue a touch.
    hue = (temp_hue * 0.7 + bh * 0.3) % 360
    ramp = {}
    for stop, light in RAMP_STOPS.items():
        ramp[str(stop)] = hsl_to_hex(hue, chroma, light)
    return ramp


# ---------------------------------------------------------------------------
# Token builders
# ---------------------------------------------------------------------------
def build_colors(brand_hex, style):
    cfg = STYLES[style]
    bh, bs, bl = rgb_to_hsl(hex_to_rgb(brand_hex))
    secondary_seed = hsl_to_hex(bh + cfg["accent_offset"], bs, bl)
    return {
        "primary": build_ramp(brand_hex),
        "secondary": build_ramp(secondary_seed),
        "neutral": build_neutral_ramp(brand_hex, cfg["neutral_temp"], cfg["neutral_chroma"]),
        "success": build_ramp("#16A34A"),
        "warning": build_ramp("#D97706"),
        "error": build_ramp("#DC2626"),
        "info": build_ramp("#0EA5E9"),
    }


def build_typography(style):
    cfg = STYLES[style]
    ratio = cfg["type_ratio"]
    # Steps relative to a 1rem (16px) base.
    steps = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"]
    base_index = 2  # "base" sits at exponent 0
    sizes = {}
    for i, name in enumerate(steps):
        rem = round(ratio ** (i - base_index), 4)
        sizes[name] = {"rem": f"{rem}rem", "px": round(rem * 16, 1)}
    return {
        "font_size": sizes,
        "font_weight": {
            "regular": 400, "medium": 500, "semibold": 600, "bold": 700,
        },
        "line_height": {
            "tight": 1.15, "snug": 1.3, "normal": 1.5, "relaxed": 1.65,
        },
        "letter_spacing": {
            "tight": "-0.02em", "normal": "0em", "wide": "0.04em",
        },
        "scale_ratio": ratio,
    }


def build_spacing():
    """8pt grid with a couple of sub-steps (4px, 2px) for fine control."""
    grid = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128]
    return {str(px): {"px": px, "rem": f"{round(px / 16, 4)}rem"} for px in grid}


def build_radius(style):
    cfg = STYLES[style]
    base = cfg["radius_base"]
    curve = cfg["radius_curve"]
    mult = {"tight": (0.5, 1, 2, 3), "moderate": (0.5, 1, 1.75, 2.75),
            "round": (0.6, 1, 1.6, 2.4)}[curve]
    return {
        "none": "0px",
        "sm": f"{round(base * mult[0])}px",
        "md": f"{base}px",
        "lg": f"{round(base * mult[2])}px",
        "xl": f"{round(base * mult[3])}px",
        "full": "9999px",
    }


def build_shadows(style):
    cfg = STYLES[style]
    a = cfg["shadow_alpha"]
    sp = cfg["shadow_spread"]
    def sh(y, blur, alpha):
        return f"0px {round(y*sp)}px {round(blur*sp)}px rgba(15, 23, 42, {round(alpha, 3)})"
    return {
        "sm": sh(1, 2, a * 0.8),
        "md": sh(3, 6, a),
        "lg": sh(8, 16, a * 1.1),
        "xl": sh(16, 32, a * 1.2),
        "2xl": sh(28, 56, a * 1.3),
        "inner": f"inset 0px 2px 4px rgba(15, 23, 42, {round(a*0.9,3)})",
    }


def build_motion():
    return {
        "duration": {"instant": "75ms", "fast": "150ms", "normal": "250ms",
                     "slow": "400ms", "slower": "600ms"},
        "easing": {
            "standard": "cubic-bezier(0.2, 0, 0, 1)",
            "decelerate": "cubic-bezier(0, 0, 0, 1)",
            "accelerate": "cubic-bezier(0.3, 0, 1, 1)",
            "spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
        },
    }


def build_breakpoints():
    return {"sm": "640px", "md": "768px", "lg": "1024px", "xl": "1280px", "2xl": "1536px"}


def build_tokens(brand_hex, style):
    return {
        "$meta": {"brand": brand_hex, "style": style, "generator": "ui-design-system"},
        "color": build_colors(brand_hex, style),
        "typography": build_typography(style),
        "spacing": build_spacing(),
        "radius": build_radius(style),
        "shadow": build_shadows(style),
        "motion": build_motion(),
        "breakpoint": build_breakpoints(),
    }


# ---------------------------------------------------------------------------
# Exporters
# ---------------------------------------------------------------------------
def _flatten(prefix, obj, out, sep="-"):
    """Flatten nested token dicts into kebab keys, picking sensible leaf values."""
    for k, v in obj.items():
        if str(k).startswith("$"):
            continue
        key = f"{prefix}{sep}{k}" if prefix else str(k)
        if isinstance(v, dict):
            # Leaf objects like {"rem": "...", "px": ...} -> take the css-friendly value.
            if "rem" in v:
                out[key] = v["rem"]
            elif "px" in v and "rem" not in v:
                out[key] = f'{v["px"]}px'
            else:
                _flatten(key, v, out, sep)
        else:
            out[key] = v


def to_css(tokens):
    flat = {}
    _flatten("", tokens, flat)
    lines = [":root {"]
    for k, v in flat.items():
        lines.append(f"  --{k}: {v};")
    lines.append("}")
    return "\n".join(lines)


def to_scss(tokens):
    flat = {}
    _flatten("", tokens, flat)
    lines = ["// Design tokens — generated by ui-design-system", ""]
    for k, v in flat.items():
        lines.append(f"${k}: {v};")
    return "\n".join(lines)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    brand = sys.argv[1]
    style = sys.argv[2].lower() if len(sys.argv) > 2 else "modern"
    fmt = sys.argv[3].lower() if len(sys.argv) > 3 else "json"

    if style not in STYLES:
        sys.exit(f"Unknown style '{style}'. Choose: {', '.join(STYLES)}")
    if fmt not in ("json", "css", "scss"):
        sys.exit(f"Unknown format '{fmt}'. Choose: json, css, scss")

    try:
        hex_to_rgb(brand)
    except ValueError as e:
        sys.exit(str(e))

    tokens = build_tokens(brand if brand.startswith("#") else f"#{brand}", style)

    if fmt == "json":
        print(json.dumps(tokens, indent=2))
    elif fmt == "css":
        print(to_css(tokens))
    else:
        print(to_scss(tokens))


if __name__ == "__main__":
    main()

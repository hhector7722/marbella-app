#!/usr/bin/env python3
"""Repair empty accented glyph outlines in the bundled EA Sports title font.

Requires fontTools only when regenerating the asset, not in the Next.js build.
The original font remains unchanged. All rendered text retains real Unicode
accents, while the repaired glyph outlines match the EA Sports letter shapes.
"""
from __future__ import annotations

from pathlib import Path
import unicodedata

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public/fonts/EASPORTS15.ttf"
TARGET = ROOT / "public/fonts/EASPORTS15-ES.ttf"


def polygon(pen, points):
    pen.moveTo(points[0])
    for point in points[1:]:
        pen.lineTo(point)
    pen.closePath()


def draw_mark(pen, mark: str, center: int, y_top: int = 1500) -> None:
    # Cap height 1500, ascender 1854 (2048 UPM). Use bold geometric marks
    # suited to the EA title font instead of mixing another font's glyphs.
    y = y_top + 65
    if mark == "\u0301":  # acute
        polygon(pen, [(center - 105, y), (center + 10, y + 205),
                      (center + 130, y + 205), (center - 10, y)])
    elif mark == "\u0300":  # grave
        polygon(pen, [(center - 130, y + 205), (center - 10, y + 205),
                      (center + 105, y), (center + 10, y)])
    elif mark == "\u0303":  # tilde
        polygon(pen, [
            (center - 200, y + 38), (center - 200, y + 142),
            (center - 145, y + 186), (center - 82, y + 192),
            (center + 80, y + 116), (center + 131, y + 131),
            (center + 166, y + 186), (center + 210, y + 174),
            (center + 210, y + 72), (center + 150, y + 24),
            (center + 91, y + 22), (center - 68, y + 100),
            (center - 128, y + 85), (center - 165, y + 32),
        ])
    elif mark == "\u0308":  # diaeresis
        for x in (center - 172, center + 54):
            polygon(pen, [(x, y + 20), (x + 120, y + 20),
                          (x + 120, y + 175), (x, y + 175)])
    elif mark == "\u0302":  # circumflex
        polygon(pen, [
            (center - 184, y), (center - 34, y + 205),
            (center + 34, y + 205), (center + 184, y),
            (center + 57, y), (center, y + 95),
            (center - 57, y),
        ])
    elif mark == "\u0327":  # cedilla (below baseline)
        polygon(pen, [
            (center - 60, 5), (center + 70, 5),
            (center + 48, -75), (center + 112, -94),
            (center + 100, -212), (center - 94, -212),
            (center - 94, -120), (center + 15, -120),
            (center + 19, -83), (center - 74, -72),
        ])


def main() -> None:
    font = TTFont(SOURCE)
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    replacement_count = 0
    expected = "ÁÉÍÓÚáéíóúÑñÜüÀÈÌÒÙàèìòùÇç"
    updated = set()

    for code, dest_name in cmap.items():
        decomposition = unicodedata.normalize("NFD", chr(code))
        if len(decomposition) != 2:
            continue
        base_char, combining_mark = decomposition
        if combining_mark not in {"\u0300", "\u0301", "\u0302", "\u0303", "\u0308", "\u0327"}:
            continue
        base_name = cmap.get(ord(base_char))
        if base_name is None:
            continue
        target_glyph = font["glyf"][dest_name]
        if target_glyph.numberOfContours != 0:
            continue  # Never modify existing valid outlines.
        if dest_name in updated:
            continue

        base_glyph = font["glyf"][base_name]
        if base_glyph.numberOfContours <= 0:
            continue
        pen = TTGlyphPen(glyphs)
        glyphs[base_name].draw(pen)
        center = round((base_glyph.xMin + base_glyph.xMax) / 2)
        draw_mark(pen, combining_mark, center, base_glyph.yMax)
        font["glyf"][dest_name] = pen.glyph()
        font["hmtx"].metrics[dest_name] = font["hmtx"].metrics[base_name]
        updated.add(dest_name)
        replacement_count += 1

    missing = [c for c in expected if font["glyf"][cmap[ord(c)]].numberOfContours <= 0]
    if missing:
        raise RuntimeError(f"Accented characters still have empty outlines: {missing}")
    font.save(TARGET)
    reopened = TTFont(TARGET)
    assert all(reopened["glyf"][reopened.getBestCmap()[ord(c)]].numberOfContours > 0 for c in expected)
    print(f"Repaired {replacement_count} empty glyphs; output: {TARGET}")


if __name__ == "__main__":
    main()

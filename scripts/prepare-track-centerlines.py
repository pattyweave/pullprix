#!/usr/bin/env python3
"""Reproduce reviewed centerlines from the three supplied constant-width SVG ribbons.

Asset-specific preparation, NOT a general SVG-to-centerline converter. Remove
arrow detours, offset the outer edge by half the authored ribbon width, reconnect
Suzuka straight through its crossing, and orient/rotate using the source arrows.
Only Python's standard library is required. Originals are never modified.
"""
import hashlib
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path


def parse(d):
    t = re.findall(r"[a-df-zA-DF-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?", d)
    i = 0
    x = y = 0
    start = (0, 0)
    paths = []
    segs = []
    while i < len(t):
        if t[i].isalpha():
            cmd = t[i]
            i += 1
        c = cmd.upper()
        rel = cmd.islower()
        if c == "Z":
            segs.append(("L", [(x, y), start]))
            paths.append(segs)
            segs = []
            x, y = start
            continue
        n = {"M": 2, "L": 2, "C": 6, "H": 1, "V": 1}[c]
        v = list(map(float, t[i : i + n]))
        i += n
        if c == "H":
            v = [v[0] + (x if rel else 0), y]
        elif c == "V":
            v = [x, v[0] + (y if rel else 0)]
        elif rel:
            v = [a + ([x, y][j % 2]) for j, a in enumerate(v)]
        pts = list(zip(v[::2], v[1::2]))
        if c == "M":
            start = pts[-1]
            cmd = "l" if rel else "L"
        else:
            segs.append(("C" if c == "C" else "L", [(x, y)] + pts))
        x, y = pts[-1]
    return paths


def sample(segment):
    c, pts = segment
    length = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
    if length < 0.02:
        return []
    result = []
    for i in range(max(2, math.ceil(length / 0.3))):
        t = i / (max(2, math.ceil(length / 0.3)) - 1)
        if c == "L":
            x, y = [(1 - t) * a + t * b for a, b in zip(pts[0], pts[1])]
            dx, dy = [b - a for a, b in zip(pts[0], pts[1])]
        else:
            x, y = [
                (1 - t) ** 3 * a
                + 3 * (1 - t) ** 2 * t * b
                + 3 * (1 - t) * t * t * c
                + t**3 * d
                for a, b, c, d in zip(*pts)
            ]
            dx, dy = [
                3 * (1 - t) ** 2 * (b - a)
                + 6 * (1 - t) * t * (c - b)
                + 3 * t * t * (d - c)
                for a, b, c, d in zip(*pts)
            ]
        norm = math.hypot(dx, dy)
        if norm > 1e-8:
            result.append(((x, y), (-dy / norm, dx / norm)))
    return result


def simplify(points, tolerance=0.12):
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    den = dx * dx + dy * dy
    distances = []
    for p in points[1:-1]:
        t = (
            max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den))
            if den
            else 0
        )
        distances.append(math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy))
    maximum = max(distances)
    if maximum <= tolerance:
        return [a, b]
    index = distances.index(maximum) + 1
    return simplify(points[: index + 1], tolerance)[:-1] + simplify(
        points[index:], tolerance
    )


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "src/assets/tracks"
CONFIG = [
    # Arrow span indices refer to the unmodified source's first subpath.
    ("interlagos", "Interlagos", "INTERLAGOS", 30, 38, 5.18, (255, 420), False),
    ("spa-francorchamps", "Spa-Francorchamps", "SPA", 17, 25, 4.98, (255, 249), True),
    ("suzuka", "Suzuka", "SUZUKA", 2, 10, 4.94, (490, 222), True),
]
# Guard the asset-specific segment recipe against replaced input artwork.
SOURCE_SHA256 = {
    "interlagos": "6acc7c8b1515d52aa91cd82d47b3bb9ecc55c3694b5535bcaccfad31b70a0b85",
    "spa-francorchamps": "c6e2acd8c80b06d49b13438a23772b98fcd971cf995e32363692b251db034ef5",
    "suzuka": "7c7cd79079f11264c80138afcfc29ff9d4aa27be5dcbaa28f7c62aefa00d0ac5",
}
exports = []
for slug, name, symbol, arrow_begin, arrow_end, width, start, reverse in CONFIG:
    source_file = ASSETS / f"{slug}.svg"
    if hashlib.sha256(source_file.read_bytes()).hexdigest() != SOURCE_SHA256[slug]:
        raise ValueError(
            f"{slug}: source changed; inspect and revise the centerline recipe before regenerating."
        )
    source = ET.parse(source_file).getroot()[0].attrib["d"]
    original = parse(source)[0]
    # Determine the normal pointing into the enclosing boundary.
    raw = [p for seg in original for p, n in sample(seg)]
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(raw, raw[1:] + raw[:1]))
    sign = 1 if area > 0 else -1
    offsets = {}
    for index, seg in enumerate(original):
        if arrow_begin < index <= arrow_end:
            continue
        if index == arrow_begin:
            seg = ("L", [original[arrow_begin][1][0], original[arrow_end][1][-1]])
        offsets[index] = [
            (p[0] + sign * width * n[0], p[1] + sign * width * n[1])
            for p, n in sample(seg)
        ]
    if slug == "suzuka":
        # The filled outline turns at the intersection. Reverse the lower lobe
        # traversal so both visits cross straight through, retaining a figure eight.
        points = sum([offsets.get(i, []) for i in range(20)], [])
        points += list(reversed(sum([offsets.get(i, []) for i in range(20, 40)], [])))
        points += sum([offsets.get(i, []) for i in range(40, 63)], [])
    else:
        points = sum(offsets.values(), [])
    if reverse:
        points.reverse()
    at = min(range(len(points)), key=lambda i: math.dist(points[i], start))
    points = points[at:] + points[:at]
    # Preserve a short explicit seam after simplification. Remove tiny offset
    # loops at source command joins (rounding in the downloaded artwork).
    points = simplify(points)
    for i in range(len(points) - 4, -1, -1):
        a, b, c, d = points[i : i + 4]
        rx, ry = b[0] - a[0], b[1] - a[1]
        sx, sy = d[0] - c[0], d[1] - c[1]
        den = rx * sy - ry * sx
        if abs(den) < 1e-9:
            continue
        t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den
        u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den
        if 0 < t < 1 and 0 < u < 1 and math.dist(b, c) < 1:
            points[i + 1 : i + 3] = [(a[0] + t * rx, a[1] + t * ry)]
    path = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in points) + " Z"
    # Keep the same source coordinate frame as Jacarepaguá so the existing
    # dashboard zoom does not enlarge a tightly cropped import unexpectedly.
    x, y, w, h = map(int, ET.parse(source_file).getroot().attrib["viewBox"].split())
    viewbox = f"{x} {y} {w} {h}"
    (ASSETS / f"{slug}-centerline.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}"><title>{name} continuous centerline</title><path d="{path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>\n'
    )
    exports.append(
        f"export const {symbol}: Circuit = {{ id: '{slug}', name: '{name}', viewBox: [{x}, {y}, {w}, {h}], path: '{path}' }}"
    )
    # QA artwork: gray source ribbon, green derived line. Retains source viewBox.
    (ASSETS / f"{slug}-alignment.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="144 144 512 512"><title>{name} centerline alignment</title><path d="{source}" fill="#444"/><path d="{path}" fill="none" stroke="#66efad" stroke-width="1.5" stroke-linejoin="round"/></svg>\n'
    )
    print(name, len(points), "vertices", viewbox)
(ROOT / "src/features/track/prepared-circuits.ts").write_text(
    "// Generated by scripts/prepare-track-centerlines.py; edit the preparation recipe.\nimport type { Circuit } from './circuits'\n\n"
    + "\n\n".join(exports)
    + "\n"
)

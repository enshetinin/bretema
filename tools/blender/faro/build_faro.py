import argparse
import importlib.util
import math
import os
import sys
import zlib

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path[:0] = [os.path.join(ROOT, 'lib'), HERE]
import bretema_bpy as B
import materials as FM
from bretema_bpy import G


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


HMAT = _load('horreo_materials', os.path.join(ROOT, 'horreo', 'materials.py'))

argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--preview', action='store_true')
ap.add_argument('--tex', type=int, default=2048)
ARGS = ap.parse_args(argv)
SRC, OUT = os.path.join(ROOT, 'source'), os.path.join(ROOT, 'out')
TEX = os.path.join(SRC, 'textures', 'faro')

sc = B.reset_scene()
bpy.context.preferences.filepaths.save_version = 0
B.setup_cycles(16)
COL = B.collection('Faro')
M = dict(
    Ashlar=FM.ashlar(),
    Dressed=FM.ashlar('Dressed', dressed=True),
    Frame=FM.paint('FramePaint', 0xF2EFE6),
    Shutter=FM.paint('ShutterPaint', 0x2F6B55),
    Iron=FM.paint('IronPaint', 0x31443F, metal_under=True, rough=0.5),
    DoorWood=FM.paint('DoorWood', 0x5B3B26, rough=0.55),
    Copper=FM.copper(),
    Tile=HMAT.tile('FaroTileProc'),
    WindowGlass=FM.glass_window(),
    LanternGlass=FM.glass_lantern(),
    LensGlow=FM.lens(),
)
GROUP_OF = {
    'Ashlar': 'stone',
    'Dressed': 'stone',
    'Frame': 'paint',
    'Shutter': 'paint',
    'Iron': 'paint',
    'DoorWood': 'paint',
    'Copper': 'paint',
    'Tile': 'tile',
    'WindowGlass': 'windows',
    'LanternGlass': 'lantern',
    'LensGlow': 'lens',
}
GROUPS = {g: [] for g in set(GROUP_OF.values())}
OCT = math.pi / 8
_n = [0]


def nm(base):
    _n[0] += 1
    return f'{base}{_n[0]}'


def gm(x=0, y=0, z=0, ry=0, rx=0, rz=0):
    return (
        Matrix.Translation(G(x, y, z))
        @ Matrix.Rotation(ry, 4, 'Z')
        @ Matrix.Rotation(rx, 4, 'X')
        @ Matrix.Rotation(-rz, 4, 'Y')
    )


def put(ob, mat_key, Mx=None):
    if Mx is not None:
        ob.matrix_world = Mx @ ob.matrix_world
    if not ob.data.materials:
        ob.data.materials.append(M[mat_key])
    GROUPS[GROUP_OF[mat_key]].append(ob)
    return ob


def gbox(mat_key, w, h, d, Mx, bev=0.03, seg=2):
    ob = B.box(nm('b'), (w, d, h), (0, 0, 0), M[mat_key], COL)
    if bev:
        B.bevel(ob, bev, seg, 50)
    return put(ob, mat_key, Mx)


def gsweep(mat_key, pts, prof, up=(0, 0, 1), Mx=None, **kw):
    return put(B.sweep(nm('s'), [G(p) for p in pts], prof, up=G(up), coll=COL, mat=M[mat_key], **kw), mat_key, Mx)


def glathe(mat_key, prof, steps, Mx=None, phase=0.0):
    ob = B.lathe(nm('l'), prof, steps, coll=COL, mat=M[mat_key])
    ob.rotation_euler = (0, 0, phase)
    return put(ob, mat_key, Mx or Matrix())


def oct_lathe(mat_key, prof, Mx=None, steps=8):
    return glathe(mat_key, prof, steps, Mx, OCT)


def gpoly(mat_key, pts2, Mx, thick=0.0, bev=0.0):
    ob = B.mesh_obj(
        nm('p'), [G(x, y, 0) for x, y in pts2], [tuple(range(len(pts2)))], coll=COL, mat=M[mat_key], smooth=False
    )
    if ob.data.polygons[0].normal.dot(G(0, 0, 1)) < 0:
        ob.data.flip_normals()
    if thick:
        B.mod(ob, 'SOLIDIFY', thickness=thick, offset=0)
    if bev:
        B.bevel(ob, bev, 1, 50)
    return put(ob, mat_key, Mx)


def ring_path(r, y, n=32):
    return [(math.sin(2 * math.pi * i / n) * r, y, math.cos(2 * math.pi * i / n) * r) for i in range(n + 1)]


def arch_pts(w, h, top, o=0.0, n=12):
    pts = [(-w / 2 - o, -h / 2 - 0.02), (-w / 2 - o, top)]
    pts += [
        (math.cos(math.pi - i / n * math.pi) * (w / 2 + o), top + math.sin(math.pi - i / n * math.pi) * (w / 2 + o))
        for i in range(1, n)
    ]
    return pts + [(w / 2 + o, top), (w / 2 + o, -h / 2 - 0.02)]


def window(Mu, w, h, arch=False, shutters=False, bars=2):
    o = 0.09
    top = h / 2 - w / 2 if arch else h / 2
    path = (
        arch_pts(w, h, top, o)
        if arch
        else [(-w / 2 - o, -h / 2 - 0.02), (-w / 2 - o, top + o), (w / 2 + o, top + o), (w / 2 + o, -h / 2 - 0.02)]
    )
    gsweep(
        'Dressed',
        [(x, y, 0) for x, y in path],
        [(-0.11, 0), (0.11, 0), (0.11, 0.1), (0.06, 0.14), (-0.11, 0.14)],
        up=(0, 0, 1),
        Mx=Mu,
    )
    gbox('Dressed', w + 0.5, 0.12, 0.26, Mu @ gm(0, -h / 2 - 0.08, 0.1), 0.03)
    gl = arch_pts(w, h, top, 0)[:-1] if arch else [(-w / 2, -h / 2), (-w / 2, h / 2), (w / 2, h / 2), (w / 2, -h / 2)]
    gl = [(x, max(y, -h / 2)) for x, y in gl]
    gpoly('WindowGlass', gl, Mu @ gm(0, 0, 0.015))
    f = 0.055
    fz = 0.04
    hh = top + h / 2
    gbox('Frame', f, hh, f, Mu @ gm(0, (top - h / 2) / 2, fz), 0.008, 1)
    for i in range(1, bars + 1):
        gbox('Frame', w, f * 0.8, f, Mu @ gm(0, -h / 2 + i * hh / (bars + 1), fz), 0.008, 1)
    for sx in (-1, 1):
        gbox('Frame', f, hh, f, Mu @ gm(sx * (w / 2 - f / 2), (top - h / 2) / 2, fz), 0.008, 1)
    gbox('Frame', w, f, f, Mu @ gm(0, -h / 2 + f / 2, fz), 0.008, 1)
    if shutters:
        for sx in (-1, 1):
            sw = w / 2
            cx = sx * (w / 2 + o + 0.14 + sw / 2)
            cy = (top - h / 2) / 2
            gbox('Shutter', sw, hh, 0.04, Mu @ gm(cx, cy, 0.16), 0.012)
            for k in range(7):
                gbox(
                    'Shutter',
                    sw - 0.08,
                    0.035,
                    0.03,
                    Mu @ gm(cx, cy - hh / 2 + 0.15 + k * (hh - 0.3) / 6, 0.19, 0, -0.5),
                    0,
                )


def door(Mu, w, h):
    top = h - w / 2
    o = 0.12
    path = (
        [(-w / 2 - o, 0), (-w / 2 - o, top)]
        + [
            (
                math.cos(math.pi - i / 14 * math.pi) * (w / 2 + o),
                top + math.sin(math.pi - i / 14 * math.pi) * (w / 2 + o),
            )
            for i in range(1, 14)
        ]
        + [(w / 2 + o, top), (w / 2 + o, 0)]
    )
    gsweep(
        'Dressed',
        [(x, y, 0) for x, y in path],
        [(-0.14, 0), (0.14, 0), (0.14, 0.14), (0.08, 0.18), (-0.14, 0.18)],
        up=(0, 0, 1),
        Mx=Mu,
    )
    gbox('Dressed', 0.34, 0.3, 0.24, Mu @ gm(0, top + w / 2 + o + 0.05, 0.1), 0.03)
    leaf = (
        [(-w / 2, 0), (w / 2, 0), (w / 2, top)]
        + [(math.cos(i / 14 * math.pi) * w / 2, top + math.sin(i / 14 * math.pi) * w / 2) for i in range(1, 14)]
        + [(-w / 2, top)]
    )
    gpoly('DoorWood', leaf, Mu @ gm(0, 0, 0.02), thick=0.04)
    for sx in (-1, 1):
        for y in (0.35, 1.25):
            gbox('DoorWood', w / 2 - 0.22, 0.7, 0.05, Mu @ gm(sx * w / 4, y + 0.2, 0.06), 0.015)
    gbox('DoorWood', 0.06, top + w / 2, 0.05, Mu @ gm(0, (top + w / 2) / 2, 0.06), 0.012)
    glathe(
        'Iron',
        [(0, -0.04), (0.04, -0.03), (0.045, 0), (0.04, 0.03), (0, 0.04)],
        10,
        Mu @ gm(0.12, 1.1, 0.1) @ Matrix.Rotation(math.pi / 2, 4, 'X'),
    )
    gbox('Dressed', w + 0.6, 0.18, 0.5, Mu @ gm(0, -0.09, 0.25), 0.04)


H0, H1 = 0.7, 6.4
gbox('Ashlar', 14, 2.4, 11.5, gm(0, -0.5, -2.25), 0.08)
gbox('Dressed', 14.3, 0.18, 11.8, gm(0, 0.7, -2.25), 0.05)
for i in range(4):
    gbox('Dressed', 3, 0.2, 0.4, gm(1, 0.55 - i * 0.2, 3.7 + i * 0.4), 0.04)
for x0, z0, x1, z1 in ((-7, 3.5, -1.4, 3.5), (3.5, 3.5, 7, 3.5), (7, 3.5, 7, -8), (-7, 3.5, -7, -8)):
    ln = math.hypot(x1 - x0, z1 - z0)
    ry = math.atan2(x1 - x0, z1 - z0) + math.pi / 2
    gbox('Ashlar', ln, 0.8, 0.4, gm((x0 + x1) / 2, 1.1, (z0 + z1) / 2, ry), 0.03)
    gbox('Dressed', ln + 0.1, 0.14, 0.55, gm((x0 + x1) / 2, 1.57, (z0 + z1) / 2, ry), 0.04)


HX, Z0, Z1 = 5, -7.6, -0.4
gbox('Ashlar', HX * 2, H1 - H0, Z1 - Z0, gm(0, (H0 + H1) / 2, (Z0 + Z1) / 2), 0.02)


def ring(y, prof, key='Dressed'):
    e = 0.02
    pts = [(-HX - e, y, Z1 + e), (HX + e, y, Z1 + e), (HX + e, y, Z0 - e), (-HX - e, y, Z0 - e), (-HX - e, y, Z1 + e)]
    path = []
    for i in range(4):
        path += [pts[i], tuple((pts[i][k] + pts[i + 1][k]) / 2 for k in range(3))]
    path.append(pts[4])
    gsweep(key, path, prof, up=(0, 1, 0))


ring(H0 + 0.35, [(0, -0.35), (0.12, -0.35), (0.12, 0.3), (0.04, 0.35), (0, 0.35)])
ring(3.55, [(0, -0.08), (0.07, -0.08), (0.07, 0.08), (0, 0.08)])
ring(H1 - 0.1, [(0, -0.25), (0.06, -0.2), (0.1, -0.06), (0.24, 0.04), (0.3, 0.16), (0.3, 0.26), (0, 0.26)])
for x0, z0, x1, z1 in ((-HX, Z1, HX, Z1), (HX, Z1, HX, Z0), (HX, Z0, -HX, Z0), (-HX, Z0, -HX, Z1)):
    ln = math.hypot(x1 - x0, z1 - z0)
    ry = math.atan2(x1 - x0, z1 - z0) + math.pi / 2
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    gbox('Ashlar', ln, 0.75, 0.3, gm(cx, H1 + 0.5, cz, ry), 0.02)
    gbox('Dressed', ln + 0.3, 0.12, 0.46, gm(cx, H1 + 0.93, cz, ry), 0.03)
gbox('Dressed', HX * 2 - 0.4, 0.1, Z1 - Z0 - 0.4, gm(0, H1 + 0.16, (Z0 + Z1) / 2), 0.02)
for sx in (-1, 1):
    for zc in (Z0, Z1):
        sz = 1 if zc > (Z0 + Z1) / 2 else -1
        for k in range(9):
            lg = k % 2 == 0
            y = H0 + 0.3 + k * 0.6
            gbox(
                'Dressed',
                0.9 if lg else 0.55,
                0.56,
                0.08,
                gm(sx * (HX - (0.45 if lg else 0.275)), y, zc + sz * 0.045),
                0.02,
            )
            gbox(
                'Dressed',
                0.08,
                0.56,
                0.55 if lg else 0.9,
                gm(sx * (HX + 0.045), y, zc - sz * (0.275 if lg else 0.45)),
                0.02,
            )
gbox('Ashlar', 0.9, 1.4, 0.7, gm(-3, H1 + 0.9, -5.6), 0.04)
gbox('Dressed', 1.1, 0.14, 0.9, gm(-3, H1 + 1.65, -5.6), 0.03)
glathe('Tile', [(0, 0), (0.16, 0), (0.14, 0.35), (0, 0.35)], 12, gm(-3, H1 + 1.72, -5.6))
gsweep('Iron', [(HX + 0.12, H0, Z0 + 0.6), (HX + 0.12, H1, Z0 + 0.6)], B.circle(0.045, 8), up=(1, 0, 0))
for y in (2.2, 4.9):
    for x in (-3, 0, 3):
        window(gm(x, y, Z0, math.pi), 1, 1.5, shutters=True)
    for z in (-5.6, -2.4):
        window(gm(HX, y, z, math.pi / 2), 1, 1.5, shutters=True)
        window(gm(-HX, y, z, -math.pi / 2), 1, 1.5, shutters=True)
    for x in (-3.9, 3.9):
        window(gm(x, y, Z1), 0.9, 1.4)
door(gm(-HX, H0, -4, -math.pi / 2), 1.3, 2.6)


R0, R1, TY0, TY1 = 2.75, 2.3, H0, 13.7
TS = TY0 + 1.3


def rAt(y):
    return R0 + (R1 - R0) * (y - TS) / (TY1 - TS)


oct_lathe(
    'Ashlar',
    [(0, TY0), (R0 + 0.35, TY0), (R0 + 0.35, TY0 + 1.1), (R0 + 0.12, TY0 + 1.3), (R0, TY0 + 1.3), (R1, TY1), (0, TY1)],
)
for y in (H1 - 0.1, 10.2):
    r = rAt(y)
    oct_lathe(
        'Dressed',
        [(r - 0.05, y - 0.14), (r + 0.12, y - 0.14), (r + 0.16, y), (r + 0.12, y + 0.14), (r - 0.05, y + 0.14)],
    )
oct_lathe(
    'Dressed',
    [
        (R1 - 0.05, TY1 - 0.1),
        (R1 + 0.15, TY1 - 0.1),
        (R1 + 0.25, TY1 + 0.15),
        (R1 + 0.45, TY1 + 0.45),
        (R1 + 0.9, TY1 + 0.7),
        (R1 + 0.9, TY1 + 0.95),
        (0, TY1 + 0.95),
    ],
)
corbel = (
    [(0, 0), (0.6, 0)]
    + [
        (
            (1 - t) ** 2 * 0.6 + 2 * (1 - t) * t * 0.6 + t * t * 0.1,
            (1 - t) ** 2 * 0 + 2 * (1 - t) * t * -0.45 + t * t * -0.6,
        )
        for t in (i / 6 for i in range(1, 7))
    ]
    + [(0, -0.6)]
)
for i in range(16):
    a = i / 16 * 2 * math.pi + OCT / 2
    r = R1 + 0.25
    gpoly(
        'Dressed',
        corbel,
        gm(math.sin(a) * (r - 0.25), TY1 + 0.7, math.cos(a) * (r - 0.25), a - math.pi / 2),
        thick=0.22,
        bev=0.015,
    )
face = lambda y: rAt(y) * math.cos(OCT)
tilt = math.atan((R0 - R1) * math.cos(OCT) / (TY1 - TS))
for y in (4.8, 8.2, 11.6):
    window(gm(0, y, face(y), 0, -tilt), 0.75, 1.25, arch=True)
for s in (-1, 1):
    window(gm(s * face(9.4), 9.4, 0, s * math.pi / 2), 0.6, 1, arch=True, bars=1)

GY, GR = TY1 + 0.95, R1 + 0.9
for i in range(16):
    a = i / 16 * 2 * math.pi
    r = GR - 0.12
    glathe(
        'Iron',
        [(0, 0), (0.045, 0), (0.035, 0.06), (0.035, 1.0), (0.05, 1.05), (0, 1.05)],
        8,
        gm(math.sin(a) * r, GY, math.cos(a) * r),
    )
for y, rr in ((GY + 0.35, 0.016), (GY + 0.7, 0.016), (GY + 1.05, 0.03)):
    gsweep('Iron', ring_path(GR - 0.12, y, 48), B.circle(rr, 6), up=(0, 1, 0))
for i in range(48):
    a = i / 48 * 2 * math.pi
    r = GR - 0.12
    gsweep(
        'Iron',
        [(math.sin(a) * r, GY + 0.02, math.cos(a) * r), (math.sin(a) * r, GY + 0.7, math.cos(a) * r)],
        B.circle(0.012, 5),
        up=(1, 0, 0),
    )

LR, LY0 = 1.6, GY + 0.05
LY1, LY2 = LY0 + 0.75, 17.75
LG0 = LY1 + 0.14
glathe(
    'Iron',
    [(0, LY0), (LR + 0.1, LY0), (LR + 0.1, LY1), (LR + 0.18, LY1 + 0.06), (LR + 0.18, LY1 + 0.14), (0, LY1 + 0.14)],
    16,
    phase=OCT / 2,
)
glathe('LanternGlass', [(LR - 0.02, LG0), (LR - 0.02, LY2)], 16, phase=OCT / 2)
for i in range(16):
    a = i / 16 * 2 * math.pi
    gbox('Iron', 0.06, LY2 - LG0, 0.06, gm(math.sin(a) * LR, (LY2 + LG0) / 2, math.cos(a) * LR, a), 0.01, 1)
for i in range(16):
    a0 = i / 16 * 2 * math.pi
    gsweep(
        'Iron',
        [
            (math.sin(a0 + OCT * k / 6) * LR, LG0 + (LY2 - LG0) * k / 6, math.cos(a0 + OCT * k / 6) * LR)
            for k in range(7)
        ],
        B.circle(0.018, 5),
        up=(0, 1, 0),
    )
gsweep('Iron', ring_path(LR, (LY2 + LG0) / 2, 48), B.circle(0.035, 6), up=(0, 1, 0))
lens = [(0, 15.9)]
for k in range(29):
    y = 16.6 - 0.7 + k * 0.05
    d = abs(y - 16.6)
    lens.append((0.55 - d * 0.25 + (0.05 if k % 2 else 0), y))
glathe('LensGlow', lens + [(0, 17.3)], 24)
glathe('Iron', [(0, 15.5), (0.5, 15.5), (0.35, 16.0), (0, 16.0)], 12)
glathe(
    'Copper',
    [
        (0, LY2),
        (LR + 0.22, LY2),
        (LR + 0.22, LY2 + 0.14),
        (LR + 0.05, LY2 + 0.2),
        (1.5, LY2 + 0.45),
        (1.2, LY2 + 0.8),
        (0.75, LY2 + 1.05),
        (0.3, LY2 + 1.2),
        (0.18, LY2 + 1.24),
        (0, LY2 + 1.25),
    ],
    32,
)
glathe(
    'Copper',
    [(0, 0)] + [(0.26 * math.sin(math.pi * k / 10), 0.26 - 0.26 * math.cos(math.pi * k / 10)) for k in range(1, 11)],
    16,
    gm(0, LY2 + 1.19, 0),
)
glathe('Iron', [(0, 0), (0.035, 0), (0.025, 1.6), (0, 1.6)], 6, gm(0, LY2 + 1.5, 0))
gbox('Iron', 0.9, 0.024, 0.1, gm(0, LY2 + 2.75, 0, 0.6), 0)
glathe(
    'Iron',
    [(0, 0), (0.08, 0), (0, 0.2)],
    4,
    gm(0.5 * math.cos(0.6), LY2 + 2.75, -0.5 * math.sin(0.6), 0.6, 0, -math.pi / 2),
)


ax0, ax1, az0, az1 = -6.6, -2.6, -7.4, -12.2
ax, az, aw, ad, AH = (ax0 + ax1) / 2, (az0 + az1) / 2, ax1 - ax0, az0 - az1, 3.3
gbox('Ashlar', aw, AH + 1.8, ad, gm(ax, H0 + AH / 2 - 1.5, az), 0.02)
for sx in (-1, 1):
    window(gm(ax + sx * aw / 2, H0 + 1.3, az, sx * math.pi / 2), 0.8, 1.1, shutters=True)
door(gm(ax, H0 - 0.6, az1, math.pi), 1.1, 2.3)
eave, rh = 0.35, 1.3
ry0 = H0 + AH - 0.6
hw, hd = aw / 2 + eave, ad / 2 + eave
ridge = hd - hw
gbox('Dressed', aw + 0.25, 0.18, ad + 0.25, gm(ax, ry0 - 0.05, az), 0.04)
Pg = lambda x, y, z: G(ax + x, y, az + z)
bed_v = [
    Pg(-hw, ry0, hd),
    Pg(hw, ry0, hd),
    Pg(hw, ry0, -hd),
    Pg(-hw, ry0, -hd),
    Pg(0, ry0 + rh, ridge),
    Pg(0, ry0 + rh, -ridge),
]
bed = B.mesh_obj(
    nm('roofbed'),
    bed_v,
    [(0, 1, 4), (1, 2, 5, 4), (2, 3, 5), (3, 0, 4, 5), (0, 3, 2, 1)],
    coll=COL,
    mat=M['Dressed'],
    smooth=False,
)
B._fix_normals(bed)
put(bed, 'Dressed')
SL = math.hypot(hw, rh)
EXP, TL = 0.3, 0.44


def gdir(x, y, z):
    return G(x, y, z).normalized()


for side in (-1, 1):
    a = Pg(side * hw, ry0, 0)
    ud = gdir(0, 0, 1)
    sd = gdir(-side * hw, rh, 0)
    nrm = gdir(side * rh, hw, 0)
    for c in range(int(SL / EXP)):
        s0 = min(c * EXP, SL - TL)
        f = (s0 + TL * 0.6) / SL
        half = hd - f * hw
        put(
            B.tile_course(nm('tile'), a, ud, sd, nrm, -half, half, s0, TL, 0.05, per_period=4, coll=COL, mat=M['Tile']),
            'Tile',
        )
    a = Pg(0, ry0, side * hd)
    ud = gdir(1, 0, 0)
    sd = gdir(0, rh, -side * hw)
    nrm = gdir(0, hw, side * rh)
    for c in range(int(SL / EXP)):
        s0 = min(c * EXP, SL - TL)
        f = (s0 + TL * 0.6) / SL
        half = hw * (1 - f)
        if half > 0.12:
            put(
                B.tile_course(
                    nm('tile'), a, ud, sd, nrm, -half, half, s0, TL, 0.05, per_period=4, coll=COL, mat=M['Tile']
                ),
                'Tile',
            )
cap = [(math.cos(math.pi * i / 6) * 0.13, math.sin(math.pi * i / 6) * 0.11) for i in range(7)]
r0, r1 = (ax, ry0 + rh + 0.07, az - ridge), (ax, ry0 + rh + 0.07, az + ridge)
gsweep('Tile', [r0, r1], cap, up=(0, 1, 0), closed=False, caps=False)
for cx, cz in ((hw, hd), (-hw, hd), (hw, -hd), (-hw, -hd)):
    end = r1 if cz > 0 else r0
    gsweep('Tile', [(ax + cx, ry0 + 0.07, az + cz), end], cap, up=(0, 1, 0), closed=False, caps=False)


def finalize():
    objs = [o for g in GROUPS.values() for o in g]
    groups = {k: [o.name for o in v] for k, v in GROUPS.items()}
    B.to_mesh(objs)
    for n in groups['paint']:
        ob = bpy.data.objects[n]
        if ob.data.uv_layers:
            ob.data.uv_layers[0].name = 'metric'
    root = B.empty('Faro', coll=COL)
    final = {}
    for k, name in (
        ('stone', 'FaroStone'),
        ('paint', 'FaroPaint'),
        ('tile', 'FaroTile'),
        ('windows', 'FaroWindows'),
        ('lantern', 'FaroLanternGlass'),
        ('lens', 'FaroLens'),
    ):
        o = B.join([bpy.data.objects[n] for n in groups[k]], name)
        o.parent = root
        B.mod(o, 'WEIGHTED_NORMAL', keep_sharp=True)
        B.to_mesh([o])
        final[k] = o
    return root, final


def make_lod1(final, ratio=0.18):
    lod = B.empty('Faro_LOD1', coll=COL)
    for k, o in final.items():
        c = o.copy()
        c.data = o.data.copy()
        c.name = c.data.name = o.name + '_LOD1'
        COL.objects.link(c)
        c.parent = lod
        if k in ('stone', 'paint', 'tile'):
            d = c.modifiers.new('Decimate', 'DECIMATE')
            d.ratio = ratio
            d.use_collapse_triangulate = True
            B.to_mesh([c])
    return lod


if __name__ == '__main__':
    os.makedirs(SRC, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TEX, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'faro_source.blend'), compress=True)
    root, final = finalize()
    tris = {k: sum(len(p.vertices) - 2 for p in o.data.polygons) for k, o in final.items()}
    print('FARO triangles:', sum(tris.values()), tris)
    if ARGS.preview:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'faro_preview.blend'), compress=True)
        sys.exit(0)
    T = ARGS.tex
    for key, objs, size in (
        ('FaroStone', [final['stone']], T),
        ('FaroPaint', [final['paint']], T // 2),
        ('FaroTile', [final['tile']], T // 4),
    ):
        print('baking', key)
        B.bake_group(key, objs, size, TEX, ao_dist=0.5)
    for o in final.values():
        for uv in [u for u in o.data.uv_layers if u.name != 'UVMap']:
            o.data.uv_layers.remove(uv)
        for a in [a for a in o.data.attributes if a.name in ('keepuv',)]:
            o.data.attributes.remove(a)
    lod = make_lod1(final)
    print('FARO_LOD1 triangles:', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in lod.children))
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'faro_baked.blend'), compress=True)
    B.export_glb(os.path.join(OUT, 'faro_raw.glb'), [root, lod])
    print('DONE', os.path.join(OUT, 'faro_raw.glb'))

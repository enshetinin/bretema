import argparse
import math
import os
import random
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path[:0] = [os.path.join(ROOT, 'lib'), HERE]
import bretema_bpy as B
import materials as HM

argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--preview', action='store_true')
ap.add_argument('--tex', type=int, default=1024)
ARGS = ap.parse_args(argv)
SRC, OUT = os.path.join(ROOT, 'source'), os.path.join(ROOT, 'out')
TEX = os.path.join(SRC, 'textures', 'horreo')

sc = B.reset_scene()
bpy.context.preferences.filepaths.save_version = 0
B.setup_cycles(16)
COL = B.collection('Horreo')
rnd = random.Random(1013)
M = dict(Granite=HM.granite(), Tile=HM.tile(), Door=HM.door(), Maize=HM.maize(), Mortar=HM.mortar())
import importlib.util

_spec = importlib.util.spec_from_file_location('dorna_materials', os.path.join(ROOT, 'dorna', 'materials.py'))
DM = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(DM)
M['Iron'] = DM.iron()
GROUPS = {'granite': [], 'roof': [], 'detail': []}


def lerp_(a, b, t):
    return a + (b - a) * t


def add(group, ob, tone=None):
    if tone is None:
        tone = rnd.random()
    ob['tone'] = tone
    GROUPS[group].append(ob)
    return ob


def stone(name, size, loc, bev=0.02, taper=1.0, rot=None, jitter=0.0):
    if jitter:
        size = tuple(s * (1 + rnd.uniform(-jitter, jitter)) for s in size)
        rot = tuple((r or 0) + rnd.uniform(-jitter, jitter) * 0.15 for r in (rot or (0, 0, 0)))
    ob = B.box(name, size, loc, M['Granite'], COL, taper, rot)
    B.bevel(ob, bev, 2, 50)
    B.mod(ob, 'WEIGHTED_NORMAL', keep_sharp=True)
    return add('granite', ob)


L, W = 5.6, 1.9
PIER_TOP, SOLL_TOP = 1.5, 1.86
for i, x in enumerate((-2.1, 0.0, 2.1)):
    for j, y in enumerate((-0.7, 0.7)):
        stone(f'Pegollo{i}{j}', (0.5, 0.5, 2.0), (x, y, PIER_TOP - 1.0), 0.035, taper=0.74, jitter=0.04)
        torn = B.lathe(
            f'Tornarratos{i}{j}',
            [(0, 0), (0.5, 0), (0.57, 0.04), (0.58, 0.09), (0.53, 0.14), (0, 0.14)],
            18,
            axis_loc=(x, y, PIER_TOP),
            coll=COL,
            mat=M['Granite'],
        )
        torn.rotation_euler = (rnd.uniform(-0.02, 0.02), rnd.uniform(-0.02, 0.02), rnd.uniform(0, 1))
        add('granite', torn)
for k in range(3):
    stone(f'Solleira{k}', (L / 3 - 0.015, W + 0.1, 0.22), (-L / 3 + k * L / 3, 0, SOLL_TOP - 0.11), 0.025, jitter=0.01)


TOP = 3.66
H = TOP - SOLL_TOP
for sx in (-1, 1):
    xw = sx * (L / 2 - 0.15)
    y0 = SOLL_TOP
    row = 0
    TOPM = TOP + 0.22
    while y0 < TOPM - 0.05:
        h = min(rnd.uniform(0.32, 0.42), TOPM - y0)
        yy = -W / 2
        off = 0.28 * (row % 2)
        cuts = [-W / 2] + [c for c in (-W / 2 + 0.5 + off, -W / 2 + 1.2 + off) if c < W / 2 - 0.2] + [W / 2]
        for a, b in zip(cuts, cuts[1:]):
            stone(
                f'Penal{sx}_{row}_{a:.2f}',
                (0.3, b - a - 0.012, h - 0.012),
                (xw, (a + b) / 2, y0 + h / 2),
                0.03,
                jitter=0.02,
            )
        y0 += h
        row += 1
    tri = B.mesh_obj(
        f'Pinon{sx}',
        [Vector((0, -W / 2 - 0.05, 0)), Vector((0, W / 2 + 0.05, 0)), Vector((0, 0, 1.2))],
        [(0, 1, 2)],
        coll=COL,
        mat=M['Granite'],
        smooth=False,
    )
    tri.location = (xw, 0, TOP + 0.2)
    B.mod(tri, 'SOLIDIFY', thickness=0.3, offset=0)
    B.bevel(tri, 0.03, 2, 50)
    add('granite', tri)
SLAT_W, GAP = 0.15, 0.05
for sy in (-1, 1):
    yw = sy * (W / 2 - 0.04)
    x = -L / 2 + 0.32
    while x < L / 2 - 0.32:
        door_zone = sy < 0 and -0.45 < x < 0.45
        pillar = abs(x) < 0.1
        if pillar:
            stone(f'Columna{sy}', (0.28, 0.16, H), (0, yw, SOLL_TOP + H / 2), 0.025)
        elif not door_zone:
            stone(f'Lousa{sy}_{x:.2f}', (SLAT_W, 0.07, H - 0.02), (x, yw, SOLL_TOP + H / 2), 0.012, jitter=0.03)
        x += SLAT_W + GAP
    stone(f'Trabe{sy}', (L - 0.1, 0.26, 0.22), (0, sy * (W / 2 - 0.02), TOP + 0.11), 0.03)
for k in range(4):
    d = B.box(f'DoorPlank{k}', (0.215, 0.045, 1.35), (-0.33 + k * 0.22, -W / 2 - 0.02, SOLL_TOP + 0.78), M['Door'], COL)
    B.bevel(d, 0.006, 2, 50)
    add('detail', d)
for zz in (0.35, 1.2):
    d = B.box(f'DoorLedge{zz}', (0.86, 0.035, 0.1), (0, -W / 2 - 0.055, SOLL_TOP + zz), M['Door'], COL)
    B.bevel(d, 0.006, 1, 50)
    add('detail', d)
    h = B.box(f'Hinge{zz}', (0.5, 0.012, 0.04), (-0.2, -W / 2 - 0.078, SOLL_TOP + zz), M['Iron'], COL)
    add('detail', h)
add('detail', B.box('Lock', (0.09, 0.015, 0.14), (0.33, -W / 2 - 0.05, SOLL_TOP + 0.8), M['Iron'], COL))
add('detail', B.box('Maize', (L - 0.7, W - 0.3, H - 0.25), (0, 0, SOLL_TOP + (H - 0.25) / 2), M['Maize'], COL))


EAVE_Y, EAVE_Z, RIDGE_Z, RL = W / 2 + 0.38, TOP + 0.26, TOP + 1.22, L + 0.5
for sy in (-1, 1):
    prof = [(0, 0), (0.16, 0), (0.2, 0.03), (0.2, 0.07), (0.15, 0.1), (0.12, 0.14), (0, 0.14)]
    path = [Vector((x, sy * (W / 2 + 0.02), TOP + 0.22)) for x in (-L / 2 - 0.05, L / 2 + 0.05)]
    cor = B.sweep(f'Beiril{sy}', path, [(p[0] * sy, p[1]) for p in prof], up=(0, 0, 1), coll=COL, mat=M['Granite'])
    add('granite', cor)
    a = Vector((0, sy * EAVE_Y, EAVE_Z))
    b = Vector((0, 0, RIDGE_Z))
    slope = b - a
    slen = slope.length
    sd = slope.normalized()
    nrm = Vector((0, sy * sd.z, -sy * sd.y)) if sy > 0 else Vector((0, sy * sd.z, -sy * sd.y))
    if nrm.z < 0:
        nrm = -nrm
    bed = B.mesh_obj(
        f'RoofBed{sy}',
        [
            Vector((-RL / 2, 0, 0)) + a,
            Vector((RL / 2, 0, 0)) + a,
            Vector((RL / 2, 0, 0)) + b,
            Vector((-RL / 2, 0, 0)) + b,
        ],
        [(0, 1, 2, 3)],
        coll=COL,
        mat=M['Granite'],
        smooth=False,
    )
    if bed.data.polygons[0].normal.dot(nrm) < 0:
        bed.data.flip_normals()
    B.mod(bed, 'SOLIDIFY', thickness=0.08, offset=-1)
    add('granite', bed)
    TL, EXP, PER = 0.44, 0.3, 0.36
    courses = int(math.ceil((slen - 0.05) / EXP))
    NX = int(RL / PER * 5)
    for c in range(courses):
        s0 = min(c * EXP, slen - TL)
        lift = 0.045 + 0.012 * c / courses
        verts, faces, uvs = [], [], []
        rows = 3
        for i in range(NX + 1):
            x = -RL / 2 + RL * i / NX
            ph = 2 * math.pi * (x + 0.09) / PER
            wav = 0.045 * math.sin(ph) + 0.012 * math.sin(3 * ph)
            for j in range(rows):
                s = s0 + TL * (1 - j / (rows - 1))
                jit = 0.006 * math.sin(x * 23.1 + c * 4.7)
                p = a + sd * s + nrm * (lift + wav + jit + (0.018 if j == 0 else 0) - 0.01 * j)
                p.x = x
                verts.append(p)
                uvs.append((x, s))
            p = verts[-rows] - nrm * 0.022
            verts.append(p)
            uvs.append((x, s0 - 0.02))
        rr = rows + 1
        for i in range(NX):
            for j in range(rows - 1):
                q = i * rr + j
                faces.append((q, q + rr, q + rr + 1, q + 1))
            q = i * rr
            faces.append((q + rows, q + rows + rr, q + rr, q))
        tob = B.mesh_obj(f'Tiles{sy}_{c}', verts, faces, uvs, coll=COL, mat=M['Tile'])
        B._fix_normals(tob)
        if sum(p.normal.z for p in tob.data.polygons) < 0:
            tob.data.flip_normals()
        add('roof', tob)
ridge = B.sweep(
    'RidgeMortar',
    [Vector((-RL / 2, 0, RIDGE_Z + 0.06)), Vector((RL / 2, 0, RIDGE_Z + 0.06))],
    [(-0.14, -0.06), (0.14, -0.06), (0.1, 0.03), (-0.1, 0.03)],
    up=(0, 0, 1),
    coll=COL,
    mat=M['Mortar'],
)
add('roof', ridge)
n_r = int(RL / 0.38)
for k in range(n_r):
    x0 = -RL / 2 + k * RL / n_r
    half = [(0.13 * math.cos(a), 0.13 * math.sin(a) + 0.02) for a in (math.pi * i / 6 for i in range(7))]
    rt = B.sweep(
        f'Ridge{k}',
        [Vector((x0, 0, RIDGE_Z + 0.09)), Vector((x0 + RL / n_r + 0.04, 0, RIDGE_Z + 0.09))],
        half,
        up=(0, 0, 1),
        closed=False,
        caps=False,
        scale=lambda u: lerp_(1.08, 0.92, u),
        coll=COL,
        mat=M['Tile'],
    )
    B.mod(rt, 'SOLIDIFY', thickness=0.02, offset=1)
    add('roof', rt)


xe = L / 2 - 0.15
apex = TOP + 0.2 + 1.2
stone('CrossBase', (0.34, 0.34, 0.18), (xe, 0, apex + 0.05), 0.03)
stone('CrossShaft', (0.12, 0.12, 0.78), (xe, 0, apex + 0.5), 0.02)
stone('CrossArm', (0.12, 0.44, 0.12), (xe, 0, apex + 0.66), 0.02)
pin = B.lathe(
    'Pinaculo',
    [(0, 0), (0.2, 0), (0.2, 0.12), (0.13, 0.16), (0.09, 0.7), (0.05, 0.74), (0, 0.74)],
    4,
    axis_loc=(-xe, 0, apex - 0.02),
    coll=COL,
    mat=M['Granite'],
)
pin.rotation_euler = (0, 0, math.pi / 4)
add('granite', pin)
add(
    'granite',
    B.lathe(
        'PinBall',
        [(0, 0)] + [(0.08 * math.sin(math.pi * k / 8), 0.08 - 0.08 * math.cos(math.pi * k / 8)) for k in range(1, 9)],
        10,
        axis_loc=(-xe, 0, apex + 0.72),
        coll=COL,
        mat=M['Granite'],
    ),
)


def finalize():
    objs = [o for g in GROUPS.values() for o in g]
    tones = {o.name: o['tone'] for o in objs}
    groups = {k: [o.name for o in v] for k, v in GROUPS.items()}
    B.to_mesh(objs)
    for n, t in tones.items():
        ob = bpy.data.objects[n]
        if ob.data.uv_layers:
            ob.data.uv_layers[0].name = 'metric'
        B.set_float_attr(ob, 'tone', t)
    root = B.empty('Horreo', coll=COL)
    final = {}
    for k, name in (('granite', 'HorreoGranite'), ('roof', 'HorreoRoof'), ('detail', 'HorreoDetail')):
        o = B.join([bpy.data.objects[n] for n in groups[k]], name)
        o.parent = root
        B.mod(o, 'WEIGHTED_NORMAL', keep_sharp=True)
        B.to_mesh([o])
        final[k] = o
    return root, final


if __name__ == '__main__':
    os.makedirs(SRC, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TEX, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'horreo_source.blend'), compress=True)
    root, final = finalize()
    tris = {k: sum(len(p.vertices) - 2 for p in o.data.polygons) for k, o in final.items()}
    print('HORREO triangles:', sum(tris.values()), tris)
    if ARGS.preview:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'horreo_preview.blend'), compress=True)
        sys.exit(0)
    T = ARGS.tex
    for key, objs, size in (
        ('HorreoGranite', [final['granite']], T),
        ('HorreoRoof', [final['roof']], T),
        ('HorreoDetail', [final['detail']], T // 2),
    ):
        print('baking', key)
        B.bake_group(key, objs, size, TEX, ao_dist=0.4)
    for o in final.values():
        for uv in [u for u in o.data.uv_layers if u.name != 'UVMap']:
            o.data.uv_layers.remove(uv)
        for a in [a for a in o.data.attributes if a.name in ('tone', 'keepuv')]:
            o.data.attributes.remove(a)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'horreo_baked.blend'), compress=True)
    B.export_glb(os.path.join(OUT, 'horreo_raw.glb'), [root])
    print('DONE', os.path.join(OUT, 'horreo_raw.glb'))

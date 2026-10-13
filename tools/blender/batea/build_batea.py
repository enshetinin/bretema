import argparse
import importlib.util
import math
import os
import random
import sys
import zlib

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path[:0] = [os.path.join(ROOT, 'lib'), HERE]
import bretema_bpy as B
import materials as BM


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DM = _load('dorna_materials', os.path.join(ROOT, 'dorna', 'materials.py'))

argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--preview', action='store_true')
ap.add_argument('--tex', type=int, default=1024)
ARGS = ap.parse_args(argv)
SRC, OUT = os.path.join(ROOT, 'source'), os.path.join(ROOT, 'out')
TEX = os.path.join(SRC, 'textures', 'batea')

sc = B.reset_scene()
bpy.context.preferences.filepaths.save_version = 0
B.setup_cycles(16)
COL = B.collection('Batea')
rnd = random.Random(626)
M = dict(
    Log=BM.log(),
    FloatPaint=BM.float_paint(),
    Mussel=BM.mussel(),
    Planks=BM.planks(),
    HutPlanks=BM.planks('HutPlanks', 0xD9D2BF),
    Corrugated=BM.corrugated(),
    Marker=BM.marker(),
    Rope=DM.rope('Rope'),
    Glass=DM.glass('MarkerGlass'),
)
GROUPS = {'timber': [], 'metal': [], 'mussel': [], 'glass': []}


def add(g, ob):
    GROUPS[g].append(ob)
    return ob


def logpiece(name, a, b, r, seed):
    rr = random.Random(seed)
    n = 8
    d = b - a
    side = d.cross(Vector((0, 0, 1))).normalized() if abs(d.normalized().z) < 0.9 else Vector((1, 0, 0))
    bow = rr.uniform(-0.06, 0.06)
    pts = [a.lerp(b, i / n) + side * bow * math.sin(math.pi * i / n) for i in range(n + 1)]
    lumps = [1 + rr.uniform(-0.08, 0.08) for _ in range(n + 1)]
    return add(
        'timber',
        B.sweep(
            name,
            pts,
            B.circle(r, 10, rr.uniform(0, 1)),
            up=(0, 0, 1) if abs(d.normalized().z) < 0.9 else (1, 0, 0),
            scale=lambda u: lumps[min(n, int(u * n))] * (1 - 0.15 * u),
            coll=COL,
            mat=M['Log'],
        ),
    )


S = 4.7
FL, FR = 4.0, 0.55
prof = [(0, -FL / 2 - 0.25)] + [
    (FR * math.sin(math.pi / 2 * k / 4), -FL / 2 - 0.25 * math.cos(math.pi / 2 * k / 4)) for k in range(1, 5)
]
prof += [(FR, FL / 2)] + [
    (FR * math.cos(math.pi / 2 * k / 4), FL / 2 + 0.25 * math.sin(math.pi / 2 * k / 4)) for k in range(1, 5)
]
for i, x in enumerate((-2.2, 2.2)):
    for j, y in enumerate((-2.6, 2.6)):
        f = B.lathe(f'Float{i}{j}', prof, 16, axis_loc=(x, y, 0.05), coll=COL, mat=M['FloatPaint'])
        f.rotation_euler = (0, math.pi / 2, 0)
        add('metal', f)
        for xx in (x - 1.2, x + 1.2):
            add(
                'metal',
                B.sweep(
                    f'Strap{i}{j}{xx:.1f}',
                    [
                        Vector((xx, y + (FR + 0.02) * math.cos(a), 0.05 + (FR + 0.02) * math.sin(a)))
                        for a in (math.pi * k / 10 for k in range(11))
                    ],
                    B.rrect(0.06, 0.01, 0.004, 1),
                    up=(1, 0, 0),
                    coll=COL,
                    mat=M['FloatPaint'],
                ),
            )
GZ = 0.05 + FR + 0.17
for j, y in enumerate((-2.6, 2.6)):
    logpiece(f'Girder{j}', Vector((-S, y, GZ)), Vector((S, y, GZ)), 0.17, 10 + j)
CZ = GZ + 0.17 + 0.1
XS = [-S + 0.3 + k * (2 * S - 0.6) / 10 for k in range(11)]
for k, x in enumerate(XS):
    logpiece(f'Beam{k}', Vector((x, -S, CZ)), Vector((x, S, CZ)), 0.1, 30 + k)
for j, y in enumerate((-4.3, 0.0, 4.3)):
    logpiece(f'Stringer{j}', Vector((-S, y, CZ + 0.17)), Vector((S, y, CZ + 0.17)), 0.07, 60 + j)

for k, x in enumerate(XS):
    for m, y in enumerate([-3.9 + q * 0.97 for q in range(9)]):
        if (k + m) % 2 or (x > 1.4 and y < -1.4):
            continue
        rr = random.Random(k * 31 + m)
        top = Vector((x + rr.uniform(-0.05, 0.05), y, CZ - 0.08))
        pts = [top + Vector((rr.uniform(-0.04, 0.04) * i, rr.uniform(-0.04, 0.04) * i, -0.32 * i)) for i in range(7)]
        lumps = [1 + rr.uniform(-0.35, 0.35) for _ in range(7)]
        add(
            'mussel',
            B.sweep(
                f'Rope{k}_{m}',
                pts,
                B.circle(0.1, 7, rr.uniform(0, 1)),
                up=(1, 0, 0),
                scale=lambda u, l=lumps: 0.18 if u < 0.12 else l[min(6, int(u * 6))],
                coll=COL,
                mat=M['Mussel'],
            ),
        )

DX, DY = (1.5, 4.7), (-4.7, -1.5)
DZ = CZ + 0.17 + 0.07 + 0.02
for q in range(int((DX[1] - DX[0]) / 0.2)):
    x = DX[0] + 0.1 + q * 0.2
    p = B.box(f'Deck{q}', (0.185, DY[1] - DY[0], 0.04), (x, (DY[0] + DY[1]) / 2, DZ), M['Planks'], COL)
    p.rotation_euler = (0, 0, rnd.uniform(-0.006, 0.006))
    B.bevel(p, 0.006, 1, 50)
    add('timber', p)
HX, HY, HW, HD, HH = 3.0, -3.0, 2.0, 1.6, 1.6
for side in range(4):
    n = 9 if side % 2 == 0 else 7
    for q in range(n):
        f = (q + 0.5) / n - 0.5
        if side == 0:
            loc, size = (HX + f * HW, HY + HD / 2, DZ + HH / 2), (HW / n - 0.008, 0.03, HH)
        elif side == 2:
            loc, size = (HX + f * HW, HY - HD / 2, DZ + HH / 2), (HW / n - 0.008, 0.03, HH)
        elif side == 1:
            loc, size = (HX + HW / 2, HY + f * HD, DZ + HH / 2), (0.03, HD / n - 0.008, HH)
        else:
            loc, size = (HX - HW / 2, HY + f * HD, DZ + HH / 2), (0.03, HD / n - 0.008, HH)
        if side == 2 and abs(f) < 0.15:
            continue
        b = B.box(f'Hut{side}_{q}', size, loc, M['HutPlanks'], COL)
        B.bevel(b, 0.005, 1, 50)
        add('timber', b)
add(
    'timber',
    B.box('HutDoor', (0.44, 0.04, 1.35), (HX + 0.12, HY - HD / 2 - 0.05, DZ + 0.7), M['Planks'], COL, rot=(0, 0, -0.5)),
)
for e in (
    (HX - HW / 2, HY - HD / 2),
    (HX + HW / 2, HY - HD / 2),
    (HX - HW / 2, HY + HD / 2),
    (HX + HW / 2, HY + HD / 2),
):
    add('timber', B.box(f'HutPost{e}', (0.07, 0.07, HH + 0.05), (e[0], e[1], DZ + HH / 2), M['Planks'], COL))
NXR = 48
verts, faces = [], []
for i in range(NXR + 1):
    x = HX - HW / 2 - 0.2 + (HW + 0.4) * i / NXR
    zz = 0.02 * math.sin(2 * math.pi * i / 4)
    for yv in (HY - HD / 2 - 0.25, HY + HD / 2 + 0.25):
        verts.append(Vector((x, yv, DZ + HH + 0.1 + zz + (0.12 if yv > HY else -0.05))))
for i in range(NXR):
    faces.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
roof = B.mesh_obj('HutRoof', verts, faces, coll=COL, mat=M['Corrugated'])
if roof.data.polygons[0].normal.z < 0:
    roof.data.flip_normals()
B.mod(roof, 'SOLIDIFY', thickness=0.008, offset=0)
add('metal', roof)
coil = [
    Vector(
        (
            2.2 + (0.14 + 0.1 * i / 120) * math.cos(i / 120 * 2 * math.pi * 3),
            -2.0 + (0.14 + 0.1 * i / 120) * math.sin(i / 120 * 2 * math.pi * 3),
            DZ + 0.04 + 0.02 * (i > 80),
        )
    )
    for i in range(121)
]
add('metal', B.sweep('Coil', coil, B.circle(0.018, 6), up=(0, 0, 1), coll=COL, mat=M['Rope']))
mx, my = -4.3, 4.3
add(
    'metal',
    B.lathe(
        'MarkPost',
        [(0, 0), (0.09, 0), (0.07, 2.4), (0, 2.4)],
        10,
        axis_loc=(mx, my, CZ + 0.1),
        coll=COL,
        mat=M['Marker'],
    ),
)
for a in (math.pi / 4, -math.pi / 4):
    add('metal', B.box(f'Topmark{a:.1f}', (0.05, 0.5, 0.07), (mx, my, CZ + 2.95), M['Marker'], COL, rot=(a, 0, 0)))
add(
    'metal',
    B.lathe(
        'LampBase',
        [(0, 0), (0.1, 0), (0.1, 0.05), (0, 0.05)],
        12,
        axis_loc=(mx, my, CZ + 2.4),
        coll=COL,
        mat=M['Marker'],
    ),
)
add(
    'glass',
    B.lathe(
        'Lamp',
        [(0, 0), (0.07, 0), (0.08, 0.1), (0.07, 0.2), (0, 0.2)],
        12,
        axis_loc=(mx, my, CZ + 2.45),
        coll=COL,
        mat=M['Glass'],
    ),
)


def finalize():
    objs = [o for g in GROUPS.values() for o in g]
    groups = {k: [o.name for o in v] for k, v in GROUPS.items()}
    B.to_mesh(objs)
    for k, names in groups.items():
        for n in names:
            ob = bpy.data.objects[n]
            if ob.data.uv_layers:
                ob.data.uv_layers[0].name = 'metric'
            if k == 'timber':
                B.set_grain(ob, zlib.crc32(n.encode()))
    root = B.empty('Batea', coll=COL)
    final = {}
    for k, name in (
        ('timber', 'BateaTimber'),
        ('metal', 'BateaMetal'),
        ('mussel', 'BateaMussel'),
        ('glass', 'BateaLight'),
    ):
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
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'batea_source.blend'), compress=True)
    root, final = finalize()
    tris = {k: sum(len(p.vertices) - 2 for p in o.data.polygons) for k, o in final.items()}
    print('BATEA triangles:', sum(tris.values()), tris)
    if ARGS.preview:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'batea_preview.blend'), compress=True)
        sys.exit(0)
    T = ARGS.tex
    for key, objs, size in (
        ('BateaTimber', [final['timber']], T),
        ('BateaMetal', [final['metal']], T // 2),
        ('BateaMussel', [final['mussel']], T // 2),
    ):
        print('baking', key)
        B.bake_group(key, objs, size, TEX, ao_dist=0.4)
    for o in final.values():
        for uv in [u for u in o.data.uv_layers if u.name != 'UVMap']:
            o.data.uv_layers.remove(uv)
        for a in [a for a in o.data.attributes if a.name in ('grain', 'keepuv')]:
            o.data.attributes.remove(a)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'batea_baked.blend'), compress=True)
    B.export_glb(os.path.join(OUT, 'batea_raw.glb'), [root])
    print('DONE', os.path.join(OUT, 'batea_raw.glb'))

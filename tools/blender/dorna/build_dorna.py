import argparse
import math
import os
import random
import sys
import zlib

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path[:0] = [os.path.join(ROOT, 'lib'), HERE]
import bretema_bpy as B
import materials as MAT
from bretema_bpy import G, lerp, smoothstep, srgb

argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--preview', action='store_true', help='skip baking/export (fast geometry check)')
ap.add_argument(
    '--tex',
    type=int,
    default=0,
    help='atlas size for paint/timber (others are scaled from it); default 2048 player, 1024 moored',
)
ap.add_argument('--variant', choices=('player', 'moored'), default='player')
ARGS = ap.parse_args(argv)
MOORED = ARGS.variant == 'moored'
NAME = 'dornas_fondeadas' if MOORED else 'dorna'
RES = 0.6 if MOORED else 1.0
SRC, OUT = os.path.join(ROOT, 'source'), os.path.join(ROOT, 'out')
TEX = os.path.join(SRC, 'textures', NAME) if MOORED else os.path.join(SRC, 'textures')


def n_(k, lo=4):
    return max(lo, int(round(k * RES)))


def section(t):
    z = lerp(-3.3, 2.6, t)
    w = 1.32 * (1 - (1 - t) ** 2.1) * (1 - 0.28 * smoothstep(0.75, 1, t))
    sheer = 0.62 + 0.95 * (1 - t) ** 3.2 + 0.18 * t
    keel = -0.58 * (1 - 0.65 * (1 - t) ** 4)
    return [(0, keel), (w * 0.78, keel * 0.5), (w, 0.12), (w * 0.97, sheer * 0.55), (w * 0.94, sheer)], z


def _cr(p0, p1, p2, p3, t):
    t2 = t * t
    t3 = t2 * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def hull_pt(t, s):
    P, z = section(t)
    ext = [(-P[1][0], P[1][1])] + P + [(P[4][0] * 2 - P[3][0], P[4][1] * 2 - P[3][1])]
    x = min(3.9999, max(0.0, s * 4))
    i = int(x)
    f = x - i
    return Vector((_cr(*(e[0] for e in ext[i : i + 4]), f), _cr(*(e[1] for e in ext[i : i + 4]), f), z))


def hull_n(t, s):
    e = 1e-3
    dt = hull_pt(min(1, t + e), s) - hull_pt(max(0, t - e), s)
    ds = hull_pt(t, min(1, s + e)) - hull_pt(t, max(0, s - e))
    n = ds.cross(dt)
    if n.length < 1e-9:
        return Vector((1, 0, 0))
    n.normalize()
    p = hull_pt(t, s)
    return -n if n.x * p.x + n.y * (p.y - 0.3) < 0 else n


def HB(t, s, off=0.0):
    return G(hull_pt(t, s) + hull_n(t, s) * off)


def tz(z):
    return (z + 3.3) / 5.9


def inner_x(t, y, off=-0.07):
    best, bd = 0.0, 9.0
    for j in range(201):
        s = j / 200
        d = abs(hull_pt(t, s).y - y)
        if d < bd:
            bd, best = d, s
    return (hull_pt(t, best) + hull_n(t, best) * off).x


UP, SIDE, AFT = Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, -1, 0))
PIVOT = G(0, 0, -1.1)


sc = B.reset_scene()
bpy.context.preferences.filepaths.save_version = 0
B.setup_cycles(16)
COL = B.collection('Dorna')
HELP = B.collection('Helpers')
PIECES = {k: [] for k in ('paint', 'timber', 'gear', 'net', 'glass', 'yard_timber', 'yard_gear', 'sail')}


def add(group, ob, mirror=False, paint=None):
    if mirror:
        B.mod(ob, 'MIRROR', use_axis=(True, False, False), use_mirror_merge=False)
    if paint is not None:
        ob['paint'] = paint
    PIECES[group].append(ob)
    return ob


PAINT = {'antifoul': 0x6B2A1E, 'blue': 0x1D5873, 'white': 0xE8E2D2, 'red': 0xB3382A}


def decal_image(text, name, px_h=256, spacing=1.12):
    dsc = bpy.data.scenes.new('Decal_' + name)
    cam_d = bpy.data.cameras.new('cam')
    cam_d.type = 'ORTHO'
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = text
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.space_character = spacing
    cu.offset = 0.012
    tob = bpy.data.objects.new(name, cu)
    dsc.collection.objects.link(tob)
    cam = bpy.data.objects.new('cam', cam_d)
    cam.location = (0, 0, 5)
    dsc.collection.objects.link(cam)
    dsc.camera = cam
    me = bpy.data.meshes.new_from_object(tob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    bpy.data.meshes.remove(me)
    w, h = (max(xs) - min(xs)) * 1.04, (max(ys) - min(ys)) * 1.25
    tob.location = (-(max(xs) + min(xs)) / 2, -(max(ys) + min(ys)) / 2, 0)
    cam_d.ortho_scale = w
    r = dsc.render
    r.engine = 'BLENDER_WORKBENCH'
    r.film_transparent = True
    r.resolution_x = int(px_h * w / h)
    r.resolution_y = px_h
    r.resolution_percentage = 100
    dsc.display.shading.light = 'FLAT'
    dsc.display.shading.color_type = 'SINGLE'
    dsc.display.shading.single_color = (1, 1, 1)
    dsc.view_settings.view_transform = 'Standard'
    dsc.display.render_aa = '16'
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    path = os.path.join(TEX, f'decal_{name}.png')
    r.filepath = path
    bpy.ops.render.render(write_still=True, scene=dsc.name)
    img = bpy.data.images.load(path, check_existing=False)
    img.name = f'decal_{name}'
    bpy.data.scenes.remove(dsc)
    return img, w / h


os.makedirs(TEX, exist_ok=True)
t_name, t_reg = 0.3, 0.12
name_z = hull_pt(t_name, 5.45 / 9).y
reg_z = hull_pt(t_reg, 7.5 / 9).y
THOLES = [(-0.15,), (1.0,)]
VARIANTS = [
    dict(key='A', name='NOVA AURORA', reg='FI-3-14-19', top=0x2F6B8A, band=0xE8E2D2, sheer=0xD9A63A),
    dict(key='B', name='ROSIÑA', reg='FI-3-08-22', top=0xA5432F, band=0xE6DCC6, sheer=0x1F2F3A),
    dict(key='C', name='VIRXE DO CARME', reg='FI-3-31-17', top=0x3D7A4A, band=0xE8E2D2, sheer=0xB3382A),
]


def decals_for(name, reg, tag):
    ni, nar = decal_image(name, f'name{tag}')
    ri, rar = decal_image(reg, f'reg{tag}', spacing=1.05)
    nh = 0.105 if len(name) < 9 else 0.085
    return [
        dict(image=ni, y=-section(t_name)[1], z=name_z, h=nh, w=nh * nar, color=0xF0E9D6),
        dict(image=ri, y=-section(t_reg)[1], z=reg_z, h=0.06, w=0.06 * rar, color=0x1B2A33),
    ]


PINS = [(-z, hull_pt(tz(z), 1).y + 0.05) for (z,) in THOLES]
if MOORED:
    PAINTS = {
        v['key']: MAT.hull_paint(decals_for(v['name'], v['reg'], v['key']), PINS, f'HullPaint_{v["key"]}')
        for v in VARIANTS
    }
else:
    PAINTS = {'': MAT.hull_paint(decals_for('BRÉTEMA', 'FI-3-27-26', ''), PINS)}

M = dict(
    HullPaint=next(iter(PAINTS.values())),
    InteriorPaint=MAT.interior_paint(),
    Wood=MAT.wood('Wood'),
    WoodDark=MAT.wood('WoodDark', 0x7A5C40, 0x4A3424, 0.35),
    WoodPale=MAT.wood('WoodPale', 0xB89A74, 0x8A6C4C, 0.8),
    Bronze=MAT.bronze(),
    Iron=MAT.iron(),
    Rope=MAT.rope('Rope'),
    RopeTar=MAT.rope('RopeTar', 0x5A4A38, 0x2E261D),
    Wicker=MAT.wicker(),
    Cork=MAT.cork(),
    Lead=MAT.flat('Lead', 0x6A6C6E, 0.55, 0.7),
    LanternBlack=MAT.flat('LanternBlack', 0x23231F, 0.5, 0.3, 0.3),
    NetCore=MAT.flat('NetCore', 0x1F3A31, 0.9),
    Net=MAT.net(),
    Sail=MAT.canvas(),
    LanternGlass=MAT.glass(),
    Furled=MAT.flat('Furled', 0xC29A66, 0.9, 0.0, 0.3),
)


STRAKES, LAP, NT, T0 = 9, 0.024, n_(44), 0.012
STRAKE_PAINT = ['antifoul'] * 3 + ['blue'] * 4 + ['white', 'red']
for k in range(STRAKES):
    s0 = k / STRAKES - (0.014 if k else 0)
    s1 = (k + 1) / STRAKES

    def fn(u, v, s0=s0, s1=s1):
        t = T0 + u * (1 - T0)
        s = lerp(s0, s1, v)
        return HB(t, s, LAP * (1 - v) * smoothstep(0, 0.06, t)), (t * 5.9, s * 2.2)

    ob = B.grid(f'Strake{k}', fn, NT, 2 if MOORED else 3, flip=True, coll=COL, mat=M['HullPaint'])
    ob.data.materials.append(M['InteriorPaint'])
    B.mod(ob, 'SOLIDIFY', thickness=0.017, offset=-1, use_even_offset=True, material_offset=1, material_offset_rim=0)
    if not MOORED:
        B.bevel(ob, 0.004, 1, 30)
    add('paint', ob, mirror=True, paint=PAINT[STRAKE_PAINT[k]])
    ob['param_uv'] = True

tr = [HB(1, s / 24, 0.02) for s in range(24, -1, -1)]
outline = tr + [Vector((-p.x, p.y, p.z)) for p in reversed(tr[:-1])]
ob = B.mesh_obj(
    'Transom', [p + Vector((0, -0.004, 0)) for p in outline], [tuple(range(len(outline)))], coll=COL, mat=M['HullPaint']
)
if ob.data.polygons[0].normal.y > 0:
    ob.data.flip_normals()
ob.data.materials.append(M['InteriorPaint'])
B.mod(ob, 'SOLIDIFY', thickness=0.035, offset=-1, material_offset=1)
B.bevel(ob, 0.006, 2, 30)
add('paint', ob, paint=PAINT['blue'])
cap = [HB(1, s / 24, 0.03) + Vector((0, -0.03, 0)) for s in range(24, 0, -1)]
cap = cap + [Vector((-p.x, p.y, p.z)) for p in reversed(cap)]
add(
    'timber',
    B.sweep('TransomCap', cap, B.rrect(0.07, 0.05, 0.012, 1 if MOORED else 2), up=AFT, coll=COL, mat=M['WoodDark']),
)

rail = [HB(t, 1, -0.008) + UP * 0.03 for t in (0.004 + i / n_(44) * 0.996 for i in range(n_(44) + 1))]
add(
    'timber',
    B.sweep(
        'Gunwale',
        rail,
        [(-0.065, -0.035), (0.05, -0.035), (0.058, 0.0), (0.048, 0.03), (0.0, 0.045), (-0.05, 0.035), (-0.065, 0.0)],
        up=UP,
        coll=COL,
        mat=M['WoodDark'],
    ),
    mirror=True,
)
rub = [HB(t, 0.935, LAP + 0.014) for t in (0.01 + i / n_(44) * 0.99 for i in range(n_(44) + 1))]
add(
    'paint',
    B.sweep(
        'Rubbing',
        rub,
        [(-0.018, -0.026), (0.012, -0.022), (0.024, 0.0), (0.012, 0.022), (-0.018, 0.026)],
        up=UP,
        coll=COL,
        mat=M['HullPaint'],
    ),
    mirror=True,
    paint=PAINT['white'],
)

keel = [HB(t, 0) + UP * -0.05 for t in (0.008 + i / n_(40) * 0.992 for i in range(n_(40) + 1))]
add(
    'paint',
    B.sweep('Keel', keel, B.rrect(0.09, 0.12, 0.02), up=UP, coll=COL, mat=M['HullPaint']),
    paint=PAINT['antifoul'],
)
stem_ctrl = [
    G(0, -0.27, -3.0),
    G(0, -0.22, -3.27),
    G(0, 0.25, -3.31),
    G(0, 0.9, -3.315),
    G(0, 1.5, -3.33),
    G(0, 1.86, -3.42),
]
stem = [
    B.lerp(stem_ctrl[int(i)], stem_ctrl[min(5, int(i) + 1)], i - int(i))
    for i in (j / n_(50) * 4.999 for j in range(n_(50) + 1))
]
add(
    'paint',
    B.sweep('Stem', stem, B.rrect(0.16, 0.11, 0.025), up=SIDE, coll=COL, mat=M['HullPaint']),
    paint=PAINT['red'],
)
head = B.lathe(
    'StemHead',
    [(0, 0), (0.06, 0.01), (0.075, 0.05), (0.05, 0.1), (0.06, 0.14), (0.03, 0.18), (0, 0.19)],
    16,
    axis_loc=G(0, 1.86, -3.42),
    coll=COL,
    mat=M['WoodDark'],
)
head.rotation_euler = (math.radians(-12), 0, 0)
add('timber', head)
add(
    'paint',
    B.sweep(
        'Sternpost',
        [G(0, -0.42, 2.5), G(0, -0.2, 2.63), G(0, 0.3, 2.66), G(0, 0.92, 2.68)],
        B.rrect(0.1, 0.1, 0.02),
        up=SIDE,
        coll=COL,
        mat=M['HullPaint'],
    ),
    paint=PAINT['blue'],
)


for i, t in enumerate(x / 100 for x in range(10, 96, 7 if not MOORED else 10)):
    path = [HB(t, s, -0.04) for s in (0.03 + j / n_(16) * 0.94 for j in range(n_(16) + 1))]
    add(
        'timber',
        B.sweep(f'Frame{i}', path, B.rrect(0.045, 0.05, 0.01, 1), up=AFT, coll=COL, mat=M['InteriorPaint']),
        mirror=True,
    )
for name, y, prof in (('Riser', 0.3, B.rrect(0.045, 0.08, 0.012, 1)),):
    path = [
        Vector((inner_x(t, y, -0.06), -lerp(-3.3, 2.6, t), y))
        for t in (0.12 + i / n_(40) * 0.8 for i in range(n_(40) + 1))
    ]
    add('timber', B.sweep(name, path, prof, up=UP, coll=COL, mat=M['InteriorPaint']), mirror=True)
inwale = [HB(t, 0.965, -0.065) for t in (0.03 + i / n_(50) * 0.95 for i in range(n_(50) + 1))]
add(
    'timber',
    B.sweep('Inwale', inwale, B.rrect(0.05, 0.06, 0.012, 1), up=UP, coll=COL, mat=M['InteriorPaint']),
    mirror=True,
)


def board(name, size, loc, mat, bev=0.008, rot=None):
    bm_ob = B.mesh_obj(
        name,
        [
            Vector((sx * size[0] / 2, sy * size[1] / 2, sz * size[2] / 2))
            for sx in (-1, 1)
            for sy in (-1, 1)
            for sz in (-1, 1)
        ],
        [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)],
        coll=COL,
        mat=mat,
        smooth=False,
    )
    bm_ob.location = loc
    if rot:
        bm_ob.rotation_euler = rot
    B.bevel(bm_ob, bev, 3 if not MOORED else 1, 60)
    B.mod(bm_ob, 'WEIGHTED_NORMAL', keep_sharp=True)
    return bm_ob


FLOOR = -0.08
SOLE = -0.115
ts = [i / 80 for i in range(81) if inner_x(i / 80, SOLE, -0.03) > 0.04]
right = [G(inner_x(t, SOLE, -0.03), SOLE, lerp(-3.3, 2.6, t)) for t in ts]
ob = B.mesh_obj(
    'Sole',
    right + [Vector((-p.x, p.y, p.z)) for p in reversed(right)],
    [tuple(range(2 * len(right)))],
    coll=COL,
    mat=M['InteriorPaint'],
)
if ob.data.polygons[0].normal.z < 0:
    ob.data.flip_normals()
B.mod(ob, 'SOLIDIFY', thickness=0.02, offset=-1)
add('timber', ob)
for k in range(-3, 4):
    xo = k * 0.17
    ts = [i / 100 for i in range(101) if inner_x(i / 100, FLOOR) > abs(xo) + 0.1]
    if ts:
        z0, z1 = lerp(-3.3, 2.6, ts[0]), lerp(-3.3, 2.6, ts[-1])
        add('timber', board(f'Floor{k}', (0.15, z1 - z0, 0.032), G(xo, FLOOR, (z0 + z1) / 2), M['WoodPale'], 0.006))


def knee(name, z, sx, hw):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'
    cu.fill_mode = 'BOTH'
    cu.extrude = 0.02
    cu.bevel_depth = 0.006
    cu.bevel_resolution = 0 if MOORED else 2
    cu.resolution_u = 3 if MOORED else 12
    sp = cu.splines.new('BEZIER')
    pts = [(0, 0), (-0.2, 0), (-0.2, -0.035), (-0.06, -0.06), (-0.035, -0.2), (0, -0.2)]
    sp.bezier_points.add(len(pts) - 1)
    sp.use_cyclic_u = True
    for p, (x, y) in zip(sp.bezier_points, pts):
        p.co = (x, y, 0)
        p.handle_left_type = p.handle_right_type = 'VECTOR'
    sp.bezier_points[3].handle_left_type = sp.bezier_points[3].handle_right_type = 'AUTO'
    ob = B.link(bpy.data.objects.new(name, cu), COL)
    ob.data.materials.append(M['Wood'])
    ob.matrix_world = Matrix.Translation(G(sx * (hw - 0.02), 0.36, z)) @ Matrix(
        ((sx, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))
    )
    return ob


for z in (-1.2, 0.4, 1.7):
    hw = inner_x(tz(z), 0.36)
    th = add('timber', board(f'Thwart{z}', (hw * 2 + 0.03, 0.3, 0.055), G(0, 0.385, z), M['Wood'], 0.012))
    if z == -1.2:
        hole = B.lathe(
            'MastHole',
            [(0, -0.2), (0.092, -0.2), (0.092, 0.2), (0, 0.2)],
            16,
            axis_loc=G(0, 0.385, -1.1),
            coll=HELP,
            mat=M['Wood'],
        )
        bl = th.modifiers.new('MastHole', 'BOOLEAN')
        bl.object = hole
        bl.operation = 'DIFFERENCE'
        bl.solver = 'EXACT'
        th.modifiers.move(len(th.modifiers) - 1, 0)
        hole.hide_render = True
        hole.hide_viewport = True
    for sx in (-1, 1):
        add('timber', knee(f'Knee{z}{sx}', z, sx, hw))

add(
    'timber',
    B.lathe(
        'Mast',
        [(0, -0.42), (0.085, -0.42), (0.084, 0.2), (0.082, 1.0), (0.07, 4.6), (0.056, 5.95), (0.045, 6.0), (0, 6.04)],
        20,
        axis_loc=G(0, 0, -1.1),
        coll=COL,
        mat=M['WoodDark'],
    ),
)
add('timber', board('MastStep', (0.22, 0.5, 0.1), G(0, -0.42, -1.1), M['WoodDark'], 0.015))
add(
    'gear',
    B.lathe(
        'MastCollar',
        [(0.088, 0.41), (0.11, 0.41), (0.115, 0.44), (0.11, 0.47), (0.088, 0.47)],
        24,
        axis_loc=G(0, 0, -1.1),
        coll=COL,
        mat=M['Bronze'],
    ),
)
add(
    'gear',
    B.lathe(
        'MastTruck',
        [(0, 5.98), (0.075, 5.98), (0.08, 6.02), (0.06, 6.06), (0, 6.07)],
        16,
        axis_loc=G(0, 0, -1.1),
        coll=COL,
        mat=M['Bronze'],
    ),
)
sheave = board('Sheave', (0.04, 0.11, 0.16), G(0, 5.82, -1.1), M['Bronze'], 0.01)
add('gear', sheave)


cu = bpy.data.curves.new('Rudder', 'CURVE')
cu.resolution_u = 12 if not MOORED else 4
cu.dimensions = '2D'
cu.fill_mode = 'BOTH'
cu.extrude = 0.028
cu.bevel_depth = 0.01
cu.bevel_resolution = 2
sp = cu.splines.new('BEZIER')
rp = [(0, 0.95), (0, -0.58), (0.22, -0.68), (0.5, -0.6), (0.46, -0.05), (0.3, 0.38), (0.13, 0.56), (0.13, 0.95)]
sp.bezier_points.add(len(rp) - 1)
sp.use_cyclic_u = True
for i, (p, (x, y)) in enumerate(zip(sp.bezier_points, rp)):
    p.co = (x, y, 0)
    p.handle_left_type = p.handle_right_type = 'AUTO' if i in (2, 3, 4, 5) else 'VECTOR'
rud = B.link(bpy.data.objects.new('Rudder', cu), COL)
rud.data.materials.append(M['HullPaint'])
rud.matrix_world = Matrix.Translation(G(0, 0, 2.73)) @ Matrix(
    ((0, 0, -1, 0), (-1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1))
)
add('paint', rud, paint=PAINT['blue'])
for y in (-0.25, 0.35):
    add(
        'gear',
        B.lathe(
            f'Pintle{y}',
            [(0, -0.07), (0.02, -0.07), (0.02, 0.07), (0, 0.07)],
            10,
            axis_loc=G(0, y, 2.705),
            coll=COL,
            mat=M['Bronze'],
        ),
    )
    add('gear', board(f'Gudgeon{y}', (0.05, 0.2, 0.025), G(0, y + 0.06, 2.64), M['Bronze'], 0.008))
tiller = [G(0, 0.9, 2.76), G(0, 0.96, 2.52), G(0, 0.96, 2.2), G(0, 0.92, 1.85), G(0, 0.88, 1.66)]
add(
    'timber',
    B.sweep(
        'Tiller',
        tiller,
        B.rrect(0.06, 0.055, 0.015),
        up=UP,
        scale=lambda u: lerp(1, 0.7, u),
        coll=COL,
        mat=M['WoodDark'],
    ),
)
knob = B.lathe(
    'TillerKnob',
    [(0, -0.04), (0.03, -0.035), (0.04, 0), (0.03, 0.035), (0, 0.04)],
    12,
    axis_loc=G(0, 0.88, 1.64),
    coll=COL,
    mat=M['WoodDark'],
)
knob.rotation_euler = (math.radians(90), 0, 0)
add('timber', knob)

post = [G(0, 0.38, 2.15), G(0, 1.48, 2.15), G(0, 1.52, 2.12), G(0, 1.52, 1.98), G(0, 1.47, 1.9)]
add('timber', B.sweep('LanternPost', post, B.rrect(0.045, 0.045, 0.01), up=SIDE, coll=COL, mat=M['WoodDark']))
lan = G(0, 1.15, 1.9)
add(
    'gear',
    B.lathe(
        'LanternBase',
        [(0, -0.16), (0.115, -0.16), (0.125, -0.14), (0.1, -0.12), (0, -0.12)],
        20,
        axis_loc=lan,
        coll=COL,
        mat=M['LanternBlack'],
    ),
)
add(
    'gear',
    B.lathe(
        'LanternTop',
        [(0, 0.19), (0.04, 0.19), (0.13, 0.14), (0.12, 0.13), (0, 0.13)],
        20,
        axis_loc=lan,
        coll=COL,
        mat=M['LanternBlack'],
    ),
)
for i in range(4):
    a = math.pi / 4 + i * math.pi / 2
    add(
        'gear',
        B.sweep(
            f'LanternBar{i}',
            [
                lan + Vector((math.cos(a) * 0.09, math.sin(a) * 0.09, -0.13)),
                lan + Vector((math.cos(a) * 0.09, math.sin(a) * 0.09, 0.14)),
            ],
            B.circle(0.008, 6),
            up=SIDE,
            coll=COL,
            mat=M['Bronze'],
        ),
    )
ring = [
    lan + Vector((0, 0.04 * math.cos(a), 0.25 + 0.04 * math.sin(a))) for a in (2 * math.pi * i / 16 for i in range(17))
]
add('gear', B.sweep('LanternRing', ring, B.circle(0.007, 6), up=SIDE, coll=COL, mat=M['Bronze']))
glass = B.lathe(
    'LanternGlassBody',
    [(0, -0.12), (0.085, -0.12), (0.09, 0), (0.085, 0.13), (0, 0.13)],
    20,
    axis_loc=lan,
    coll=COL,
    mat=M['LanternGlass'],
)
add('glass', glass)


def grommet(name, c, r, rr, axis=UP):
    prof = B.profile_obj(name + '_prof', B.laid_rope_profile(rr, n=8 if MOORED else 12), HELP)
    a, b = axis.orthogonal().normalized(), None
    b = axis.cross(a)
    n = n_(40, 16)
    pts = [c + (a * math.cos(2 * math.pi * i / n) + b * math.sin(2 * math.pi * i / n)) * r for i in range(n)]
    ob = B.curve_obj(name, pts, bevel=prof, tilt=lambda u: u * 2 * math.pi * 7, coll=COL, mat=M['Rope'])
    ob.data.splines[0].use_cyclic_u = True
    return ob


for sx in (-1, 1):
    for (z,) in THOLES:
        t = tz(z)
        p = hull_pt(t, 1)
        base = G(sx * (p.x - 0.02), p.y + 0.07, z)
        add('timber', board(f'Chock{sx}{z}', (0.08, 0.22, 0.05), base - UP * 0.02, M['WoodDark'], 0.01))
        add(
            'timber',
            B.lathe(
                f'Thole{sx}{z}',
                [(0, 0), (0.022, 0), (0.02, 0.15), (0.026, 0.18), (0, 0.19)],
                10,
                axis_loc=base,
                coll=COL,
                mat=M['WoodDark'],
            ),
        )
        add(
            'gear',
            grommet(
                f'Estrobo{sx}{z}',
                base + UP * 0.05 + Vector((sx * 0.05, 0, 0)),
                0.055,
                0.011,
                axis=Vector((0, 1, 0.25)).normalized(),
            ),
        )
    x, y = sx * 0.52, 0.44
    add(
        'timber',
        B.sweep(
            f'OarLoom{sx}',
            [G(x, y, z) for z in (-1.75, -0.5, 0.5, 1.3)],
            B.circle(0.028, 10),
            up=UP,
            coll=COL,
            mat=M['WoodPale'],
        ),
    )
    add(
        'timber',
        B.sweep(
            f'OarBlade{sx}',
            [G(x, y, z) for z in (1.3, 1.5, 1.7, 1.9)],
            B.rrect(0.2, 0.022, 0.009, 2),
            up=UP,
            scale=lambda u: lerp(0.35, 1, min(1, u * 2.5)) if u < 1 else 1,
            coll=COL,
            mat=M['WoodPale'],
        ),
    )
    add(
        'timber',
        B.sweep(
            f'OarGrip{sx}', [G(x, y, z) for z in (-2.0, -1.75)], B.circle(0.022, 10), up=UP, coll=COL, mat=M['WoodDark']
        ),
    )
    wrap = [G(x, y, -0.25) + Vector((0, -0.18 * i / 80, 0)) + Vector((0, 0, 0)) for i in range(81)]
    wrap = [p + Vector((0.034 * math.cos(i * 0.9), 0, 0.034 * math.sin(i * 0.9))) for i, p in enumerate(wrap)]
    if not MOORED:
        add('gear', B.sweep(f'OarLeather{sx}', wrap, B.circle(0.007, 6), up=UP, coll=COL, mat=M['RopeTar']))


def rope_line(name, pts, r, mat='Rope', sides=8):
    return add('gear', B.sweep(name, pts, B.circle(r, sides), up=UP, coll=COL, mat=M[mat]))


coil = []
NC = n_(200, 60)
for i in range(NC + 1):
    a = i / NC * 2 * math.pi * 3.4
    rr = 0.085 + i / NC * 0.15
    coil.append(
        G(
            0.32 + math.cos(a) * rr,
            FLOOR
            + 0.035
            + 0.022 * (i / NC > 0.6) * math.sin(i / NC * 160) ** 2
            + (i / NC - 0.94) * 0.6 * (i / NC > 0.94),
            -1.85 + math.sin(a) * rr,
        )
    )
rope_line('Coil', coil, 0.015, sides=7)
cleat = [G(0.1, 0.55, -1.02), G(0.1, 0.58, -0.94), G(0.1, 0.58, -1.26), G(0.1, 0.55, -1.18)]
add('gear', B.sweep('Cleat', cleat, B.rrect(0.03, 0.03, 0.01), up=SIDE, coll=COL, mat=M['Bronze']))
rope_line(
    'Halyard',
    [G(0.07, 5.82, -1.04), G(0.08, 3.5, -1.0), G(0.09, 1.2, -1.0), G(0.1, 0.6, -1.02), G(0.12, 0.57, -1.1)],
    0.009,
)
for i in range(3):
    a = i * 0.9
    rope_line(
        f'Belay{i}',
        [
            G(0.1 + 0.03 * math.cos(a + k * 0.7), 0.6 + 0.008 * k, -1.1 + 0.12 * math.sin(a + k * 1.3))
            for k in range(10)
        ],
        0.009,
    )

heap = B.lathe(
    'NetHeap',
    [(0, -0.01)] + [(0.5 * math.sin(math.pi * k / 16), 0.25 * math.cos(math.pi * k / 16) - 0.02) for k in range(9)],
    24,
    axis_loc=G(-0.38, FLOOR + 0.03, -0.55),
    coll=COL,
    mat=M['Net'],
)
heap.scale = (1.0, 0.85, 1.0)
tex = bpy.data.textures.new('NetLumps', 'CLOUDS')
tex.noise_scale = 0.18
tex.noise_depth = 3
B.mod(heap, 'SUBSURF', levels=1, render_levels=1)
B.mod(heap, 'DISPLACE', texture=tex, strength=0.12, mid_level=0.5, texture_coords='GLOBAL')
add('net', heap)
core = heap.copy()
core.data = heap.data.copy()
core.name = 'NetCore'
COL.objects.link(core)
core.scale = (0.94, 0.8, 0.9)
core.data.materials.clear()
core.data.materials.append(M['NetCore'])
add('gear', core)
NET_T = (0.40, 0.58)


def net_sheet(u, v):
    t = lerp(*NET_T, u)
    top = HB(t, 1, 0.03) + UP * 0.055
    rx = abs(top.x)
    sag = 0.05 * math.sin(math.pi * u)
    if v < 0.18:
        f = (0.18 - v) / 0.18
        p = Vector((-(rx + 0.03 + 0.05 * f), top.y, top.z - 0.32 * f * f - sag * f))
    else:
        f = (v - 0.18) / 0.82
        p = Vector(
            (
                -(rx - 0.06 - 0.5 * f),
                top.y + 0.12 * math.sin(math.pi * f) * (u - 0.5),
                lerp(top.z, FLOOR + 0.1, smoothstep(0, 0.55, f)) - sag * (1 - f),
            )
        )
    return p, (u, v)


if not MOORED:
    sheet = B.grid('NetDrape', net_sheet, 24, 16, coll=COL, mat=M['Net'], flip=True)
    B.mod(sheet, 'SOLIDIFY', thickness=0.006, offset=0)
    add('net', sheet)
    head_rope = [net_sheet(i / 40, 0.18)[0] + UP * 0.012 for i in range(41)]
    rope_line('HeadRope', head_rope, 0.008)
    float_proto = B.lathe(
        'CorkFloat', [(0, -0.035), (0.045, -0.033), (0.05, 0), (0.045, 0.033), (0, 0.035)], 12, coll=COL, mat=M['Cork']
    )
    path_cu = B.curve_obj('FloatPath', [p - head_rope[0] for p in head_rope], depth=0, coll=HELP)
    path_cu.location = head_rope[0]
    float_proto.location = head_rope[0]
    float_proto.rotation_euler = (0, math.radians(90), 0)
    B.mod(
        float_proto,
        'ARRAY',
        fit_type='FIT_CURVE',
        curve=path_cu,
        use_relative_offset=False,
        use_constant_offset=True,
        constant_offset_displace=(0, 0, 0.16),
    )
    B.mod(float_proto, 'CURVE', object=path_cu, deform_axis='POS_Z')
    add('gear', float_proto)
    for i in range(6):
        p = net_sheet(0.08 + i * 0.17, 0.8)[0]
        add(
            'gear',
            B.lathe(
                f'Sinker{i}',
                [(0, -0.025), (0.018, -0.025), (0.022, 0), (0.018, 0.025), (0, 0.025)],
                10,
                axis_loc=p + UP * 0.01,
                coll=COL,
                mat=M['Lead'],
            ),
        )

for i, (x, z, ry) in enumerate(((0.42, 0.95, 0.0), (0.5, 1.25, 0.5))[: 1 if MOORED else 2]):
    loc = G(x, FLOOR + 0.02, z)
    cage = B.lathe(
        f'Nasa{i}',
        [(0.0, 0.0), (0.2, 0), (0.27, 0.1), (0.27, 0.26), (0.18, 0.38), (0.12, 0.4)],
        n_(14, 10),
        axis_loc=loc,
        coll=COL,
        mat=M['Wicker'],
    )
    cage.modifiers['Lathe'].use_normal_calculate = True
    B.mod(
        cage,
        'WIREFRAME',
        thickness=0.012,
        use_even_offset=True,
        use_relative_offset=False,
        use_replace=True,
        use_boundary=True,
    )
    cage.rotation_euler = (0, 0, ry) if i == 0 else (math.radians(-80), 0, ry)
    if i == 1:
        cage.location = G(x, FLOOR + 0.3, z)
    add('gear', cage)
    mouth = [
        loc + Vector((0.12 * math.cos(a), 0.12 * math.sin(a), 0.4)) for a in (2 * math.pi * k / 24 for k in range(25))
    ]
    if i == 0:
        rope_line(f'NasaMouth{i}', mouth, 0.014, 'Wicker')
    add(
        'gear',
        B.lathe(
            f'NasaBase{i}', [(0, 0), (0.2, 0), (0.2, 0.015), (0, 0.015)], 20, axis_loc=loc, coll=COL, mat=M['WoodDark']
        ),
    ) if i == 0 else None

an = G(-0.25, FLOOR + 0.06, -2.35)
add(
    'gear',
    B.sweep('GrapnelShank', [an, an + Vector((0, 0.38, 0.02))], B.circle(0.016, 8), up=UP, coll=COL, mat=M['Iron']),
)
for k in range(4):
    a = k * math.pi / 2 + 0.4
    d = Vector((math.cos(a), math.sin(a) * 0.35, 0))
    arm = [an + d * (0.02 + 0.12 * f) + Vector((0, 0, 0.08 * f * f - 0.02 * f)) for f in (i / 10 for i in range(11))]
    add('gear', B.curve_obj(f'GrapnelArm{k}', arm, depth=0.012, res=2, coll=COL, mat=M['Iron']))
add('gear', grommet('GrapnelRing', an + Vector((0, 0.42, 0.02)), 0.035, 0.006, axis=SIDE))
rope_line(
    'Rode',
    [
        an + Vector((0, 0.44, 0.02)),
        G(-0.1, FLOOR + 0.05, -2.0),
        G(0.05, FLOOR + 0.04, -1.95),
        G(0.2, FLOOR + 0.04, -1.9),
    ],
    0.012,
    'RopeTar',
)

bx = G(-0.35, FLOOR + 0.1, 1.15)
for j, (size, off) in enumerate(
    (
        ((0.5, 0.32, 0.016), (0, 0, -0.07)),
        ((0.016, 0.32, 0.15), (0.24, 0, 0)),
        ((0.016, 0.32, 0.15), (-0.24, 0, 0)),
        ((0.5, 0.016, 0.06), (0, 0.155, 0.04)),
        ((0.5, 0.016, 0.06), (0, -0.155, 0.04)),
        ((0.5, 0.016, 0.06), (0, 0.155, -0.035)),
        ((0.5, 0.016, 0.06), (0, -0.155, -0.035)),
    )
):
    add('timber', board(f'Box{j}', size, bx + Vector(off), M['WoodPale'], 0.004))


if MOORED:
    ya, yb = G(0.3, 0.47, -1.75), G(0.18, 0.47, 2.35)
    yd = (yb - ya).normalized()
    add(
        'timber',
        B.sweep(
            'YardStowed',
            [ya.lerp(yb, f) for f in (i / 8 for i in range(9))],
            B.circle(0.04, 10),
            up=UP,
            coll=COL,
            mat=M['WoodDark'],
        ),
    )
    rnd = random.Random(7)
    side = Vector((-yd.y, yd.x, 0)).normalized()
    bundle = [ya.lerp(yb, f) + side * 0.09 + UP * 0.05 for f in (0.04 + i / 14 * 0.9 for i in range(15))]
    lumps = [1 + rnd.uniform(-0.18, 0.18) for _ in range(15)]
    add(
        'gear',
        B.sweep(
            'SailFurled',
            bundle,
            [
                (0.11 * math.cos(a) * (1 + 0.15 * math.sin(3 * a)), 0.08 * math.sin(a))
                for a in (2 * math.pi * k / 12 for k in range(12))
            ],
            up=UP,
            scale=lambda u: lumps[min(14, int(u * 14))] * (0.55 + 0.45 * math.sin(math.pi * min(1, u * 1.15))),
            coll=COL,
            mat=M['Furled'],
        ),
    )
    for i in range(1, 5):
        c = ya.lerp(yb, 0.05 + i * 0.2) + side * 0.05 + UP * 0.03
        a1, a2 = side, UP
        ring = [
            c + (a1 * math.cos(2 * math.pi * k / 14) * 0.17 + a2 * math.sin(2 * math.pi * k / 14) * 0.1)
            for k in range(15)
        ]
        rope_line(f'Gasket{i}', ring, 0.007, sides=6)
    head = G(0, 1.78, -3.44)
    moor = [
        head + Vector((0, 0.06 * math.cos(a), 0.03 * math.sin(a))) for a in (2 * math.pi * k / 10 for k in range(11))
    ]
    rope_line('MooringTurns', moor, 0.013, 'RopeTar', sides=6)
    line = [head + Vector((0, f * 2.6, -1.95 * f + 0.9 * f * (1 - f))) for f in (i / 12 for i in range(13))]
    rope_line('MooringLine', line, 0.013, 'RopeTar', sides=6)

if not MOORED:
    corners = dict(tack=(0, 1.05, -1.55), clew=(0, 1.15, 1.9), peak=(0, 5.9, 1.55), throat=(0, 4.5, -1.15))
    th, pk = G(corners['throat']), G(corners['peak'])
    d = (pk - th).normalized()
    y0, y1 = th - d * 0.25, pk + d * 0.25
    add(
        'yard_timber',
        B.sweep(
            'YardSpar',
            [y0.lerp(y1, f) for f in (i / 12 for i in range(13))],
            B.circle(0.045, 12),
            up=SIDE,
            scale=lambda u: 1 - abs(u - 0.5) * 0.55,
            coll=COL,
            mat=M['WoodDark'],
        ),
    )
    add('yard_gear', grommet('Parrel', G(0, 4.52, -1.1), 0.11, 0.014, axis=UP))
    for i in range(1, 12):
        c = th.lerp(pk, i / 12)
        a1, a2 = SIDE, d.cross(SIDE).normalized()
        pts = [
            c
            + d * (0.012 * k / 16)
            + (a1 * math.cos(2 * math.pi * k / 16) + a2 * math.sin(2 * math.pi * k / 16)) * 0.052
            for k in range(17)
        ]
        add('yard_gear', B.sweep(f'Lacing{i}', pts, B.circle(0.006, 6), up=d, coll=COL, mat=M['Rope']))

    def sail_pt(u, v):
        L = lambda a, b, t: tuple(lerp(a[i], b[i], t) for i in range(3))
        q = G(L(L(corners['tack'], corners['clew'], u), L(corners['throat'], corners['peak'], u), v))
        q.x += 0.42 * math.sin(math.pi * u) * math.sin(math.pi * min(1, v * 1.1))
        return q, (u, v)

    sail = B.grid('Sail', sail_pt, 20, 20, coll=COL, mat=M['Sail'])
    add('sail', sail)


def keep_param_uv(ob):
    me = ob.data
    src = me.uv_layers['metric']
    dst = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        shift = 7.0 if p.center.x < 0 else 0.0
        for li in p.loop_indices:
            dst.data[li].uv = (src.data[li].uv.x + shift, src.data[li].uv.y)
    me.attributes.new('keepuv', 'BOOLEAN', 'FACE').data.foreach_set('value', [True] * len(me.polygons))


def finalize():
    for o in list(HELP.objects):
        o.hide_viewport = False
    objs = [o for g in PIECES.values() for o in g]
    paint = {o.name: o.get('paint') for o in objs}
    groups = {k: [o.name for o in v] for k, v in PIECES.items()}
    B.to_mesh(objs)
    for k, names in groups.items():
        for n in names:
            ob = bpy.data.objects[n]
            if ob.data.uv_layers:
                ob.data.uv_layers[0].name = 'metric'
            if paint.get(n) is not None:
                B.set_color_attr(ob, 'Paint', srgb(paint[n]))
            if k in ('timber', 'yard_timber', 'paint'):
                B.set_grain(ob, zlib.crc32(n.encode()))
            if ob.get('param_uv'):
                keep_param_uv(ob)
    for n in list(groups['paint']):
        ob = bpy.data.objects[n]
        if len(ob.data.materials) < 2:
            continue
        B.select_only([ob])
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        ob.active_material_index = 1
        bpy.ops.object.material_slot_select()
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        inner = [o for o in bpy.context.selected_objects if o != ob][0]
        for o, keep in ((ob, 0), (inner, 1)):
            mat = o.data.materials[keep]
            o.data.materials.clear()
            o.data.materials.append(mat)
        groups['timber'].append(inner.name)
    for o in list(HELP.objects):
        bpy.data.objects.remove(o)
    J = lambda key, name: B.join([bpy.data.objects[n] for n in groups[key]], name)
    final = {}
    if MOORED:
        roots = [B.empty(f'Dorna_{v["key"]}', (3.6 * (i - 1), 0, 0), coll=COL) for i, v in enumerate(VARIANTS)]
        base = {k: J(k, f'{k.title()}') for k in ('timber', 'gear', 'net', 'glass')}
        paint0 = J('paint', 'Paint_A')
        remap = {PAINT['blue']: 'top', PAINT['red']: 'sheer', PAINT['white']: 'band'}
        paints = []
        copies = [paint0]
        for _ in VARIANTS[1:]:
            o = paint0.copy()
            o.data = paint0.data.copy()
            COL.objects.link(o)
            copies.append(o)
        for i, v in enumerate(VARIANTS):
            o = copies[i]
            o.name = o.data.name = f'Paint_{v["key"]}'
            recolor(o, {srgb(h)[:3]: srgb(v[k])[:3] for h, k in remap.items()})
            sa = o.data.attributes.new('seed', 'FLOAT', 'POINT')
            sa.data.foreach_set('value', [float(i)] * len(o.data.vertices))
            o.data.materials.clear()
            o.data.materials.append(PAINTS[v['key']])
            o.parent = roots[i]
            paints.append(o)
        for o in base.values():
            o.parent = roots[0]
        final.update(base)
        final['paints'] = paints
        for o in list(base.values()) + paints:
            B.mod(o, 'WEIGHTED_NORMAL', keep_sharp=True)
            B.to_mesh([o])
        return roots, final
    hull = B.empty('Hull', coll=COL)
    yard = B.empty('Yard', PIVOT, coll=COL)
    final['paint'] = J('paint', 'HullPaint')
    final['timber'] = J('timber', 'HullTimber')
    final['gear'] = J('gear', 'HullGear')
    final['net'] = J('net', 'HullNet')
    final['glass'] = J('glass', 'HullLantern')
    final['yard_timber'] = J('yard_timber', 'YardTimber')
    final['yard_gear'] = J('yard_gear', 'YardGear')
    final['sail'] = bpy.data.objects[groups['sail'][0]]
    for k in ('paint', 'timber', 'gear', 'net', 'glass'):
        final[k].parent = hull
    for k in ('yard_timber', 'yard_gear'):
        o = final[k]
        o.data.transform(Matrix.Translation(-PIVOT))
        o.parent = yard
    s = final['sail']
    s.data.transform(Matrix.Translation(-PIVOT))
    s.location = PIVOT
    s.data.uv_layers[0].name = 'UVMap'
    for o in final.values():
        B.mod(o, 'WEIGHTED_NORMAL', keep_sharp=True)
        B.to_mesh([o])
    return [hull, yard, s], final


def recolor(ob, mapping):
    a = ob.data.color_attributes['Paint']
    for d in a.data:
        k = min(mapping, key=lambda c: sum((d.color[i] - c[i]) ** 2 for i in range(3)))
        if sum((d.color[i] - k[i]) ** 2 for i in range(3)) < 1e-6:
            d.color = (*mapping[k], 1.0)


def stats(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == 'MESH')


def strip_authoring(objs):
    for o in objs:
        me = o.data
        for uv in [u for u in me.uv_layers if u.name != 'UVMap']:
            me.uv_layers.remove(uv)
        for a in [a for a in me.attributes if a.name in ('grain', 'Paint', 'seed', 'keepuv')]:
            me.attributes.remove(a)


if __name__ == '__main__':
    os.makedirs(SRC, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, f'{NAME}_source.blend'), compress=True)
    roots, final = finalize()
    flat = [o for v in final.values() for o in (v if isinstance(v, list) else [v])]
    print(f'DORNA triangles: {stats(flat)}', {k: stats(v if isinstance(v, list) else [v]) for k, v in final.items()})
    if ARGS.preview:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, f'{NAME}_preview.blend'), compress=True)
        sys.exit(0)
    T = ARGS.tex or (1024 if MOORED else 2048)
    if MOORED:
        for key, objs, size, kw in (
            ('Paint', final['paints'], 2 * T, {}),
            ('Timber', [final['timber']], T, {}),
            ('Gear', [final['gear']], T // 2, {}),
            ('Net', [final['net']], T // 4, dict(alpha=True, metal=False)),
        ):
            print('baking', key)
            B.bake_group(f'Moored{key}', objs, size, TEX, **kw)
        strip_authoring(flat)
        for i, r in enumerate(roots[1:], 1):
            for k in ('timber', 'gear', 'net', 'glass'):
                o = final[k].copy()
                o.name = f'{final[k].name}_{"ABC"[i]}'
                COL.objects.link(o)
                o.parent = r
    else:
        sail = final['sail']
        sail.hide_render = True
        for key, objs, size, kw in (
            ('HullPaint', [final['paint']], T, {}),
            ('Timber', [final['timber'], final['yard_timber']], T, {}),
            ('Gear', [final['gear'], final['yard_gear']], T // 2, {}),
            ('Net', [final['net']], T // 4, dict(alpha=True, metal=False)),
        ):
            print('baking', key)
            B.bake_group(key, objs, size, TEX, **kw)
        sail.hide_render = False
        print('baking Sail')
        B.bake_group('Sail', [sail], T // 2, TEX, metal=False, unwrap_uv=False)
        strip_authoring(flat)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, f'{NAME}_baked.blend'), compress=True)
    B.export_glb(os.path.join(OUT, f'{NAME}_raw.glb'), roots)
    print('DONE', os.path.join(OUT, f'{NAME}_raw.glb'))

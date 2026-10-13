import math
import os
import random

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(v, a=0.0, b=1.0):
    return max(a, min(b, v))


def smoothstep(a, b, v):
    t = clamp((v - a) / (b - a))
    return t * t * (3 - 2 * t)


def G(x, y=None, z=None):
    if y is None:
        x, y, z = x
    return Vector((x, -z, y))


def srgb(h):
    def c(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    return (c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255), 1.0)


def rrect(w, h, r, seg=2):
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    out = []
    for cx, cy, a0 in (
        (w / 2 - r, h / 2 - r, 0),
        (-w / 2 + r, h / 2 - r, 90),
        (-w / 2 + r, -h / 2 + r, 180),
        (w / 2 - r, -h / 2 + r, 270),
    ):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out


def circle(r, n=8, phase=0.0):
    return [(r * math.cos(phase + 2 * math.pi * i / n), r * math.sin(phase + 2 * math.pi * i / n)) for i in range(n)]


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.world = bpy.data.worlds.new('World')
    return sc


def collection(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in (parent or bpy.context.scene.collection).children:
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def link(ob, coll=None):
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def empty(name, loc=(0, 0, 0), coll=None):
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    ob.empty_display_size = 0.3
    return link(ob, coll)


def select_only(objs, active=None):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def mesh_obj(name, verts, faces, uvs=None, coll=None, smooth=True, mat=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        per_loop = len(uvs) == len(faces) and faces and isinstance(uvs[0], list)
        for p in me.polygons:
            for k, li in enumerate(p.loop_indices):
                uvl.data[li].uv = uvs[p.index][k] if per_loop else uvs[me.loops[li].vertex_index]
    if smooth:
        me.shade_smooth()
    ob = link(bpy.data.objects.new(name, me), coll)
    if mat:
        ob.data.materials.append(mat)
    return ob


def grid(name, fn, nu, nv, flip=False, **kw):
    verts, uvs, faces = [], [], []
    for i in range(nu + 1):
        for j in range(nv + 1):
            p, uv = fn(i / nu, j / nv)
            verts.append(p)
            uvs.append(uv)
    for i in range(nu):
        for j in range(nv):
            a = i * (nv + 1) + j
            b, c = a + 1, a + nv + 1
            d = c + 1
            faces.append((a, b, d, c) if flip else (a, c, d, b))
    return mesh_obj(name, verts, faces, uvs, **kw)


def _frames(path, up):
    n = len(path)
    out = []
    for i in range(n):
        t = (path[min(n - 1, i + 1)] - path[max(0, i - 1)]).normalized()
        u = up(i / max(1, n - 1)) if callable(up) else Vector(up)
        u = u - t * u.dot(t)
        if u.length < 1e-6:
            u = out[-1][2] if out else t.orthogonal()
        u.normalize()
        out.append((t, u.cross(t).normalized(), u))
    return out


def sweep(name, path, profile, up=(0, 0, 1), scale=None, caps=True, closed=True, uv_scale=1.0, **kw):
    path = [Vector(p) for p in path]
    fr = _frames(path, up)
    m = len(profile)
    along = [0.0]
    for i in range(1, len(path)):
        along.append(along[-1] + (path[i] - path[i - 1]).length)
    per = [0.0]
    ring = profile + ([profile[0]] if closed else [])
    for i in range(1, len(ring)):
        per.append(per[-1] + math.dist(ring[i], ring[i - 1]))
    verts, faces, uvs = [], [], []
    rn = len(ring)
    for i, (p, (t, s, u)) in enumerate(zip(path, fr)):
        k = scale(along[i] / along[-1]) if scale else 1.0
        for j, (px, py) in enumerate(ring):
            verts.append(p + s * (px * k) + u * (py * k))
            uvs.append((along[i] * uv_scale, per[j] * uv_scale))
    for i in range(len(path) - 1):
        for j in range(rn - 1):
            a = i * rn + j
            faces.append((a, a + 1, a + rn + 1, a + rn))
    face_uvs = [[uvs[v] for v in f] for f in faces]
    if caps and closed:
        for i, rev in ((0, True), (len(path) - 1, False)):
            f = [i * rn + j for j in range(m)]
            f = f[::-1] if rev else f
            faces.append(tuple(f))
            face_uvs.append(
                [
                    ((profile[j % m][0]) * uv_scale + 5, profile[j % m][1] * uv_scale)
                    for j in (range(m)[::-1] if rev else range(m))
                ]
            )
    ob = mesh_obj(name, verts, faces, face_uvs, **kw)
    _fix_normals(ob)
    return ob


def _fix_normals(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()


def lathe(name, profile, steps=24, axis_loc=(0, 0, 0), **kw):
    verts = [Vector((r, 0, h)) for r, h in profile]
    edges = [(i, i + 1) for i in range(len(verts) - 1)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, edges, [])
    ob = link(bpy.data.objects.new(name, me), kw.pop('coll', None))
    ob.location = axis_loc
    sc = ob.modifiers.new('Lathe', 'SCREW')
    sc.axis = 'Z'
    sc.steps = sc.render_steps = steps
    sc.use_merge_vertices = True
    sc.merge_threshold = 1e-4
    sc.use_normal_calculate = True
    sc.use_smooth_shade = True
    if kw.get('mat'):
        ob.data.materials.append(kw['mat'])
    return ob


def curve_obj(
    name,
    points,
    bevel=None,
    depth=0.0,
    res=4,
    tilt=None,
    kind='POLY',
    coll=None,
    mat=None,
    twist='MINIMUM',
    fill_caps=True,
):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.twist_mode = twist
    cu.resolution_u = res
    cu.bevel_resolution = 3
    cu.use_fill_caps = fill_caps
    if bevel is not None:
        cu.bevel_mode = 'OBJECT'
        cu.bevel_object = bevel
    else:
        cu.bevel_depth = depth
    sp = cu.splines.new(kind)
    sp.points.add(len(points) - 1)
    for i, p in enumerate(points):
        sp.points[i].co = (*p, 1.0)
        if tilt is not None:
            sp.points[i].tilt = tilt(i / max(1, len(points) - 1)) if callable(tilt) else tilt
    if kind == 'NURBS':
        sp.use_endpoint_u = True
        sp.order_u = 4
    ob = link(bpy.data.objects.new(name, cu), coll)
    if mat:
        ob.data.materials.append(mat)
    return ob


def profile_obj(name, pts, coll):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    sp.use_cyclic_u = True
    for i, (x, y) in enumerate(pts):
        sp.points[i].co = (x, y, 0, 1)
    ob = link(bpy.data.objects.new(name, cu), coll)
    ob.hide_render = True
    ob.hide_viewport = True
    return ob


def laid_rope_profile(r, strands=3, n=24):
    return [
        (
            (r * (0.78 + 0.22 * math.cos(strands * a))) * math.cos(a),
            (r * (0.78 + 0.22 * math.cos(strands * a))) * math.sin(a),
        )
        for a in (2 * math.pi * i / n for i in range(n))
    ]


def mod(ob, kind, **props):
    m = ob.modifiers.new(kind.title(), kind)
    for k, v in props.items():
        setattr(m, k, v)
    return m


def bevel(ob, width=0.004, segments=2, angle=35, **kw):
    return mod(
        ob,
        'BEVEL',
        width=width,
        segments=segments,
        limit_method='ANGLE',
        angle_limit=math.radians(angle),
        harden_normals=False,
        **kw,
    )


def to_mesh(objs):
    objs = [o for o in objs if o.type in ('MESH', 'CURVE', 'FONT')]
    if not objs:
        return []
    select_only(objs)
    bpy.ops.object.convert(target='MESH')
    return [o for o in bpy.context.selected_objects]


def join(objs, name):
    objs = [o for o in objs if o.type == 'MESH']
    select_only(objs, objs[0])
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    select_only([ob])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def set_color_attr(ob, name, rgba):
    me = ob.data
    a = me.color_attributes.get(name) or me.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
    for d in a.data:
        d.color = rgba


def set_float_attr(ob, name, value):
    me = ob.data
    a = me.attributes.get(name) or me.attributes.new(name, 'FLOAT', 'POINT')
    a.data.foreach_set('value', [float(value)] * len(me.vertices))


def box(name, size, loc, mat=None, coll=None, taper=1.0, rot=None):
    sx, sy, sz = (s / 2 for s in size)
    v = [
        Vector((x * sx * (taper if z > 0 else 1), y * sy * (taper if z > 0 else 1), z * sz))
        for x in (-1, 1)
        for y in (-1, 1)
        for z in (-1, 1)
    ]
    ob = mesh_obj(
        name,
        v,
        [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)],
        coll=coll,
        mat=mat,
        smooth=False,
    )
    _fix_normals(ob)
    ob.location = loc
    if rot:
        ob.rotation_euler = rot
    return ob


def tile_course(
    name, a, ud, sd, nrm, u0, u1, s0, length=0.44, lift=0.05, period=0.36, amp=0.045, per_period=5, coll=None, mat=None
):
    nx = max(2, int((u1 - u0) / period * per_period))
    rows = 3
    verts, faces, uvs = [], [], []
    for i in range(nx + 1):
        u = u0 + (u1 - u0) * i / nx
        ph = 2 * math.pi * (u + period / 4) / period
        wav = amp * math.sin(ph) + amp * 0.27 * math.sin(3 * ph)
        for j in range(rows):
            s = s0 + length * (1 - j / (rows - 1))
            jit = 0.006 * math.sin(u * 23.1 + s0 * 15.7)
            verts.append(a + ud * u + sd * s + nrm * (lift + wav + jit + (0.018 if j == 0 else 0) - 0.01 * j))
            uvs.append((u, s))
        verts.append(verts[-rows] - nrm * 0.022)
        uvs.append((u, s0 - 0.02))
    rr = rows + 1
    for i in range(nx):
        for j in range(rows - 1):
            q = i * rr + j
            faces.append((q, q + rr, q + rr + 1, q + 1))
        q = i * rr
        faces.append((q + rows, q + rows + rr, q + rr, q))
    ob = mesh_obj(name, verts, faces, uvs, coll=coll, mat=mat)
    _fix_normals(ob)
    if sum(p.normal.dot(nrm) for p in ob.data.polygons) < 0:
        ob.data.flip_normals()
    return ob


def set_grain(ob, seed):
    me = ob.data
    n = len(me.vertices)
    if n < 3:
        return
    P = np.empty(n * 3)
    me.vertices.foreach_get('co', P)
    P = P.reshape(-1, 3)
    P = (np.array(ob.matrix_world)[:3, :3] @ P.T).T
    c = P.mean(0)
    w, v = np.linalg.eigh(np.cov((P - c).T))
    axes = v[:, ::-1]
    rnd = random.Random(seed)
    off = np.array([rnd.uniform(-5, 5), rnd.uniform(-5, 5), rnd.uniform(-5, 5)])
    g = (P - c) @ axes + off
    a = me.attributes.get('grain') or me.attributes.new('grain', 'FLOAT_VECTOR', 'POINT')
    a.data.foreach_set('vector', g.astype(np.float32).ravel())


class NB:
    def __init__(self, mat):
        mat.use_nodes = True
        self.mat, self.nt = mat, mat.node_tree
        self.nt.nodes.clear()
        self.x = 0
        self.out = self.node('ShaderNodeOutputMaterial')
        self.bsdf = self.node('ShaderNodeBsdfPrincipled')
        self.link(self.bsdf.outputs[0], self.out.inputs['Surface'])
        self.sockets = {}

    def node(self, kind, **props):
        n = self.nt.nodes.new(kind)
        n.location = (self.x, 0)
        self.x -= 40
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def _in(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.link(v, sock)
        elif v is not None:
            sock.default_value = v

    def coord(self, kind='Object'):
        return self.node('ShaderNodeTexCoord').outputs[kind]

    def attr(self, name, out='Vector'):
        n = self.node('ShaderNodeAttribute')
        n.attribute_name = name
        return n.outputs[out]

    def geo(self, out):
        return self.node('ShaderNodeNewGeometry').outputs[out]

    def sep(self, v):
        n = self.node('ShaderNodeSeparateXYZ')
        self._in(n.inputs[0], v)
        return n.outputs

    def comb(self, x, y, z):
        n = self.node('ShaderNodeCombineXYZ')
        [self._in(n.inputs[i], c) for i, c in enumerate((x, y, z))]
        return n.outputs[0]

    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            self._in(n.inputs[i], v)
        return n.outputs[0]

    def add(self, a, b, **k):
        return self.math('ADD', a, b, **k)

    def mul(self, a, b, **k):
        return self.math('MULTIPLY', a, b, **k)

    def sub(self, a, b, **k):
        return self.math('SUBTRACT', a, b, **k)

    def vmath(self, op, a, b=None, out=0):
        n = self.node('ShaderNodeVectorMath', operation=op)
        for i, v in enumerate((a, b)):
            self._in(n.inputs[i], v)
        return n.outputs[out]

    def vscale(self, v, s):
        return self.vmath('MULTIPLY', v, s)

    def smooth(self, a, b, x):
        n = self.node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP')
        self._in(n.inputs['Value'], x)
        n.inputs['From Min'].default_value = a
        n.inputs['From Max'].default_value = b
        return n.outputs['Result']

    def remap(self, x, a, b, c=0.0, d=1.0, clamp=True):
        n = self.node('ShaderNodeMapRange', clamp=clamp)
        self._in(n.inputs['Value'], x)
        for k, v in zip(('From Min', 'From Max', 'To Min', 'To Max'), (a, b, c, d)):
            n.inputs[k].default_value = v
        return n.outputs['Result']

    def mix(self, fac, a, b, blend='MIX'):
        n = self.node('ShaderNodeMix', data_type='RGBA', blend_type=blend, clamp_factor=True)
        self._in(n.inputs['Factor'], fac)
        self._in(n.inputs[6], a)
        self._in(n.inputs[7], b)
        return n.outputs[2]

    def mixf(self, fac, a, b):
        n = self.node('ShaderNodeMix', data_type='FLOAT', clamp_factor=True)
        self._in(n.inputs['Factor'], fac)
        self._in(n.inputs[2], a)
        self._in(n.inputs[3], b)
        return n.outputs[0]

    def hsv(self, col, h=0.5, s=1.0, v=1.0):
        n = self.node('ShaderNodeHueSaturation')
        self._in(n.inputs['Color'], col)
        self._in(n.inputs['Hue'], h)
        self._in(n.inputs['Saturation'], s)
        self._in(n.inputs['Value'], v)
        return n.outputs[0]

    def noise(self, vec, scale=1.0, detail=4.0, rough=0.5, dist=0.0, out='Fac', dims='3D', w=None):
        n = self.node('ShaderNodeTexNoise', noise_dimensions=dims)
        self._in(n.inputs['Vector'], vec)
        for k, v in (('Scale', scale), ('Detail', detail), ('Roughness', rough), ('Distortion', dist), ('W', w)):
            if v is not None:
                self._in(n.inputs[k], v)
        return n.outputs[out]

    def voronoi(self, vec, scale=1.0, feature='F1', out='Distance', rand=1.0, metric='EUCLIDEAN'):
        n = self.node('ShaderNodeTexVoronoi', feature=feature, distance=metric)
        self._in(n.inputs['Vector'], vec)
        self._in(n.inputs['Scale'], scale)
        self._in(n.inputs['Randomness'], rand)
        return n.outputs[out]

    def wave(self, vec, scale=1.0, dist=0.0, detail=2.0, kind='BANDS', axis='X', profile='SIN'):
        n = self.node('ShaderNodeTexWave', wave_type=kind, bands_direction=axis, wave_profile=profile)
        self._in(n.inputs['Vector'], vec)
        self._in(n.inputs['Scale'], scale)
        self._in(n.inputs['Distortion'], dist)
        self._in(n.inputs['Detail'], detail)
        return n.outputs['Fac']

    def ramp(self, fac, stops):
        n = self.node('ShaderNodeValToRGB')
        self._in(n.inputs[0], fac)
        el = n.color_ramp.elements
        while len(el) < len(stops):
            el.new(0.5)
        for e, (p, c) in zip(el, stops):
            e.position = p
            e.color = c if len(c) == 4 else (*c, 1)
        return n.outputs[0]

    def ao(self, dist=0.1, samples=16, inside=False, out='AO'):
        n = self.node('ShaderNodeAmbientOcclusion', samples=samples, inside=inside)
        n.inputs['Distance'].default_value = dist
        return n.outputs[out]

    def edges(self, radius=0.006):
        bv = self.node('ShaderNodeBevel', samples=8)
        bv.inputs['Radius'].default_value = radius
        d = self.vmath('DOT_PRODUCT', bv.outputs[0], self.geo('Normal'), out=1)
        return self.remap(d, 0.995, 0.9)

    def bump(self, h, strength=0.3, distance=0.01, normal=None):
        n = self.node('ShaderNodeBump')
        self._in(n.inputs['Height'], h)
        n.inputs['Strength'].default_value = strength
        n.inputs['Distance'].default_value = distance
        if normal is not None:
            self._in(n.inputs['Normal'], normal)
        return n.outputs[0]

    def finish(self, color, rough, metal=0.0, normal=None, alpha=None, emission=None, emission_strength=0.0):
        b = self.bsdf.inputs
        self._in(b['Base Color'], color)
        self._in(b['Roughness'], rough)
        self._in(b['Metallic'], metal)
        if normal is not None:
            self._in(b['Normal'], normal)
        if alpha is not None:
            self._in(b['Alpha'], alpha)
        if emission is not None:
            self._in(b['Emission Color'], emission)
            b['Emission Strength'].default_value = emission_strength
        self.sockets = dict(metal=metal, alpha=alpha)
        _CHANNELS[self.mat.name] = self.sockets
        return self.mat


_CHANNELS = {}


def material(name, build):
    m = bpy.data.materials.new(name)
    nb = NB(m)
    build(nb)
    return m


def setup_cycles(samples=16, gpu=True):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    if gpu:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        try:
            prefs.compute_device_type = 'METAL'
            prefs.get_devices()
            for d in prefs.devices:
                d.use = d.type == 'METAL'
            sc.cycles.device = 'GPU'
        except Exception as e:
            print('Cycles GPU unavailable, using CPU:', e)
            sc.cycles.device = 'CPU'
    return sc


def unwrap(objs, margin=0.004, angle=60):
    objs = [o for o in objs if o.type == 'MESH']
    for o in objs:
        uv = o.data.uv_layers.get('UVMap') or o.data.uv_layers.new(name='UVMap')
        o.data.uv_layers.active = uv
        uv.active_render = True
    for o in objs:
        k = o.data.attributes.get('keepuv')
        flags = [False] * len(o.data.polygons)
        if k:
            k.data.foreach_get('value', flags)
        o.data.polygons.foreach_set('select', [not f for f in flags])
    select_only(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(angle),
        island_margin=margin,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, rotate_method='ANY', margin=margin, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')


def _bake(objs, mats, img, kind, pass_filter=None, channel=None, margin=16):
    sc = bpy.context.scene
    bk = sc.render.bake
    restore = []
    for m in mats:
        nt = m.node_tree
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        nt.nodes.active = n
        restore.append((m, n))
        if channel:
            out = next(x for x in nt.nodes if x.type == 'OUTPUT_MATERIAL')
            old = out.inputs['Surface'].links[0].from_socket
            em = nt.nodes.new('ShaderNodeEmission')
            v = _CHANNELS.get(m.name, {}).get(channel)
            v = 1.0 if (v is None and channel == 'alpha') else (0.0 if v is None else v)
            if isinstance(v, bpy.types.NodeSocket):
                nt.links.new(v, em.inputs['Color'])
            else:
                em.inputs['Color'].default_value = (v, v, v, 1)
            nt.links.new(em.outputs[0], out.inputs['Surface'])
            restore.append((m, em, old, out))
    select_only(objs)
    bk.margin = margin
    bk.use_clear = True
    bk.target = 'IMAGE_TEXTURES'
    if pass_filter is not None:
        bk.use_pass_direct = 'DIRECT' in pass_filter
        bk.use_pass_indirect = 'INDIRECT' in pass_filter
        bk.use_pass_color = 'COLOR' in pass_filter
    bpy.ops.object.bake(type=kind)
    for r in restore:
        if len(r) == 2:
            r[0].node_tree.nodes.remove(r[1])
        else:
            m, em, old, out = r
            m.node_tree.links.new(old, out.inputs['Surface'])
            m.node_tree.nodes.remove(em)


def _image(name, size, non_color, alpha=False):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, size, size, alpha=alpha, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color' if non_color else 'sRGB'
    return img


def _blur(a, r=2):
    k = 2 * r + 1
    for ax in (0, 1):
        p = np.pad(a, [(r, r) if i == ax else (0, 0) for i in (0, 1)], mode='edge')
        c = np.cumsum(p, axis=ax, dtype=np.float64)
        c = np.concatenate([np.zeros_like(np.take(c, [0], axis=ax)), c], axis=ax)
        a = ((np.take(c, range(k, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - k), axis=ax)) / k).astype(
            np.float32
        )
    return a


def _px(img):
    a = np.empty(len(img.pixels), np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(-1, 4)


def bake_group(name, objs, size, tex_dir, alpha=False, metal=True, ao_dist=0.25, unwrap_uv=True):
    objs = [o for o in objs if o.type == 'MESH']
    if unwrap_uv:
        unwrap(objs)
    mats = list({s.material for o in objs for s in o.material_slots if s.material})
    sc = bpy.context.scene
    sc.world.light_settings.distance = ao_dist
    col = _image(f'{name}_col', size, False)
    rough = _image(f'{name}_rough', size, True)
    nrm = _image(f'{name}_nrm', size, True)
    ao = _image(f'{name}_ao', size, True)
    met = _image(f'{name}_met', size, True)
    alp = _image(f'{name}_alpha', size, True)
    sc.cycles.samples = 4
    _bake(objs, mats, col, 'DIFFUSE', {'COLOR'})
    _bake(objs, mats, rough, 'ROUGHNESS')
    _bake(objs, mats, nrm, 'NORMAL')
    if metal:
        _bake(objs, mats, met, 'EMIT', channel='metal')
    if alpha:
        _bake(objs, mats, alp, 'EMIT', channel='alpha')
    sc.cycles.samples = 64
    _bake(objs, mats, ao, 'AO')
    c = _px(col)
    if alpha:
        c[:, 3] = _px(alp)[:, 0]
    base = _image(f'{name}_baseColor', size, False, alpha=alpha)
    base.pixels.foreach_set(c.ravel())
    orm = _image(f'{name}_orm', size, True)
    o = np.ones((size * size, 4), np.float32)
    o[:, 0] = _blur(_px(ao)[:, 0].reshape(size, size)).ravel()
    o[:, 1] = _px(rough)[:, 0]
    o[:, 2] = _px(met)[:, 0] if metal else 0
    orm.pixels.foreach_set(o.ravel())
    os.makedirs(tex_dir, exist_ok=True)
    for img in (base, orm, nrm):
        img.filepath_raw = os.path.join(tex_dir, f'{img.name}.png')
        img.file_format = 'PNG'
        img.save()
    for img in (col, rough, ao, met, alp):
        bpy.data.images.remove(img)
    m = baked_material(name, base, orm, nrm, alpha=alpha)
    for ob in objs:
        ob.data.materials.clear()
        ob.data.materials.append(m)
    return m


def _gltf_output_group():
    g = bpy.data.node_groups.get('glTF Material Output')
    if g:
        return g
    g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    g.nodes.new('NodeGroupInput')
    return g


def baked_material(name, base, orm, nrm, alpha=False, double=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], out.inputs[0])
    tb = nt.nodes.new('ShaderNodeTexImage')
    tb.image = base
    nt.links.new(tb.outputs['Color'], b.inputs['Base Color'])
    to = nt.nodes.new('ShaderNodeTexImage')
    to.image = orm
    sp = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(to.outputs['Color'], sp.inputs[0])
    nt.links.new(sp.outputs['Green'], b.inputs['Roughness'])
    nt.links.new(sp.outputs['Blue'], b.inputs['Metallic'])
    gg = nt.nodes.new('ShaderNodeGroup')
    gg.node_tree = _gltf_output_group()
    nt.links.new(sp.outputs['Red'], gg.inputs['Occlusion'])
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = nrm
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs[0], b.inputs['Normal'])
    if alpha:
        rnd = nt.nodes.new('ShaderNodeMath')
        rnd.operation = 'ROUND'
        nt.links.new(tb.outputs['Alpha'], rnd.inputs[0])
        nt.links.new(rnd.outputs[0], b.inputs['Alpha'])
        m.surface_render_method = 'DITHERED'
        m.use_backface_culling = False
    else:
        m.use_backface_culling = True if double is None else not double
    return m


def export_glb(path, roots):
    objs = []
    for r in roots:
        objs.append(r)
        objs.extend(r.children_recursive)
    select_only(objs)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_image_format='AUTO',
        export_tangents=False,
        export_vertex_color='NONE',
        export_attributes=False,
        export_extras=False,
        export_cameras=False,
        export_lights=False,
    )

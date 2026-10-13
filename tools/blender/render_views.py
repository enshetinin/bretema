import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--out', required=True)
ap.add_argument('--samples', type=int, default=64)
ap.add_argument('--views', default='')
ap.add_argument('--size', default='1280x720')
ap.add_argument('--no-sea', action='store_true')
ap.add_argument('--set', default='player')
A = ap.parse_args(argv)
W, H = map(int, A.size.split('x'))

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = A.samples
sc.cycles.use_denoising = True
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == 'METAL'
    sc.cycles.device = 'GPU'
except Exception:
    pass
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = -0.7
for o in bpy.data.objects:
    o.hide_render = o.hide_render and o.type != 'MESH'

world = sc.world or bpy.data.worlds.new('World')
sc.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
sky = nt.nodes.new('ShaderNodeTexSky')
for k, v in (('sky_type', 'NISHITA'), ('sky_type', 'MULTIPLE_SCATTERING')):
    try:
        sky.sky_type = v
    except TypeError:
        pass
sky.sun_elevation = math.radians(16)
sky.sun_rotation = math.radians(215)
if hasattr(sky, 'air_density'):
    sky.air_density = 1.2
if hasattr(sky, 'aerosol_density'):
    sky.aerosol_density = 3.0
bg = nt.nodes.new('ShaderNodeBackground')
bg.inputs['Strength'].default_value = 0.35
out = nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(sky.outputs[0], bg.inputs[0])
nt.links.new(bg.outputs[0], out.inputs[0])

sun_d = bpy.data.lights.new('Sun', 'SUN')
sun_d.energy = 3.2
sun_d.angle = math.radians(1.5)
sun_d.color = (1, 0.9, 0.78)
sun = bpy.data.objects.new('Sun', sun_d)
sc.collection.objects.link(sun)
sun.rotation_euler = (math.radians(90 - 16), 0, math.radians(215 + 180))
fill_d = bpy.data.lights.new('Fill', 'AREA')
fill_d.energy = 300
fill_d.size = 6
fill_d.color = (0.75, 0.85, 1)
fill = bpy.data.objects.new('Fill', fill_d)
sc.collection.objects.link(fill)
fill.location = (6, -6, 5)
fill.rotation_euler = (Vector((0, 0, 0)) - fill.location).to_track_quat('-Z', 'Y').to_euler()

if A.set in ('horreo', 'faro'):
    A.no_sea = True
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    gnd = bpy.context.active_object
    gm = bpy.data.materials.new('Ground')
    gm.use_nodes = True
    gn = gm.node_tree.nodes
    gl = gm.node_tree.links
    nz = gn.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 3
    rp = gn.new('ShaderNodeValToRGB')
    rp.color_ramp.elements[0].color = (0.06, 0.1, 0.03, 1)
    rp.color_ramp.elements[1].color = (0.16, 0.2, 0.06, 1)
    gl.new(nz.outputs['Fac'], rp.inputs[0])
    gl.new(rp.outputs[0], gn['Principled BSDF'].inputs['Base Color'])
    gn['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    gnd.data.materials.append(gm)
if not A.no_sea:
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0 if A.set == 'batea' else -0.2))
    sea = bpy.context.active_object
    sea.name = 'Sea'
    m = bpy.data.materials.new('Sea')
    m.use_nodes = True
    n = m.node_tree.nodes
    l = m.node_tree.links
    b = n['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.01, 0.045, 0.05, 1)
    b.inputs['Roughness'].default_value = 0.08
    b.inputs['Transmission Weight'].default_value = 0.0
    b.inputs['Specular IOR Level'].default_value = 0.5
    tc = n.new('ShaderNodeTexCoord')
    w1 = n.new('ShaderNodeTexWave')
    w1.inputs['Scale'].default_value = 0.35
    w1.inputs['Distortion'].default_value = 6
    nz = n.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 2.5
    nz.inputs['Detail'].default_value = 8
    mx = n.new('ShaderNodeMath')
    mx.operation = 'ADD'
    bump = n.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.25
    bump.inputs['Distance'].default_value = 0.2
    l.new(tc.outputs['Object'], w1.inputs['Vector'])
    l.new(tc.outputs['Object'], nz.inputs['Vector'])
    l.new(w1.outputs['Fac'], mx.inputs[0])
    l.new(nz.outputs['Fac'], mx.inputs[1])
    l.new(mx.outputs[0], bump.inputs['Height'])
    l.new(bump.outputs[0], b.inputs['Normal'])
    sea.data.materials.append(m)

cam_d = bpy.data.cameras.new('Cam')
cam = bpy.data.objects.new('Cam', cam_d)
sc.collection.objects.link(cam)
sc.camera = cam
cam_d.sensor_width = 36
VIEWS = {
    'hero_bow': ((-6.4, 7.2, 2.1), (0, 0.4, 1.6), 50),
    'stern_quarter': ((5.8, -7.0, 2.6), (0, -0.2, 1.5), 50),
    'profile': ((-11.5, 0.3, 1.2), (0, 0.3, 2.2), 45),
    'interior': ((2.6, -4.2, 4.6), (0, -0.1, 0.0), 32),
    'bow_detail': ((-2.4, 4.6, 1.1), (0, 2.6, 0.8), 60),
    'low_water': ((3.6, 5.2, 0.15), (0, 0.6, 0.9), 35),
}
if A.set == 'moored':
    VIEWS = {
        'harbour': ((-9.5, 12.5, 4.2), (0, 0, 0.6), 40),
        'harbour_aft': ((10.0, -11.0, 3.4), (0, 0, 0.6), 40),
        'moored_close': ((-4.4, 5.2, 2.6), (-1.8, 0.6, 0.4), 45),
    }
if A.set == 'horreo':
    VIEWS = {
        'three_quarter': ((7.5, -8.0, 3.2), (0, 0, 2.6), 40),
        'side': ((0.5, -11.0, 2.2), (0, 0, 2.6), 40),
        'gable': ((-9.0, -2.5, 4.0), (0, 0, 2.8), 45),
        'roof_detail': ((3.2, -3.8, 5.6), (1.0, 0, 4.2), 50),
        'piers': ((2.8, -4.2, 1.0), (0, 0, 1.6), 30),
    }
if A.set == 'batea':
    VIEWS = {
        'raft': ((-12.0, 13.0, 6.0), (0, 0, 0.4), 35),
        'raft_low': ((11.0, -9.0, 1.4), (0, 0, 0.8), 35),
        'raft_deck': ((7.5, -8.5, 4.0), (2.6, -2.6, 1.2), 40),
    }
if A.set == 'faro':
    VIEWS = {
        'sea_front': ((10.0, -26.0, 7.0), (0, -1.0, 9.0), 40),
        'landward': ((-18.0, 16.0, 9.0), (-1.0, 3.0, 6.0), 40),
        'lantern': ((3.8, -7.5, 18.0), (0, 0, 16.6), 45),
        'house': ((9.0, 12.0, 4.0), (0, 4.0, 3.5), 35),
        'far': ((34.0, -60.0, 14.0), (0, 0, 8.0), 50),
    }
os.makedirs(A.out, exist_ok=True)
for name, (loc, at, f) in VIEWS.items():
    if A.views and name not in A.views.split(','):
        continue
    cam.location = loc
    cam_d.lens = f
    cam.rotation_euler = (Vector(at) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(A.out, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath)

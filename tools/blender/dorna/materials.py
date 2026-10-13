import bretema_bpy as B
from bretema_bpy import srgb

WL = -0.13


def _wood_layers(nb, light=0xA0815C, dark=0x6E5038, weather=0.55):
    g = nb.attr('grain')
    warp = nb.vscale(nb.noise(g, 0.35, 3, 0.5, out='Color'), (0.0, 0.08, 0.08))
    gw = nb.vmath('ADD', g, warp)
    rings = nb.wave(nb.vscale(gw, (0.06, 1.0, 1.0)), 9.0, 6.0, 3.0, 'BANDS', 'Y', 'SAW')
    fibre = nb.noise(nb.vscale(g, (1.5, 60, 60)), 1.0, 3, 0.6)
    knots = nb.sub(1.0, nb.smooth(0.0, 0.06, nb.voronoi(nb.vscale(g, (0.9, 4, 4)), 1.0, rand=0.9)))
    knots = nb.mul(
        knots, nb.math('GREATER_THAN', nb.voronoi(nb.vscale(g, (0.9, 4, 4)), 1.0, out='Color', rand=0.9), 0.82)
    )
    t = nb.add(nb.add(nb.mul(rings, 0.45), nb.mul(fibre, 0.35)), nb.mul(knots, 0.8), clamp=True)
    col = nb.mix(t, srgb(light), srgb(dark))
    up = nb.sep(nb.geo('Normal'))[2]
    wz = nb.mul(nb.mul(nb.smooth(-0.1, 0.8, up), weather), nb.noise(g, 1.2, 4))
    col = nb.mix(nb.mul(wz, 0.9), col, srgb(0x8D877C))
    z = nb.sep(nb.coord('Object'))[2]
    stain = nb.mul(nb.sub(1.0, nb.smooth(-0.32, -0.12, z)), nb.smooth(0.35, 0.7, nb.noise(nb.coord('Object'), 3.0, 5)))
    col = nb.mix(nb.mul(stain, 0.55), col, srgb(0x3E3024))
    rough = nb.add(0.58, nb.add(nb.mul(wz, 0.25), nb.mul(fibre, 0.12)))
    h = nb.add(nb.mul(rings, 0.25), nb.add(nb.mul(fibre, 0.5), nb.mul(wz, 0.3)))
    return col, rough, h


def wood(name, light=0xA0815C, dark=0x6E5038, weather=0.55):
    def build(nb):
        col, rough, h = _wood_layers(nb, light, dark, weather)
        ao = nb.ao(0.05)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.5), col, srgb(0x2B2118))
        nb.finish(col, rough, 0.0, nb.bump(h, 0.35, 0.003))

    return B.material(name, build)


def interior_paint(name='InteriorPaint', base=0xCDBF9A):
    def build(nb):
        P = nb.coord('Object')
        wcol, wrough, wh = _wood_layers(nb, 0x8F7353, 0x5E4430, 0.3)
        up = nb.sep(nb.geo('Normal'))[2]
        edge = nb.edges(0.01)
        wear = nb.add(nb.noise(P, 4.0, 8, 0.62), nb.add(nb.mul(edge, 0.25), nb.mul(nb.smooth(0.6, 1.0, up), 0.12)))
        wear = nb.add(wear, nb.mul(nb.sub(nb.noise(P, 45.0, 2), 0.5), 0.08))
        chip = nb.smooth(0.62, 0.64, wear)
        paint = nb.mix(nb.mul(nb.noise(P, 1.5, 3), 0.25), srgb(base), srgb(0xB8A780))
        col = nb.mix(chip, paint, wcol)
        ao = nb.ao(0.08)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.7), col, srgb(0x4A3A28))
        rough = nb.mixf(chip, 0.5, wrough)
        h = nb.add(nb.mul(nb.sub(1.0, chip), 0.4), nb.mul(wh, chip))
        nb.finish(col, rough, 0.0, nb.bump(nb.add(h, nb.mul(nb.noise(P, 250.0, 2), 0.05)), 0.3, 0.002))

    return B.material(name, build)


def hull_paint(decals, pins, name='HullPaint'):
    def build(nb):
        P0 = nb.coord('Object')
        x, y, z = nb.sep(P0)
        P = nb.vmath('ADD', P0, nb.comb(nb.mul(nb.attr('seed', 'Fac'), 17.3), nb.mul(nb.attr('seed', 'Fac'), 9.1), 0.0))
        paint = nb.attr('Paint', 'Color')
        zw = nb.add(z, nb.mul(nb.sub(nb.noise(P, 1.2, 2), 0.5), 0.014))
        below = nb.math('LESS_THAN', zw, WL)
        boot = nb.mul(nb.math('GREATER_THAN', zw, WL), nb.math('LESS_THAN', zw, WL + 0.04))
        col = nb.mix(boot, paint, srgb(0xE6E0CF))
        col = nb.mix(below, col, srgb(0x6B2A1E))
        for d in decals:
            u = nb.add(nb.math('DIVIDE', nb.mul(nb.sub(y, d['y']), nb.math('SIGN', x)), d['w']), 0.5)
            v = nb.add(nb.math('DIVIDE', nb.sub(z, d['z']), d['h']), 0.5)
            tx = nb.node('ShaderNodeTexImage', extension='CLIP')
            tx.image = d['image']
            nb.link(nb.comb(u, v, 0.0), tx.inputs[0])
            a = nb.mul(tx.outputs['Alpha'], nb.math('GREATER_THAN', nb.math('ABSOLUTE', x), 0.05))
            col = nb.mix(a, col, srgb(d['color']))
        up = nb.sep(nb.geo('Normal'))[2]
        fade = nb.mul(nb.smooth(-0.3, 1.0, up), nb.smooth(0.3, 0.8, nb.noise(P, 1.8, 3)))
        col = nb.mix(nb.mul(fade, 0.3), col, nb.hsv(col, 0.5, 0.8, 1.12))
        edge = nb.edges(0.006)
        topwear = nb.mul(nb.smooth(0.75, 1.1, z), 0.12)
        wear = nb.add(nb.noise(P, 7.5, 10, 0.68), nb.add(nb.mul(edge, 0.4), topwear))
        wear = nb.add(wear, nb.mul(nb.sub(nb.noise(P, 60.0, 3), 0.5), 0.12))
        chip1 = nb.smooth(0.655, 0.665, wear)
        chip2 = nb.smooth(0.705, 0.712, nb.add(wear, nb.mul(nb.noise(P, 14.0, 3), 0.04)))
        under = nb.mix(below, srgb(0x7D8C7B), srgb(0x8C4A36))
        grain = nb.noise(nb.vscale(P, (40, 2.0, 40)), 1.0, 4, 0.6)
        bare = nb.mix(grain, srgb(0x857461), srgb(0x5E5042))
        col = nb.mix(chip1, col, under)
        col = nb.mix(chip2, col, bare)
        streak = nb.mul(
            nb.smooth(0.55, 0.8, nb.noise(nb.vscale(P, (28, 28, 1.1)), 1.0, 4, 0.5)), nb.smooth(-0.05, 0.9, z)
        )
        col = nb.mix(nb.mul(streak, 0.32), col, srgb(0x3A3127))
        rust = 0.0
        for py, pz in pins:
            dy = nb.math('ABSOLUTE', nb.add(nb.sub(y, py), nb.mul(nb.sub(nb.noise(P, 6.0, 2), 0.5), 0.03)))
            r = nb.mul(
                nb.sub(1.0, nb.smooth(0.0, 0.035, dy)),
                nb.mul(nb.smooth(pz - 0.55, pz - 0.06, z), nb.sub(1.0, nb.smooth(pz - 0.04, pz, z))),
            )
            rust = nb.add(rust, r)
        col = nb.mix(nb.mul(rust, 0.55), col, srgb(0x7A3F1C))
        band = nb.mul(
            nb.sub(1.0, nb.smooth(0.0, 0.09, nb.math('ABSOLUTE', nb.sub(zw, WL + 0.01)))),
            nb.smooth(0.35, 0.65, nb.noise(P, 5.0, 4)),
        )
        col = nb.mix(nb.mul(band, 0.7), col, srgb(0x4B5034))
        salt = nb.mul(
            nb.smooth(0.62, 0.7, nb.noise(P, 70.0, 2)),
            nb.mul(nb.smooth(WL, WL + 0.05, zw), nb.sub(1.0, nb.smooth(WL + 0.08, WL + 0.2, zw))),
        )
        col = nb.mix(nb.mul(salt, 0.7), col, srgb(0xDEDBD0))
        deep = nb.sub(1.0, nb.smooth(WL - 0.3, WL - 0.04, zw))
        bloom = nb.mul(deep, nb.smooth(0.45, 0.75, nb.noise(P, 2.5, 5)))
        col = nb.mix(nb.mul(bloom, 0.35), col, srgb(0x9B7A68))
        barn = nb.mul(
            nb.sub(1.0, nb.smooth(0.0, 0.16, nb.voronoi(P, 70.0))),
            nb.mul(deep, nb.smooth(0.55, 0.7, nb.noise(P, 4.0, 3))),
        )
        col = nb.mix(barn, col, srgb(0xC2BCAE))
        ao = nb.ao(0.05)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.6), col, srgb(0x2C241C))
        rough = nb.mixf(below, nb.add(0.36, nb.mul(fade, 0.2)), 0.72)
        rough = nb.mixf(chip1, rough, 0.55)
        rough = nb.mixf(chip2, rough, 0.82)
        rough = nb.add(rough, nb.add(nb.mul(streak, 0.1), nb.mul(barn, 0.2)))
        brush = nb.noise(nb.vscale(P, (70, 3.0, 70)), 1.0, 3, 0.5)
        h = nb.add(nb.mul(brush, 0.12), nb.mul(nb.noise(P, 320.0, 2), 0.04))
        h = nb.add(h, nb.add(nb.mul(nb.sub(1.0, chip1), 0.35), nb.mul(nb.sub(1.0, chip2), 0.35)))
        h = nb.add(h, nb.add(nb.mul(grain, nb.mul(chip2, 0.3)), nb.mul(barn, 0.9)))
        nb.finish(col, rough, 0.0, nb.bump(h, 0.4, 0.002))

    return B.material(name, build)


def bronze(name='Bronze'):
    def build(nb):
        P = nb.coord('Object')
        ao = nb.ao(0.03)
        patina = nb.add(nb.mul(nb.sub(1.0, ao), 0.9), nb.mul(nb.noise(P, 18.0, 5), 0.5))
        v = nb.smooth(0.55, 0.75, patina)
        col = nb.mix(v, nb.mix(nb.noise(P, 30.0, 3), srgb(0xA77A43), srgb(0x6E5230)), srgb(0x4F8F7C))
        nb.finish(
            col,
            nb.mixf(v, nb.add(0.32, nb.mul(nb.noise(P, 60.0, 2), 0.2)), 0.8),
            nb.mixf(v, 1.0, 0.0),
            nb.bump(nb.mul(v, 0.5), 0.2, 0.002),
        )

    return B.material(name, build)


def iron(name='Iron'):
    def build(nb):
        P = nb.coord('Object')
        ao = nb.ao(0.04)
        r = nb.smooth(0.42, 0.62, nb.add(nb.noise(P, 9.0, 6, 0.6), nb.mul(nb.sub(1.0, ao), 0.4)))
        col = nb.mix(r, srgb(0x5D5F60), nb.mix(nb.noise(P, 40.0, 3), srgb(0x7A3A18), srgb(0x4A2410)))
        nb.finish(
            col,
            nb.mixf(r, 0.45, 0.92),
            nb.mixf(r, 0.9, 0.0),
            nb.bump(nb.add(nb.mul(r, 0.6), nb.mul(nb.noise(P, 120.0, 3), 0.3)), 0.45, 0.002),
        )

    return B.material(name, build)


def rope(name, light=0xB3966A, dark=0x7D6444):
    def build(nb):
        uv = nb.node('ShaderNodeUVMap', uv_map='metric').outputs[0]
        u, v, _ = nb.sep(uv)
        phase = nb.math('FRACT', nb.math('DIVIDE', nb.add(v, nb.mul(u, 0.62)), 0.021))
        strand = nb.math('SINE', nb.mul(phase, 3.14159))
        strand = nb.math('POWER', strand, 0.6)
        P = nb.coord('Object')
        fibre = nb.noise(nb.vscale(nb.comb(u, v, 0.0), (900, 300, 1)), 1.0, 2, 0.6)
        col = nb.mix(nb.add(nb.mul(nb.sub(1.0, strand), 0.6), nb.mul(fibre, 0.3)), srgb(light), srgb(dark))
        col = nb.mix(nb.mul(nb.smooth(0.55, 0.8, nb.noise(P, 6.0, 4)), 0.5), col, srgb(0x4A3B2A))
        nb.finish(col, 0.9, 0.0, nb.bump(nb.add(strand, nb.mul(fibre, 0.25)), 0.55, 0.004))

    return B.material(name, build)


def wicker(name='Wicker'):
    def build(nb):
        P = nb.coord('Object')
        n = nb.noise(P, 60.0, 4, 0.6)
        col = nb.mix(n, srgb(0xA98A58), srgb(0x6F5634))
        ao = nb.ao(0.04)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.6), col, srgb(0x2A2016))
        nb.finish(col, 0.75, 0.0, nb.bump(n, 0.3, 0.002))

    return B.material(name, build)


def cork(name='Cork'):
    def build(nb):
        P = nb.coord('Object')
        pores = nb.smooth(0.0, 0.25, nb.voronoi(P, 140.0))
        col = nb.mix(nb.mul(nb.noise(P, 25.0, 3), 0.7), srgb(0xC58A52), srgb(0x8C5A32))
        col = nb.mix(nb.sub(1.0, pores), col, srgb(0x4A2C18))
        nb.finish(col, 0.85, 0.0, nb.bump(pores, 0.5, 0.002))

    return B.material(name, build)


def flat(name, color, rough=0.6, metal=0.0, noise=0.15):
    def build(nb):
        P = nb.coord('Object')
        n = nb.noise(P, 20.0, 4)
        col = nb.mix(nb.mul(n, noise), srgb(color), srgb(0x1A1612))
        ao = nb.ao(0.04)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.5), col, srgb(0x110E0B))
        nb.finish(col, nb.add(rough, nb.mul(n, 0.15)), metal, nb.bump(n, 0.15, 0.002))

    return B.material(name, build)


def net(name='Net', color=0x2F5A46):
    def build(nb):
        P = nb.coord('Object')
        x, y, z = nb.sep(P)
        s = 0.036

        def fam(a):
            q = nb.math('DIVIDE', a, s)
            d = nb.math('ABSOLUTE', nb.sub(nb.math('FRACT', q), 0.5))
            return nb.smooth(0.37, 0.41, d)

        t = nb.math('MAXIMUM', fam(nb.add(nb.add(x, y), nb.mul(z, 0.7))), fam(nb.add(nb.sub(x, y), nb.mul(z, 0.7))))
        col = nb.mix(nb.mul(nb.noise(P, 4.0, 3), 0.6), srgb(color), srgb(0x6D6A4A))
        nb.finish(col, 0.8, 0.0, None, alpha=t)

    return B.material(name, build)


def canvas(name='Sail'):
    def build(nb):
        uv = nb.node('ShaderNodeUVMap', uv_map='UVMap').outputs[0]
        u, v, _ = nb.sep(uv)

        def line(c, w, a):
            return nb.sub(1.0, nb.smooth(w * 0.5, w, nb.math('ABSOLUTE', nb.sub(a, c))))

        cloths = 7.0
        f = nb.math('FRACT', nb.mul(u, cloths))
        dseam = nb.math('MINIMUM', f, nb.sub(1.0, f))
        seam = nb.sub(1.0, nb.smooth(0.008, 0.02, dseam))
        stitch = nb.mul(
            nb.sub(1.0, nb.smooth(0.0, 0.004, nb.math('ABSOLUTE', nb.sub(dseam, 0.02)))),
            nb.smooth(0.3, 0.5, nb.math('SINE', nb.mul(v, 900.0))),
        )
        edge = nb.math('MINIMUM', nb.math('MINIMUM', u, nb.sub(1.0, u)), nb.math('MINIMUM', v, nb.sub(1.0, v)))
        tabling = nb.sub(1.0, nb.smooth(0.012, 0.016, edge))
        corner = nb.math(
            'MAXIMUM',
            nb.sub(1.0, nb.smooth(0.1, 0.11, nb.add(u, v))),
            nb.sub(1.0, nb.smooth(0.1, 0.11, nb.add(nb.sub(1.0, u), v))),
        )
        corner = nb.math(
            'MAXIMUM',
            corner,
            nb.math(
                'MAXIMUM',
                nb.sub(1.0, nb.smooth(0.1, 0.11, nb.add(u, nb.sub(1.0, v)))),
                nb.sub(1.0, nb.smooth(0.1, 0.11, nb.add(nb.sub(1.0, u), nb.sub(1.0, v)))),
            ),
        )
        reef = line(0.2, 0.006, v)
        rp = nb.mul(
            nb.sub(1.0, nb.smooth(0.004, 0.007, nb.math('ABSOLUTE', nb.sub(nb.math('FRACT', nb.mul(u, 14.0)), 0.5)))),
            nb.sub(1.0, nb.smooth(0.01, 0.03, nb.math('ABSOLUTE', nb.sub(v, 0.19)))),
        )
        patch = nb.mul(
            nb.mul(nb.smooth(0.58, 0.585, u), nb.sub(1.0, nb.smooth(0.68, 0.685, u))),
            nb.mul(nb.smooth(0.44, 0.445, v), nb.sub(1.0, nb.smooth(0.53, 0.535, v))),
        )
        P = nb.comb(nb.mul(u, 3.4), nb.mul(v, 4.7), 0.0)
        base = nb.mix(nb.smooth(0.0, 1.0, v), srgb(0xC79A62), srgb(0xDCB983))
        base = nb.mix(nb.mul(nb.noise(nb.vscale(P, (1, 1, 1)), 1.5, 5), 0.35), base, srgb(0xA07446))
        base = nb.mix(nb.mul(patch, 0.8), base, srgb(0xB88A58))
        col = nb.mix(nb.mul(nb.math('MAXIMUM', tabling, corner), 0.3), base, srgb(0x9A7046))
        col = nb.mix(nb.mul(nb.math('MAXIMUM', seam, reef), 0.5), col, srgb(0x8A6440))
        col = nb.mix(nb.mul(nb.math('MAXIMUM', stitch, rp), 0.7), col, srgb(0x5A4128))
        stains = nb.mul(nb.sub(1.0, nb.smooth(0.0, 0.35, v)), nb.smooth(0.55, 0.75, nb.noise(P, 3.0, 5)))
        col = nb.mix(nb.mul(stains, 0.4), col, srgb(0x5C4A35))
        mildew = nb.mul(nb.smooth(0.7, 0.78, nb.noise(P, 40.0, 3)), nb.smooth(0.5, 0.7, nb.noise(P, 2.0, 3)))
        col = nb.mix(nb.mul(mildew, 0.35), col, srgb(0x3B3A2C))
        h = nb.add(
            nb.add(nb.mul(seam, 0.5), nb.mul(nb.math('MAXIMUM', tabling, corner), 0.4)),
            nb.add(nb.mul(patch, 0.3), nb.mul(nb.noise(P, 300.0, 2), 0.15)),
        )
        nb.finish(col, 0.88, 0.0, nb.bump(h, 0.3, 0.002))

    return B.material(name, build)


def glass(name='LanternGlass'):
    def build(nb):
        nb.finish(srgb(0xFFE0A8), 0.15, 0.0, emission=srgb(0xFFC070), emission_strength=2.5)

    return B.material(name, build)

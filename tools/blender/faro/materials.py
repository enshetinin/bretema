import bretema_bpy as B
from bretema_bpy import srgb


def ashlar(name='Ashlar', course=0.5, block=1.05, dressed=False):
    def build(nb):
        P = nb.coord('Object')
        x, y, z = nb.sep(P)
        n = nb.geo('Normal')
        nx, ny, nz = nb.sep(n)
        side = nb.math('GREATER_THAN', nb.math('ABSOLUTE', nx), nb.math('ABSOLUTE', ny))
        uvA, uvB = nb.comb(x, z, 0.0), nb.comb(y, z, 0.0)

        def brick(v, out):
            b = nb.node('ShaderNodeTexBrick', offset=0.5, squash=1.0)
            nb._in(b.inputs['Vector'], v)
            b.inputs['Scale'].default_value = 1.0
            b.inputs['Mortar Size'].default_value = 0.012
            b.inputs['Mortar Smooth'].default_value = 0.4
            b.inputs['Brick Width'].default_value = block
            b.inputs['Row Height'].default_value = course
            b.inputs['Color1'].default_value = (0, 0, 0, 1)
            b.inputs['Color2'].default_value = (1, 1, 1, 1)
            return b.outputs[out]

        if dressed:
            joint, tone = 0.0, nb.noise(P, 0.8, 2)
        else:
            joint = nb.mixf(side, brick(uvA, 'Fac'), brick(uvB, 'Fac'))
            tone = nb.mixf(side, nb.sep(brick(uvA, 'Color'))[0], nb.sep(brick(uvB, 'Color'))[0])
        Pt = nb.vmath('ADD', P, nb.comb(nb.mul(tone, 13.0), nb.mul(tone, 7.0), 0.0))
        g = nb.sep(nb.voronoi(Pt, 150.0 if not dressed else 220.0, out='Color'))[0]
        base = nb.mix(
            nb.mul(tone, 0.9), srgb(0x8B8A83 if not dressed else 0xA5A299), srgb(0x6F706B if not dressed else 0x908E86)
        )
        col = nb.mix(nb.smooth(0.6, 0.66, g), base, srgb(0xB5B0A2))
        col = nb.mix(nb.smooth(0.83, 0.87, g), col, srgb(0x33332F))
        col = nb.mix(nb.mul(nb.noise(Pt, 2.5, 5), 0.45), col, srgb(0x5B5A53))
        up = nz
        lich = nb.mul(
            nb.smooth(0.57, 0.64, nb.noise(Pt, 5.0, 6, 0.6)), nb.add(0.3, nb.mul(nb.smooth(-0.1, 0.7, up), 0.7))
        )
        col = nb.mix(nb.mul(lich, 0.8), col, nb.mix(nb.noise(Pt, 2.0, 2), srgb(0xC7A443), srgb(0xA3AB8A)))
        streak = nb.mul(nb.smooth(0.55, 0.8, nb.noise(nb.vscale(P, (9, 9, 0.5)), 1.0, 4)), 0.5)
        col = nb.mix(streak, col, srgb(0x45463F))
        salt = nb.mul(nb.sub(1.0, nb.smooth(0.4, 2.2, z)), nb.smooth(0.5, 0.7, nb.noise(Pt, 8.0, 4)))
        col = nb.mix(nb.mul(salt, 0.5), col, srgb(0xD9D6CC))
        col = nb.mix(nb.mul(joint, 0.85), col, srgb(0x3D3B35))
        ao = nb.ao(0.15)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.7), col, srgb(0x23231F))
        edge = nb.edges(0.02)
        col = nb.mix(nb.mul(edge, 0.2), col, srgb(0xBCB7AA))
        h = nb.add(nb.mul(nb.noise(Pt, 18.0, 6, 0.65), 0.5), nb.add(nb.mul(nb.sub(1.0, joint), 0.8), nb.mul(lich, 0.3)))
        nb.finish(col, nb.add(0.74, nb.mul(lich, 0.12)), 0.0, nb.bump(h, 0.5, 0.006))

    return B.material(name, build)


def paint(name, color, metal_under=False, rough=0.45):
    def build(nb):
        P = nb.coord('Object')
        wear = nb.add(nb.noise(P, 7.0, 8, 0.65), nb.mul(nb.edges(0.008), 0.35))
        chip = nb.smooth(0.62, 0.64, wear)
        under = (
            nb.mix(nb.noise(P, 30.0, 3), srgb(0x7A3B1A), srgb(0x4A2A16))
            if metal_under
            else nb.mix(nb.noise(P, 40.0, 3), srgb(0x8B857A), srgb(0x5E5A51))
        )
        pc = nb.mix(nb.mul(nb.noise(P, 2.0, 3), 0.3), srgb(color), nb.hsv(srgb(color), 0.5, 0.7, 1.15))
        col = nb.mix(chip, pc, under)
        streak = nb.mul(
            nb.smooth(0.6, 0.8, nb.noise(nb.vscale(P, (20, 20, 1.2)), 1.0, 3)), 0.25 if not metal_under else 0.4
        )
        col = nb.mix(streak, col, srgb(0x5A3A22) if metal_under else srgb(0x4B4A43))
        ao = nb.ao(0.05)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.6), col, srgb(0x1B1A17))
        nb.finish(col, nb.mixf(chip, rough, 0.8), 0.0, nb.bump(nb.mul(nb.sub(1.0, chip), 0.5), 0.35, 0.002))

    return B.material(name, build)


def copper(name='Copper'):
    def build(nb):
        P = nb.coord('Object')
        z = nb.sep(P)[2]
        v = nb.smooth(
            0.35, 0.6, nb.add(nb.noise(P, 6.0, 6, 0.6), nb.mul(nb.noise(nb.vscale(P, (14, 14, 1)), 1.0, 3), 0.35))
        )
        col = nb.mix(
            v,
            nb.mix(nb.noise(P, 20.0, 3), srgb(0x8A5A36), srgb(0x5C3A22)),
            nb.mix(nb.noise(P, 4.0, 2), srgb(0x5F9E88), srgb(0x7FB39E)),
        )
        ao = nb.ao(0.05)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.5), col, srgb(0x1E2A24))
        nb.finish(col, nb.mixf(v, 0.4, 0.75), nb.mixf(v, 0.9, 0.0), nb.bump(v, 0.3, 0.002))

    return B.material(name, build)


def glass_window(name='WindowGlass'):
    def build(nb):
        nb.finish(srgb(0x23343B), 0.08, 0.1, emission=srgb(0xFFC277), emission_strength=1.0)

    return B.material(name, build)


def glass_lantern(name='LanternGlass'):
    def build(nb):
        nb.finish(srgb(0xCFE3E6), 0.04, 0.0, alpha=0.22)

    m = B.material(name, build)
    m.surface_render_method = 'BLENDED'
    m.use_backface_culling = False
    return m


def lens(name='LensGlow'):
    def build(nb):
        nb.finish(srgb(0xFFF0CF), 0.1, 0.2, emission=srgb(0xFFD59A), emission_strength=1.0)

    return B.material(name, build)

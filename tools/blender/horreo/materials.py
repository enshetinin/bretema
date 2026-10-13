import bretema_bpy as B
from bretema_bpy import srgb


def granite(name='Granite'):
    def build(nb):
        P = nb.coord('Object')
        x, y, z = nb.sep(P)
        tone = nb.attr('tone', 'Fac')
        Pt = nb.vmath('ADD', P, nb.comb(nb.mul(tone, 31.0), nb.mul(tone, 17.0), nb.mul(tone, 7.0)))
        grains = nb.voronoi(Pt, 160.0, out='Color')
        g = nb.sep(grains)[0]
        base = nb.mix(nb.mul(tone, 0.8), srgb(0x7F7E77), srgb(0x6A6B66))
        col = nb.mix(nb.smooth(0.6, 0.66, g), base, srgb(0xAAA597))
        col = nb.mix(nb.smooth(0.82, 0.86, g), col, srgb(0x2E2F2D))
        col = nb.mix(nb.mul(nb.noise(Pt, 3.0, 5), 0.5), col, srgb(0x55554F))
        up = nb.sep(nb.geo('Normal'))[2]
        lich = nb.mul(
            nb.smooth(0.55, 0.62, nb.noise(Pt, 6.0, 6, 0.6)), nb.add(0.35, nb.mul(nb.smooth(-0.2, 0.8, up), 0.65))
        )
        col = nb.mix(nb.mul(lich, 0.85), col, nb.mix(nb.noise(Pt, 2.0, 2), srgb(0xC9A646), srgb(0xA9B08C)))
        moss = nb.mul(nb.sub(1.0, nb.smooth(0.1, 1.2, z)), nb.smooth(0.45, 0.7, nb.noise(Pt, 4.0, 5)))
        col = nb.mix(nb.mul(moss, 0.8), col, srgb(0x4F5D2E))
        streak = nb.mul(nb.smooth(0.55, 0.8, nb.noise(nb.vscale(Pt, (14, 14, 0.8)), 1.0, 4)), 0.45)
        col = nb.mix(streak, col, srgb(0x4A4A44))
        ao = nb.ao(0.12)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.75), col, srgb(0x2A2A26))
        edge = nb.edges(0.015)
        col = nb.mix(nb.mul(edge, 0.25), col, srgb(0xB5B1A5))
        chisel = nb.noise(Pt, 22.0, 6, 0.65)
        h = nb.add(nb.mul(chisel, 0.6), nb.add(nb.mul(nb.smooth(0.55, 0.62, g), 0.15), nb.mul(lich, 0.35)))
        nb.finish(col, nb.add(0.72, nb.mul(lich, 0.15)), 0.0, nb.bump(h, 0.5, 0.004))

    return B.material(name, build)


def tile(name='Tile'):
    def build(nb):
        P = nb.coord('Object')
        x, y, z = nb.sep(P)
        idx = nb.math('FLOOR', nb.math('DIVIDE', nb.add(x, 10.0), 0.18))
        row = nb.math('FLOOR', nb.math('DIVIDE', nb.add(nb.math('ABSOLUTE', y), 0.0), 0.3))
        rnd = nb.noise(nb.comb(nb.mul(idx, 1.37), nb.mul(row, 2.71), 0.0), 7.0, 0.0)
        base = nb.ramp(rnd, [(0, srgb(0x5A2213)), (0.45, srgb(0x7A3220)), (0.7, srgb(0x8C4128)), (1, srgb(0x6A3D2A))])
        col = nb.mix(nb.mul(nb.noise(P, 25.0, 4), 0.3), base, srgb(0x6E3220))
        ao = nb.ao(0.06)
        moss = nb.mul(nb.sub(1.0, ao), nb.smooth(0.4, 0.6, nb.noise(P, 5.0, 4)))
        col = nb.mix(nb.mul(moss, 0.9), col, srgb(0x4C5A2A))
        lich = nb.mul(nb.smooth(0.66, 0.7, nb.noise(P, 14.0, 6, 0.6)), nb.smooth(0.4, 0.6, nb.noise(P, 1.5, 2)))
        col = nb.mix(nb.mul(lich, 0.7), col, nb.mix(nb.noise(P, 3.0, 2), srgb(0xB9B29C), srgb(0xB08F3E)))
        grime = nb.mul(nb.sub(1.0, nb.smooth(3.9, 4.6, z)), 0.35)
        col = nb.mix(grime, col, srgb(0x3E2A20))
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.6), col, srgb(0x24170F))
        h = nb.add(nb.mul(nb.noise(P, 60.0, 4), 0.3), nb.mul(lich, 0.4))
        nb.finish(col, nb.add(0.68, nb.mul(lich, 0.15)), 0.0, nb.bump(h, 0.35, 0.003))

    return B.material(name, build)


def door(name='Door'):
    def build(nb):
        P = nb.coord('Object')
        g = nb.noise(nb.vscale(P, (60, 60, 3)), 1.0, 4, 0.6)
        wood = nb.mix(g, srgb(0x7D7466), srgb(0x5A5248))
        wear = nb.add(nb.noise(P, 8.0, 8, 0.65), nb.mul(nb.edges(0.01), 0.3))
        chip = nb.smooth(0.56, 0.58, wear)
        paint = nb.mix(nb.mul(nb.noise(P, 2.0, 3), 0.4), srgb(0x3F6B55), srgb(0x6D8C78))
        col = nb.mix(chip, paint, wood)
        ao = nb.ao(0.05)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.6), col, srgb(0x1C1A16))
        nb.finish(
            col,
            nb.mixf(chip, 0.55, 0.85),
            0.0,
            nb.bump(nb.add(nb.mul(nb.sub(1.0, chip), 0.4), nb.mul(g, 0.3)), 0.35, 0.003),
        )

    return B.material(name, build)


def maize(name='Maize'):
    def build(nb):
        P = nb.coord('Object')
        k = nb.voronoi(P, 90.0)
        cob = nb.noise(P, 6.0, 2)
        col = nb.mix(nb.smooth(0.0, 0.35, k), srgb(0x8A4A10), nb.mix(cob, srgb(0xE2A52A), srgb(0xD27A1E)))
        nb.finish(col, 0.55, 0.0, nb.bump(nb.smooth(0.0, 0.3, k), 0.5, 0.004))

    return B.material(name, build)


def mortar(name='Mortar'):
    def build(nb):
        P = nb.coord('Object')
        n = nb.noise(P, 30.0, 5)
        col = nb.mix(n, srgb(0xB7AE9C), srgb(0x8F877A))
        ao = nb.ao(0.05)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.6), col, srgb(0x3A352E))
        nb.finish(col, 0.9, 0.0, nb.bump(n, 0.4, 0.003))

    return B.material(name, build)

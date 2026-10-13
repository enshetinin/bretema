import bretema_bpy as B
from bretema_bpy import srgb


def log(name='Log'):
    def build(nb):
        P = nb.coord('Object')
        g = nb.attr('grain')
        fibre = nb.noise(nb.vscale(g, (1.2, 40, 40)), 1.0, 4, 0.6)
        col = nb.mix(fibre, srgb(0x9C9384), srgb(0x6E665A))
        col = nb.mix(nb.mul(nb.smooth(0.45, 0.75, nb.noise(g, 1.5, 4)), 0.6), col, srgb(0x8A6C4E))
        up = nb.sep(nb.geo('Normal'))[2]
        drop = nb.mul(nb.smooth(0.62, 0.7, nb.noise(P, 7.0, 5, 0.6)), nb.smooth(-0.2, 0.6, up))
        drip = nb.mul(
            nb.mul(
                nb.smooth(0.68, 0.78, nb.noise(nb.vscale(P, (14, 14, 2.5)), 1.0, 3)),
                nb.smooth(0.5, 0.7, nb.noise(P, 1.3, 2)),
            ),
            0.5,
        )
        col = nb.mix(nb.math('MAXIMUM', drop, drip), col, srgb(0xE8E4D8))
        z = nb.sep(P)[2]
        wet = nb.sub(1.0, nb.smooth(0.1, 0.7, z))
        col = nb.mix(nb.mul(wet, 0.6), col, srgb(0x3D3A2C))
        ao = nb.ao(0.1)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.6), col, srgb(0x221F19))
        h = nb.add(nb.mul(fibre, 0.6), nb.mul(drop, 0.4))
        nb.finish(col, nb.mixf(drop, nb.sub(0.8, nb.mul(wet, 0.3)), 0.6), 0.0, nb.bump(h, 0.45, 0.004))

    return B.material(name, build)


def float_paint(name='FloatPaint'):
    def build(nb):
        P = nb.coord('Object')
        z = nb.sep(P)[2]
        rust = nb.smooth(
            0.72, 0.82, nb.add(nb.noise(P, 4.0, 6, 0.6), nb.mul(nb.noise(nb.vscale(P, (12, 12, 1)), 1.0, 3), 0.25))
        )
        col = nb.mix(rust, srgb(0x1D1F20), nb.mix(nb.noise(P, 20.0, 3), srgb(0x6B3418), srgb(0x3E2412)))
        band = nb.sub(1.0, nb.smooth(0.0, 0.25, nb.math('ABSOLUTE', nb.sub(z, 0.05))))
        alg = nb.mul(band, nb.smooth(0.35, 0.6, nb.noise(P, 6.0, 4)))
        col = nb.mix(alg, col, srgb(0x3D5A2A))
        barn = nb.mul(nb.sub(1.0, nb.smooth(0.0, 0.2, nb.voronoi(P, 60.0))), nb.sub(1.0, nb.smooth(-0.1, 0.1, z)))
        col = nb.mix(barn, col, srgb(0xBDB6A6))
        nb.finish(col, nb.mixf(rust, 0.72, 0.9), 0.0, nb.bump(nb.add(nb.mul(rust, 0.5), barn), 0.4, 0.003))

    return B.material(name, build)


def mussel(name='Mussel'):
    def build(nb):
        P = nb.coord('Object')
        cells = nb.voronoi(P, 55.0, out='Distance')
        cid = nb.voronoi(P, 55.0, out='Color')
        shell = nb.mix(nb.sep(cid)[0], srgb(0x14171F), srgb(0x2B3140))
        edge = nb.smooth(0.25, 0.4, cells)
        col = nb.mix(nb.mul(edge, 0.6), shell, srgb(0x6F7480))
        barn = nb.mul(nb.sub(1.0, nb.smooth(0.0, 0.15, nb.voronoi(P, 140.0))), nb.smooth(0.6, 0.7, nb.noise(P, 5.0, 3)))
        col = nb.mix(barn, col, srgb(0xC7C0B0))
        ao = nb.ao(0.05)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.7), col, srgb(0x08090B))
        nb.finish(
            col, nb.mixf(edge, 0.55, 0.75), 0.0, nb.bump(nb.add(nb.sub(1.0, cells), nb.mul(barn, 0.5)), 0.8, 0.006)
        )

    return B.material(name, build)


def planks(name='Planks', paint=None):
    def build(nb):
        P = nb.coord('Object')
        g = nb.attr('grain')
        fibre = nb.noise(nb.vscale(g, (1.0, 50, 50)), 1.0, 4, 0.6)
        col = nb.mix(fibre, srgb(0x8A8478), srgb(0x5E594F))
        rough = nb.add(0.75, nb.mul(fibre, 0.1))
        if paint is not None:
            wear = nb.add(nb.noise(P, 6.0, 8, 0.65), nb.mul(nb.edges(0.01), 0.3))
            chip = nb.smooth(0.6, 0.62, wear)
            pc = nb.mix(nb.mul(nb.noise(P, 2.0, 3), 0.3), srgb(paint), srgb(0xB9B2A0))
            col = nb.mix(chip, pc, col)
            rough = nb.mixf(chip, 0.5, rough)
        ao = nb.ao(0.06)
        col = nb.mix(nb.mul(nb.sub(1.0, ao), 0.6), col, srgb(0x1F1C17))
        nb.finish(col, rough, 0.0, nb.bump(fibre, 0.4, 0.003))

    return B.material(name, build)


def corrugated(name='Corrugated'):
    def build(nb):
        P = nb.coord('Object')
        r = nb.smooth(0.45, 0.7, nb.noise(P, 5.0, 6, 0.6))
        col = nb.mix(r, srgb(0x8D9192), nb.mix(nb.noise(P, 30.0, 3), srgb(0x7C4022), srgb(0x4D2814)))
        nb.finish(col, nb.mixf(r, 0.4, 0.85), nb.mixf(r, 0.8, 0.0), nb.bump(r, 0.3, 0.003))

    return B.material(name, build)


def marker(name='Marker'):
    def build(nb):
        P = nb.coord('Object')
        r = nb.smooth(0.6, 0.72, nb.noise(P, 8.0, 6, 0.6))
        col = nb.mix(r, nb.mix(nb.noise(P, 3.0, 3), srgb(0xE0B21E), srgb(0xD29A12)), srgb(0x6B3A18))
        nb.finish(col, nb.mixf(r, 0.45, 0.8), 0.0, nb.bump(r, 0.3, 0.003))

    return B.material(name, build)

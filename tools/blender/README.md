# tools/blender — procedural Blender model generators

Scripts that build BRÉTEMA's 3D models in **Blender 5.2 LTS** through the Python API (`bpy`):
geometry, procedural PBR materials, texture baking and glTF export. Only development tools:
the game loads the resulting `assets/models/*.glb` files and never runs these scripts.

## License (different from the game)

| What | License | Why |
|---|---|---|
| `tools/blender/**/*.py` (these scripts) | **GPL-3.0-or-later** (`LICENSE` in this folder) | They use Blender's Python API. blender.org: *"such scripts (if published) are being shared under a GPL compliant license"*. Blender 5.2 itself is GPL-3.0-or-later. |
| Output: `.blend`, renders, baked PNGs, `out/*.glb`, `assets/models/dorna.glb` | Owned by the project's copyright holder; distributed with the game under its MIT terms | blender.org: *"What you create with Blender is your sole property"*. The GPL does not reach Blender's output. |
| `tools/models/optimize.js` (Node, does not use `bpy`) | MIT, like the rest of the game | Uses gltf-transform (MIT), meshoptimizer (MIT), sharp (Apache-2.0) as dev dependencies; none of them is shipped. |

The GPL scripts are kept in their own folder with their own `LICENSE`, so they are not mixed with the
MIT code in `src/`. Third-party content: none. Every shape and texture comes from code in this
folder (Blender's built-in procedural nodes: noise, Voronoi, wave, AO, bevel). The hull lettering
is rendered from Blender's built-in UI font (Inter, SIL OFL 1.1; it ends up only as pixels in a
baked texture, not as a font file).

## Requirements

- Blender 5.2 (`/Applications/Blender.app/Contents/MacOS/Blender` on macOS). Cycles is used for baking (Metal GPU when available, otherwise CPU).
- Node 18+ with `tools/models` dependencies installed (`cd tools/models && npm ci`) for the final optimisation step.

## Models

| Generator | Output in `assets/models/` | Game use (`src/world.js`, `src/boat.js`) | Triangles | GLB |
|---|---|---|---|---|
| `dorna/build_dorna.py` | `dorna.glb` | Player boat (`Hull`, `Yard`, `Sail`) | 71.8k | 3.4 MB |
| `dorna/build_dorna.py --variant moored` | `dornas_fondeadas.glb` | Three moored sisters in Porto do Son (`Dorna_A/B/C`, shared timber/gear) | 44k unique, ≈30k per boat drawn | 1.7 MB |
| `horreo/build_horreo.py` | `horreo.glb` | Four granaries, cloned and scaled per placement (`Horreo`) | 19.2k | 1.0 MB |
| `batea/build_batea.py` | `batea.glb` | Three mussel rafts riding the swell (`Batea`) | 13.4k | 0.6 MB |
| `faro/build_faro.py` | `faro.glb` | Faro de Fisterra (`Faro` + `Faro_LOD1` beyond 110 m; `LensGlow`, `WindowGlass`) | 46k + 9.5k LOD | 2.6 MB |

Every model keeps the frame, footprint and anchor points of the procedural geometry it replaces, and
that geometry stays in the game as the fallback (also with `?procedural` in the URL). Colliders are
unchanged except the moored dornas, which now use two circles along the keel to match the longer hull.

```sh
BL=/Applications/Blender.app/Contents/MacOS/Blender
for g in dorna/build_dorna.py horreo/build_horreo.py batea/build_batea.py faro/build_faro.py; do $BL -b --factory-startup --python tools/blender/$g; done
$BL -b --factory-startup --python tools/blender/dorna/build_dorna.py -- --variant moored
cd tools/models && for m in dorna dornas_fondeadas horreo batea faro; do node optimize.js ../blender/out/${m}_raw.glb ../../assets/models/$m.glb; done
# review renders: --set player (default) | moored | horreo | batea | faro
$BL -b tools/blender/source/faro_baked.blend --python tools/blender/render_views.py -- --set faro --out tools/blender/renders/faro
```

`out/*_raw.glb` and `renders/` are regenerable; `source/*_source.blend` (live modifiers and procedural
materials) and `source/*_baked.blend` are the editable sources.

## Dorna (player boat)

```sh
BL=/Applications/Blender.app/Contents/MacOS/Blender
# 1. model + bake + raw export (≈ a few minutes; --preview skips baking for quick geometry checks)
$BL -b --factory-startup --python tools/blender/dorna/build_dorna.py
# 2. review renders (procedural sky/sea; six cameras)
$BL -b tools/blender/source/dorna_baked.blend --python tools/blender/render_views.py -- --out tools/blender/renders/final
# 3. optimise for Three.js (meshopt + WebP) → the file the game loads
cd tools/models && node optimize.js ../blender/out/dorna_raw.glb ../../assets/models/dorna.glb
```

Outputs:

| Path | Content |
|---|---|
| `source/<model>_source.blend` | Editable source: live modifiers (Solidify, Bevel, Mirror, Screw, Boolean, Array + Curve, Displace, Wireframe), curves and the procedural Cycles materials |
| `source/<model>_baked.blend` | Applied geometry with the baked image materials (what gets exported) |
| `source/textures/*.png` | Baked atlases per material: `baseColor`, `orm` (R occlusion, G roughness, B metallic), `nrm` (tangent-space normal) and the lettering decals |
| `out/dorna_raw.glb` | Unoptimised export from Blender |
| `renders/` | Review renders of each iteration |

### Contract with the game (`src/boat.js`)

- Bow towards −Z in glTF (Blender +Y); origin on the centreline at the body pivot; metres.
- The hull lines are generated from the same `section()` as `hullGeometry()`, so physics sample points, colliders, wake and the lantern anchor (`Boat.lanternPos = (0, 1.15, 1.9)`) are unchanged.
- Nodes: `Hull` (empty with one mesh per material), `Yard` (empty at the sail pivot, z = −1.1, the mast axis) and `Sail` (single mesh; the game animates its own sail and only takes this material).
- Painted waterline at y = −0.13. The game floats the hull with the sea at y ≈ −0.2 and draws the sea through the hull, so a watertight sole at y = −0.115 keeps the bilge dry.

### Materials (baked)

| Material | Atlas | Notes |
|---|---|---|
| `HullPaint` | 2048² | Strake colours, hand-painted waterline and boot-top, lettering, two layers of chipping, rust weeping from the thole pins, algae, salt, barnacles |
| `Timber` | 2048² | Oiled and weathered wood on a per-piece grain frame; cream interior paint scuffed to bare wood |
| `Gear` | 1024² | Bronze with verdigris, rusty iron, three-strand rope, wicker, cork, lead, lantern |
| `Net` | 1024² | Diamond mesh, alpha mask (glTF `MASK`), double-sided |
| `Sail` | 1024² | Tanned cotton: cloths, seams and stitching, tabling, corner patches, reef band, a repair patch, stains |
| `LanternGlass` | — | Emissive, not baked |

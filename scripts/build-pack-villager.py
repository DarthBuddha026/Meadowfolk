"""Build a Junction townsperson from "Low Poly Characters (PACK)": the strolling villagers
(public/models/villager-<name>.glb) and the help seekers Sarah and Mika (public/models/<name>.glb).

Source: "Low Poly Characters (PACK)" by micaelsampaio (CC-BY-4.0, credited in CREDITS.md,
https://sketchfab.com/3d-models/low-poly-characters-pack-f1c8018af59643e0b009a6f018ed9fd9): four
flat-shaded chibis in one scene (a bald bearded man in a red suit, a bearded man in black, a
blond boy, a brown-haired girl), T-posed, no rig, facing -Y, each coloured from a 64 px palette.

Usage: blender -b --factory-startup -P scripts/build-pack-villager.py -- <scene.gltf> <villager> <out.glb>
       (<villager> is a key of VILLAGERS below: a villager, `sarah` or `mika`)

The script (Blender coords: z up, the figures face -Y, character's left = +x):
- keeps the villager's base figure, normalised to height 1 with the feet on z = 0;
- names every face's part (skin, hair, eyes, brows, beard, shirt, pants, shoes...) from its palette
  colour and where it sits, then repaints the parts in the villager's own colours, one flat
  material per colour, so clothes and faces differ from the pack's;
- adds the villager's accessories (hats, glasses, apron, backpack...);
- adds the base body's Mixamo-style skeleton (chibi_body.py) on this figure's joints, weights each
  vertex to its nearest bones (the head and everything on it rigid on Head), lowers the arms from
  the T-pose and adds the black outline shell;
- bakes the shared clips (character_clips.py) and stores the gait strides on the rig.
"""
import bpy, bmesh, sys, os, math
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from mathutils.geometry import intersect_point_line

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chibi_body as body
from chibi_body import select, ss

argv = sys.argv[sys.argv.index('--') + 1:]
src, who, out = argv[0], argv[1], argv[2]

# This figure's joints (height 1), measured from height slices of the mesh. All four share them.
body.BODY_Y = 0.01
body.HIPS, body.WAIST, body.SPINE1, body.RIBS, body.THROAT, body.NECK = 0.25, 0.31, 0.37, 0.43, 0.5, 0.545
body.HIP_J = (0.075, 0.01, 0.26)
body.KNEE_J = (0.088, 0.0, 0.14)
body.ANKLE_J = (0.1, 0.01, 0.045)
body.BALL_J = (0.1, -0.03, 0.015)
body.TOE_J = (0.1, -0.06, 0.01)
body.CLAVICLE = (0.03, 0.03, 0.5)
SHOULDER_J = (0.095, 0.045, 0.48)
ELBOW_J = (0.17, 0.045, 0.43)
WRIST_J = (0.24, 0.045, 0.38)
HAND_TIP = (0.29, 0.05, 0.32)
# The pack's legs splay out towards the feet (a hand's width apart); below LEG_TOP each point moves
# in by FEET_IN per unit of height under it, so the legs hang straight and the feet stand close.
LEG_TOP, FEET_IN = 0.24, 0.25


def feet_in(x, z):
    return x - math.copysign(FEET_IN * max(0.0, LEG_TOP - z), x)


for name in ('KNEE_J', 'ANKLE_J', 'BALL_J', 'TOE_J'):
    jx, jy, jz = getattr(body, name)
    setattr(body, name, (feet_in(jx, jz), jy, jz))
# How much thicker the arms are than the pack's.
ARM_THICK = 1.35
# How far from the armpit a loose armhole (`loose`) reaches.
ARMHOLE = 0.075
ARM_DOWN = math.radians(38)      # the T-posed arms slope ~39 degrees; this brings them to ~77
ROUGHNESS = 0.85
# Catmull-Clark levels that round off the pack's facets (the help seekers, seen up close, get two);
# creases sharper than SHARP stay crisp (hat brims, the bib, the apron).
SUBDIVIDE = {'sarah': 2, 'mika': 2}
SHARP = math.radians(40)
# Passes of weight smoothing after bone heat (wider, softer bends at the joints).
WEIGHT_SMOOTH = 6


def by_height(z_split, above, below):
    return lambda c: above if c.z > z_split else below


# Each base figure: its material in the pack, and the part each palette colour paints (a name,
# or a function of the face's centre for colours the pack reuses).
BASES = {
    'santa': ('null', {
        '#ba756a': 'skin',
        '#dae0ea': lambda c: 'brows' if c.z > 0.71 else 'beard',
        '#141013': lambda c: 'eyes' if c.z > 0.6 else 'shoes' if c.z < 0.07 else 'gloves',
        '#e86a73': 'skin-shade',
        '#8e5252': 'mouth',
        '#060608': lambda c: 'gloves' if abs(c.x) > 0.25 else 'belt',
        '#73172d': by_height(0.27, 'shirt', 'pants'),
        '#ffffff': 'trim',
        '#4a5462': 'buckle',
    }),
    'bearded': ('Santa', {
        '#141013': lambda c: 'beard' if c.z < 0.69 and c.y < 0 else 'hair',
        '#d1b39b': 'skin',
        '#b3756f': 'skin-shade',
        '#1f1f1f': lambda c: 'eyes' if c.z > 0.66 else 'beard' if c.z > 0.54 else 'shirt',
        '#2e3547': 'pants',
        '#000000': 'shoes',
    }),
    'boy': ('material', {
        '#ffd541': 'hair',
        # The T-posed arms out past the sleeves (hands past the wrist), the shins, and the head and neck.
        '#fad6b8': lambda c: (('hands' if abs(c.x) > 0.245 else 'cuffs' if abs(c.x) > 0.205 else 'arms') if abs(c.x) > 0.13 and 0.3 < c.z < 0.52
                             else 'legs' if c.z < 0.3 else 'skin'),
        '#71413b': 'brows',
        '#285cc4': lambda c: 'eyes' if c.z > 0.5 else 'wristbands' if c.z > 0.3 else 'pants',
        '#ba756a': 'skin-shade',
        '#b4202a': lambda c: 'sleeves' if abs(c.x) > 0.13 else 'shirt',
        '#ffffff': 'socks',
        '#141013': 'shoes',
    }),
    'girl': ('Girl', {
        '#401c00': 'hair',
        '#fae1cd': 'skin',
        '#70411d': lambda c: 'skin-shade' if abs(c.x) > 0.2 or abs(c.x) < 0.04 else 'eyes' if c.z < 0.8 else 'hair',   # ears, nose; a lock on the crown
        '#cf71ad': 'blush',
        '#fabd8c': 'skin-shade',
        '#bc4a9b': 'shirt',
        # Her bare arms, T-posed: the hands past the wrist (x 0.245), a cuff just before it.
        '#fae8d9': lambda c: 'skin' if abs(c.x) > 0.245 else 'cuffs' if abs(c.x) > 0.22 else 'arms',
        '#285cc4': 'pants',
        '#fad6b8': 'legs',
        '#ffffff': 'socks',
        '#ffd541': 'shoes',
    }),
}
# Parts that are bare skin unless a character paints them (sleeves, boots).
SKIN_PARTS = {'arms', 'cuffs', 'hands', 'legs'}
# Parts that take another part's colour unless painted themselves.
SAME_AS = {'sleeves': 'shirt'}

# The villagers: base figure, new colours per part (unlisted parts keep the pack's) and accessories.
VILLAGERS = {
    'baker': dict(base='santa', paint={
        'skin': '#e7b48f', 'skin-shade': '#d9937a', 'mouth': '#a85a4a', 'beard': '#6b4a32', 'brows': '#5a3d2b',
        'eyes': '#2b2340', 'shirt': '#f6f1e7', 'trim': '#e3d6c2', 'pants': '#6b4a32', 'gloves': '#e7b48f',
        'belt': '#4a3424', 'buckle': '#4a3424', 'shoes': '#3a2a20',
    }, extras=[('chef-hat', '#fbf8f2'), ('apron', '#d9674a')]),
    'fisher': dict(base='bearded', paint={
        'skin': '#b07a55', 'skin-shade': '#97624a', 'hair': '#7a7f87', 'beard': '#9aa0a8', 'eyes': '#2b2340',
        'shirt': '#3f7d6b', 'pants': '#5b6e8c', 'shoes': '#3a2a20',
    }, extras=[('bucket-hat', '#d9b45a')]),
    'student': dict(base='boy', paint={
        'skin': '#e8b892', 'skin-shade': '#cf9472', 'hair': '#2b2340', 'brows': '#2b2340', 'eyes': '#5a3d2b',
        'shirt': '#f2c94c', 'pants': '#3d4f7a', 'socks': '#f6f1e7', 'shoes': '#e8594a',
    }, extras=[('glasses-round', '#2b2340'), ('backpack', '#4f86b8')]),
    'neighbour': dict(base='girl', paint={
        'skin': '#f3d2b8', 'skin-shade': '#d9a888', 'hair': '#a64b2a', 'eyes': '#3d6b4f', 'blush': '#e89aa0',
        'shirt': '#5aa86b', 'pants': '#e9e2cf', 'socks': '#f6f1e7', 'shoes': '#7a4a2e',
    }, extras=[('flower', '#f28bb0')]),
    'pond-walker': dict(base='girl', paint={
        'skin': '#c88a62', 'skin-shade': '#a86e4c', 'hair': '#2b2340', 'eyes': '#2b2340', 'blush': '#d9776f',
        'shirt': '#4fa3c7', 'pants': '#f2c94c', 'socks': '#f6f1e7', 'shoes': '#e8594a',
    }, extras=[('cap', '#e8594a')]),
    'traveller': dict(base='boy', paint={
        'skin': '#d9a47e', 'skin-shade': '#bf8462', 'hair': '#6b4a32', 'brows': '#4a3424', 'eyes': '#2b2340',
        'shirt': '#d9674a', 'pants': '#5b6e8c', 'socks': '#6b4a32', 'shoes': '#3a2a20',
    }, extras=[('cap', '#3a6b5a'), ('backpack', '#6b8e4e')]),
    # Help seekers. Sarah, after her character sheet: dark teal bob (dark eyes like the villagers), a dark-green
    # gold-trimmed blazer over a white shirt with a buckled collar strap and a compass brooch, a
    # pleated green skirt with a gold hem line and a white frill, a brown belt, knee-high boots.
    'sarah': dict(base='girl', paint={
        'hair': '#1f4a44', 'eyes': '#2b2340', 'blush': '#f2b0a4',
        'shirt': '#1e3a30', 'arms': '#1e3a30', 'cuffs': '#1e3a30', 'pants': '#1e3a30',
        'legs': '#3a2a22', 'socks': '#3a2a22', 'shoes': '#2a1e18',
    }, extras=[('shirt-front', '#f6f1e7'), ('lapels', '#b8944a'), ('collar-strap', '#1b1b1f'), ('buckle', '#b8944a'),
               ('brooch', '#c9a04e'), ('frill', '#f6f1e7'), ('skirt', '#1e3a30'), ('skirt-trim', '#b8944a'),
               ('belt', '#5a3a26'), ('belt-buckle', '#b8944a')]),
    # Dr Fe, the hero: a scientist, all in black (sweater and trousers) with dark brown shoes, white
    # hair, and round black-framed glasses with clear lenses that cover her whole eyes. (The short lab
    # coat — 'coat' + 'coat-front' with coat_hem=0.2 — is left off.) (Her earlier detailed model public/models/dr-fe.glb is kept.)
    'dr-fe': dict(base='girl', loose=0.012, paint={
        'hair': '#f2f0eb', 'eyes': '#231c26', 'blush': '#f2b0a4',
        'shirt': '#18181c', 'arms': '#18181c', 'cuffs': '#18181c', 'pants': '#26262c', 'legs': '#26262c',
        'socks': '#26262c', 'shoes': '#3b2619',
    }, extras=[('glasses-round', '#141416'), ('waistband', '#5c3a24'), ('waist-buckle', '#c9a24e')]),
    # Captain T, the mentor, as a superhero: black hair, a blue spandex top with long sleeves, a big white
    # V panel on the chest (wide at the shoulders, a sharp point at the waist) with the navy diamond-T
    # emblem inside it, gold cuffs and a gold belt, white tights, yellow knee-high boots and a yellow cape.
    'captain-t': dict(base='boy', paint={
        'hair': '#16141a', 'brows': '#16141a', 'eyes': '#231c26',
        'shirt': '#2563d6', 'arms': '#2563d6', 'cuffs': '#2563d6', 'wristbands': '#2563d6',
        'pants': '#f4f3ef', 'legs': '#f2c230', 'socks': '#f2c230', 'shoes': '#e3ad1c',
    }, extras=[('cape', '#f2c230'), ('chest-v', '#f6f5f1'), ('emblem', '#0f1c4d'), ('wrist-cuffs', '#e3ad1c'),
               ('gold-belt', '#e3ad1c')]),
    # Mika, who farms the greenhouse: straw hat, full denim overalls (bib with a pocket and brass buttons,
    # straps crossing behind, trousers with rolled cuffs down to her boots), braids and freckles.
    'mika': dict(base='girl', paint={
        'skin': '#d9a47e', 'skin-shade': '#bf8462', 'hair': '#5a3a22', 'eyes': '#3a2a20', 'blush': '#d9776f',
        'shirt': '#c8553d', 'pants': '#4f6fa8', 'legs': '#4f6fa8', 'socks': '#6b4a32', 'shoes': '#6b4a32',
    }, extras=[('straw-hat', '#e8c872'), ('hat-band', '#c8553d'), ('braids', '#5a3a22'), ('bib', '#4f6fa8'), ('freckles', '#9a5a3a')]),
}

# Parts that ride the Head bone whatever their height (long hair hangs below the neck).
HEAD_PARTS = {'hair', 'eyes', 'brows', 'beard', 'blush', 'mouth'}

spec = VILLAGERS[who]
# Everyone shares Dr Fe's skin tone (the dominant colour of her skin texture), and a shade of it for
# noses, ears and necks; parts painted in the villager's own skin colour (bare hands) follow it.
SKIN, SKIN_SHADE = '#fdba9e', '#eda088'
own_skin = spec['paint'].get('skin')
spec['paint'] = {part: SKIN if hex_ == own_skin else hex_ for part, hex_ in spec['paint'].items()}
spec['paint'].update(skin=SKIN, **{'skin-shade': SKIN_SHADE})
matname, parts = BASES[spec['base']]


def linear(hex_):
    c = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]


materials = {}
def material(hex_):
    """One flat material per colour, shared by every part painted in it."""
    if hex_ not in materials:
        m = bpy.data.materials.new('c' + hex_[1:])
        m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = linear(hex_)
        bsdf.inputs['Roughness'].default_value = ROUGHNESS
        materials[hex_] = m
    return materials[hex_]


def glass():
    """Clear lens glass: almost invisible, a faint sheen."""
    m = bpy.data.materials.get('lens-glass')
    if m is None:
        m = bpy.data.materials.new('lens-glass')
        m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = (0.92, 0.96, 1.0, 1)
        bsdf.inputs['Alpha'].default_value = 0.1
        bsdf.inputs['Roughness'].default_value = 0.5
        bsdf.inputs['Specular IOR Level'].default_value = 0.1   # a bright sheen would hide the eyes
        m.surface_render_method = 'BLENDED'
    return m


# --- Load the base figure, normalise it ---------------------------------------------------------
meshes = body.load(src)
obj = next(o for o in meshes if o.data.materials[0].name == matname)
for o in meshes:
    if o is not obj:
        bpy.data.objects.remove(o)
select(obj)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
pts = [v.co for v in obj.data.vertices]
z0, z1 = min(p.z for p in pts), max(p.z for p in pts)
cx = sum(p.x for p in pts) / len(pts)
size = 1 / (z1 - z0)
obj.data.transform(Matrix.Diagonal((size, size, size, 1)) @ Matrix.Translation((-cx, 0, -z0)))
obj.name = 'Character'; obj.data.name = 'Character'

# --- Name each face's part from its palette colour, then repaint -------------------------------
img = next(n.image for n in obj.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE')
w, h = img.size
px = list(img.pixels)
uv = obj.data.uv_layers.active.data
face_part = []
for poly in obj.data.polygons:
    u = sum(uv[l].uv.x for l in poly.loop_indices) / poly.loop_total
    v = sum(uv[l].uv.y for l in poly.loop_indices) / poly.loop_total
    i = (min(h - 1, max(0, int(v % 1 * h))) * w + min(w - 1, max(0, int(u % 1 * w)))) * 4
    col = '#%02x%02x%02x' % tuple(int(round(px[i + k] * 255)) for k in range(3))
    part = parts.get(col)
    if callable(part):
        part = part(poly.center)
    if part is None:
        raise SystemExit('unmapped palette colour %s at %s' % (col, tuple(round(x, 2) for x in poly.center)))
    face_part.append((part, col))

obj.data.materials.clear()
slots = {}
for poly, (part, col) in zip(obj.data.polygons, face_part):
    hex_ = (spec['paint'].get(part) or spec['paint'].get(SAME_AS.get(part, ''))
            or (spec['paint'].get('skin') if part in SKIN_PARTS else None) or col)
    if hex_ not in slots:
        slots[hex_] = len(obj.data.materials)
        obj.data.materials.append(material(hex_))
    poly.material_index = slots[hex_]
# Which faces ride the head, kept through the subdivision as a face attribute.
head = obj.data.attributes.new('head', 'INT', 'FACE')
head.data.foreach_set('value', [int(part in HEAD_PARTS) for part, _ in face_part])

# Weld the pack's faces (each was its own island, for flat shading) so the surface is one piece,
# round it off, then scale it back to height 1 (subdividing pulls the extremes in).
bm = bmesh.new(); bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
# A few of the pack's faces are wound inside out (a lock of the girl's fringe): face everything outward.
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(obj.data); bm.free()
sub = obj.modifiers.new('round', 'SUBSURF')
sub.levels = sub.render_levels = SUBDIVIDE.get(who, 1)
select(obj)
bpy.ops.object.modifier_apply(modifier=sub.name)
pts = [v.co for v in obj.data.vertices]
z0, z1 = min(p.z for p in pts), max(p.z for p in pts)
obj.data.transform(Matrix.Diagonal((1 / (z1 - z0),) * 3 + (1,)) @ Matrix.Translation((0, 0, -z0)))
flags = [0] * len(obj.data.polygons)
obj.data.attributes['head'].data.foreach_get('value', flags)
head_verts = {vi for poly, f in zip(obj.data.polygons, flags) if f for vi in poly.vertices}
head_verts |= {v.index for v in obj.data.vertices if v.co.z > body.NECK}
obj.data.attributes.remove(obj.data.attributes['head'])
print('SUBDIVIDED', len(obj.data.vertices), 'verts,', len(head_verts), 'on the head')
for v in obj.data.vertices:
    v.co.x = feet_in(v.co.x, v.co.z)
# Thicker arms: each arm point moves out from the arm's axis (shoulder to wrist, still T-posed),
# easing in from the torso and out again over the hand so neither gets a step.
for v in obj.data.vertices:
    side = 1 if v.co.x >= 0 else -1
    a = Vector((side * SHOULDER_J[0], SHOULDER_J[1], SHOULDER_J[2]))
    b_ = Vector((side * WRIST_J[0], WRIST_J[1], WRIST_J[2]))
    p, t = intersect_point_line(v.co, a, b_)
    off = v.co - p
    w = ss(0.12, 0.16, abs(v.co.x)) * (1 - ss(0.235, 0.27, abs(v.co.x)))
    if w > 0 and off.length < 0.07 and v.index not in head_verts:
        v.co = p + off * (1 + (ARM_THICK - 1) * w)
# Long sleeves end in a straight cuff: the points where sleeve meets hand are moved along the arm's axis
# onto one plane across the wrist (the painted boundary otherwise zig-zags along the faces).
if 'arms' in spec['paint']:
    # Every colour change along the arm (sleeve to cuff, cuff to hand) gets its own straight ring.
    tone = [spec['paint']['arms'], spec['paint'].get('cuffs', spec['paint']['arms']), spec['paint']['skin']]
    tone = [slots[t] for i, t in enumerate(tone) if i == 0 or t != tone[i - 1]]
    bm_ = bmesh.new(); bm_.from_mesh(obj.data); bm_.verts.ensure_lookup_table()
    for sleeve, skin in zip(tone, tone[1:]):
        edge = [v for v in bm_.verts if abs(v.co.x) > 0.18
                and {f_.material_index for f_ in v.link_faces} >= {sleeve, skin}]
        for side in (1, -1):
            a = Vector((side * SHOULDER_J[0], SHOULDER_J[1], SHOULDER_J[2]))
            d = Vector((side * WRIST_J[0], WRIST_J[1], WRIST_J[2])) - a
            ring = [v for v in edge if v.co.x * side > 0]
            if not ring:
                continue
            t0 = sum((v.co - a).dot(d) for v in ring) / len(ring) / d.length_squared
            for v in ring:
                v.co += d * (t0 - (v.co - a).dot(d) / d.length_squared)
    bm_.to_mesh(obj.data); bm_.free()
# A tucked-in top blouses out a little just above the trousers' waistband.
if any(k == 'waistband' for k, _ in spec['extras']):
    top = slots[spec['paint']['shirt']]
    bm_ = bmesh.new(); bm_.from_mesh(obj.data); bm_.normal_update(); bm_.verts.ensure_lookup_table()
    move = {}
    for f_ in bm_.faces:
        if f_.material_index == top:
            for v in f_.verts:
                z = v.co.z
                w = ss(0.27, 0.3, z) * (1 - ss(0.3, 0.36, z))
                if w > 0 and abs(v.co.x) < 0.17:
                    move[v.index] = v.normal * 0.008 * w
    for i, d in move.items():
        bm_.verts[i].co += d
    bm_.to_mesh(obj.data); bm_.free()
# Loose armholes (`loose`: metres): around each shoulder the top stands off the body along its normals,
# most at the armpit and fading out within ARMHOLE of it, so the rest of the top stays fitted.
if spec.get('loose'):
    top = slots[spec['paint']['shirt']]
    bm_ = bmesh.new(); bm_.from_mesh(obj.data); bm_.normal_update(); bm_.verts.ensure_lookup_table()
    move = {}
    for f_ in bm_.faces:
        if f_.material_index != top:
            continue
        for v in f_.verts:
            pit = Vector((math.copysign(SHOULDER_J[0], v.co.x), SHOULDER_J[1], SHOULDER_J[2] - 0.02))
            w = 1 - ss(0.0, ARMHOLE, (v.co - pit).length)
            if w > 0 and v.index not in head_verts:
                move[v.index] = v.normal * spec['loose'] * w
    for i, d in move.items():
        bm_.verts[i].co += d
    bm_.to_mesh(obj.data); bm_.free()
print('PARTS', sorted({p for p, _ in face_part}))

# --- Accessories ---------------------------------------------------------------------------------
def add_part(name, bm, hex_, bone):
    """A new object from `bm`, painted and weighted rigid on `bone` (joined into the body later)."""
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material(hex_))
    for p in o.data.polygons:
        p.use_smooth = False
    o.vertex_groups.new(name=bone).add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
    return o


def cylinder(bm, r1, r2, depth, at, segments=20, rot=None):
    m = Matrix.Translation(at) @ (rot or Matrix.Identity(4))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r1, radius2=r2, depth=depth, matrix=m)


def sphere(bm, r, at, scale=(1, 1, 1), subdivisions=3):
    m = Matrix.Translation(at) @ Matrix.Diagonal((*scale, 1))
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=r, matrix=m)


def box(bm, size_, at):
    m = Matrix.Translation(at) @ Matrix.Diagonal((*size_, 1))
    bmesh.ops.create_cube(bm, size=1, matrix=m)


tree = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())


def front(x, z, lift=0.004, back=False):
    """The body's front (or back) surface, its y at x, z, raised by `lift`: for things that lie on it."""
    d = -1 if back else 1
    # Past the body's edge the ray misses: use the nearest point in towards the middle.
    for k in range(11):
        hit = tree.ray_cast(Vector((x * (1 - k / 10), -d, z)), Vector((0, d, 0)))[0]
        if hit:
            return hit.y - lift * d
    return -0.15 * d - lift * d


def patch(bm, x0, x1, z0, z1, lift=0.006, thick=0.01, n=6, back=False):
    """A cloth panel laid on the body's front (or back) over x0..x1, z0..z1, following its curve."""
    rows = [[bm.verts.new((x0 + (x1 - x0) * i / n, front(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * j / n, lift, back), z0 + (z1 - z0) * j / n))
             for i in range(n + 1)] for j in range(n + 1)]
    faces = [bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i])) for j in range(n) for i in range(n)]
    ret = bmesh.ops.extrude_face_region(bm, geom=faces)
    for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
        v.co.y += thick if back else -thick
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


# Vertices of the coat (Dr Fe), which below COAT_WAIST ride the hips alone.
coat_verts = set()
skirt_verts = set()
# Coat shell vertex -> the body vertex it was copied from (it takes that vertex's weights).
shell_from = {}
# Accessories whose vertices take the weights of the body under them (they lie on the chest).
on_chest = set()
COAT_WAIST = 0.29
# How far the coat stands off the body.
COAT_OUT = 0.012

HEAD = Vector((0, 0.03, 0.78))   # the head's middle; its crown is at z = 1, its face at y = -0.19
extras = []
for kind, hex_ in spec['extras']:
    bm = bmesh.new()
    if kind == 'chef-hat':
        cylinder(bm, 0.215, 0.215, 0.12, (0, 0.03, 0.93), 24)
        sphere(bm, 0.24, (0, 0.03, 1.04), (1, 1, 0.55))
        extras.append(add_part(kind, bm, hex_, 'Head'))
    elif kind == 'bucket-hat':
        cylinder(bm, 0.3, 0.3, 0.02, (0, 0.03, 0.9), 24)
        cylinder(bm, 0.235, 0.2, 0.18, (0, 0.03, 0.98), 24)
        extras.append(add_part(kind, bm, hex_, 'Head'))
    elif kind == 'cap':
        sphere(bm, 0.215, (0, 0.03, 0.87), (1.04, 1.14, 0.82), subdivisions=3)
        # The peak: a curved half-moon from the cap's front edge, longest in the middle, dipping a
        # little towards its tip and its sides like a real cap's bill.
        ax, ay, zb = 0.2178, 0.2387, 0.83   # the cap's outline at the peak's height
        cols = [(-0.8 + 1.6 * k / 16) for k in range(17)]
        grid = []
        for t in (0.0, 0.5, 1.0):
            row = []
            for th in cols:
                inner = 1 / math.sqrt((math.sin(th) / ax) ** 2 + (math.cos(th) / ay) ** 2) - 0.01
                reach = 0.11 * math.cos(th * 1.6) ** 0.7
                rr = inner + reach * t
                z = zb - 0.028 * t * t - 0.018 * (th / 0.8) ** 2
                row.append(bm.verts.new((math.sin(th) * rr, 0.03 - math.cos(th) * rr, z)))
            grid.append(row)
        bill = [bm.faces.new((grid[j][k], grid[j][k + 1], grid[j + 1][k + 1], grid[j + 1][k]))
                for j in range(2) for k in range(16)]
        ret = bmesh.ops.extrude_face_region(bm, geom=bill)
        for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
            v.co.z -= 0.012
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        # Hair the cap should cover is pulled inside it (a tuft poked through the crown).
        c, size = Vector((0, 0.03, 0.87)), Vector((0.215 * 1.04, 0.215 * 1.14, 0.215 * 0.82))
        hair = slots.get(spec['paint'].get('hair'))
        inside = {vi for p in obj.data.polygons if p.material_index == hair for vi in p.vertices}
        for vi in inside:
            co = obj.data.vertices[vi].co
            q = Vector(((co - c).x / size.x, (co - c).y / size.y, (co - c).z / size.z))
            if co.z > 0.86 and q.length > 0.94:
                obj.data.vertices[vi].co = c + Vector((q.x * size.x, q.y * size.y, q.z * size.z)) * (0.94 / q.length)
        extras.append(add_part(kind, bm, hex_, 'Head'))
    elif kind == 'coat':
        # One coat. Above the waist it is a single shell over the torso and both arms — the body's own
        # surface copied out a little, so the shoulders flow into the sleeves and bend with the body —
        # and below it a skirt flares to the hem, riding the hips (COAT_WAIST) so the legs swing inside.
        # The open front is drawn on it ('coat-front'). All of it goes into the body mesh, so it gets
        # bone-heat weights.
        bm.free()
        if hex_ not in slots:
            slots[hex_] = len(obj.data.materials)
            obj.data.materials.append(material(hex_))
        coat = slots[hex_]
        shirt = slots[spec['paint']['shirt']]
        body_bm = bmesh.new(); body_bm.from_mesh(obj.data); body_bm.normal_update()
        first = len(body_bm.verts)
        waist, hem, gap = COAT_WAIST, spec.get('coat_hem', 0.11), 0.3   # gap: half the skirt's opening, radians either side of front
        # Under the coat the shirt takes the coat's colour, so nothing dark shows if it pokes through.
        for f in body_bm.faces:
            if f.material_index == shirt and f.calc_center_median().z > waist:
                f.material_index = coat
        upper = [f for f in body_bm.faces if f.material_index == coat and f.calc_center_median().z > waist - 0.01]
        normals = {v: v.normal.copy() for f in upper for v in f.verts}
        dup = bmesh.ops.duplicate(body_bm, geom=list(normals) + list({e for f in upper for e in f.edges}) + upper)
        pairs = []
        for old, new in dup['vert_map'].items():
            if old in normals:
                new.co = old.co + normals[old] * COAT_OUT
                pairs.append((old, new))
        # The skirt grows straight down out of the shell's lower edge, so the coat is one surface: that
        # edge loop is extruded ring by ring to the hem, each ring a little lower and further out.
        shell = {new for _, new in pairs}
        edges = [e for e in body_bm.edges if all(v in shell for v in e.verts) and e.is_boundary]
        loops, seen = [], set()
        for e in edges:   # group the shell's open edges into loops (waist, neck, cuffs)
            if e in seen:
                continue
            group, todo = [], [e]
            while todo:
                x = todo.pop()
                if x in seen:
                    continue
                seen.add(x); group.append(x)
                todo += [y for v in x.verts for y in v.link_edges if y in edges and y not in seen]
            loops.append(group)
        loop = min(loops, key=lambda g: sum(v.co.z for x in g for v in x.verts) / (2 * len(g)))
        start = {v: (v.co.copy(), Vector((v.co.x, v.co.y + 0.02, 0)).normalized()) for x in loop for v in x.verts}
        steps = 8
        skirt_new = []
        for i in range(1, steps + 1):
            ret = bmesh.ops.extrude_edge_only(body_bm, edges=loop)
            new = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]
            # Each new vertex sits on the one it came from: carry its starting point and direction down.
            fresh = {}
            for v in new:
                src = next(w for e in v.link_edges for w in e.verts if w is not v and w in start)
                co, d = start[src]
                z = co.z - (co.z - hem) * i / steps
                v.co = Vector((co.x, co.y, z)) + d * (co.z - z) * 0.3
                fresh[v] = (co, d)
            start = fresh
            skirt_new += new
            loop = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMEdge) and all(v in fresh for v in g.verts)]
        for fc in {fc for v in skirt_new for fc in v.link_faces}:
            fc.material_index = coat
            fc.smooth = True
        bmesh.ops.recalc_face_normals(body_bm, faces=[f for f in body_bm.faces if f.material_index == coat])
        body_bm.verts.index_update()
        shell_from.update({new.index: old.index for old, new in pairs})
        skirt_verts.update(v.index for v in skirt_new)
        body_bm.to_mesh(obj.data); body_bm.free()
        coat_verts.update(range(first, len(obj.data.vertices)))
        # What comes after lies on the coat, so front() now measures the coat (from the mesh itself:
        # the depsgraph's copy would still be the body without it).
        coat_bm = bmesh.new(); coat_bm.from_mesh(obj.data)
        tree = BVHTree.FromBMesh(coat_bm); coat_bm.free()
    elif kind == 'coat-front':
        # The coat's open front: the black turtleneck showing down the middle, from the collar to the skirt.
        patch(bm, -0.034, 0.034, spec.get('coat_hem', 0.11) + 0.004, 0.53, lift=0.004, thick=0.004, n=12)
        extras.append(add_part(kind, bm, hex_, 'Spine1'))
        on_chest.add(kind)
    elif kind == 'glasses-round':
        # Sized and centred on the eyes themselves (the faces painted the eye colour).
        eye = slots[spec['paint']['eyes']]
        pts = [p.center for p in obj.data.polygons if p.material_index == eye and p.center.x > 0.02]
        cx = sum(p.x for p in pts) / len(pts)
        cz = sum(p.z for p in pts) / len(pts)
        r = max(max(abs(p.x - cx), abs(p.z - cz)) for p in pts) + 0.022
        lens = bmesh.new()
        rim_y = {}
        for s in (-1, 1):
            y = rim_y[s] = front(s * cx, cz, 0.016)
            at = Matrix.Translation((s * cx, y, cz)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
            loops = [bmesh.ops.create_circle(bm, cap_ends=False, segments=24, radius=q, matrix=at)['verts'] for q in (r + 0.011, r)]
            edges = [e for e in bm.edges if all(v in loops[0] or v in loops[1] for v in e.verts)]
            faces = bmesh.ops.bridge_loops(bm, edges=edges)['faces']
            ret = bmesh.ops.extrude_face_region(bm, geom=faces)
            for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
                v.co.y += 0.01
            bmesh.ops.create_circle(lens, cap_ends=True, segments=24, radius=r, matrix=Matrix.Translation((0, 0.004, 0)) @ at)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        def rod(p, q, w=0.011):
            """A thin square bar from p to q."""
            d = q - p
            m = (Matrix.Translation((p + q) / 2) @ d.to_track_quat('Y', 'Z').to_matrix().to_4x4()
                 @ Matrix.Diagonal((w, d.length + w, w, 1)))
            bmesh.ops.create_cube(bm, size=1, matrix=m)
        # Where each rim sits (mid-depth of its ring) and its inner and outer edges.
        ry = {s: rim_y[s] + 0.005 for s in (-1, 1)}
        # The bridge: from each rim's inner edge up and forward over the nose, so it meets both rims.
        nose = Vector((0, front(0, cz + 0.012, 0.01), cz + 0.012))
        for s in (-1, 1):
            rod(Vector((s * (cx - r - 0.004), ry[s], cz + 0.008)), nose)
        # Each arm runs from the rim's outer edge, where a hinge joins them, back towards the ear, and
        # tucks under the hair where it meets it (a piece showing past the hair would look cut off).
        for s in (-1, 1):
            hinge = Vector((s * (cx + r + 0.008), ry[s], cz))
            ear = Vector((s * 0.205, 0.03, cz + 0.01))
            box(bm, (0.014, 0.016, 0.016), hinge)
            ahead = (ear - hinge).normalized()
            start = hinge + ahead * 0.01
            hit = tree.ray_cast(start, ahead, (ear - start).length)[0]
            rod(hinge, hit + ahead * 0.006 if hit else ear)
        extras.append(add_part(kind, bm, hex_, 'Head'))
        o = add_part('lenses', lens, '#ffffff', 'Head')
        o.data.materials[0] = glass()
        extras.append(o)
    elif kind == 'waistband':
        # The top tucked into the trousers: their waistband, a band hugging the waist over the top's hem.
        z0, z1 = 0.262, 0.284
        rows = []
        for z in (z0, z1):
            ring = []
            for k in range(48):
                a = math.tau * k / 48
                d = Vector((math.sin(a), -math.cos(a), 0))
                o = Vector((0, 0.0, z))
                hit = tree.ray_cast(o, d, 1.0)[0]
                rr = ((hit - o).length if hit else 0.12) + 0.003
                ring.append(bm.verts.new(o + d * rr))
            rows.append(ring)
        for k in range(48):
            bm.faces.new((rows[0][k], rows[0][(k + 1) % 48], rows[1][(k + 1) % 48], rows[1][k]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ret = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
        for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
            v.co += Vector((v.co.x, v.co.y, 0)).normalized() * 0.003
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        extras.append(add_part(kind, bm, hex_, 'Hips'))
        on_chest.add(kind)
    elif kind == 'cape':
        # Hangs from the shoulders down the back to the knees, flaring out and away below the waist so the
        # legs swing clear of it; it rides the upper back.
        rows, cols = 12, 10
        grid = []
        for j in range(rows + 1):
            z = 0.53 - (0.53 - 0.12) * j / rows
            half = 0.1 + (0.53 - z) * 0.2
            row = []
            for i in range(cols + 1):
                x = -half + 2 * half * i / cols
                y = max(front(x, max(z, 0.3), 0.0, back=True), 0.06) + 0.03 + max(0.0, 0.34 - z) * 0.45 + (x / half) ** 2 * -0.02
                row.append(bm.verts.new((x, y, z)))
            grid.append(row)
        sheet = [bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])) for j in range(rows) for i in range(cols)]
        ret = bmesh.ops.extrude_face_region(bm, geom=sheet)
        for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
            v.co.y += 0.008
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        extras.append(add_part(kind, bm, hex_, 'Spine1'))
        # The clasps at the shoulders, where it fastens.
        clasp = bmesh.new()
        for s in (-1, 1):
            sphere(clasp, 0.022, (s * 0.1, front(s * 0.1, 0.5, 0.008), 0.5), (1, 0.5, 1))
        extras.append(add_part('cape-clasps', clasp, '#e3ad1c', 'Spine2'))
        on_chest.add('cape-clasps')
    elif kind == 'emblem':
        # A navy diamond with a T in it, sized to sit inside the white chest V just below the collar.
        cz, r, w = 0.44, 0.032, 0.0075
        y = front(0, cz, 0.012)
        def bar(p, q):
            (x0, z0), (x1, z1) = p, q
            m = (Matrix.Translation(((x0 + x1) / 2, y, (z0 + z1) / 2)) @ Matrix.Rotation(-math.atan2(z1 - z0, x1 - x0), 4, 'Y')
                 @ Matrix.Diagonal((math.hypot(x1 - x0, z1 - z0) + w, 0.004, w, 1)))
            bmesh.ops.create_cube(bm, size=1, matrix=m)
        top, right, bottom, left = (0, cz + r), (r, cz), (0, cz - r), (-r, cz)
        for p, q in ((top, right), (right, bottom), (bottom, left), (left, top)):
            bar(p, q)
        bar((-r, cz), (r, cz))             # the T's crossbar, corner to corner
        bar((0, cz), (0, cz - r))          # and its stem, down to the bottom corner
        for v in bm.verts:   # onto the chest's curve
            v.co.y += front(v.co.x, v.co.z, 0.012) - y
        extras.append(add_part(kind, bm, hex_, 'Spine1'))
        on_chest.add(kind)
    elif kind == 'chest-v':
        # A white V on the chest: wide across the shoulders, narrowing to a sharp point at the waist.
        n, k = 8, 14
        rows = [(0.49 - (0.49 - 0.3) * j / k, max(0.1 * (1 - j / k), 0.002)) for j in range(k + 1)]
        grid = [[bm.verts.new((hw * (2 * i / n - 1), front(hw * (2 * i / n - 1), z, 0.004), z)) for i in range(n + 1)] for z, hw in rows]
        faces = [bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])) for j in range(k) for i in range(n)]
        ret = bmesh.ops.extrude_face_region(bm, geom=faces)
        for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
            v.co.y -= 0.004
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        extras.append(add_part(kind, bm, hex_, 'Spine1'))
        on_chest.add(kind)
    elif kind == 'gold-belt':
        # A band round the waist, cast onto the body.
        rings = []
        for z in (0.262, 0.29):
            ring = []
            for k in range(48):
                a = math.tau * k / 48
                d = Vector((math.sin(a), -math.cos(a), 0))
                o = Vector((0, 0, z))
                hit = tree.ray_cast(o, d, 1.0)[0]
                ring.append(bm.verts.new(o + d * (((hit - o).length if hit else 0.12) + 0.009)))
            rings.append(ring)
        for k in range(48):
            bm.faces.new((rings[0][k], rings[0][(k + 1) % 48], rings[1][(k + 1) % 48], rings[1][k]))
        ret = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
        for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
            v.co += Vector((v.co.x, v.co.y, 0)).normalized() * 0.004
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        extras.append(add_part(kind, bm, hex_, 'Hips'))
        on_chest.add(kind)
    elif kind == 'wrist-cuffs':
        # A gold band round each wrist, cast onto the arm round its axis (still T-posed here).
        for side in (1, -1):
            a = Vector((side * SHOULDER_J[0], SHOULDER_J[1], SHOULDER_J[2]))
            d = (Vector((side * WRIST_J[0], WRIST_J[1], WRIST_J[2])) - a).normalized()
            u = d.cross(Vector((0, 1, 0))).normalized()
            w_ = d.cross(u).normalized()
            band = bmesh.new()
            rings = []
            for t in (-0.026, 0.0):
                c = Vector((side * WRIST_J[0], WRIST_J[1], WRIST_J[2])) + d * t
                ring = []
                for k in range(24):
                    ang = math.tau * k / 24
                    dirn = u * math.cos(ang) + w_ * math.sin(ang)
                    hit = tree.ray_cast(c, dirn, 0.2)[0]
                    ring.append(band.verts.new(c + dirn * (((hit - c).length if hit else 0.04) + 0.006)))
                rings.append(ring)
            for k in range(24):
                band.faces.new((rings[0][k], rings[0][(k + 1) % 24], rings[1][(k + 1) % 24], rings[1][k]))
            bmesh.ops.recalc_face_normals(band, faces=band.faces)
            o = add_part(kind, band, hex_, ('Left' if side > 0 else 'Right') + 'ForeArm')
            o.name = kind
            extras.append(o)
        on_chest.add(kind)
    elif kind == 'waist-buckle':
        # A buckle at the front of the waistband (the belt).
        y = front(0, 0.273, 0.01)
        box(bm, (0.03, 0.006, 0.026), (0, y, 0.273))
        extras.append(add_part(kind, bm, hex_, 'Hips'))
        on_chest.add(kind)
    elif kind == 'flower':
        for k in range(5):
            a = k * math.tau / 5
            sphere(bm, 0.035, (0.15 + math.cos(a) * 0.04, -0.06, 0.93 + math.sin(a) * 0.04))
        extras.append(add_part(kind, bm, hex_, 'Head'))
        centre = bmesh.new()
        sphere(centre, 0.03, (0.15, -0.075, 0.93))
        extras.append(add_part('flower-centre', centre, '#f2c94c', 'Head'))
    elif kind == 'apron':
        # A cook's apron: a bib on the chest hung from a strap round the neck, a skirt from the waist to the
        # knees hanging straight down over the belly (not clinging to the legs), ties round the waist and a
        # front pocket.
        patch(bm, -0.075, 0.075, 0.33, 0.47, lift=0.006, n=6)
        for s in (-1, 1):
            patch(bm, s * 0.055, s * 0.075, 0.47, 0.53, lift=0.006, n=2)
        extras.append(add_part(kind, bm, hex_, 'Spine1'))
        on_chest.add(kind)
        skirt = bmesh.new()
        n, k = 8, 8
        top = 0.33
        def drape(x, z, extra=0.0):
            # Round the belly at the waist, then straight down (the legs swing behind it, never through).
            return front(x, max(z, 0.27), 0.014) - 0.016 * max(0.0, 0.27 - z) / 0.12 - extra
        grid = []
        for j in range(k + 1):
            z = top - (top - 0.15) * j / k
            hw = 0.12 + 0.01 * j / k
            grid.append([skirt.verts.new((hw * (2 * i / n - 1), drape(hw * (2 * i / n - 1), z), z)) for i in range(n + 1)])
        faces = [skirt.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])) for j in range(k) for i in range(n)]
        ret = bmesh.ops.extrude_face_region(skirt, geom=faces)
        for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
            v.co.y += 0.008
        bmesh.ops.recalc_face_normals(skirt, faces=skirt.faces)
        extras.append(add_part('apron-skirt', skirt, hex_, 'Hips'))
        # Ties: a band round the waist, knotted at the back.
        ties = bmesh.new()
        rings = []
        for z in (0.322, 0.34):
            ring = []
            for q in range(40):
                a = math.tau * q / 40
                d = Vector((math.sin(a), -math.cos(a), 0))
                o = Vector((0, 0, z))
                hit = tree.ray_cast(o, d, 1.0)[0]
                ring.append(ties.verts.new(o + d * (((hit - o).length if hit else 0.15) + 0.008)))
            rings.append(ring)
        for q in range(40):
            ties.faces.new((rings[0][q], rings[0][(q + 1) % 40], rings[1][(q + 1) % 40], rings[1][q]))
        bmesh.ops.recalc_face_normals(ties, faces=ties.faces)
        for s in (-1, 1):
            sphere(ties, 0.016, (s * 0.018, front(s * 0.018, 0.331, 0.012, True), 0.331), (1.2, 0.6, 0.8))
            box(ties, (0.014, 0.006, 0.07), (s * 0.03, front(s * 0.03, 0.29, 0.014, True), 0.29))
        extras.append(add_part('apron-ties', ties, hex_, 'Hips'))
        on_chest.add('apron-ties')
        pocket = bmesh.new()
        rows = [[pocket.verts.new((x, drape(x, z, 0.004), z)) for x in (-0.06 + 0.03 * i for i in range(5))] for z in (0.26, 0.235, 0.21)]
        pf = [pocket.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i])) for j in range(2) for i in range(4)]
        ret = bmesh.ops.extrude_face_region(pocket, geom=pf)
        for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
            v.co.y -= 0.003
        bmesh.ops.recalc_face_normals(pocket, faces=pocket.faces)
        extras.append(add_part('apron-pocket', pocket, '#b9553c', 'Hips'))
    elif kind == 'shirt-front':
        # The white shirt showing between the blazer's lapels, and its collar points.
        patch(bm, -0.032, 0.032, 0.35, 0.505, lift=0.003, thick=0.004, n=4)
        for s in (-1, 1):
            patch(bm, s * 0.012, s * 0.05, 0.475, 0.505, lift=0.006, thick=0.006, n=2)
        extras.append(add_part(kind, bm, hex_, 'Spine2'))
    elif kind == 'lapels':
        for s in (-1, 1):
            patch(bm, s * 0.032, s * 0.042, 0.35, 0.5, lift=0.005, thick=0.004, n=4)
        extras.append(add_part(kind, bm, hex_, 'Spine2'))
    elif kind == 'collar-strap':
        patch(bm, -0.03, 0.03, 0.495, 0.512, lift=0.008, thick=0.005, n=3)
        extras.append(add_part(kind, bm, hex_, 'Spine2'))
    elif kind == 'buckle':
        box(bm, (0.022, 0.006, 0.018), (0, front(0, 0.503, 0.014), 0.503))
        extras.append(add_part(kind, bm, hex_, 'Spine2'))
    elif kind == 'brooch':
        sphere(bm, 0.018, (0.06, front(0.06, 0.44, 0.006), 0.44), (1, 0.35, 1), subdivisions=2)
        extras.append(add_part(kind, bm, hex_, 'Spine2'))
    elif kind == 'frill':
        # A white ruffle peeking out under the skirt's hem.
        cylinder(bm, 0.172, 0.16, 0.022, (0, 0.0, 0.152), 24)
        extras.append(add_part(kind, bm, hex_, 'Hips'))
    elif kind == 'skirt-trim':
        cylinder(bm, 0.163, 0.159, 0.008, (0, 0.0, 0.168), 24)
        extras.append(add_part(kind, bm, hex_, 'Hips'))
    elif kind == 'belt':
        cylinder(bm, 0.122, 0.12, 0.02, (0, 0.0, 0.275), 24)
        extras.append(add_part(kind, bm, hex_, 'Hips'))
    elif kind == 'belt-buckle':
        box(bm, (0.03, 0.008, 0.024), (0.03, -0.122, 0.275))
        extras.append(add_part(kind, bm, hex_, 'Hips'))
    elif kind == 'buns':
        for s in (-1, 1):
            sphere(bm, 0.075, (s * 0.15, 0.08, 0.96), subdivisions=3)
        extras.append(add_part(kind, bm, hex_, 'Head'))
    elif kind == 'straw-hat':
        cylinder(bm, 0.34, 0.34, 0.016, (0, 0.03, 0.89), 24)
        cylinder(bm, 0.225, 0.19, 0.15, (0, 0.03, 0.97), 24)
        extras.append(add_part(kind, bm, hex_, 'Head'))
    elif kind == 'hat-band':
        cylinder(bm, 0.23, 0.225, 0.035, (0, 0.03, 0.915), 24)
        extras.append(add_part(kind, bm, hex_, 'Head'))
    elif kind == 'braids':
        for s in (-1, 1):
            sphere(bm, 0.045, (s * 0.17, 0.1, 0.5), (1, 1, 2.2), subdivisions=3)
            sphere(bm, 0.03, (s * 0.17, 0.1, 0.39), subdivisions=2)
        extras.append(add_part(kind, bm, hex_, 'Head'))
    elif kind == 'freckles':
        for s in (-1, 1):
            for dx, dz in ((0.0, 0.0), (0.03, 0.012), (0.018, -0.02)):
                sphere(bm, 0.008, (s * (0.09 + dx), front(s * (0.09 + dx), 0.62 + dz, 0.0), 0.62 + dz), (1, 0.35, 1), subdivisions=1)
        extras.append(add_part(kind, bm, hex_, 'Head'))
    elif kind == 'skirt':
        # A short pleated skirt over the shorts, flaring from the waist.
        cylinder(bm, 0.165, 0.118, 0.13, (0, 0.0, 0.215), 10)
        extras.append(add_part(kind, bm, hex_, 'Hips'))
    elif kind == 'bow':
        y = front(0, 0.49, 0.012)
        for s in (-1, 1):
            sphere(bm, 0.03, (s * 0.032, y, 0.49), (1.2, 0.5, 0.8))
        sphere(bm, 0.017, (0, y - 0.01, 0.49))
        extras.append(add_part(kind, bm, hex_, 'Spine2'))
    elif kind == 'bib':
        # The overalls' top: a bib from the waistband up the chest, straps over the shoulders crossing
        # into an X on the back, a back panel at the waist, a chest pocket, brass buttons where the
        # straps fasten, a stitched waistband and rolled cuffs at the ankles.
        patch(bm, -0.07, 0.07, 0.26, 0.45, n=8)
        patch(bm, -0.1, 0.1, 0.26, 0.33, n=6, back=True)
        for s in (-1, 1):
            patch(bm, s * 0.045, s * 0.068, 0.44, 0.52, n=2)
            # each strap runs from its shoulder down and across to the other side of the back
            n = 6
            rows = []
            for j in range(n + 1):
                t = j / n
                z = 0.52 - (0.52 - 0.33) * t
                xc = s * (0.057 - 0.11 * t)
                rows.append([bm.verts.new((xc + dx, front(xc + dx, z, 0.006, True), z)) for dx in (-0.012, 0.012)])
            faces = [bm.faces.new((rows[j][0], rows[j][1], rows[j + 1][1], rows[j + 1][0])) for j in range(n)]
            ret = bmesh.ops.extrude_face_region(bm, geom=faces)
            for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
                v.co.y += 0.008
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        extras.append(add_part(kind, bm, hex_, 'Spine1'))
        on_chest.add(kind)
        detail = bmesh.new()
        patch(detail, -0.036, 0.036, 0.365, 0.415, lift=0.018, thick=0.004, n=3)   # the bib pocket
        extras.append(add_part('bib-pocket', detail, '#3f5c8f', 'Spine1'))
        on_chest.add('bib-pocket')
        buttons = bmesh.new()
        for s in (-1, 1):
            sphere(buttons, 0.011, (s * 0.057, front(s * 0.057, 0.44, 0.022), 0.44), (1, 0.5, 1))
            sphere(buttons, 0.009, (s * 0.1, front(s * 0.1, 0.28, 0.016), 0.28), (1, 0.5, 1))
        extras.append(add_part('bib-buttons', buttons, '#c9a24e', 'Spine1'))
        on_chest.add('bib-buttons')
        cuffs = bmesh.new()
        for side in (1, -1):
            for z0, z1 in ((0.075, 0.1),):
                rings = []
                for z in (z0, z1):
                    ring = []
                    c = Vector((side * body.ANKLE_J[0], body.ANKLE_J[1], z))
                    for k in range(20):
                        a = math.tau * k / 20
                        d = Vector((math.sin(a), -math.cos(a), 0))
                        hit = tree.ray_cast(c, d, 0.2)[0]
                        ring.append(cuffs.verts.new(c + d * (((hit - c).length if hit else 0.045) + 0.006)))
                    rings.append(ring)
                for k in range(20):
                    cuffs.faces.new((rings[0][k], rings[0][(k + 1) % 20], rings[1][(k + 1) % 20], rings[1][k]))
        bmesh.ops.recalc_face_normals(cuffs, faces=cuffs.faces)
        extras.append(add_part('overall-cuffs', cuffs, '#6f8cc0', 'Hips'))
        on_chest.add('overall-cuffs')
    elif kind == 'backpack':
        box(bm, (0.19, 0.09, 0.2), (0, 0.15, 0.4))
        box(bm, (0.14, 0.02, 0.08), (0, 0.205, 0.36))
        extras.append(add_part(kind, bm, hex_, 'Spine1'))
    else:
        raise SystemExit('unknown accessory ' + kind)

# --- Rig and weights -----------------------------------------------------------------------------
rig = body.build_rig(SHOULDER_J, ELBOW_J, WRIST_J, HAND_TIP)
# Bone-heat weights (each vertex shared by every bone near it, so shoulders, hips and knees bend
# smoothly instead of creasing where one bone hands over to the next), then smoothed further over
# the mesh. The head and everything on it stays rigid on Head.
select(obj, rig, active=rig)
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
select(obj)
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.5, repeat=WEIGHT_SMOOTH)
bpy.ops.object.mode_set(mode='OBJECT')
for g in obj.vertex_groups:
    g.remove(list(head_verts))
obj.vertex_groups['Head'].add(list(head_verts), 1.0, 'REPLACE')
# Bone heat weights a shell standing off the body by its own reach (the chest of the coat would
# follow the arms): each shell vertex takes the weights of the body vertex under it instead.
for new, old in shell_from.items():
    for g in obj.vertex_groups:
        g.remove([new])
    for g in obj.data.vertices[old].groups:
        obj.vertex_groups[g.group].add([new], g.weight, 'REPLACE')
skirt = list(skirt_verts)
for g in obj.vertex_groups:
    g.remove(skirt)
for i in skirt:
    z = obj.data.vertices[i].co.z
    up = min(1.0, max(0.0, (z - (COAT_WAIST - 0.06)) / 0.06))   # near the waist it eases onto the spine
    obj.vertex_groups['Hips'].add([i], 1 - up, 'REPLACE')
    if up > 0:
        obj.vertex_groups['Spine'].add([i], up, 'REPLACE')
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
# Bone heat can miss a shell lying just over the body (Dr Fe's coat): those vertices copy the
# weights of the nearest vertex that got some.
bare = [v for v in obj.data.vertices if not v.groups]
if bare:
    weighted = [v for v in obj.data.vertices if v.groups]
    kd = KDTree(len(weighted))
    for i, v in enumerate(weighted):
        kd.insert(v.co, i)
    kd.balance()
    for v in bare:
        src = weighted[kd.find(v.co)[1]]
        for g in src.groups:
            obj.vertex_groups[g.group].add([v.index], g.weight, 'REPLACE')
    print('WEIGHTS copied to', len(bare), 'vertices bone heat missed')
for m in [m for m in obj.modifiers if m.type == 'ARMATURE']:
    obj.modifiers.remove(m)

# Pieces lying on the chest take the weights of the nearest body vertex, so they move with it.
chest = [o for o in extras if o.name.split('.')[0] in on_chest]
if chest:
    kd = KDTree(len(obj.data.vertices))
    for v in obj.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    for o in chest:
        o.vertex_groups.clear()
        for b_ in rig.data.bones:
            o.vertex_groups.new(name=b_.name)
        for v in o.data.vertices:
            src = obj.data.vertices[kd.find(v.co)[1]]
            for g in src.groups:
                o.vertex_groups[obj.vertex_groups[g.group].name].add([v.index], g.weight, 'REPLACE')
if extras:
    select(*extras, obj, active=obj)
    bpy.ops.object.join()
am = obj.modifiers.new('rig', 'ARMATURE'); am.object = rig
obj.parent = rig
select(obj)
bpy.ops.object.shade_smooth_by_angle(angle=SHARP)

body.lower_arms(rig, obj, ARM_DOWN)
body.outline(obj)
body.finish(rig, obj, out)

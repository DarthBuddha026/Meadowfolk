"""Build the shared character body (public/models/base-character.glb) from the chibi base mesh.

Source: "©mazko free lowpoly chibi base model" (CC-BY-4.0, https://sketchfab.com/mazkoexe):
an untextured T-posed body plus a black "solidify" outline shell (an inverted hull: its
faces point inward, so normal back-face culling draws it as a silhouette line).

Usage: blender -b --factory-startup -P scripts/build-base-character.py -- <in.glb> <out.glb> ["Material=r,g,b" ...]

The same script builds a *dressed* hero (e.g. public/models/dr-fe.glb from Dr Fe's
DR.FE.glb): the base body plus separate clothing meshes sized to it, no outline. Dense
clothing is decimated, skin the clothes cover is removed (it would poke through as the
body bends) and a black outline shell is grown around the whole figure. "Material=r,g,b"
sets a material's linear base colour (for colours Blender's glTF exporter drops, such as
ones driven by a colour ramp).

The model keeps its own look (its materials + the outline). The script only
(Blender coords: z up, model faces -Y, character's left = +x):
- normalises it to height 1 with feet at z = 0;
- lowers the T-posed arms close to the sides (a smooth rotation about each shoulder), body
  and outline alike;
- brings the outward-splayed legs in (a shear toward the centre line that keeps the soles
  flat), so the feet stand closer together;
- adds a Mixamo-style 22-bone skeleton like WoraWork's characters — Hips > Spine > Spine1 >
  Spine2 > Neck > Head; Shoulder > Arm > ForeArm > Hand and UpLeg > Leg > Foot > ToeBase per
  side — with smooth geometric (position-based) weights, so body and outline always bend
  identically;
- keyframes the clips `character-model.tsx` plays and crossfades: Idle, Lookaround, Talk,
  Walk and Run (one NLA track each, exported as glTF animations; shared with other bodies
  in character_clips.py).
Measurements below are fractions of the body height, read from height slices of the mesh.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import character_clips as clips
from character_clips import SIDES, BONES

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
colours = {k: tuple(float(c) for c in v.split(',')) for k, v in (a.rsplit('=', 1) for a in argv[2:])}

# Dressed models only: clothing meshes above this many vertices are decimated to it; skin
# whose outward normal meets clothing within COVERED (body heights) is removed; OUTLINE is
# the outline shell's thickness (the mazko outline is about this much larger than its body).
DENSE = 15000
COVERED = 0.02
OUTLINE = 0.0035

NECK = 0.765         # the head starts here
# Torso joints (z) and the blend half-width around each.
WAIST, SPINE1, RIBS, THROAT = 0.53, 0.59, 0.65, 0.745
# Legs splay outward (ankle centres at |x| 0.098); each leg is sheared in by up to LEG_IN,
# fading in from the crotch down to the ankle.
LEG_IN = 0.03
LEG_SHEAR = (0.45, 0.07)
def leg_in(z):
    return LEG_IN * ss(LEG_SHEAR[0], LEG_SHEAR[1], z)
# Leg joints along each (outward-angled) leg, as measured: (x, y, z).
HIP_J = (0.047, -0.02, 0.47)
KNEE_J = (0.076, -0.02, 0.26)
ANKLE_J = (0.098, -0.01, 0.075)
BALL_J = (0.098, -0.07, 0.025)   # where the toes bend
TOE_J = (0.098, -0.128, 0.02)
# Arm joints measured along the T-posed arm (|x| at z 0.725); moved down with the arm.
ELBOW_X, WRIST_X = 0.215, 0.345
ARM_Z = 0.64         # arms are the only geometry wider than the torso above this
SHOULDER = (0.085, 0.72)
CLAVICLE_X = 0.025   # collarbones run from here out to the shoulder joint
ARM_BLEND = (0.065, 0.125)  # |x| range over which the shoulder blends from body to arm
ARM_DOWN = math.radians(80)
CROTCH = 0.47

def ss(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
for o in [o for o in bpy.context.scene.objects if o.type == 'EMPTY']:
    bpy.data.objects.remove(o)
for o in meshes:
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Weld split vertices (UV seams) so recomputed normals stay smooth across them.
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(o.data); bm.free()
    if o.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()

def height(o):
    zs = [v.co.z for v in o.data.vertices]
    return max(zs) - min(zs)
# The body is the tallest mesh that isn't the outline (clothes only cover part of it).
body = max([o for o in meshes if 'outline' not in o.name], key=height)
dressed = not any('outline' in o.name for o in meshes)
# Normalise by the body (the outline is a hair larger): height 1, feet on z = 0.
vs = [v.co for v in body.data.vertices]
zmin = min(v.z for v in vs); h = max(v.z for v in vs) - zmin
for o in meshes:
    for v in o.data.vertices:
        v.co = Vector((v.co.x / h, v.co.y / h, (v.co.z - zmin) / h))
    o.data.update()

for m in bpy.data.materials:
    if m.name in colours and m.use_nodes:
        bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = (*colours[m.name], 1.0)

if dressed:
    clothes = [o for o in meshes if o is not body]
    for o in clothes:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        n = len(o.data.vertices)
        if n > DENSE:
            dec = o.modifiers.new('decimate', 'DECIMATE'); dec.ratio = DENSE / n
            bpy.ops.object.modifier_apply(modifier=dec.name)
            print('DECIMATED', o.name, n, '->', len(o.data.vertices))
    # Skin under the clothes: any face whose outward normal meets clothing close by.
    verts, polys = [], []
    for o in clothes:
        base = len(verts)
        verts += [v.co.copy() for v in o.data.vertices]
        polys += [[base + i for i in p.vertices] for p in o.data.polygons]
    cloth = BVHTree.FromPolygons(verts, polys)
    bm = bmesh.new(); bm.from_mesh(body.data); bm.normal_update()
    covered =[f for f in bm.faces if cloth.ray_cast(f.calc_center_median() + f.normal * 1e-4, f.normal, COVERED)[0] is not None]
    print('COVERED SKIN FACES', len(covered), 'of', len(bm.faces))
    bmesh.ops.delete(bm, geom=covered, context='FACES')
    bm.to_mesh(body.data); bm.free()

# One object: body + outline share the rig and the weights.
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
obj = body
obj.name = 'Character'; obj.data.name = 'Character'

if dressed:
    # Grow the outline the mazko body has: an inverted hull — a copy of every face pushed
    # out along the smooth vertex normals and turned inside out, in a single-sided black.
    black = bpy.data.materials.new('solidifyoutline'); black.use_nodes = True
    bsdf = next(n for n in black.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    bsdf.inputs['Roughness'].default_value = 0.8
    black.use_backface_culling = True
    obj.data.materials.append(black)
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.normal_update()
    normals = {v: v.normal.copy() for v in bm.verts}
    dup = bmesh.ops.duplicate(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:])
    for old, new in dup['vert_map'].items():
        if old in normals:   # the map runs both ways
            new.co = old.co + normals[old] * OUTLINE
    shell = [f for f in dup['geom'] if isinstance(f, bmesh.types.BMFace)]
    bmesh.ops.reverse_faces(bm, faces=shell)
    for f in shell:
        f.material_index = len(obj.data.materials) - 1
    bm.to_mesh(obj.data); bm.free()

# Arm weights from the T-pose, then lower the arms (rotation about each shoulder, in the
# x/z plane, blended across the shoulder so the joint bends smoothly).
sx, sz = SHOULDER
arm_w = {}
arm_x = {}
tpose = {}   # (|x|, z) before any reposing, for the collarbone and leg weights
for v in obj.data.vertices:
    x, y, z = v.co
    arm_x[v.index] = abs(x)
    tpose[v.index] = (abs(x), z)
    w = ss(ARM_BLEND[0], ARM_BLEND[1], abs(x)) if ARM_Z < z < NECK else 0.0
    arm_w[v.index] = w
    if w <= 0:
        continue
    s = 1 if x > 0 else -1
    a = ARM_DOWN * w
    dx, dz = x - s * sx, z - sz
    nx = dx * math.cos(a) + s * dz * math.sin(a)
    nz = -s * dx * math.sin(a) + dz * math.cos(a)
    v.co = Vector((s * sx + nx, y, sz + nz))
# Bring the legs in (|x| shrinks; horizontal slices only slide, so the soles stay flat).
for v in obj.data.vertices:
    x, y, z = v.co
    if z < LEG_SHEAR[0] and abs(x) > 1e-4:
        s = 1 if x > 0 else -1
        v.co.x = x - s * leg_in(z) * ss(0.0, 0.02, abs(x))
HIP_J, KNEE_J, ANKLE_J, BALL_J, TOE_J = [(j[0] - leg_in(j[2]), j[1], j[2]) for j in (HIP_J, KNEE_J, ANKLE_J, BALL_J, TOE_J)]
print("LEG JOINTS", [tuple(round(c, 3) for c in j) for j in (HIP_J, KNEE_J, ANKLE_J, BALL_J, TOE_J)])
for p in obj.data.polygons:
    p.use_smooth = True
obj.data.update()

hand = Vector((0.0, 0.0, 9.0))
for v in obj.data.vertices:
    if arm_w[v.index] > 0.99 and v.co.x > 0 and v.co.z < hand.z:
        hand = v.co.copy()
print('LOWEST LEFT HAND VERT', tuple(round(c, 3) for c in hand))

def lowered(ax, az=0.725):
    # Where a point on the T-posed left arm ends up after the repose rotation.
    dx, dz = ax - sx, az - sz
    return Vector((sx + dx * math.cos(ARM_DOWN) + dz * math.sin(ARM_DOWN), 0, sz - dx * math.sin(ARM_DOWN) + dz * math.cos(ARM_DOWN)))
ELBOW = lowered(ELBOW_X); WRIST = lowered(WRIST_X)
print('ELBOW', tuple(round(c, 3) for c in ELBOW), 'WRIST', tuple(round(c, 3) for c in WRIST))

# ---------------------------------------------------------------------------------------
# Rig: a Mixamo-style humanoid skeleton (the naming and hierarchy WoraWork's characters use).
arm_data = bpy.data.armatures.new('Rig'); rig = bpy.data.objects.new('Rig', arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name); b.head = head; b.tail = tail
    if parent: b.parent = arm_data.edit_bones[parent]
bone('Hips', (0, 0, CROTCH), (0, 0, WAIST))
bone('Spine', (0, 0, WAIST), (0, 0, SPINE1), 'Hips')
bone('Spine1', (0, 0, SPINE1), (0, 0, RIBS), 'Spine')
bone('Spine2', (0, 0, RIBS), (0, 0, THROAT), 'Spine1')
bone('Neck', (0, 0, THROAT), (0, 0, NECK + 0.01), 'Spine2')
bone('Head', (0, 0, NECK + 0.01), (0, 0, 1.0), 'Neck')
for s, side in ((1, 'Left'), (-1, 'Right')):
    m = lambda p: (s * p[0], p[1], p[2])
    bone(side + 'Shoulder', (s * CLAVICLE_X, 0, sz - 0.005), (s * sx, 0, sz), 'Spine2')
    bone(side + 'Arm', (s * sx, 0, sz), (s * ELBOW.x, 0, ELBOW.z), side + 'Shoulder')
    bone(side + 'ForeArm', (s * ELBOW.x, 0, ELBOW.z), (s * WRIST.x, 0, WRIST.z), side + 'Arm')
    bone(side + 'Hand', (s * WRIST.x, 0, WRIST.z), (s * hand.x, 0, hand.z), side + 'ForeArm')
    bone(side + 'UpLeg', m(HIP_J), m(KNEE_J), 'Hips')
    bone(side + 'Leg', m(KNEE_J), m(ANKLE_J), side + 'UpLeg')
    bone(side + 'Foot', m(ANKLE_J), m(BALL_J), side + 'Leg')
    bone(side + 'ToeBase', m(BALL_J), m(TOE_J), side + 'Foot')
bpy.ops.object.mode_set(mode='OBJECT')

groups = {nm: obj.vertex_groups.new(name=nm) for nm in BONES}
for v in obj.data.vertices:
    x, y, z = v.co
    side = 'Left' if x > 0 else 'Right'
    w = {}
    arm = arm_w[v.index]
    if arm > 0:
        # Split the arm along its T-pose length: upper arm | forearm | hand.
        ax = arm_x[v.index]
        hand_w = ss(WRIST_X - 0.015, WRIST_X + 0.02, ax)
        fore_w = (1 - hand_w) * ss(ELBOW_X - 0.025, ELBOW_X + 0.025, ax)
        w[side + 'Hand'] = arm * hand_w
        w[side + 'ForeArm'] = arm * fore_w
        w[side + 'Arm'] = arm * (1 - hand_w - fore_w)
    else:
        hd = ss(NECK - 0.02, NECK + 0.02, z)
        if hd > 0:
            w['Head'] = hd
        # Measured before the legs were brought in, so the inner edges of the feet stay
        # fully on the legs.
        leg = (1 - ss(CROTCH - 0.07, CROTCH + 0.01, z)) * ss(0.0, 0.025, tpose[v.index][0])
        if leg > 0:
            foot_w = 1 - ss(ANKLE_J[2] - 0.02, ANKLE_J[2] + 0.025, z)
            shin_w = (1 - foot_w) * (1 - ss(KNEE_J[2] - 0.03, KNEE_J[2] + 0.03, z))
            # The front of the foot (ahead of the ball, model faces -y) bends at the toes.
            toe_w = foot_w * ss(BALL_J[1] + 0.03, BALL_J[1] - 0.03, y)
            w[side + 'ToeBase'] = leg * toe_w
            w[side + 'Foot'] = leg * (foot_w - toe_w)
            w[side + 'Leg'] = leg * shin_w
            w[side + 'UpLeg'] = leg * (1 - foot_w - shin_w)
    total = sum(w.values())
    if total > 1:
        w = {k: val / total for k, val in w.items()}; total = 1
    # Whatever is left belongs to the torso chain, blended by height; the top of the
    # shoulders (read from the T-pose) goes to the collarbones.
    rest = 1 - total
    c1 = ss(WAIST - 0.02, WAIST + 0.02, z)
    c2 = ss(SPINE1 - 0.02, SPINE1 + 0.02, z)
    c3 = ss(RIBS - 0.02, RIBS + 0.02, z)
    c4 = ss(THROAT - 0.015, THROAT + 0.015, z)
    tx, tz = tpose[v.index]
    clav = ss(CLAVICLE_X - 0.01, CLAVICLE_X + 0.03, tx) * ss(0.655, 0.69, tz) * (1 - c4)
    w['Hips'] = rest * (1 - c1)
    w['Spine'] = rest * c1 * (1 - c2)
    w['Spine1'] = rest * c1 * c2 * (1 - c3)
    w['Spine2'] = rest * c1 * c2 * c3 * (1 - c4) * (1 - clav)
    w[side + 'Shoulder'] = w.get(side + 'Shoulder', 0) + rest * c1 * c2 * c3 * (1 - c4) * clav
    w['Neck'] = rest * c1 * c2 * c3 * c4
    for k, val in w.items():
        if val > 1e-3:
            groups[k].add([v.index], val, 'REPLACE')
obj.parent = rig
am = obj.modifiers.new('rig', 'ARMATURE'); am.object = rig

# Clips (Idle, Lookaround, Talk, Walk, Run): see character_clips.py.
walk, run = clips.bake_all(rig, HIP_J, KNEE_J, ANKLE_J)
print('STRIDE walk %.3f run %.3f (body heights per cycle)' % (walk, run))

print('MATERIALS', [m.name for m in obj.data.materials], 'VERTS', len(obj.data.vertices), 'FACES', len(obj.data.polygons))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=out, export_format='GLB', use_selection=True,
    export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS',
    export_force_sampling=True, export_frame_step=1,
    export_yup=True, export_apply=False, export_texcoords=False, export_normals=True, export_tangents=False,
)
print('EXPORTED', out)

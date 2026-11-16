"""Steps shared by the characters built on the "Cute Chibi Girl" body (build-dr-fe.py), and reused by build-pack-villager.py.

The body: "Cute Chibi Girl" by Syed's Creation (CC-BY-4.0,
https://sketchfab.com/3d-models/cute-chibi-girl-c42960a64f7c4cd89706e79da4d04de0) — skin, head
and shoes, A-posed, no rig, facing +x. Blender coords: z up, the character faces -Y, its
left = +x. Measurements are fractions of the head height, read from height slices of the mesh.
"""
import bpy, bmesh, math
from mathutils import Matrix, Vector

import character_clips as clips
from character_clips import SIDES

# Joints (x, y, z) on the character's left side; the body's centre line runs at y = BODY_Y.
# The arm joints differ per model (each poses its arms its own way), so they are arguments.
BODY_Y = 0.03
HIPS, WAIST, SPINE1, RIBS, THROAT, NECK = 0.37, 0.44, 0.5, 0.56, 0.63, 0.705
HIP_J = (0.045, 0.045, 0.37)
KNEE_J = (0.047, 0.045, 0.205)
ANKLE_J = (0.044, 0.05, 0.065)
BALL_J = (0.044, 0.02, 0.02)     # where the toes bend
TOE_J = (0.044, -0.005, 0.015)
CLAVICLE = (0.02, 0.025, 0.625)
OUTLINE = 0.0035                 # outline shell thickness, as on the base body


def ss(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def select(*objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def load(src):
    """Import the model; returns its meshes, unparented (the Sketchfab empties removed)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in [o for o in bpy.context.scene.objects if o.type == 'EMPTY']:
        bpy.data.objects.remove(o)
    return meshes


def named(meshes, key):
    return next(o for o in meshes if key in o.name)


def normalise(meshes, head, feet):
    """Face -Y, then scale to head height 1 with the soles (lowest of `feet`) on z = 0."""
    turn = Matrix.Rotation(-math.pi / 2, 4, 'Z')
    z0 = min((turn @ o.matrix_world @ v.co).z for o in feet for v in o.data.vertices)
    h = max((turn @ head.matrix_world @ v.co).z for v in head.data.vertices) - z0
    fit = Matrix.Diagonal((1 / h, 1 / h, 1 / h, 1)) @ Matrix.Translation((0, 0, -z0)) @ turn
    for o in meshes:
        o.matrix_world = fit @ o.matrix_world
        select(o)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def weld(objs):
    """Weld UV seams (so bone heat and weight smoothing flow across them) and drop custom
    normals (they would stay pointing the A-pose way once the arms are lowered)."""
    for o in objs:
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.to_mesh(o.data); bm.free()
    for o in objs:
        select(o)
        if o.data.has_custom_normals:
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
        for p in o.data.polygons:
            p.use_smooth = True


def build_rig(shoulder, elbow, wrist, hand_tip):
    """The base body's Mixamo-style skeleton, on this body's joints."""
    arm_data = bpy.data.armatures.new('Rig'); rig = bpy.data.objects.new('Rig', arm_data)
    bpy.context.scene.collection.objects.link(rig)
    select(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name, head, tail, parent=None):
        b = arm_data.edit_bones.new(name); b.head = head; b.tail = tail
        if parent: b.parent = arm_data.edit_bones[parent]
    spine = lambda z: (0, BODY_Y, z)
    bone('Hips', spine(HIPS), spine(WAIST))
    bone('Spine', spine(WAIST), spine(SPINE1), 'Hips')
    bone('Spine1', spine(SPINE1), spine(RIBS), 'Spine')
    bone('Spine2', spine(RIBS), spine(THROAT), 'Spine1')
    bone('Neck', spine(THROAT), spine(NECK), 'Spine2')
    bone('Head', spine(NECK), spine(1.0), 'Neck')
    for s, side in ((1, 'Left'), (-1, 'Right')):
        m = lambda p: (s * p[0], p[1], p[2])
        bone(side + 'Shoulder', m(CLAVICLE), m(shoulder), 'Spine2')
        bone(side + 'Arm', m(shoulder), m(elbow), side + 'Shoulder')
        bone(side + 'ForeArm', m(elbow), m(wrist), side + 'Arm')
        bone(side + 'Hand', m(wrist), m(hand_tip), side + 'ForeArm')
        bone(side + 'UpLeg', m(HIP_J), m(KNEE_J), 'Hips')
        bone(side + 'Leg', m(KNEE_J), m(ANKLE_J), side + 'UpLeg')
        bone(side + 'Foot', m(ANKLE_J), m(BALL_J), side + 'Leg')
        bone(side + 'ToeBase', m(BALL_J), m(TOE_J), side + 'Foot')
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def rigid(head_parts, shoes):
    """Head parts on the Head bone; each shoe on its foot, bending at the toes."""
    for o in head_parts:
        g = o.vertex_groups.new(name='Head')
        g.add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
    for side in SIDES:
        shoes.vertex_groups.new(name=side + 'Foot'); shoes.vertex_groups.new(name=side + 'ToeBase')
    for v in shoes.data.vertices:
        side = 'Left' if v.co.x > 0 else 'Right'
        toe = ss(BALL_J[1] + 0.015, BALL_J[1] - 0.015, v.co.y)
        if toe < 1: shoes.vertex_groups[side + 'Foot'].add([v.index], 1 - toe, 'REPLACE')
        if toe > 0: shoes.vertex_groups[side + 'ToeBase'].add([v.index], toe, 'REPLACE')


def join(meshes, skin):
    """One object: the vertex groups merge by name; the skin's armature modifier drives it all."""
    select(*meshes, active=skin)
    bpy.ops.object.join()
    skin.name = 'Character'; skin.data.name = 'Character'
    return skin


def lower_arms(rig, obj, angle):
    """Lower the arms (about each shoulder joint, in the x/z plane) and make that the rest pose."""
    select(rig)
    bpy.ops.object.mode_set(mode='POSE')
    for s, side in ((1, 'Left'), (-1, 'Right')):
        pb = rig.pose.bones[side + 'Arm']
        pivot = Vector(pb.head)
        pb.matrix = Matrix.Translation(pivot) @ Matrix.Rotation(s * angle, 4, 'Y') @ Matrix.Translation(-pivot) @ pb.matrix
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode='OBJECT')
    select(obj)
    mod = next(m for m in obj.modifiers if m.type == 'ARMATURE')
    bpy.ops.object.modifier_apply(modifier=mod.name)
    select(rig)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    am = obj.modifiers.new('rig', 'ARMATURE'); am.object = rig


def outline_material():
    """The single-sided black of every outline shell (character-model.tsx knows it by name)."""
    black = bpy.data.materials.new('solidifyoutline'); black.use_nodes = True
    bsdf = next(n for n in black.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    bsdf.inputs['Roughness'].default_value = 0.8
    black.use_backface_culling = True
    return black


def outline(obj):
    """The base body's outline: every face but see-through ones copied out along the smooth
    vertex normals and turned inside out, in a single-sided black (the copies keep their weights)."""
    obj.data.materials.append(outline_material())
    clear = {i for i, m in enumerate(obj.data.materials) if m.surface_render_method == 'BLENDED'}
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.normal_update()
    normals = {v: v.normal.copy() for v in bm.verts}
    solid = [f for f in bm.faces if f.material_index not in clear]
    dup = bmesh.ops.duplicate(bm, geom=list({v for f in solid for v in f.verts}) + list({e for f in solid for e in f.edges}) + solid)
    for old, new in dup['vert_map'].items():
        if old in normals:   # the map runs both ways
            new.co = old.co + normals[old] * OUTLINE
    shell = [f for f in dup['geom'] if isinstance(f, bmesh.types.BMFace)]
    bmesh.ops.reverse_faces(bm, faces=shell)
    for f in shell:
        f.material_index = len(obj.data.materials) - 1
    bm.to_mesh(obj.data); bm.free()


def finish(rig, obj, out):
    """Bake the shared clips, store the gait strides on the rig and export the GLB."""
    walk, run = clips.bake_all(rig, HIP_J, KNEE_J, ANKLE_J)
    print('STRIDE walk %.3f run %.3f (body heights per cycle)' % (walk, run))
    # character-model.tsx reads these from the rig node's extras.
    rig['walk_stride'] = round(walk, 3)
    rig['run_stride'] = round(run, 3)
    print('MATERIALS', [m.name for m in obj.data.materials], 'VERTS', len(obj.data.vertices), 'FACES', len(obj.data.polygons))
    export(out)


def export(out):
    """Export everything in the scene as a GLB: the rig, its skinned mesh and its clips."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', use_selection=True,
        export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS',
        export_force_sampling=True, export_frame_step=1, export_extras=True,
        export_yup=True, export_apply=False, export_texcoords=True, export_normals=True, export_tangents=False,
        export_image_format='AUTO',
    )
    print('EXPORTED', out)

"""Build Dr Fe (public/models/dr-fe.glb) from "Dr.FE Model.glb".

Source: the "Cute Chibi Girl" body (see chibi_body.py; CC-BY-4.0) — skin, head and shoes,
A-posed, no rig, facing +x — dressed as Dr Fe: white hair in a bun, glasses, a black turtleneck
(sweater, collar, cuffs), black pants, a belt and a white lab coat (body, collar, lapels, pockets,
buttons).

Usage: blender -b --factory-startup -P scripts/build-dr-fe.py -- "<Dr.FE Model.glb>" <out.glb>

The model keeps its own look (its materials, plus a black outline shell like the base body's).
The script (Blender coords: z up, model faces -Y, character's left = +x):
- turns it to face -Y and normalises it to head height 1 (the hair stands above) with the
  feet on z = 0;
- decimates the dense meshes (the sweater, the coat, the hair) to DENSE vertices and shrinks the hair's
  textures to its colour map at TEXTURE pixels; the lenses become plain see-through (no
  transmission pass);
- adds the same Mixamo-style 22-bone skeleton as build-base-character.py, placed on this
  body's measured joints; the skin gets Blender's automatic (bone heat) weights and every piece
  of clothing copies the weights of the skin under it, so cloth and body bend as one; skin the
  clothes cover is then removed (it would poke through), and so is the clothing under the coat;
  the coat's skirt hangs from the hips and follows the thighs only part of the way, so it swings
  instead of tearing between the legs; the head, hair and glasses follow the Head bone, each shoe
  its foot;
- lowers the A-posed arms close to the sides and makes that the rest pose;
- bakes the shared clips (character_clips.py) and stores the gait strides on the rig, so
  character-model.tsx paces the steps to this body's shorter legs.
"""
import bpy, bmesh, sys, os, math, heapq
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from character_clips import SIDES
import chibi_body as body
from chibi_body import select

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]

# The A-posed arm, along its measured centre line (about 43 degrees below horizontal).
SHOULDER_J = (0.075, 0.02, 0.59)
ELBOW_J = (0.137, 0.02, 0.532)
WRIST_J = (0.198, 0.02, 0.476)
HAND_TIP = (0.228, 0.02, 0.43)
ARM_DOWN = math.radians(35)      # lowers the arms to ~78 degrees, close to the sides
DENSE = 10000                    # meshes above this many vertices are decimated to it
TEXTURE = 1024                   # largest texture side kept
COVERED = 0.02                   # leg skin whose outward normal meets clothing this close is removed
UNDER_COAT = 0.06                # clothing whose outward normal meets the coat this close is removed
COAT_EDGE = 3                    # ...except this many rings of faces short of the coat's opening
SKIRT_TOP = 0.42                 # the coat follows the thighs from here (head heights) down to its hem
SKIRT_FOLLOW = 0.85              # how much of a thigh's swing the hem takes
COAT_SMOOTH = 8                  # smoothing passes over the coat's decimated sleeves (their creases catch the outline)
SLEEVE_RADIUS = 0.045            # cloth this close to the arm's centre line can be sleeve
SMOOTH = 10                      # weight-smoothing passes over the clothing
COAT_WEIGHT_SMOOTH = 30          # ...and over the coat, whose roomy shoulders the arms pull on harder

meshes = body.load(src)
named = lambda key: body.named(meshes, key)
skin, head, shoes = named('skin'), named('head'), named('shoes')
head_parts = [head, named('hair'), named('glasses_frame'), named('glasses_lenses')]
clothes = [o for o in meshes if o not in head_parts and o not in (skin, shoes)]
coat = [o for o in clothes if o.name.startswith('LabCoat')]
print('CLOTHES', [o.name for o in clothes])

body.normalise(meshes, head, (skin, shoes))
for o in meshes:
    n = len(o.data.vertices)
    if n > DENSE:
        # Welded first: vertices split at UV seams would keep the decimation from crossing them.
        select(o)
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.to_mesh(o.data); bm.free()
        for p in o.data.polygons:
            p.use_smooth = True
        dec = o.modifiers.new('decimate', 'DECIMATE'); dec.ratio = DENSE / len(o.data.vertices)
        bpy.ops.object.modifier_apply(modifier=dec.name)
        print('DECIMATED', o.name, n, '->', len(o.data.vertices))
body.weld([skin] + clothes)

# The decimated sleeves keep the sculpted creases, which catch the outline: smooth them (not the hem or the
# front edges, which it would fray).
def along_arm(co):
    """(distance along the arm from the shoulder, distance from the arm's centre line)."""
    co = Vector((abs(co.x), co.y, co.z)) - Vector(SHOULDER_J)
    axis = (Vector(WRIST_J) - Vector(SHOULDER_J)).normalized()
    t = co.dot(axis)
    return t, (co - axis * t).length
bm = bmesh.new(); bm.from_mesh(named('LabCoat_body').data)
creased = [v for v in bm.verts if not v.is_boundary and -0.03 < along_arm(v.co)[0] < 0.14 and along_arm(v.co)[1] < 0.09]
for _ in range(COAT_SMOOTH):
    bmesh.ops.smooth_vert(bm, verts=creased, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(named('LabCoat_body').data); bm.free()

# The hair keeps only its colour map, shrunk; the lenses lose the transmission pass.
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        continue
    for k in ('Metallic', 'Roughness', 'Normal'):
        for l in list(bsdf.inputs[k].links):
            links.remove(l)
    if bsdf.inputs['Transmission Weight'].default_value > 0:
        bsdf.inputs['Transmission Weight'].default_value = 0
        bsdf.inputs['Alpha'].default_value = 0.12
        m.surface_render_method = 'BLENDED'
for kinds in (('NORMAL_MAP', 'SEPARATE_COLOR'), ('TEX_IMAGE',)):
    for n in [n for m in bpy.data.materials if m.use_nodes for n in m.node_tree.nodes]:
        if n.type in kinds and not any(o.links for o in n.outputs if o.name != 'Alpha'):
            n.id_data.nodes.remove(n)
for im in bpy.data.images:
    if im.users == 0:
        bpy.data.images.remove(im)
    elif max(im.size) > TEXTURE:
        print('TEXTURE', im.name, tuple(im.size), '->', TEXTURE)
        im.scale(TEXTURE, TEXTURE)
        im.pack()

rig = body.build_rig(SHOULDER_J, ELBOW_J, WRIST_J, HAND_TIP)

# Skin: automatic weights from bone heat. (Bone heat fails on the decimated sweater, so the
# clothing copies the skin's weights instead, below.)
select(skin, rig, active=rig)
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
print('SKIN GROUPS', sorted(g.name for g in skin.vertex_groups))

# Clothing: each vertex takes the weights of the nearest point of the skin (blended over that
# skin face's corners), so cloth and body bend as one. The skin is searched on the vertex's own
# limb only: the A-posed hands hang by the waist and the upper arms by the chest, so the nearest
# skin is often the wrong limb. Sleeve is the cloth within an arm's length of a wrist, measured
# along the cloth (the waist beside a hand is far that way, round by the armpit) that also lies
# around the arm (a coat's roomy side is closer to the wrist than its shoulder is); the rest takes
# the trunk or a leg, whichever bone is nearest.
def limb(name):
    for side in SIDES:
        if name.startswith(side):
            return side + ('Arm' if any(k in name for k in ('Shoulder', 'Arm', 'Hand')) else 'Leg')
    return 'Trunk'
segs = [(b.head_local, b.tail_local, limb(b.name)) for b in rig.data.bones if not limb(b.name).endswith('Arm')]
def nearest_limb(co):
    def dist(a, b):
        ab = b - a
        t = min(max((co - a).dot(ab) / ab.length_squared, 0.0), 1.0)
        return (co - (a + ab * t)).length
    return min(segs, key=lambda s: dist(s[0], s[1]))[2]
REACH = (Vector(WRIST_J) - Vector(SHOULDER_J)).length + 0.02
def sleeves(o):
    me = o.data
    near = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        d = (me.vertices[a].co - me.vertices[b].co).length
        near[a].append((b, d)); near[b].append((a, d))
    dist = [math.inf] * len(me.vertices); side = [None] * len(me.vertices); heap = []
    for s, name in ((1, 'Left'), (-1, 'Right')):
        wrist = Vector((s * WRIST_J[0], WRIST_J[1], WRIST_J[2]))
        for v in me.vertices:
            if (v.co - wrist).length < 0.035:
                dist[v.index] = 0; side[v.index] = name + 'Arm'
                heapq.heappush(heap, (0, v.index))
    while heap:
        d, i = heapq.heappop(heap)
        if d > dist[i]:
            continue
        for j, l in near[i]:
            if d + l < dist[j]:
                dist[j] = d + l; side[j] = side[i]
                heapq.heappush(heap, (d + l, j))
    return [side[i] if dist[i] < REACH and along_arm(me.vertices[i].co)[1] < SLEEVE_RADIUS else None for i in range(len(me.vertices))]
names = {g.index: g.name for g in skin.vertex_groups}
sw = [{names[g.group]: g.weight for g in v.groups} for v in skin.data.vertices]
sbm = bmesh.new(); sbm.from_mesh(skin.data); sbm.faces.ensure_lookup_table()
trees = {}
for key in {limb(b.name) for b in rig.data.bones}:
    faces = []
    for f in sbm.faces:
        total = {}
        for u in f.verts:
            for g, x in sw[u.index].items():
                total[limb(g)] = total.get(limb(g), 0) + x
        if max(total, key=total.get) == key:
            faces.append(f)
    trees[key] = (BVHTree.FromPolygons([v.co for v in sbm.verts], [[u.index for u in f.verts] for f in faces]), faces)
for o in clothes:
    for name in names.values():
        o.vertex_groups.new(name=name)
    arm = sleeves(o)
    print(o.name, 'SLEEVE VERTS', sum(1 for a in arm if a))
    for v in o.data.vertices:
        tree, faces = trees[arm[v.index] or nearest_limb(v.co)]
        co, _, fi, _ = tree.find_nearest(v.co)
        corners = faces[fi].verts
        ws = [1 / max((u.co - co).length, 1e-6) for u in corners]
        total = sum(ws)
        mix = {}
        for u, w in zip(corners, ws):
            for g, x in sw[u.index].items():
                mix[g] = mix.get(g, 0) + x * w / total
        for g, x in mix.items():
            if x > 1e-3:
                o.vertex_groups[g].add([v.index], x, 'REPLACE')
sbm.free()

# Neighbouring cloth vertices can land on differently weighted skin, which crumples the cloth
# as it bends: smooth the copied weights.
for o in clothes:
    me = o.data
    near = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        near[a].append(b); near[b].append(a)
    w = [{g.group: g.weight for g in v.groups} for v in me.vertices]
    for _ in range(COAT_WEIGHT_SMOOTH if o in coat else SMOOTH):
        nw = []
        for i, own in enumerate(w):
            mix = {g: x * 0.5 for g, x in own.items()} if near[i] else dict(own)
            for j in near[i]:
                for g, x in w[j].items():
                    mix[g] = mix.get(g, 0) + x * 0.5 / len(near[i])
            nw.append(mix)
        w = nw
    for i, mix in enumerate(w):
        total = sum(mix.values())
        for g, x in mix.items():
            o.vertex_groups[g].add([i], x / total, 'REPLACE')

# The coat's skirt is one piece of cloth over both legs: its weights come from where it hangs, not
# from the skin under it. Anything below the waist hangs from the hips; towards the hem it follows
# that side's thigh too. The two front panels are free to, but the back joins them, so its centre
# stays on the hips and it never tears apart. Every piece of the coat (pockets, buttons) moves together.
hem = min(v.co.z for v in named('LabCoat_body').data.vertices)
for o in coat:
    for v in o.data.vertices:
        w = {o.vertex_groups[g.group].name: g.weight for g in v.groups}
        back = body.ss(body.BODY_Y - 0.01, body.BODY_Y + 0.03, v.co.y)
        k = SKIRT_FOLLOW * body.ss(SKIRT_TOP, hem, v.co.z) * (1 - back * (1 - body.ss(0.01, 0.07, abs(v.co.x))))
        thigh = ('Left' if v.co.x > 0 else 'Right') + 'UpLeg'
        mix = {'Hips': 0.0, thigh: k}
        for name, x in w.items():
            key = 'Hips' if limb(name).endswith('Leg') else name
            mix[key] = mix.get(key, 0) + x * (1 - k)
        for name in w:
            o.vertex_groups[name].remove([v.index])
        for name, x in mix.items():
            if x > 1e-3:
                o.vertex_groups[name].add([v.index], x, 'REPLACE')

# Skin under the clothes. The turtleneck covers the trunk and arms all the way, so all of their
# skin but the hands goes (any left would show through the gap a swinging sleeve opens at the
# armpit); on the legs, any face whose outward normal meets clothing close by.
verts, polys = [], []
for o in clothes:
    base = len(verts)
    verts += [v.co.copy() for v in o.data.vertices]
    polys += [[base + i for i in p.vertices] for p in o.data.polygons]
cloth = BVHTree.FromPolygons(verts, polys)
def owner(v):
    total = {}
    for g in v.groups:
        n = names[g.group]
        key = 'Hand' if n.endswith('Hand') else limb(n)
        total[key] = total.get(key, 0) + g.weight
    return max(total, key=total.get)
part_of = [owner(v) for v in skin.data.vertices]
bm = bmesh.new(); bm.from_mesh(skin.data); bm.normal_update()
def is_covered(f):
    parts = {part_of[v.index] for v in f.verts}
    if 'Hand' in parts:
        return False
    if not any(p.endswith('Leg') for p in parts):
        return True
    return cloth.ray_cast(f.calc_center_median() + f.normal * 1e-4, f.normal, COVERED)[0] is not None
covered = [f for f in bm.faces if is_covered(f)]
print('COVERED SKIN FACES', len(covered), 'of', len(bm.faces))
bmesh.ops.delete(bm, geom=covered, context='FACES')
bm.to_mesh(skin.data); bm.free()

# Whatever the coat hides would poke through it (the sweater through a sleeve, the belt and pants
# through the skirt as a thigh swings back). It goes, short of the opening's edge, which shows as
# the coat swings: the sweater wherever the coat lies right over it, the rest wherever the coat
# hides it from the front, and all of its back (their inner faces don't look out at the coat).
verts, polys = [], []
for o in coat:
    base = len(verts)
    verts += [v.co.copy() for v in o.data.vertices]
    polys += [[base + i for i in p.vertices] for p in o.data.polygons]
coat_tree = BVHTree.FromPolygons(verts, polys)
def remove_hidden(o, is_hidden):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.normal_update()
    hidden = {f for f in bm.faces if is_hidden(f)}
    for _ in range(COAT_EDGE):
        shown = {u for f in bm.faces if f not in hidden for u in f.verts}
        hidden = {f for f in hidden if not any(u in shown for u in f.verts)}
    print('UNDER COAT', o.name, len(hidden), 'of', len(bm.faces))
    bmesh.ops.delete(bm, geom=list(hidden), context='FACES')
    bm.to_mesh(o.data); bm.free()
def covers(co, ray, reach):
    return coat_tree.ray_cast(co, ray, reach)[0] is not None
remove_hidden(named('turtleneck_sweater'), lambda f: covers(f.calc_center_median() + f.normal * 1e-4, f.normal, UNDER_COAT))
for o in (named('pants'), named('belt_loops'), next(m for m in meshes if m.name == 'belt')):
    remove_hidden(o, lambda f: f.calc_center_median().z > hem and (f.calc_center_median().y > body.BODY_Y or covers(f.calc_center_median(), Vector((0, -1, 0)), 1.0)))

body.rigid(head_parts, shoes)
obj = body.join(meshes, skin)
body.lower_arms(rig, obj, ARM_DOWN)
body.outline(obj)
body.finish(rig, obj, out)

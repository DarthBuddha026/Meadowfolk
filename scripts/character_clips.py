"""The clips every character plays, shared by the Blender build scripts
(build-base-character.py, build-dr-fe.py).

Keyframed like WoraWork's Idle / Lookaround / Walk / Run (plus a Talk gesture), authored
as key poses for a body rigged with the Mixamo-style 22-bone skeleton. Angles are radians
about the *rest* world axes (Blender: x = left, -y = forward, z = up), in each bone's own
frame:
  pitch (about x): + swings a limb back, bends a knee, points the toes down, leans the
                   torso forward; - swings a limb forward, bends an elbow, lifts the toes.
  roll  (about y): + tips a bone toward the character's right (-x).
  yaw   (about z): + turns the left side backward.
Each gait cycle starts with the left heel striking the ground in front.

Usage: `bake_all(rig, hip, knee, ankle)` with the leg joints (x, y, z) in body heights;
it bakes one NLA track per clip and returns the (walk, run) strides in body heights per cycle.
"""
import bpy, math
from mathutils import Quaternion, Vector

SIDES = ('Left', 'Right')
BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'] + [
    side + b for side in SIDES for b in ('Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase')]

FPS = 30
AX = (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
TAU = math.pi * 2

# Set by bake_all() for the body being animated.
rig = None
REST_INV = {}
THIGH_LEN = SHIN_LEN = LEG_LEN = 0.0

def loop(keys, u):
    """Periodic Catmull-Rom curve through (u, value) keys, u in [0, 1)."""
    n = len(keys); u %= 1.0
    i = max([k for k in range(n) if keys[k][0] <= u], default=-1)
    ks = lambda k: (keys[k % n][0] + math.floor(k / n), keys[k % n][1])
    (t0, p0), (t1, p1), (t2, p2), (t3, p3) = ks(i - 1), ks(i), ks(i + 1), ks(i + 2)
    s = (u - t1) / (t2 - t1) if t2 != t1 else 0
    return 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s ** 3)

def leg(pose, side, thigh, knee, foot_world, toe=0.0):
    """Pose one leg; returns (vertical reach, forward reach) of its ankle below the hip."""
    pose[side + 'UpLeg'] = (thigh, 0, 0)
    pose[side + 'Leg'] = (knee, 0, 0)
    pose[side + 'Foot'] = (foot_world - thigh - knee, 0, 0)
    pose[side + 'ToeBase'] = (toe, 0, 0)
    return (THIGH_LEN * math.cos(thigh) + SHIN_LEN * math.cos(thigh + knee),
            -(THIGH_LEN * math.sin(thigh) + SHIN_LEN * math.sin(thigh + knee)))

def arm(pose, side, swing, elbow, hand=0.0, out=0.06, shrug=0.0):
    s = 1 if side == 'Left' else -1
    pose[side + 'Shoulder'] = (swing * 0.15, -s * shrug, 0)
    pose[side + 'Arm'] = (swing, -s * out, 0)
    pose[side + 'ForeArm'] = (elbow, 0, 0)
    pose[side + 'Hand'] = (hand, 0, 0)

def gait(u, g):
    """One frame of a walk or run cycle from its key curves `g`."""
    pose = {}
    reach = {}
    for side, off in (('Left', 0.0), ('Right', 0.5)):
        lu = u + off
        reach[side] = leg(pose, side, loop(g['thigh'], lu), loop(g['knee'], lu), loop(g['foot'], lu), loop(g['toe'], lu))
    c, s = math.cos(TAU * u), math.sin(TAU * u)
    # Hips ride on whichever leg is planted (the longer one), so feet meet the ground.
    planted = max(reach.values(), key=lambda r: r[0])
    dz = planted[0] - LEG_LEN + g['flight'] * max(0.0, math.cos(2 * TAU * (u - g['flight_at'])))
    pose['Hips'] = (0, -g['roll'] * s, -g['twist'] * c)
    pose['Spine'] = (g['lean'] * 0.6, g['roll'] * 0.6 * s, g['twist'] * 0.4 * c)
    pose['Spine1'] = (g['lean'] * 0.25, 0, g['twist'] * 0.35 * c)
    pose['Spine2'] = (g['lean'] * 0.15, 0, g['twist'] * 0.45 * c)
    pose['Neck'] = (-g['lean'] * 0.6, g['roll'] * 0.3 * s, -g['twist'] * 0.15 * c)
    pose['Head'] = (-g['lean'] * 0.3 + g['nod'] * math.cos(2 * TAU * u), 0, 0)
    # Arms swing opposite to their leg; the elbow bends more as the arm comes forward.
    for side, k in (('Left', 1), ('Right', -1)):
        a = k * c
        arm(pose, side, g['arm'] * a + g['arm_bias'], g['elbow'] - g['elbow_fwd'] * max(0.0, -a),
            hand=0.12 * k * s, out=g['arm_out'], shrug=g['shrug'] * max(0.0, -a))
    return pose, Vector((0, 0, dz)), planted, reach

WALK = dict(
    seconds=1.0,
    thigh=[(0.0, -0.44), (0.1, -0.34), (0.3, 0.02), (0.5, 0.36), (0.58, 0.32), (0.7, -0.08), (0.84, -0.42), (0.94, -0.47)],
    knee=[(0.0, 0.06), (0.1, 0.3), (0.3, 0.1), (0.46, 0.22), (0.56, 0.8), (0.66, 1.25), (0.78, 0.95), (0.9, 0.22)],
    foot=[(0.0, -0.35), (0.08, 0.0), (0.38, 0.0), (0.48, 0.35), (0.56, 0.9), (0.68, 0.85), (0.8, 0.2), (0.92, -0.32)],
    toe=[(0.0, 0.0), (0.38, 0.0), (0.48, -0.25), (0.55, -0.4), (0.64, 0.0), (0.9, 0.05)],
    flight=0.0, flight_at=0.0,
    roll=0.05, twist=0.13, lean=0.05, nod=0.03,
    arm=0.28, arm_bias=-0.02, elbow=-0.14, elbow_fwd=0.24, arm_out=0.07, shrug=0.04,
)
RUN = dict(
    seconds=0.7,
    thigh=[(0.0, -0.5), (0.12, -0.02), (0.28, 0.6), (0.4, 0.5), (0.55, -0.2), (0.72, -0.9), (0.88, -0.78)],
    knee=[(0.0, 0.25), (0.1, 0.5), (0.28, 0.35), (0.4, 1.4), (0.52, 1.95), (0.65, 1.55), (0.8, 0.7), (0.92, 0.3)],
    foot=[(0.0, -0.15), (0.08, 0.0), (0.22, 0.1), (0.3, 0.8), (0.45, 1.15), (0.6, 0.6), (0.8, 0.0), (0.92, -0.2)],
    toe=[(0.0, 0.0), (0.2, 0.0), (0.28, -0.35), (0.36, 0.0)],
    flight=0.02, flight_at=0.4,
    roll=0.06, twist=0.18, lean=0.32, nod=0.04,
    arm=0.5, arm_bias=0.0, elbow=-1.25, elbow_fwd=0.15, arm_out=0.1, shrug=0.06,
)

def stand(u, breaths, sway=1.0):
    """The relaxed standing pose every non-moving clip is built on (u: 0..1 over the clip)."""
    pose = {}
    b = math.sin(TAU * u * breaths)       # breathing
    shift = math.sin(TAU * u) * sway      # slow weight shift
    for side in SIDES:
        leg(pose, side, -0.02, 0.05, 0.0)
        arm(pose, side, -0.03 + 0.02 * b, -0.16 - 0.02 * b, hand=0.05, out=0.05, shrug=0.0)
        pose[side + 'Shoulder'] = (0, (0.015 * b) * (-1 if side == 'Left' else 1), 0)
    pose['Hips'] = (0, 0.02 * shift, 0)
    pose['Spine'] = (0.01 * b, -0.015 * shift, 0)
    pose['Spine2'] = (0.015 * b, 0, 0)
    pose['Neck'] = (0, 0, 0)
    pose['Head'] = (0.015 * math.sin(TAU * u * breaths + 0.8), -0.01 * shift, 0)
    return pose, Vector((0, 0, -0.004 + 0.002 * b))

def idle(u):
    return stand(u, 2)

def lookaround(u):
    pose, hips = stand(u, 3, 0.5)
    look = loop([(0.0, 0.0), (0.12, 0.0), (0.26, 0.6), (0.44, 0.6), (0.6, -0.55), (0.8, -0.55), (0.92, 0.0)], u)
    up = 0.06 * max(0.0, math.sin(TAU * u))
    pose['Spine2'] = (pose['Spine2'][0], 0, 0.15 * look)
    pose['Neck'] = (0, 0, 0.3 * look)
    pose['Head'] = (-up, 0, 0.55 * look)
    return pose, hips

def talk(u):
    pose, hips = stand(u, 2)
    beat = math.sin(TAU * u * 2)
    arm(pose, 'Right', -0.95 + 0.12 * beat, -0.9 + 0.2 * math.sin(TAU * u * 2 + 1), hand=0.2 * math.sin(TAU * u * 4), out=0.15)
    arm(pose, 'Left', -0.08, -0.22, hand=0.05, out=0.05)
    pose['Spine2'] = (pose['Spine2'][0], 0, -0.05 * math.sin(TAU * u))
    pose['Head'] = (0.05 * math.sin(TAU * u * 5), 0.03 * math.sin(TAU * u), 0)
    return pose, hips

def rot(name, pitch=0.0, roll=0.0, yaw=0.0):
    inv = REST_INV[name]
    return (Quaternion(inv @ AX[0], pitch) @ Quaternion(inv @ AX[1], roll) @ Quaternion(inv @ AX[2], yaw))

def bake(name, seconds, frame_fn):
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    frames = round(seconds * FPS)
    for f in range(frames + 1):
        pose, hips = frame_fn(f / frames)
        for bn in BONES:
            pb = rig.pose.bones[bn]
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = rot(bn, *pose.get(bn, (0, 0, 0)))
            pb.keyframe_insert('rotation_quaternion', frame=f)
        hb = rig.pose.bones['Hips']
        hb.location = REST_INV['Hips'] @ hips
        hb.keyframe_insert('location', frame=f)
    track = rig.animation_data.nla_tracks.new(); track.name = name
    track.strips.new(name, 0, act)
    rig.animation_data.action = None

def stride(g):
    """Ground covered per cycle (body heights): how fast the planted foot slides back."""
    n = 400; total = 0.0; prev = None
    for i in range(n + 1):
        _, _, planted, reach = gait(i / n, g)
        side = max(reach, key=lambda k: reach[k][0])
        if prev and prev[0] == side:
            total += prev[1] - reach[side][1]
        prev = (side, reach[side][1])
    return total

def bake_all(rig_obj, hip, knee, ankle):
    global rig, REST_INV, THIGH_LEN, SHIN_LEN, LEG_LEN
    rig = rig_obj
    REST_INV = {b.name: b.matrix_local.to_3x3().inverted() for b in rig.data.bones}
    THIGH_LEN = (Vector(hip) - Vector(knee)).length
    SHIN_LEN = (Vector(knee) - Vector(ankle)).length
    LEG_LEN = THIGH_LEN + SHIN_LEN
    bpy.context.scene.render.fps = FPS
    bake('Idle', 4.0, idle)
    bake('Lookaround', 6.0, lookaround)
    bake('Talk', 4.0, talk)
    bake('Walk', WALK['seconds'], lambda u: gait(u, WALK)[:2])
    bake('Run', RUN['seconds'], lambda u: gait(u, RUN)[:2])
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion(); pb.location = Vector()
    return stride(WALK), stride(RUN)

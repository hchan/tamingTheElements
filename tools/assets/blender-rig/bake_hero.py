"""Headless Blender (Eevee) bake of one painted portrait: mesh + armature + weight skin -> 240 px frames.

Pilot for ideas/in-progress/blender-rigging-pilot.md. Run (see README.md):
  nice -n 15 timeout 1500 blender -b -P tools/assets/blender-rig/bake_hero.py -- \
      --spec tools/assets/portrait-rig/spec/pax.json --out .scratch/blender-pax [--dirs E,S] [--actions idle,walk]

Reuses the portrait-rig spec (bone heads, feathered weight polygons, glows, curves) so the comparison is the renderer, not the
motion. Eevee only. Output: <out>/frames/<action>/<dir>/NN.png (straight RGBA, 240x240) and <out>/bake.json (timings).
"""
import json, math, os, sys, time
import bpy
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


SPEC = json.load(open(arg('--spec')))
ANIM = json.load(open(arg('--anim', arg('--spec').replace('.json', '.anim.json'))))
OUT = os.path.abspath(arg('--out'))
SRC = os.path.abspath(arg('--source', SPEC['source']))
DIRS = arg('--dirs', 'E,SE,S,N,NE').split(',')
ACTIONS = arg('--actions', ','.join(ANIM)).split(',')
FRAME = SPEC['frame']          # 240
RES = SPEC['res']              # portrait px per frame px (2)
SS = 2                         # render at 2x, box-filter down (same idea as the ss2 bake)
U = 100.0                      # portrait px per Blender unit
FEET = SPEC['feet']
# portrait px -> frame px: frame = p / RES + OFF (fitted to the existing bake's visual box)
OFF = (float(arg('--offx', 28)), float(arg('--offy', 16)))
YAW = {'E': 0, 'SE': 20, 'S': 28, 'N': -28, 'NE': -20}   # cos(yaw) matches the existing sx 94 / 88 offsets


def wp(x, y):  # portrait px (y down) -> world (x, z)
    return ((x - FEET[0]) / U, (FEET[1] - y) / U)


# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.eevee.taa_render_samples = 16
sc.render.film_transparent = True
sc.render.filter_size = 0.6
sc.render.resolution_x = sc.render.resolution_y = FRAME * SS
sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
sc.render.image_settings.file_format = 'OPEN_EXR'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.image_settings.color_depth = '16'

cam_d = bpy.data.cameras.new('cam')
cam_d.type = 'ORTHO'
cam_d.ortho_scale = FRAME * RES / U
cam = bpy.data.objects.new('cam', cam_d)
sc.collection.objects.link(cam)
cx, cz = wp((FRAME / 2 - OFF[0]) * RES, (FRAME / 2 - OFF[1]) * RES)
cam.location = (cx, -10, cz)
cam.rotation_euler = (math.pi / 2, 0, 0)
sc.camera = cam

yaw = bpy.data.objects.new('yaw', None)
sc.collection.objects.link(yaw)

# ---------------------------------------------------------------- source image with colour bled into the clear border
src = bpy.data.images.load(SRC)
W, H = src.size
px = np.array(src.pixels[:], dtype=np.float32).reshape(H, W, 4)[::-1].copy()   # top-down, linear
alpha = px[..., 3]
known = alpha > 0.02
rgb = px[..., :3] * known[..., None]
for _ in range(8):  # bleed
    m = known.astype(np.float32)
    ns = sum(np.roll(np.roll(rgb, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    nm = sum(np.roll(np.roll(m, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    fill = (~known) & (nm > 0)
    rgb[fill] = ns[fill] / nm[fill][:, None]
    known = known | fill
tex = bpy.data.images.new('portrait', W, H, alpha=True, float_buffer=True)
tex.colorspace_settings.name = 'Non-Color'   # values are already linear; keep them untouched
out_px = np.concatenate([rgb, alpha[..., None]], axis=2)[::-1]
tex.pixels.foreach_set(out_px.ravel())
tex.alpha_mode = 'CHANNEL_PACKED'
tex.update()

# ---------------------------------------------------------------- armature
arm_d = bpy.data.armatures.new('rig')
arm = bpy.data.objects.new('rig', arm_d)
sc.collection.objects.link(arm)
arm.parent = yaw
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
BONES = SPEC['bones']
for b in BONES:
    eb = arm_d.edit_bones.new(b['id'])
    x, z = wp(*b['head'])
    eb.head = (x, 0, z)
    eb.tail = (x, 0, z + 0.3)
    eb.roll = 0
for b in BONES:
    if b.get('parent'):
        arm_d.edit_bones[b['id']].parent = arm_d.edit_bones[b['parent']]
bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------- mesh from alpha, weights from the spec's feathered polygons
STEP = 8
cell = np.zeros((H // STEP, W // STEP), bool)
for j in range(H // STEP):
    for i in range(W // STEP):
        cell[j, i] = (alpha[j * STEP:(j + 1) * STEP + 1, i * STEP:(i + 1) * STEP + 1] > 0.02).any()
cd = cell.copy()
cd[1:] |= cell[:-1]
cd[:-1] |= cell[1:]
cd[:, 1:] |= cell[:, :-1]
cd[:, :-1] |= cell[:, 1:]
vid = {}
verts = []
faces = []
for j in range(cd.shape[0]):
    for i in range(cd.shape[1]):
        if not cd[j, i]:
            continue
        q = []
        for (jj, ii) in ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)):
            if (jj, ii) not in vid:
                vid[(jj, ii)] = len(verts)
                verts.append((ii * STEP, jj * STEP))
            q.append(vid[(jj, ii)])
        faces.append(q)
P = np.array(verts, np.float32)
mesh = bpy.data.meshes.new('body')
mesh.from_pydata([(wp(x, y)[0], 0, wp(x, y)[1]) for x, y in P], [], [tuple(f) for f in faces])
uv = mesh.uv_layers.new(name='uv')
for poly in mesh.polygons:
    for li, vi in zip(poly.loop_indices, poly.vertices):
        uv.data[li].uv = (P[vi][0] / W, 1 - P[vi][1] / H)
body = bpy.data.objects.new('body', mesh)
sc.collection.objects.link(body)


def poly_signed(P, poly):  # distance to the polygon edge, positive inside (px)
    poly = np.array(poly, np.float32)
    n = len(poly)
    inside = np.zeros(len(P), bool)
    d = np.full(len(P), 1e9, np.float32)
    for k in range(n):
        a, b = poly[k], poly[(k + 1) % n]
        c = ((a[1] > P[:, 1]) != (b[1] > P[:, 1])) & (P[:, 0] < (b[0] - a[0]) * (P[:, 1] - a[1]) / (b[1] - a[1] + 1e-9) + a[0])
        inside ^= c
        ab = b - a
        t = np.clip(((P - a) @ ab) / (ab @ ab + 1e-9), 0, 1)
        d = np.minimum(d, np.linalg.norm(P - (a + t[:, None] * ab), axis=1))
    return np.where(inside, d, -d)


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


wts = {}
for b in BONES:
    if 'poly' in b:
        wts[b['id']] = smooth(0.5 + poly_signed(P, b['poly']) / (2.0 * b.get('feather', 10)))
w_over = [wts[k] for k in wts if k != 'torso']
if 'torso' in wts:   # torso keeps what the limb and head regions do not claim
    wts['torso'] = wts['torso'] * np.clip(1 - np.max(w_over, axis=0), 0, 1)
tot = sum(wts.values())
wts['root'] = np.clip(1 - tot, 0, 1)
tot = sum(wts.values())
for k in wts:
    wts[k] = wts[k] / np.maximum(tot, 1e-6)
for b in BONES:
    vg = body.vertex_groups.new(name=b['id'])
    for vi in np.nonzero(wts[b['id']] > 0.004)[0]:
        vg.add([int(vi)], float(wts[b['id']][vi]), 'REPLACE')
body.parent = yaw
body.modifiers.new('arm', 'ARMATURE').object = arm


# ---------------------------------------------------------------- materials
def mk_mat(name, additive):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.surface_render_method = 'BLENDED'
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emi = nt.nodes.new('ShaderNodeEmission')
    emi.name = 'emi'
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    ti = nt.nodes.new('ShaderNodeTexImage')
    ti.interpolation = 'Linear'
    ti.extension = 'CLIP'
    k = nt.nodes.new('ShaderNodeValue')
    k.name = 'k'
    k.outputs[0].default_value = 1.0
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    if additive:
        nt.links.new(ti.outputs['Color'], mul.inputs[0])
        nt.links.new(k.outputs[0], mul.inputs[1])
        col = nt.nodes.new('ShaderNodeRGB')
        col.name = 'col'
        mx = nt.nodes.new('ShaderNodeMix')
        mx.data_type = 'RGBA'
        mx.blend_type = 'MULTIPLY'
        mx.inputs[0].default_value = 1
        nt.links.new(col.outputs[0], mx.inputs[6])
        nt.links.new(mul.outputs[0], mx.inputs[7])
        nt.links.new(mx.outputs[2], emi.inputs['Color'])
        add = nt.nodes.new('ShaderNodeAddShader')
        nt.links.new(tr.outputs[0], add.inputs[0])
        nt.links.new(emi.outputs[0], add.inputs[1])
        nt.links.new(add.outputs[0], out.inputs['Surface'])
    else:
        nt.links.new(ti.outputs['Color'], emi.inputs['Color'])
        nt.links.new(ti.outputs['Alpha'], mul.inputs[0])
        nt.links.new(k.outputs[0], mul.inputs[1])
        mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(mul.outputs[0], mix.inputs[0])
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(emi.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return m, ti, nt


bm, bti, bnt = mk_mat('body', False)
bti.image = tex
body.data.materials.append(bm)


def blob_image(name):
    n = 64
    yy, xx = np.mgrid[0:n, 0:n]
    r = np.hypot((xx - n / 2 + .5) / (n / 2), (yy - n / 2 + .5) / (n / 2))
    v = np.clip(1 - r, 0, 1) ** 1.6
    a = np.stack([v, v, v, v], -1).astype(np.float32)
    im = bpy.data.images.new(name, n, n, alpha=True, float_buffer=True)
    im.colorspace_settings.name = 'Non-Color'
    im.pixels.foreach_set(a.ravel())
    im.update()
    return im


blob = blob_image('blob')


def quad(name, cxp, cyp, rx, ry, bone=None):  # portrait-px rectangle with the 0..1 UV
    x0, z0 = wp(cxp - rx, cyp + ry)
    x1, z1 = wp(cxp + rx, cyp - ry)
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1)], [], [(0, 1, 2, 3)])
    u = me.uv_layers.new(name='uv')
    for li, c in zip(me.polygons[0].loop_indices, ((0, 0), (1, 0), (1, 1), (0, 1))):
        u.data[li].uv = c
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    ob.parent = yaw
    if bone:
        vg = ob.vertex_groups.new(name=bone)
        vg.add([0, 1, 2, 3], 1.0, 'REPLACE')
        ob.modifiers.new('arm', 'ARMATURE').object = arm
    return ob


glows = {}
for g in SPEC.get('glows', []):
    r = g['r'] * 4.0
    ob = quad(g['id'], g['at'][0], g['at'][1], r, r, g['bone'])
    m, ti, nt = mk_mat(g['id'], True)
    ti.image = blob
    c = [(v / 255) for v in g['color']]
    nt.nodes['col'].outputs[0].default_value = (c[0], c[1], c[2], 1)
    ob.data.materials.append(m)
    glows[g['id']] = (m, g.get('gain', 1.0))

sh = SPEC['shadow']
shadow = quad('shadow', FEET[0], FEET[1] - 6, sh['rx'], sh['ry'] * 1.5)
shm, sti, snt = mk_mat('shadow', False)
sti.image = blob
snt.nodes['emi'].inputs['Color'].default_value = (0, 0, 0, 1)
for l in list(snt.links):
    if l.to_node == snt.nodes['emi'] and l.to_socket.name == 'Color':
        snt.links.remove(l)
for l in list(snt.links):   # shadow alpha = blob (its alpha channel is the falloff) * k
    if l.from_socket.name == 'Alpha':
        snt.links.remove(l)
snt.links.new(sti.outputs['Alpha'], [n for n in snt.nodes if n.bl_idname == 'ShaderNodeMath'][0].inputs[0])
shadow.data.materials.append(shm)
SHADOW_A = sh['alpha'] / 256.0

# ---------------------------------------------------------------- posing
for pb in arm.pose.bones:
    pb.rotation_mode = 'XYZ'


def chan(curves, key, ch, f, default):
    v = curves.get(key, {}).get(ch)
    return default if v is None else v[min(f, len(v) - 1)]


def pose_frame(action, f, d):
    cv = ANIM[action]['curves']
    off = SPEC.get('dirOffsets', {}).get(d, {})
    for b in BONES:
        pb = arm.pose.bones[b['id']]
        i = b['id']
        rot = chan(cv, i, 'rot', f, 0) + off.get(i, {}).get('rot', 0)
        dx = chan(cv, i, 'dx', f, 0)
        dy = chan(cv, i, 'dy', f, 0) + off.get(i, {}).get('dy', 0)
        sx = chan(cv, i, 'sx', f, 100)
        sy = chan(cv, i, 'sy', f, 100)
        if i == 'root':   # the spec's "body" channels move the whole figure about the feet
            rot += chan(cv, 'body', 'rot', f, 0)
            dx += chan(cv, 'body', 'dx', f, 0)
            dy += chan(cv, 'body', 'dy', f, 0)
            sx = sx * chan(cv, 'body', 'sx', f, 100) / 100
            sy = sy * chan(cv, 'body', 'sy', f, 100) / 100
        pb.rotation_euler = (0, 0, -math.radians(rot))          # bone local Z = world -Y: positive rot is clockwise on screen
        pb.location = (dx / U, -dy / U, 0)
        pb.scale = (sx / 100, sy / 100, 1)
    bnt.nodes['k'].outputs[0].default_value = chan(cv, 'body', 'alpha', f, 256) / 256
    for gid, (m, gain) in glows.items():
        br = chan(cv, gid, 'bright', f, 256) / 256
        al = chan(cv, gid, 'alpha', f, 256) / 256
        m.node_tree.nodes['k'].outputs[0].default_value = gain * br * al * 0.8
    snt.nodes['k'].outputs[0].default_value = chan(cv, 'shadow', 'alpha', f, 256) / 256 * SHADOW_A
    shadow.scale = (chan(cv, 'shadow', 'sx', f, 100) / 100, 1, 1)
    yaw.rotation_euler = (0, 0, math.radians(YAW[d]))
    bpy.context.view_layer.update()


# ---------------------------------------------------------------- bake loop
def finish(exr, dst):
    im = bpy.data.images.load(exr)
    im.colorspace_settings.name = 'Non-Color'
    a = np.array(im.pixels[:], np.float32).reshape(FRAME * SS, FRAME * SS, 4)[::-1]
    bpy.data.images.remove(im)
    a = a.reshape(FRAME, SS, FRAME, SS, 4).mean(axis=(1, 3))                 # box filter, premultiplied linear
    A = np.clip(np.maximum(a[..., 3], a[..., :3].max(-1)), 0, 1)             # additive light keeps its colour
    c = np.where(A[..., None] > 1e-5, a[..., :3] / np.maximum(A, 1e-5)[..., None], 0)
    o = np.concatenate([np.clip(c, 0, 1), A[..., None]], -1)[::-1]
    out = bpy.data.images.new('o', FRAME, FRAME, alpha=True)
    out.colorspace_settings.name = 'Non-Color'
    out.alpha_mode = 'STRAIGHT'
    out.pixels.foreach_set(o.astype(np.float32).ravel())
    out.update()
    out.filepath_raw = dst
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)


t0 = time.time()
n = 0
per = {}
os.makedirs(OUT, exist_ok=True)
for action in ACTIONS:
    ta = time.time()
    for d in DIRS:
        os.makedirs(f'{OUT}/frames/{action}/{d}', exist_ok=True)
        for f in range(ANIM[action]['frames']):
            pose_frame(action, f, d)
            tmp = f'{OUT}/_tmp.exr'
            sc.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            finish(tmp, f'{OUT}/frames/{action}/{d}/{f:02d}.png')
            n += 1
    per[action] = round(time.time() - ta, 1)
    print('baked', action, per[action], 's', flush=True)
if os.path.exists(f'{OUT}/_tmp.exr'):
    os.remove(f'{OUT}/_tmp.exr')
json.dump({'frames': n, 'seconds': round(time.time() - t0, 1), 'perAction': per, 'dirs': DIRS, 'blender': bpy.app.version_string,
           'mesh': {'verts': len(verts), 'tris': len(faces) * 2}, 'engine': sc.render.engine, 'samples': sc.eevee.taa_render_samples},
          open(f'{OUT}/bake.json', 'w'), indent=1)
print('done', n, 'frames', round(time.time() - t0, 1), 's')

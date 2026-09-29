"""
Корпус META University для презентации META Rooms.

Собирает здание в Blender по фото фасада (meta.edu.kz): кирпич песочного цвета,
тёмные окна в нишах, красные пилястры и белые межэтажные пояса на правом крыле,
остеклённая лестничная башня с жёлтым ребром, щит META, вход с навесом, площадь,
деревья и флаг. Свет (солнце + небо, Cycles) запекается в одну текстуру,
стекло экспортируется отдельно и отражает окружение уже в браузере.

Единицы — единицы 3D-сцены презентации: габарит совпадает с поэтажной схемой
(шаг этажа 1.45, план 35.4 × 10.1), Z вверх (экспортёр glTF переводит в Y вверх).

  python build_meta.py -- <out.glb> <logo.jpg> [bake_px] [samples]
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "meta-building.glb")
LOGO = os.path.abspath(argv[1]) if len(argv) > 1 else None
BAKE_PX = int(argv[2]) if len(argv) > 2 else 2048
SAMPLES = int(argv[3]) if len(argv) > 3 else 96

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def mat(name, hexc, rough=0.8, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*srgb(hexc), 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    return m

# ---------------------------------------------------------------- materials
def brick_material():
    """Кирпич песочного цвета; ниже 1.27 — серый камень цоколя."""
    m = bpy.data.materials.new("Brick"); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    p = N["Principled BSDF"]; p.inputs["Roughness"].default_value = 0.85
    geo = N.new("ShaderNodeNewGeometry")
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ"); L.new(tc.outputs["Object"], sep.inputs[0])
    nsep = N.new("ShaderNodeSeparateXYZ"); L.new(geo.outputs["Normal"], nsep.inputs[0])
    absx = N.new("ShaderNodeMath"); absx.operation = "ABSOLUTE"; L.new(nsep.outputs[0], absx.inputs[0])
    u = N.new("ShaderNodeMix"); u.data_type = "FLOAT"
    L.new(absx.outputs[0], u.inputs[0]); L.new(sep.outputs[0], u.inputs[2]); L.new(sep.outputs[1], u.inputs[3])
    comb = N.new("ShaderNodeCombineXYZ"); L.new(u.outputs[0], comb.inputs[0]); L.new(sep.outputs[2], comb.inputs[1])
    br = N.new("ShaderNodeTexBrick")
    br.inputs["Scale"].default_value = 2.6
    br.inputs["Mortar Size"].default_value = 0.012
    br.inputs["Color1"].default_value = (*srgb("D9C29A"), 1)
    br.inputs["Color2"].default_value = (*srgb("C9AE82"), 1)
    br.inputs["Mortar"].default_value = (*srgb("E9DEC8"), 1)
    br.offset = 0.5
    L.new(comb.outputs[0], br.inputs["Vector"])
    stone = N.new("ShaderNodeRGB"); stone.outputs[0].default_value = (*srgb("B9B3AB"), 1)
    lt = N.new("ShaderNodeMath"); lt.operation = "LESS_THAN"; lt.inputs[1].default_value = 1.27
    L.new(sep.outputs[2], lt.inputs[0])
    mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"
    L.new(lt.outputs[0], mix.inputs[0]); L.new(br.outputs["Color"], mix.inputs[6]); L.new(stone.outputs[0], mix.inputs[7])
    L.new(mix.outputs[2], p.inputs["Base Color"])
    return m

M_BRICK = brick_material()
M_BAND  = mat("Band", "ECE9E3", 0.6)
M_RED   = mat("Pilaster", "B8442C", 0.7)
M_FRAME = mat("Frame", "3A3F46", 0.45, 0.3)
M_BACK  = mat("Interior", "2A2C31", 0.9)
M_YEL   = mat("Fin", "D69A2C", 0.5, 0.2)
M_FASC  = mat("Fascia", "C21F2C", 0.55)
M_WHITE = mat("White", "F4F2EE", 0.5)
M_ROOF  = mat("Roof", "8E8A86", 0.95)
M_CAP   = mat("Cap", "A3A7AB", 0.4, 0.6)
M_PAVE  = mat("Pavers", "ADA79E", 0.9)
M_LAWN  = mat("Lawn", "6E8F4E", 1.0)
M_TREE  = mat("Tree", "5C8A45", 0.95)
M_TRUNK = mat("Trunk", "6B4E3A", 0.9)
M_FLAG  = mat("Flag", "00AFCA", 0.7)
M_POLE  = mat("Pole", "C9CDD2", 0.3, 0.8)
M_GLASS = mat("Glass", "1E3246", 0.06, 0.4)

M_LOGO = bpy.data.materials.new("Logo"); M_LOGO.use_nodes = True
if LOGO and os.path.exists(LOGO):
    img = bpy.data.images.load(LOGO)
    t = M_LOGO.node_tree.nodes.new("ShaderNodeTexImage"); t.image = img
    uvn = M_LOGO.node_tree.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "LogoUV"
    M_LOGO.node_tree.links.new(uvn.outputs["UV"], t.inputs["Vector"])
    M_LOGO.node_tree.links.new(t.outputs["Color"], M_LOGO.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
M_LOGO.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.4

# ---------------------------------------------------------------- mesh helpers
class Mesh:
    """Набирает много боксов в один bmesh (быстро и без тысяч объектов)."""
    def __init__(self, name, mats):
        self.name = name; self.mats = mats; self.bm = bmesh.new()
    def box(self, x0, x1, y0, y1, z0, z1, mi=0):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = r["verts"]
        for v in vs:
            v.co.x = x0 if v.co.x < 0 else x1
            v.co.y = y0 if v.co.y < 0 else y1
            v.co.z = z0 if v.co.z < 0 else z1
        for f in {f for v in vs for f in v.link_faces}:
            f.material_index = mi
    def obj(self):
        me = bpy.data.meshes.new(self.name); self.bm.to_mesh(me); self.bm.free()
        for m in self.mats: me.materials.append(m)
        o = bpy.data.objects.new(self.name, me); scene.collection.objects.link(o)
        return o

def activate(o):
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
    bpy.context.view_layer.objects.active = o

def boolean_cut(target, cutter):
    mod = target.modifiers.new("cut", "BOOLEAN"); mod.operation = "DIFFERENCE"
    mod.object = cutter; mod.solver = "EXACT"
    activate(target); bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter)

# ---------------------------------------------------------------- dimensions
X0, X1 = -17.7, 17.7          # длина корпуса
YS, YN = -5.05, 5.05          # южный (главный) и северный фасад
ZG, FH = -0.2, 1.45           # земля, шаг этажа
TOP = 6 * FH + 1.27 + 0.38    # верх парапета ≈ 10.35
XA1 = -3.4                    # конец левого крыла
XT0, XT1 = -3.4, -1.9         # лестничная башня
XC0 = -1.9                    # начало правого крыла (выступает на 0.3)
YC = YS - 0.3
XLOGO0, XLOGO1 = -1.9, 1.6    # простенок со щитом
WW, WH = 0.95, 0.85           # окно
REC = 0.3                     # глубина ниши

def floors(): return [(f, f * FH) for f in range(1, 7)]
def bays(a, b, step=1.55, pad=0.8):
    n = int((b - a - 2 * pad) // step) + 1
    s = (b - a - (n - 1) * step) / 2
    return [a + s + i * step for i in range(n)]

A_BAYS = bays(X0, XA1)
C_BAYS = bays(XLOGO1, X1)
END_BAYS = [-3.3, -1.1, 1.1, 3.3]

# ---------------------------------------------------------------- volumes
body = Mesh("Body", [M_BRICK]); body.box(X0, X1, YS, YN, ZG, TOP); body = body.obj()
wing = Mesh("Wing", [M_BRICK]); wing.box(XC0, X1, YC, YS + 0.02, ZG, TOP); wing = wing.obj()

cut_body = Mesh("cut_body", [])
cut_wing = Mesh("cut_wing", [])
frames = Mesh("Frames", [M_FRAME])
glass = Mesh("Glass", [M_GLASS])
backs = Mesh("Backs", [M_BACK])

def window_x(cutm, xc, face_y, z0, outward, w=WW, h=WH, zoff=0.32, frame_mullion=True):
    """Окно на фасаде, перпендикулярном Y (outward = -1 юг, +1 север)."""
    za, zb = z0 + zoff, z0 + zoff + h
    xa, xb = xc - w / 2, xc + w / 2
    yo, yi = face_y + outward * 0.2, face_y - outward * REC
    cutm.box(xa, xb, min(yo, yi), max(yo, yi), za, zb)
    gy = face_y - outward * (REC - 0.06)
    glass.box(xa, xb, min(gy, gy - outward * 0.02), max(gy, gy - outward * 0.02), za, zb)
    fy0, fy1 = sorted((gy + outward * 0.01, gy + outward * 0.07))
    t = 0.045
    frames.box(xa, xb, fy0, fy1, za, za + t); frames.box(xa, xb, fy0, fy1, zb - t, zb)
    frames.box(xa, xa + t, fy0, fy1, za, zb); frames.box(xb - t, xb, fy0, fy1, za, zb)
    if frame_mullion:
        frames.box(xc - t / 2, xc + t / 2, fy0, fy1, za, zb)
        frames.box(xa, xb, fy0, fy1, za + h * 0.62, za + h * 0.62 + t)

def window_y(cutm, yc, face_x, z0, outward):
    """Окно на торце (грань перпендикулярна X)."""
    za, zb = z0 + 0.32, z0 + 0.32 + WH
    ya, yb = yc - WW / 2, yc + WW / 2
    xo, xi = face_x + outward * 0.2, face_x - outward * REC
    cutm.box(min(xo, xi), max(xo, xi), ya, yb, za, zb)
    gx = face_x - outward * (REC - 0.06)
    glass.box(min(gx, gx - outward * 0.02), max(gx, gx - outward * 0.02), ya, yb, za, zb)
    fx0, fx1 = sorted((gx + outward * 0.01, gx + outward * 0.07)); t = 0.045
    frames.box(fx0, fx1, ya, yb, za, za + t); frames.box(fx0, fx1, ya, yb, zb - t, zb)
    frames.box(fx0, fx1, ya, ya + t, za, zb); frames.box(fx0, fx1, yb - t, yb, za, zb)
    frames.box(fx0, fx1, yc - t / 2, yc + t / 2, za, zb)

# южный фасад: левое крыло (все этажи, первый — цоколь из камня)
for x in A_BAYS:
    window_x(cut_body, x, YS, 0.0, -1, zoff=0.3, h=0.78)
    for f, z0 in floors(): window_x(cut_body, x, YS, z0, -1)
# южный фасад: правое крыло
for x in C_BAYS:
    for f, z0 in floors(): window_x(cut_wing, x, YC, z0, -1)
# витраж первого этажа правого крыла
for x in C_BAYS:
    window_x(cut_wing, x, YC, 0.0, -1, w=1.38, h=1.02, zoff=0.06)
# простенок со щитом: окна только на 1–3 этажах
for x in (XLOGO0 + 1.0, XLOGO1 - 1.0):
    for f, z0 in floors()[:3]: window_x(cut_wing, x, YC, z0, -1, w=0.8)

# северный фасад
for x in A_BAYS + bays(XC0, X1):
    window_x(cut_body, x, YN, 0.0, +1, zoff=0.3, h=0.78)
    for f, z0 in floors(): window_x(cut_body, x, YN, z0, +1)
# торцы
for y in END_BAYS:
    for f, z0 in [(0, 0.0)] + floors():
        window_y(cut_body, y, X1, z0, +1)
        window_y(cut_body, y, X0, z0, -1)

# плоская кровля с парапетом
cut_body.box(X0 + 0.3, X1 - 0.3, YS + 0.3, YN - 0.3, TOP - 0.3, TOP + 1)
cut_wing.box(XC0 + 0.3, X1 - 0.3, YC + 0.1, YS + 0.5, TOP - 0.3, TOP + 1)

boolean_cut(body, cut_body.obj())
boolean_cut(wing, cut_wing.obj())

# ---------------------------------------------------------------- details
det = Mesh("Details", [M_BAND, M_RED, M_YEL, M_FASC, M_ROOF, M_CAP, M_WHITE, M_BACK])
BAND, RED, YEL, FASC, ROOF, CAP, WHITE, BACK = range(8)

# белые межэтажные пояса и карниз на правом крыле (как на фото)
for f in range(1, 7):
    z = f * FH
    det.box(XLOGO1, X1, YC - 0.07, YC, z - 0.1, z + 0.14, BAND)
det.box(XLOGO1, X1, YC - 0.12, YC, TOP - 0.28, TOP, BAND)
# красные пилястры между парами окон
for i in range(len(C_BAYS) - 1):
    if i % 2 == 0:
        xm = (C_BAYS[i] + C_BAYS[i + 1]) / 2
        det.box(xm - 0.13, xm + 0.13, YC - 0.1, YC, FH - 0.1, TOP - 0.28, RED)
for xm in ((A_BAYS[2] + A_BAYS[3]) / 2, (A_BAYS[5] + A_BAYS[6]) / 2):
    det.box(xm - 0.11, xm + 0.11, YS - 0.06, YS, FH - 0.1, TOP, RED)
    det.box(xm - 0.11, xm + 0.11, YN, YN + 0.06, FH - 0.1, TOP, RED)
# кровля, парапеты, техника
det.box(X0 + 0.3, X1 - 0.3, YS + 0.3, YN - 0.3, TOP - 0.32, TOP - 0.28, ROOF)
for (x0, x1, y0, y1) in ((X0, X1, YS, YS + 0.3), (X0, X1, YN - 0.3, YN), (X0, X0 + 0.3, YS, YN), (X1 - 0.3, X1, YS, YN)):
    det.box(x0 - 0.02, x1 + 0.02, y0 - 0.02, y1 + 0.02, TOP, TOP + 0.06, CAP)
det.box(XC0, X1, YC - 0.02, YC + 0.3, TOP, TOP + 0.06, CAP)
for (x, y, w, d, h) in ((-11, 1.5, 2.4, 1.6, 0.7), (-6, -1.2, 1.4, 1.4, 0.55), (7, 1.0, 3.0, 1.8, 0.8), (12.5, -1.8, 1.2, 1.2, 1.1)):
    det.box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, TOP - 0.28, TOP - 0.28 + h, CAP if h < 1 else WHITE)

# остеклённая лестничная башня + жёлтое ребро
TZ1 = TOP + 0.65
glass.box(XT0, XT1, YS - 0.42, YS + 0.2, ZG, TZ1)
fr = 0.05
for z in [ZG + 0.02 + i * 0.3625 for i in range(int((TZ1 - ZG) / 0.3625) + 1)]:
    frames.box(XT0 - 0.02, XT1 + 0.02, YS - 0.44, YS - 0.4, z, z + fr)
for x in (XT0, XT0 + 0.5, XT0 + 1.0, XT1 - fr):
    frames.box(x, x + fr, YS - 0.45, YS - 0.4, ZG, TZ1)
frames.box(XT0 - 0.03, XT1 + 0.03, YS - 0.46, YS + 0.2, TZ1 - 0.08, TZ1 + 0.04)
det.box(XT1, XT1 + 0.14, YS - 0.75, YS - 0.3, ZG, TZ1 + 0.25, YEL)

# вход: навес с красной вывеской
EX0, EX1 = C_BAYS[2] - 0.8, C_BAYS[5] + 0.8
det.box(EX0, EX1, YC - 1.7, YC, 1.2, 1.32, WHITE)
det.box(EX0, EX1, YC - 1.76, YC - 1.66, 0.98, 1.36, FASC)
for x in (EX0 + 0.2, EX1 - 0.2):
    det.box(x - 0.05, x + 0.05, YC - 1.6, YC - 1.5, ZG, 1.2, CAP)
det = det.obj()

# надпись на вывеске
bpy.ops.object.text_add(location=((EX0 + EX1) / 2, YC - 1.77, 1.17), rotation=(math.pi / 2, 0, 0))
txt = bpy.context.object; txt.data.body = "META  UNIVERSITY"
txt.data.align_x = "CENTER"; txt.data.align_y = "CENTER"; txt.data.size = 0.2; txt.data.extrude = 0.008
txt.data.materials.append(M_WHITE)
bpy.ops.object.convert(target="MESH")

# щит META на простенке (UV — по кадрированному логотипу)
def shield(cx, cz, h, face_y):
    w = h * 0.685
    top = [(-w / 2, h / 2 - 0.08 * h), (-w / 2 + 0.06 * h, h / 2), (w / 2 - 0.06 * h, h / 2), (w / 2, h / 2 - 0.08 * h)]
    side = [(w / 2, -h * 0.05)]
    curve = []
    for i in range(1, 12):
        t = i / 12
        x = w / 2 * (1 - t) ** 1.1
        z = -h * 0.05 - (h * 0.45) * math.sin(t * math.pi / 2)
        curve.append((x, z))
    right = top[2:] + side + curve
    outline = top[:2] + right + [(0, -h / 2)] + [(-x, z) for (x, z) in reversed(curve)] + [(-w / 2, -h * 0.05)]
    bm = bmesh.new(); uv = bm.loops.layers.uv.new("LogoUV")
    vs = [bm.verts.new((cx + x, face_y, cz + z)) for (x, z) in outline]
    f = bm.faces.new(vs)
    # кадр логотипа внутри 160×186: 35.6..124.5 по X, 27.7..157.6 по Y
    u0, u1, v0, v1 = 35.6 / 160, 124.5 / 160, 1 - 157.6 / 186, 1 - 27.7 / 186
    for l in f.loops:
        x, z = l.vert.co.x - cx, l.vert.co.z - cz
        l[uv].uv = (u0 + (x / w + 0.5) * (u1 - u0), v0 + (z / h + 0.5) * (v1 - v0))
    f.normal_update()
    if f.normal.y > 0: f.normal_flip()        # лицом наружу, иначе щит запекается в тени
    bmesh.ops.triangulate(bm, faces=[f])
    me = bpy.data.meshes.new("Shield"); bm.to_mesh(me); bm.free()
    me.materials.append(M_LOGO)
    o = bpy.data.objects.new("Shield", me); scene.collection.objects.link(o)
    return o
shield_o = shield((XLOGO0 + XLOGO1) / 2, 7.95, 2.35, YC - 0.03)

# ---------------------------------------------------------------- site
site = Mesh("Site", [M_PAVE, M_LAWN, M_TREE, M_TRUNK, M_POLE])
PAVE, LAWN, TREE, TRUNK, POLE = range(5)
site.box(-25, 25, -14, 11, ZG - 0.35, ZG, PAVE)
for (x0, x1, y0, y1) in ((-17, -6.2, -12.3, -8.2), (11.8, 18, -12.3, -8.2), (-17, 17, 7.2, 10.2)):
    site.box(x0, x1, y0, y1, ZG, ZG + 0.04, LAWN)
site.box(-5.6, -5.5, -10.5, -10.4, ZG, ZG + 7.2, POLE)
site = site.obj()

def tree(x, y, s=1.0):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.05 * s, location=(x, y, ZG + 2.3 * s))
    c = bpy.context.object; c.scale.z = 1.25; c.data.materials.append(M_TREE)
    bpy.ops.object.shade_flat()
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.12 * s, depth=1.5 * s, location=(x, y, ZG + 0.75 * s))
    t = bpy.context.object; t.data.materials.append(M_TRUNK)
    return [c, t]
trees = []
for (x, y, s) in ((-15.5, -10.2, 1.0), (-11.5, -10.4, 0.85), (-8, -10.0, 0.95), (13, -10.3, 0.9), (16.4, -10.1, 1.05),
                  (-13, 8.7, 1.0), (-4, 8.7, 0.9), (6, 8.8, 1.0), (14, 8.6, 0.85), (21, -3, 1.1), (-21, 2, 1.0)):
    trees += tree(x, y, s)

# флаг Казахстана
bpy.ops.mesh.primitive_plane_add(size=1, location=(-4.75, -10.45, ZG + 6.55), rotation=(math.pi / 2, 0, 0))
flag = bpy.context.object; flag.scale = (1.5, 0.75, 1)
bpy.ops.object.transform_apply(scale=True)
activate(flag); bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.subdivide(number_cuts=10); bpy.ops.object.mode_set(mode="OBJECT")
for v in flag.data.vertices:
    d = v.co.x + 0.75
    v.co.y += math.sin(d * 3.2) * 0.09 * d
flag.data.materials.append(M_FLAG)

# ---------------------------------------------------------------- light
world = bpy.data.worlds.new("World"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.62, 0.70, 0.82, 1); bg.inputs[1].default_value = 0.85
bpy.ops.object.light_add(type="SUN", rotation=(math.radians(52), 0, math.radians(35)))
sun = bpy.context.object; sun.data.energy = 3.6; sun.data.angle = math.radians(1.5)
sun.data.color = (1.0, 0.94, 0.86)

# ---------------------------------------------------------------- bake
baked_parts = [body, wing, frames_o := frames.obj(), backs.obj(), det, txt, shield_o, site, flag] + trees
glass_o = glass.obj()
glass_o.hide_render = True

bpy.ops.object.select_all(action="DESELECT")
for o in baked_parts: o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.convert(target="MESH")
bpy.ops.object.join()
B = bpy.context.object; B.name = "Building"

activate(B)
bake_uv = B.data.uv_layers.new(name="BakeUV")
B.data.uv_layers.active = bake_uv
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0015, area_weight=0.0, scale_to_bounds=True)
bpy.ops.object.mode_set(mode="OBJECT")
bake_name = bake_uv.name
img = bpy.data.images.new("meta-building-bake", BAKE_PX, BAKE_PX, alpha=False)
for m in B.data.materials:
    t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = img
    m.node_tree.nodes.active = t

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = SAMPLES
scene.render.bake.use_pass_direct = True
scene.render.bake.use_pass_indirect = True
scene.render.bake.use_pass_color = True
scene.render.bake.margin = 6
print(f"baking {BAKE_PX}px × {SAMPLES} spp …", flush=True)
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT", "COLOR"}, uv_layer=bake_name)

img_png = img
img_png.filepath_raw = OUT.replace(".glb", "-bake.png"); img_png.file_format = "PNG"; img_png.save()

# один «запечённый» материал на всё здание
bm_mat = bpy.data.materials.new("Baked"); bm_mat.use_nodes = True
p = bm_mat.node_tree.nodes["Principled BSDF"]
t = bm_mat.node_tree.nodes.new("ShaderNodeTexImage"); t.image = img_png
bm_mat.node_tree.links.new(t.outputs["Color"], p.inputs["Base Color"])
p.inputs["Roughness"].default_value = 1.0
B.data.materials.clear(); B.data.materials.append(bm_mat)
# оставить только UV запекания
for l in [l.name for l in B.data.uv_layers if l.name != bake_name]:
    l = B.data.uv_layers[l]
    B.data.uv_layers.remove(l)

glass_o.hide_render = False
bpy.ops.object.select_all(action="DESELECT")
B.select_set(True); glass_o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True,
                          export_image_format="JPEG", export_image_quality=88,
                          export_apply=True, export_yup=True)
print("done:", OUT, os.path.getsize(OUT) // 1024, "KB", "faces:", len(B.data.polygons), flush=True)

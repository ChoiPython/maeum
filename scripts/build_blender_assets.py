"""Blender에서 마음정원 모델 원본을 제작하고 웹용 GLB로 내보냅니다.

실행: blender --background --factory-startup --python scripts/build_blender_assets.py
외부 모델/텍스처를 사용하지 않으며, 모든 메시와 재질은 bpy로 제작합니다.
"""
from pathlib import Path
import json
import math
import random
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'asset-sources' / 'blender'
EXPORT = ROOT / 'apps' / 'client' / 'public' / 'assets' / 'models' / 'blender'
SOURCE.mkdir(parents=True, exist_ok=True)
EXPORT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(41)

def material(name, hex_color, roughness=0.8, emission=0):
    rgb = tuple(int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4))
    # Blender node values are linear, whereas the design palette is sRGB.
    linear = tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*linear, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*linear, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat

M = {
    'bark': material('Warm_Bark', '715541'),
    'wood': material('Honey_Wood', 'ab8154'),
    'woodlight': material('Wood_Edge', 'd1ac76'),
    'metal': material('Forest_Metal', '3d5146', .45),
    'leaf': material('Canopy_Moss', '577b4c'),
    'leaflight': material('Canopy_Sage', '7f9a61'),
    'leafdark': material('Canopy_Forest', '3b6044'),
    'pine': material('Pine_Sage', '557969'),
    'pinedark': material('Pine_Shadow', '36594e'),
    'stem': material('Flower_Stem', '5d7950'),
    'white': material('Petal_Cream', 'f3e8c9'),
    'pink': material('Petal_DustyPink', 'cd9e9c'),
    'yellow': material('Flower_Pollen', 'd7b45c'),
    'stone': material('Stone_Warm', '8d9281'),
    'stonelight': material('Stone_Pale', 'b1b39e'),
    'moss': material('Stone_Moss', '83916a'),
    'lamp': material('Lantern_Amber', 'f4ce7a', .5, .7),
    'coat': material('Visitor_Coat', '456c56'),
    'skin': material('Visitor_Skin', 'e3c3a1'),
    'eyes': material('Visitor_Eyes', '38463b'),
    'hat': material('Visitor_Hat', 'd8c49b'),
}

current_root = None
current_collection = None

def asset(name):
    global current_root, current_collection
    current_collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(current_collection)
    current_root = bpy.data.objects.new(name, None)
    current_collection.objects.link(current_root)
    current_root['asset_id'] = name
    current_root['modeling_tool'] = 'Blender bpy'
    current_root['units'] = 'meter'
    return current_root

def finish(obj, name, mat, smooth=False):
    obj.name = name
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    current_collection.objects.link(obj)
    obj.parent = current_root
    obj.data.materials.append(mat)
    if smooth:
        for face in obj.data.polygons:
            face.use_smooth = True
    return obj

def ico(name, location, scale, mat, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=location)
    obj = finish(bpy.context.object, name, mat)
    obj.scale = scale
    return obj

def uv(name, location, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=location)
    obj = finish(bpy.context.object, name, mat, True)
    obj.scale = scale
    return obj

def cylinder(name, start, end, radius, mat, top=None, vertices=8):
    direction = Vector(end) - Vector(start)
    middle = (Vector(start) + Vector(end)) * .5
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
        radius2=radius if top is None else top, depth=direction.length, location=middle)
    obj = finish(bpy.context.object, name, mat)
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    return obj

def box(name, location, scale, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = finish(bpy.context.object, name, mat)
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new('Soft_Handcrafted_Edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj

assets = []
root = asset('tree-canopy')
cylinder('Trunk_Tapered', (0,0,0), (.1,.02,2.5), .26, M['bark'], .13, 9)
branches = [((.04,0,1.4),(-.8,.12,2.7)), ((.06,0,1.7),(.85,.22,3.0)),
            ((.08,0,1.9),(.12,-.78,3.2)), ((.08,0,2.0),(-.25,.65,3.1))]
for i,(start,end) in enumerate(branches):
    cylinder(f'Branch_{i+1}', start, end, .12, M['bark'], .055)
canopies = [(-.88,.15,2.9,1.0), (.82,.22,3.1,1.08), (.06,-.72,3.3,.95),
            (-.22,.7,3.25,1), (.05,0,3.9,1.05), (-.65,-.45,3.55,.8), (.68,-.35,3.6,.82)]
for i,(x,y,z,s) in enumerate(canopies):
    obj=ico(f'Canopy_Cluster_{i+1}', (x,y,z), (s,s*.87,s*.85), [M['leaf'],M['leaflight'],M['leafdark']][i%3], 2)
    obj.rotation_euler=(.12*i,.17*i,.42*i)
for i in range(5):
    a=i*math.tau/5
    cylinder(f'Root_{i+1}', (0,0,.15), (.65*math.cos(a),.65*math.sin(a),.06), .105, M['bark'], .04)
assets.append(root)

root=asset('tree-pine')
cylinder('Pine_Trunk',(0,0,0),(0,0,3.1),.2,M['bark'],.09)
for i,(z,r,depth) in enumerate([(1.55,1.35,1.75),(2.3,1.05,1.65),(3.0,.75,1.55)]):
    bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=r, radius2=0, depth=depth, location=(0,0,z))
    obj=finish(bpy.context.object,f'Pine_Layer_{i+1}',M['pine'] if i%2==0 else M['pinedark'])
    obj.rotation_euler.z=i*.31
assets.append(root)

root=asset('flower-patch')
for i,(x,y,h) in enumerate([(-.3,-.15,.42),(.18,.12,.58),(.42,-.2,.34),(-.12,.4,.48),(-.48,.26,.3)]):
    cylinder(f'Stem_{i}',(x,y,0),(x+.035,y,h),.018,M['stem'],vertices=6)
    for j in range(5):
        a=j*math.tau/5
        petal=uv(f'Petal_{i}_{j}',(x+.035+math.cos(a)*.09,y+math.sin(a)*.09,h),(.1,.055,.028),M['white'] if i%2==0 else M['pink'])
        petal.rotation_euler.z=a
    uv(f'Pollen_{i}',(x+.035,y,h+.012),(.047,.047,.028),M['yellow'])
    leaf=uv(f'Flower_Leaf_{i}',(x-.075,y,h*.4),(.1,.04,.025),M['leaflight'])
    leaf.rotation_euler.y=-.4
assets.append(root)

root=asset('rock-cluster')
for i,(x,y,z,scale) in enumerate([(-.2,.05,.35,(.72,.6,.5)),(.55,.2,.21,(.43,.35,.31)),(-.45,-.4,.14,(.3,.35,.22))]):
    rock=ico(f'Rock_{i}',(x,y,z),scale,M['stone'] if i%2==0 else M['stonelight'],1)
    rock.rotation_euler=(.15*i,.2,.41*i)
ico('Moss_Patch',(-.28,.05,.7),(.33,.34,.06),M['moss'],1)
assets.append(root)

root=asset('garden-bench')
for x in [-.82,.82]:
    for y in [-.27,.27]:
        box(f'Leg_{x}_{y}',(x,y,.31),(.12,.12,.62),M['metal'],.018)
    box(f'SideRail_{x}',(x,0,.52),(.12,.78,.12),M['metal'],.02)
    box(f'BackPost_{x}',(x,.32,.85),(.1,.1,.95),M['metal'],.02)
for i in range(4):
    box(f'SeatSlat_{i}',(0,-.29+i*.19,.65),(2.08,.16,.1),M['wood'] if i%2 else M['woodlight'],.025)
for i in range(3):
    box(f'BackSlat_{i}',(0,.34,.94+i*.16),(2.08,.09,.125),M['wood'],.02)
assets.append(root)

root=asset('floating-leaf')
verts=[]
for i in range(13):
    t=i/12
    width=math.sin(math.pi*t)*.26
    for j in [-1,0,1]:
        verts.append((j*width, t*.95-.475, .035*math.sin(math.pi*t)+.04*abs(j)))
faces=[]
for i in range(12):
    for j in range(2):
        k=i*3+j
        faces.append((k,k+1,k+4,k+3))
mesh=bpy.data.meshes.new('Curved_Leaf_Mesh')
mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('Curved_Leaf',mesh)
current_collection.objects.link(obj);obj.parent=current_root;obj.data.materials.append(M['leaflight'])
solid=obj.modifiers.new('Leaf_Thickness','SOLIDIFY');solid.thickness=.012
bpy.context.view_layer.objects.active=obj
bpy.ops.object.modifier_apply(modifier=solid.name)
cylinder('Leaf_Vein',(0,-.52,.03),(0,.43,.03),.012,M['yellow'],vertices=6)
assets.append(root)

root=asset('garden-lantern')
cylinder('Lantern_Post',(0,0,0),(0,0,1.35),.075,M['wood'],vertices=8)
box('Lantern_Base',(0,0,.06),(.35,.35,.12),M['metal'],.035)
box('Lantern_House',(0,0,1.55),(.34,.34,.42),M['lamp'],.035)
for x in [-.18,.18]:
    for y in [-.18,.18]:
        box(f'Lantern_Frame_{x}_{y}',(x,y,1.55),(.035,.035,.48),M['metal'],.006)
bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.36,radius2=.06,depth=.24,location=(0,0,1.88),rotation=(0,0,math.pi/4))
finish(bpy.context.object,'Lantern_Roof',M['metal'])
assets.append(root)

root=asset('garden-visitor')
uv('Visitor_Torso',(0,0,.69),(.29,.2,.37),M['coat'])
uv('Visitor_Head',(0,-.015,1.19),(.235,.215,.255),M['skin'])
for x in [-.13,.13]:
    cylinder(f'Visitor_Leg_{x}',(x,0,.12),(x,0,.48),.085,M['metal'],vertices=8)
    uv(f'Visitor_Shoe_{x}',(x,-.035,.1),(.1,.15,.09),M['metal'])
    uv(f'Visitor_Eye_{x}',(x*.57,-.216,1.23),(.023,.018,.028),M['eyes'])
for x in [-.34,.34]:
    cylinder(f'Visitor_Arm_{x}',(x*.77,0,.9),(x,0,.51),.075,M['coat'],.065,8)
    uv(f'Visitor_Hand_{x}',(x,0,.48),(.075,.075,.085),M['skin'])
cylinder('Hat_Brim',(0,0,1.4),(0,0,1.45),.34,M['hat'],vertices=16)
cylinder('Hat_Crown',(0,0,1.45),(0,0,1.59),.225,M['hat'],.2,12)
assets.append(root)

for index,root in enumerate(assets):
    root.location=((index%4)*6,(index//4)*7,0)

# 편집 가능한 모델 카탈로그로 저장합니다. Collection마다 모델 하나를 배치합니다.
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
bpy.ops.mesh.primitive_plane_add(size=2,location=(9,3,-.04))
floor=bpy.context.object;floor.name='Catalog_Backdrop';floor.scale=(13,7,1)
floor.data.materials.append(material('Catalog_Backdrop_Material','e8eddd'))
scene.world=bpy.data.worlds.new('Garden_Studio_World');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.8,.85,.75,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
bpy.ops.object.light_add(type='AREA',location=(6,-4,15))
light=bpy.context.object;light.name='Studio_Key';light.data.energy=1700;light.data.shape='DISK';light.data.size=10
bpy.ops.object.camera_add(location=(12,-17,20))
camera=bpy.context.object;camera.name='Asset_Catalog_Camera'
direction=Vector((8,3,1.5))-camera.location
camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=27
scene.camera=camera
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene['project']='마음정원 / Mind Garden'
scene['asset_workflow']='Blender collection source -> per-model GLB -> Three.js GLTFLoader'
bpy.ops.object.select_all(action='DESELECT')
assets[0].select_set(True);bpy.context.view_layer.objects.active=assets[0]
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'maeum-garden.blend'),compress=True)
import sys
sys.path.insert(0,str(ROOT/'scripts'))
from export_blender_assets import export_assets
manifest=export_assets(assets,ROOT)
print('MAEUM_ASSETS_COMPLETE '+json.dumps(manifest,ensure_ascii=False))

"""편집한 .blend를 다시 모델링하지 않고 웹용 GLB로 내보내는 Blender 스크립트."""
from pathlib import Path
import hashlib
import json
import bpy
from mathutils import Vector

ASSET_IDS = ('tree-canopy','tree-pine','flower-patch','rock-cluster',
             'garden-bench','floating-leaf','garden-lantern','garden-visitor')

def export_assets(assets, project_root):
    source = project_root/'asset-sources'/'blender'
    export = project_root/'apps'/'client'/'public'/'assets'/'models'/'blender'
    source_file = source/'maeum-garden.blend'
    export.mkdir(parents=True,exist_ok=True)
    manifest = {'schemaVersion':1,'generator':'Blender bpy','blenderVersion':bpy.app.version_string,
        'source':'asset-sources/blender/maeum-garden.blend',
        'sourceSha256':hashlib.sha256(source_file.read_bytes()).hexdigest(),
        'units':'meter','runtimeUpAxis':'Y','assets':[]}
    for root in assets:
        original_location=root.location.copy()
        root.location=(0,0,0)
        bpy.context.view_layer.update()
        originals=[obj for obj in root.children_recursive if obj.type=='MESH']
        temporary=bpy.data.collections.new('_RuntimeExport')
        bpy.context.scene.collection.children.link(temporary)
        temporary_meshes=[]
        try:
            # 모디파이어를 평가한 복사본을 사용하고 편집 원본은 보존합니다.
            depsgraph=bpy.context.evaluated_depsgraph_get()
            duplicates=[]
            points=[]
            triangles=0
            for obj in originals:
                evaluated=obj.evaluated_get(depsgraph)
                mesh=bpy.data.meshes.new_from_object(evaluated,depsgraph=depsgraph)
                duplicate=bpy.data.objects.new(obj.name+'_Export',mesh)
                duplicate.matrix_world=obj.matrix_world.copy()
                temporary.objects.link(duplicate)
                duplicates.append(duplicate);temporary_meshes.append(mesh)
                points.extend(duplicate.matrix_world @ vertex.co for vertex in mesh.vertices)
                mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles)
            if not duplicates: raise RuntimeError(f'메시가 없는 모델: {root.name}')
            dimensions=[round(max(p[i] for p in points)-min(p[i] for p in points),4) for i in range(3)]
            bpy.ops.object.select_all(action='DESELECT')
            for obj in duplicates: obj.select_set(True)
            bpy.context.view_layer.objects.active=duplicates[0]
            bpy.ops.object.join()
            bpy.context.view_layer.objects.active.name=root.name+'-runtime'
            filepath=export/(root.name+'.glb')
            bpy.ops.export_scene.gltf(filepath=str(filepath),export_format='GLB',use_selection=True,
                export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
            manifest['assets'].append({'id':root.name,'file':filepath.name,'bytes':filepath.stat().st_size,
                'sourceMeshCount':len(originals),'runtimeMeshCount':1,'triangles':triangles,
                'blenderDimensionsXYZ':dimensions})
        finally:
            for obj in list(temporary.objects): bpy.data.objects.remove(obj,do_unlink=True)
            bpy.data.collections.remove(temporary)
            for mesh in temporary_meshes:
                if mesh.users==0: bpy.data.meshes.remove(mesh)
            root.location=original_location
    text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
    (export/'manifest.json').write_text(text,encoding='utf-8')
    (source/'manifest.json').write_text(text,encoding='utf-8')
    return manifest

if __name__=='__main__':
    project_root=Path(__file__).resolve().parents[1]
    expected=(project_root/'asset-sources/blender/maeum-garden.blend').resolve()
    if Path(bpy.data.filepath).resolve()!=expected:
        raise RuntimeError('저장한 maeum-garden.blend를 열고 실행해주세요.')
    assets=[bpy.data.objects.get(name) for name in ASSET_IDS]
    if any(root is None for root in assets): raise RuntimeError('모델 루트 이름 8개를 유지해주세요.')
    print('MAEUM_EXPORT_COMPLETE '+json.dumps(export_assets(assets,project_root),ensure_ascii=False))

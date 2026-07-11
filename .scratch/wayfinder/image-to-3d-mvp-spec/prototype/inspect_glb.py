import trimesh

path = r"C:\Users\asus\Documents\Side-Projects\maker\.scratch\wayfinder\image-to-3d-mvp-spec\prototype\output-chair.glb"
scene = trimesh.load(path)

if isinstance(scene, trimesh.Scene):
    geoms = list(scene.geometry.values())
else:
    geoms = [scene]

total_verts = sum(len(g.vertices) for g in geoms)
total_faces = sum(len(g.faces) for g in geoms)

print(f"Geometries: {len(geoms)}")
print(f"Total vertices: {total_verts}")
print(f"Total faces: {total_faces}")

for i, g in enumerate(geoms):
    print(f"\n-- geometry {i} --")
    print("vertices:", len(g.vertices))
    print("faces:", len(g.faces))
    print("bounding box (size):", g.bounding_box.extents)
    print("watertight:", g.is_watertight)
    has_uv = hasattr(g.visual, "uv") and g.visual.uv is not None
    print("has UV coords:", has_uv)
    mat = getattr(g.visual, "material", None)
    if mat is not None:
        print("material:", type(mat).__name__)
        base_color_tex = getattr(mat, "baseColorTexture", None)
        print("has base color texture:", base_color_tex is not None)

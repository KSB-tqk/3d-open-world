"""Rig the existing Cat - Tabby Kitten GLTF and export a self-contained GLB.

Run from the repository root:
    blender --background --python tools/cat-animation/rig_cat.py

The script never edits the source GLTF, scene.bin, or texture. Anatomical
landmarks are estimated from the imported mesh bounds and vertex distribution;
review the generated rig and weights in Blender before using it in game.
"""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def find_project_root():
    """Find the repo even when Blender's Text Editor sets __file__ to /name.py."""
    possible_scripts = [Path(__file__)]
    for text in bpy.data.texts:
        if text.name == "rig_cat.py" and text.filepath:
            possible_scripts.append(Path(bpy.path.abspath(text.filepath)))
    possible_scripts.append(Path.cwd() / "tools/cat-animation/rig_cat.py")

    for script_path in possible_scripts:
        try:
            resolved = script_path.expanduser().resolve()
        except (OSError, RuntimeError):
            continue
        for parent in resolved.parents:
            if (parent / "public/models/animals/cat_tabby/cat_tabby.gltf").is_file():
                return parent

    # Useful when Blender is launched from the project directory.
    for start in (Path.cwd(), *Path.cwd().parents):
        if (start / "public/models/animals/cat_tabby/cat_tabby.gltf").is_file():
            return start

    raise RuntimeError(
        "Could not locate the anime-grassland project. In Blender's Text Editor, "
        "open tools/cat-animation/rig_cat.py from the project folder, then run it again."
    )


ROOT = find_project_root()
SOURCE_DIR = ROOT / "public/models/animals/cat_tabby"
SOURCE_GLTF = SOURCE_DIR / "cat_tabby.gltf"
OUTPUT_GLB = ROOT / "public/models/animals/cat_tabby_animated.glb"

# Leave these as None to infer them from the actual mesh. If Blender inspection
# shows the inferred long axis/head end is reversed, set LONG_AXIS to "X"/"Y"
# and HEAD_END_SIGN to 1 or -1, then rerun the script.
LONG_AXIS = None
HEAD_END_SIGN = None
FPS = 24
EXPECTED_VERTEX_COUNT = 24240
ANIMATION_NAMES = ("Idle_Cute", "Happy", "Pet_Reaction", "Hop")
# Blender's import/export conversion already accounts for the source GLTF's
# -90 degree X node chain. The rig's exported rest joints show that the
# remaining correction is the inverse (+90 degrees): it puts the head joint
# above the paw joints in GLTF's Y-up space.
Y_UP_ASSET_ROOT_ROTATION = (math.sqrt(0.5), 0.0, 0.0, math.sqrt(0.5))


def log(message):
    print(f"[CAT RIG] {message}", flush=True)


def check_source_files():
    required = [
        SOURCE_GLTF,
        SOURCE_DIR / "scene.bin",
        SOURCE_DIR / "textures/modddif_material_0_baseColor.jpeg",
    ]
    missing = [path for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing cat source files:\n" + "\n".join(map(str, missing)))

    data = json.loads(SOURCE_GLTF.read_text())
    mesh_defs = data.get("meshes", [])
    primitives = [primitive for mesh in mesh_defs for primitive in mesh.get("primitives", [])]
    position_ids = [primitive.get("attributes", {}).get("POSITION") for primitive in primitives]
    if len(mesh_defs) != 1 or len(primitives) != 1 or position_ids[0] is None:
        raise RuntimeError("Expected one static cat mesh with a POSITION accessor.")
    vertex_count = data["accessors"][position_ids[0]]["count"]
    uv_present = "TEXCOORD_0" in primitives[0].get("attributes", {})
    if data.get("skins") or data.get("animations"):
        raise RuntimeError("The source is no longer static; inspect it before using this rig script.")
    log(f"Source mesh: {mesh_defs[0].get('name', '<unnamed>')}; vertices: {vertex_count}; UV0: {uv_present}")
    log(f"Source skins: {len(data.get('skins', []))}; source animations: {len(data.get('animations', []))}")
    if vertex_count != EXPECTED_VERTEX_COUNT:
        log(f"NOTE: expected {EXPECTED_VERTEX_COUNT} vertices from inspection, found {vertex_count}.")
    if not uv_present:
        raise RuntimeError("Cat mesh has no UV map; cannot preserve its textured material reliably.")
    return data


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions, bpy.data.materials):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def world_bounds(mesh):
    points = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
    low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    return low, high


def bake_mesh_to_armature_space(mesh):
    # Bake imported GLTF parent transforms into this working copy so the mesh,
    # armature, bounds, and vertex weights all use the same measured space.
    transform = mesh.matrix_world.copy()
    mesh.parent = None
    mesh.matrix_world = transform
    mesh.data.transform(transform)
    mesh.location = (0.0, 0.0, 0.0)
    mesh.rotation_euler = (0.0, 0.0, 0.0)
    mesh.scale = (1.0, 1.0, 1.0)
    mesh.matrix_parent_inverse.identity()
    bpy.context.view_layer.update()


def infer_axes(mesh, low, high):
    dimensions = high - low
    vertical = max(range(3), key=lambda axis: dimensions[axis])
    horizontal = [axis for axis in range(3) if axis != vertical]
    if LONG_AXIS is None:
        long_axis = max(horizontal, key=lambda axis: dimensions[axis])
    else:
        long_axis = {"X": 0, "Y": 1}.get(LONG_AXIS.upper())
        if long_axis not in horizontal:
            raise ValueError(f"LONG_AXIS={LONG_AXIS!r} is not a horizontal mesh axis in this import.")
    lateral_axis = next(axis for axis in horizontal if axis != long_axis)

    if HEAD_END_SIGN in (-1, 1):
        head_sign = HEAD_END_SIGN
        evidence = "configured"
    else:
        # The kitten's head is the denser elevated end of its horizontal long
        # axis. This is only an estimate; inspect the result in Blender.
        high_cut = low[vertical] + dimensions[vertical] * 0.62
        mid_lateral = (low[lateral_axis] + high[lateral_axis]) * 0.5
        side_limit = dimensions[lateral_axis] * 0.32
        end_cut = dimensions[long_axis] * 0.27
        low_end = high_end = 0
        for vertex in mesh.data.vertices:
            point = vertex.co
            if point[vertical] < high_cut or abs(point[lateral_axis] - mid_lateral) > side_limit:
                continue
            if point[long_axis] <= low[long_axis] + end_cut:
                low_end += 1
            if point[long_axis] >= high[long_axis] - end_cut:
                high_end += 1
        head_sign = 1 if high_end >= low_end else -1
        evidence = f"inferred from elevated end vertex counts (low={low_end}, high={high_end})"

    log("Imported mesh bounds (Blender X/Y/Z): " + " x ".join(f"{dimensions[i]:.4f} m" for i in range(3)))
    log(f"Vertical axis: {'XYZ'[vertical]}; longitudinal axis: {'XYZ'[long_axis]}; head end sign: {head_sign} ({evidence})")
    return vertical, long_axis, lateral_axis, head_sign


def make_landmark(low, high, vertical, long_axis, lateral_axis, head_sign, forward, side=0.0, height=0.5):
    point = Vector(((low.x + high.x) * 0.5, (low.y + high.y) * 0.5, (low.z + high.z) * 0.5))
    length = high[long_axis] - low[long_axis]
    width = high[lateral_axis] - low[lateral_axis]
    tail_to_head = forward if head_sign > 0 else 1.0 - forward
    point[long_axis] = low[long_axis] + tail_to_head * length
    point[lateral_axis] = (low[lateral_axis] + high[lateral_axis]) * 0.5 + side * width
    point[vertical] = low[vertical] + height * (high[vertical] - low[vertical])
    return point


def build_bone_specs(low, high, axes):
    vertical, long_axis, lateral_axis, head_sign = axes
    p = lambda f, s=0.0, h=0.5: make_landmark(low, high, vertical, long_axis, lateral_axis, head_sign, f, s, h)
    floor = low[vertical]
    height = high[vertical] - floor
    specs = []

    def add(name, head, tail, parent, deform=True):
        specs.append({"name": name, "head": head, "tail": tail, "parent": parent, "deform": deform})

    root_head = p(0.50, 0, 0.015)
    root_tail = root_head.copy(); root_tail[vertical] += max(height * 0.12, 0.04)
    add("Cat_Root", root_head, root_tail, None, False)
    add("Pelvis", p(0.39, 0, .51), p(0.47, 0, .53), "Cat_Root")
    add("Spine_01", p(.43, 0, .53), p(.54, 0, .55), "Pelvis")
    add("Spine_02", p(.54, 0, .55), p(.65, 0, .56), "Spine_01")
    add("Chest", p(.65, 0, .56), p(.73, 0, .57), "Spine_02")
    add("Neck", p(.73, 0, .57), p(.82, 0, .62), "Chest")
    add("Head", p(.82, 0, .62), p(.96, 0, .68), "Neck")
    for side, suffix in ((-1, "L"), (1, "R")):
        add(f"Ear_{suffix}", p(.91, side * .10, .78), p(.92, side * .16, .98), "Head")

    for side, suffix in ((-1, "L"), (1, "R")):
        add(f"FrontLeg_{suffix}", p(.67, side * .20, .53), p(.68, side * .20, .29), "Chest")
        add(f"FrontLowerLeg_{suffix}", p(.68, side * .20, .29), p(.68, side * .20, .09), f"FrontLeg_{suffix}")
        add(f"FrontPaw_{suffix}", p(.68, side * .20, .09), p(.71, side * .20, .035), f"FrontLowerLeg_{suffix}")
        add(f"BackLeg_{suffix}", p(.37, side * .19, .51), p(.34, side * .19, .28), "Pelvis")
        add(f"BackLowerLeg_{suffix}", p(.34, side * .19, .28), p(.34, side * .19, .09), f"BackLeg_{suffix}")
        add(f"BackPaw_{suffix}", p(.34, side * .19, .09), p(.31, side * .19, .035), f"BackLowerLeg_{suffix}")

    tail_points = [p(.31, 0, .52), p(.23, 0, .55), p(.15, 0, .61), p(.075, 0, .68), p(.015, 0, .72)]
    for index in range(4):
        add(f"Tail_{index + 1:02d}", tail_points[index], tail_points[index + 1], "Pelvis" if index == 0 else f"Tail_{index:02d}")
    return specs


def create_armature(specs):
    data = bpy.data.armatures.new("Cat_Tabby_Rig")
    armature = bpy.data.objects.new("Cat_Tabby_Armature", data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bones = {}
    for spec in specs:
        bone = data.edit_bones.new(spec["name"])
        bone.head = spec["head"]
        tail = spec["tail"]
        if (tail - bone.head).length < 0.025:
            tail = bone.head + Vector((0.0, 0.0, 0.03))
        bone.tail = tail
        bone.use_deform = spec["deform"]
        bones[spec["name"]] = bone
    for spec in specs:
        if spec["parent"]:
            bones[spec["name"]].parent = bones[spec["parent"]]
            bones[spec["name"]].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.show_in_front = True
    return armature


def normalize_vertex_groups(mesh):
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    try:
        bpy.ops.object.vertex_group_limit_total(limit=4)
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    except RuntimeError as error:
        log(f"Weight cleanup operator unavailable; retaining Blender weights: {error}")


def manual_weights(mesh, armature, specs):
    # Deterministic fallback if Blender's heat method cannot solve this static
    # mesh. Smooth nearest-segment weights are limited to four bones per vertex.
    for group in list(mesh.vertex_groups):
        mesh.vertex_groups.remove(group)
    deform_specs = [spec for spec in specs if spec["deform"]]
    groups = {spec["name"]: mesh.vertex_groups.new(name=spec["name"]) for spec in deform_specs}
    segments = [(spec, Vector(spec["head"]), Vector(spec["tail"])) for spec in deform_specs]
    dimensions = mesh.dimensions
    sigma = max(min(dimensions.x, dimensions.y, dimensions.z) * 0.11, 0.025)

    def segment_distance(point, start, end):
        vector = end - start
        if vector.length_squared == 0:
            return (point - start).length
        t = max(0.0, min(1.0, (point - start).dot(vector) / vector.length_squared))
        return (point - (start + t * vector)).length

    for vertex in mesh.data.vertices:
        scored = [(math.exp(-0.5 * (segment_distance(vertex.co, start, end) / sigma) ** 2), spec["name"])
                  for spec, start, end in segments]
        scored.sort(reverse=True)
        chosen = scored[:4]
        total = sum(weight for weight, _ in chosen)
        if total < 1e-10:
            chosen = [(1.0, scored[0][1])]
            total = 1.0
        for weight, name in chosen:
            if weight / total > 0.002:
                groups[name].add([vertex.index], weight / total, "REPLACE")
    armature_modifier = next((modifier for modifier in mesh.modifiers if modifier.type == "ARMATURE"), None)
    if armature_modifier is None:
        armature_modifier = mesh.modifiers.new("Cat_Armature", "ARMATURE")
    armature_modifier.object = armature
    mesh.parent = armature
    log("Applied deterministic nearest-bone fallback weights (max 4 influences/vertex).")


def skin_mesh(mesh, armature, specs):
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        if not any(modifier.type == "ARMATURE" and modifier.object == armature for modifier in mesh.modifiers):
            raise RuntimeError("Automatic weighting did not create an armature modifier.")
        if not mesh.vertex_groups:
            raise RuntimeError("Automatic weighting produced no vertex groups.")
        normalize_vertex_groups(mesh)
        group_by_name = {group.name: group.index for group in mesh.vertex_groups}
        required = ("Head", "Tail_02", "FrontLeg_L", "BackLeg_R")
        unweighted = []
        for name in required:
            group_index = group_by_name.get(name)
            if group_index is None or not any(
                any(item.group == group_index and item.weight > 1e-5 for item in vertex.groups)
                for vertex in mesh.data.vertices
            ):
                unweighted.append(name)
        if unweighted:
            raise RuntimeError("Automatic weights left required bones without vertices: " + ", ".join(unweighted))
        log("Blender automatic weights created and pruned to at most four influences/vertex.")
    except Exception as error:
        log(f"Automatic weights failed ({error}); using deterministic fallback.")
        mesh.parent = None
        for modifier in list(mesh.modifiers):
            if modifier.type == "ARMATURE":
                mesh.modifiers.remove(modifier)
        manual_weights(mesh, armature, specs)


def validate_deformation(mesh, armature, bone_names):
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    baseline_obj = mesh.evaluated_get(depsgraph)
    baseline_mesh = baseline_obj.to_mesh()
    sample_ids = list(range(len(baseline_mesh.vertices)))
    baseline = [baseline_mesh.vertices[index].co.copy() for index in sample_ids]
    baseline_obj.to_mesh_clear()
    tests = ("Head", "Tail_02", "FrontLeg_L", "BackLeg_R")
    for name in tests:
        if name not in bone_names:
            raise RuntimeError(f"Validation bone {name} is missing.")
        pose_bone = armature.pose.bones[name]
        pose_bone.rotation_mode = "XYZ"
        # A single Euler axis can line up with a bone's local orientation and
        # produce little or no visible movement. Probe a compound rotation.
        pose_bone.rotation_euler = (0.12, 0.17, 0.09)
        bpy.context.view_layer.update()
        evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        evaluated_mesh = evaluated.to_mesh()
        points = [evaluated_mesh.vertices[index].co for index in sample_ids]
        valid = all(math.isfinite(value) for point in points for value in point)
        moved = any((points[i] - baseline[i]).length > 1e-5 for i in range(len(points)))
        evaluated.to_mesh_clear()
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        bpy.context.view_layer.update()
        log(f"Deformation probe {name}: finite={valid}, vertices_moved={moved}")
        if not valid:
            raise RuntimeError(f"Non-finite vertex deformation detected at {name}.")
        if not moved:
            raise RuntimeError(f"Bone {name} did not deform any vertices; inspect its weights before export.")


def key_pose(armature, frame, rotations=None, root_height=0.0):
    rotations = rotations or {}
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = rotations.get(pose_bone.name, (0.0, 0.0, 0.0))
        pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=pose_bone.name)
        if pose_bone.name == "Cat_Root":
            pose_bone.location = (0.0, root_height, 0.0)
            pose_bone.keyframe_insert(data_path="location", frame=frame, group=pose_bone.name)


def create_action(armature, name, duration, poses, loop=False):
    frame_end = int(round(duration * FPS)) + 1
    action = bpy.data.actions.new(name=name)
    armature.animation_data_create()
    action_slot = None
    if hasattr(action, "fcurves"):
        # Blender versions using the legacy Action API.
        armature.animation_data.action = action
    else:
        # Blender 4.4+ uses layered Actions with explicit slots and keyframe strips.
        layer = action.layers.new(name=f"{name}_Layer")
        layer.strips.new(type="KEYFRAME")
        action_slot = action.slots.new(id_type="OBJECT", name=armature.name)
        armature.animation_data.action = action
        armature.animation_data.action_slot = action_slot
    for frame, rotations, root_height in poses:
        key_pose(armature, frame, rotations, root_height)

    if hasattr(action, "fcurves"):
        curves = action.fcurves
    else:
        curves = []
        for layer in action.layers:
            for action_strip in layer.strips:
                channelbag = action_strip.channelbag(action_slot)
                if channelbag:
                    curves.extend(channelbag.fcurves)
    for curve in curves:
        for key in curve.keyframe_points:
            key.interpolation = "BEZIER"
        if loop:
            curve.modifiers.new(type="CYCLES")
    action.use_fake_user = True
    log(f"Action {name}: {duration:.2f}s, loop={loop}, frames 1-{frame_end}")
    return action, frame_end


def make_animations(armature, height):
    scale = max(height, 0.1)
    def r(**values): return values
    created = []
    created.append(create_action(armature, "Idle_Cute", 5.0, [
        (1, r(), 0), (31, r(Spine_01=(.015, 0, 0), Tail_01=(0, 0, -.08), Tail_02=(0, 0, -.07), Head=(.015, 0, 0)), 0),
        (61, r(Spine_01=(.025, 0, 0), Head=(0, 0, .04), Tail_01=(0, 0, .08), Tail_02=(0, 0, .07), Ear_L=(.03, 0, 0)), 0),
        (91, r(Spine_01=(.012, 0, 0), Head=(-.012, 0, 0), Tail_01=(0, 0, -.06), Tail_02=(0, 0, -.05), Ear_R=(-.04, 0, 0)), 0),
        (121, r(), 0)], True))
    created.append(create_action(armature, "Happy", 2.0, [
        (1, r(), 0), (9, r(Head=(.04, 0, .10), Tail_01=(0, 0, .20), Tail_02=(0, 0, .24), Tail_03=(0, 0, .16)), .015 * scale),
        (17, r(Spine_01=(-.05, 0, 0), Chest=(-.04, 0, 0), Head=(-.04, 0, -.08), Tail_01=(0, 0, -.20), Tail_02=(0, 0, -.24), Tail_03=(0, 0, -.16)), 0),
        (25, r(Head=(.02, 0, .06), Tail_01=(0, 0, .16), Tail_02=(0, 0, .18), Tail_03=(0, 0, .12)), .01 * scale),
        (49, r(), 0)], False))
    created.append(create_action(armature, "Pet_Reaction", 2.5, [
        (1, r(), 0), (13, r(Neck=(.08, 0, 0), Head=(.16, 0, -.06), Tail_01=(0, 0, .12), Tail_02=(0, 0, .14)), 0),
        (31, r(Neck=(.13, 0, 0), Head=(.24, 0, -.10), Spine_01=(-.02, 0, 0), Tail_01=(0, 0, -.18), Tail_02=(0, 0, -.20), Tail_03=(0, 0, -.12)), 0),
        (45, r(Head=(.08, 0, .06), Tail_01=(0, 0, .20), Tail_02=(0, 0, .22), Tail_03=(0, 0, .13)), .008 * scale),
        (61, r(), 0)], False))
    created.append(create_action(armature, "Hop", 1.0, [
        (1, r(FrontLeg_L=(.06, 0, 0), FrontLeg_R=(.06, 0, 0), BackLeg_L=(.06, 0, 0), BackLeg_R=(.06, 0, 0), Spine_01=(.03, 0, 0)), 0),
        (7, r(FrontLeg_L=(-.08, 0, 0), FrontLeg_R=(-.08, 0, 0), BackLeg_L=(-.10, 0, 0), BackLeg_R=(-.10, 0, 0), Head=(.04, 0, 0)), .025 * scale),
        (13, r(FrontLeg_L=(.10, 0, 0), FrontLeg_R=(.10, 0, 0), BackLeg_L=(.08, 0, 0), BackLeg_R=(.08, 0, 0), Spine_01=(-.04, 0, 0), Tail_01=(0, 0, .12)), .07 * scale),
        (19, r(FrontLeg_L=(.03, 0, 0), FrontLeg_R=(.03, 0, 0), BackLeg_L=(.04, 0, 0), BackLeg_R=(.04, 0, 0), Head=(.02, 0, 0)), .02 * scale),
        (25, r(), 0)], False))
    armature.animation_data.action = None
    for action, end_frame in created:
        track = armature.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, 1, action)
        if hasattr(strip, "action_slot") and action.slots:
            strip.action_slot = action.slots[0]
        strip.action_frame_start = 1
        strip.action_frame_end = end_frame
        strip.blend_type = "REPLACE"
        strip.extrapolation = "NOTHING"
    return created


def read_glb_json(path):
    with path.open("rb") as stream:
        magic, version, total_length = struct.unpack("<4sII", stream.read(12))
        if magic != b"glTF" or version != 2:
            raise RuntimeError("Export is not a GLB 2.0 file.")
        json_length, chunk_type = struct.unpack("<I4s", stream.read(8))
        if chunk_type != b"JSON":
            raise RuntimeError("GLB has no leading JSON chunk.")
        document = json.loads(stream.read(json_length).decode("utf-8").rstrip(" \t\r\n\0"))
        if total_length != path.stat().st_size:
            raise RuntimeError("GLB header length does not match file size.")
        return document


def normalize_exported_animation_names(path):
    # Blender versions can prefix NLA track names with the armature name.
    # Normalize only a unique known suffix, then rewrite the GLB JSON chunk.
    blob = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<4sII", blob, 0)
    json_length, chunk_type = struct.unpack_from("<I4s", blob, 12)
    if magic != b"glTF" or version != 2 or chunk_type != b"JSON" or total_length != len(blob):
        raise RuntimeError("Cannot normalize animation names: malformed GLB header.")
    document = json.loads(blob[20:20 + json_length].decode("utf-8").rstrip(" \t\r\n\0"))
    found = []
    for animation in document.get("animations", []):
        exported_name = animation.get("name", "")
        matches = [name for name in ANIMATION_NAMES if exported_name == name or exported_name.endswith("|" + name)]
        if len(matches) != 1:
            raise RuntimeError(f"Could not safely map Blender animation name {exported_name!r} to an expected action.")
        animation["name"] = matches[0]
        found.append(matches[0])
    if len(found) != len(ANIMATION_NAMES) or set(found) != set(ANIMATION_NAMES):
        raise RuntimeError(f"Blender exported unexpected action set: {found}")
    json_chunk = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
    remaining_chunks = blob[20 + json_length:]
    result = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(json_chunk) + len(remaining_chunks))
    result += struct.pack("<I4s", len(json_chunk), b"JSON") + json_chunk + remaining_chunks
    path.write_bytes(result)


def add_y_up_asset_root(path):
    """Apply the measured inverse basis correction to the complete skinned asset."""
    blob = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<4sII", blob, 0)
    json_length, chunk_type = struct.unpack_from("<I4s", blob, 12)
    if magic != b"glTF" or version != 2 or chunk_type != b"JSON" or total_length != len(blob):
        raise RuntimeError("Cannot add the Y-up root: malformed GLB header.")
    document = json.loads(blob[20:20 + json_length].decode("utf-8").rstrip(" \t\r\n\0"))
    scene_index = document.get("scene", 0)
    scene = document.get("scenes", [])[scene_index]
    roots = scene.get("nodes", [])
    if len(roots) == 1 and document.get("nodes", [])[roots[0]].get("name") == "Cat_AssetRoot_YUp":
        log("Y-up asset root is already present.")
        return
    if len(roots) != 1:
        raise RuntimeError(f"Expected one exported armature root before Y-up conversion; found {roots}.")
    root_index = len(document["nodes"])
    document["nodes"].append({
        "name": "Cat_AssetRoot_YUp",
        "rotation": list(Y_UP_ASSET_ROOT_ROTATION),
        "children": roots,
    })
    scene["nodes"] = [root_index]
    json_chunk = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
    remaining_chunks = blob[20 + json_length:]
    result = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(json_chunk) + len(remaining_chunks))
    result += struct.pack("<I4s", len(json_chunk), b"JSON") + json_chunk + remaining_chunks
    path.write_bytes(result)
    log("Applied the upright Y-up correction to the shared mesh/armature root.")


def validate_export(path):
    document = read_glb_json(path)
    scene = document.get("scenes", [])[document.get("scene", 0)]
    scene_roots = scene.get("nodes", [])
    if len(scene_roots) != 1 or document["nodes"][scene_roots[0]].get("name") != "Cat_AssetRoot_YUp":
        raise RuntimeError("Export is missing the canonical Y-up asset root.")
    root_rotation = document["nodes"][scene_roots[0]].get("rotation", [])
    if len(root_rotation) != 4 or any(abs(a - b) > 1e-5 for a, b in zip(root_rotation, Y_UP_ASSET_ROOT_ROTATION)):
        raise RuntimeError(f"Export has an unexpected asset-root orientation: {root_rotation}.")
    mesh_count = len(document.get("meshes", []))
    skin_count = len(document.get("skins", []))
    bone_count = len(document.get("skins", [{}])[0].get("joints", [])) if skin_count else 0
    animations = document.get("animations", [])
    names = [animation.get("name") for animation in animations]
    if mesh_count < 1 or skin_count < 1 or bone_count < 1:
        raise RuntimeError(f"Export is missing mesh/skin/bones: {mesh_count}/{skin_count}/{bone_count}.")
    if set(names) != set(ANIMATION_NAMES) or len(names) != len(ANIMATION_NAMES):
        raise RuntimeError(f"Expected animation names {ANIMATION_NAMES}; found {names}.")
    if not document.get("materials") or not document.get("images"):
        raise RuntimeError("Export is missing the cat material or embedded texture.")
    if any("bufferView" not in image or image.get("uri") for image in document.get("images", [])):
        raise RuntimeError("Expected all exported images to be embedded in the GLB binary chunk.")
    accessors = document.get("accessors", [])
    for animation in animations:
        end = max((max(accessors[sampler["input"]].get("max", [0.0]))
                   for sampler in animation.get("samplers", [])
                   if sampler.get("input", -1) < len(accessors)), default=0.0)
        log(f"Verified animation: {animation.get('name')} ({end:.3f}s)")
    log(f"Verified GLB: {path} ({path.stat().st_size:,} bytes), meshes={mesh_count}, skins={skin_count}, bones={bone_count}, animations={len(animations)}")


def main():
    source = check_source_files()
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_GLTF))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one imported cat mesh, found {len(meshes)}.")
    mesh = meshes[0]
    if len(mesh.data.vertices) != source["accessors"][source["meshes"][0]["primitives"][0]["attributes"]["POSITION"]]["count"]:
        raise RuntimeError("Blender import vertex count differs from source GLTF metadata.")
    if not mesh.data.uv_layers:
        raise RuntimeError("Imported cat mesh has no UV layer.")
    if not mesh.data.materials or not any(material and material.use_nodes for material in mesh.data.materials):
        raise RuntimeError("Imported cat mesh has no node material; inspect the source texture/material paths.")

    bake_mesh_to_armature_space(mesh)
    low, high = world_bounds(mesh)
    axes = infer_axes(mesh, low, high)
    vertical = axes[0]
    specs = build_bone_specs(low, high, axes)
    armature = create_armature(specs)
    skin_mesh(mesh, armature, specs)
    bone_names = {bone.name for bone in armature.data.bones}
    validate_deformation(mesh, armature, bone_names)
    make_animations(armature, high[vertical] - low[vertical])

    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = 121
    scene.unit_settings.system = "METRIC"
    OUTPUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_nla_strips=True,
        export_force_sampling=True,
    )
    normalize_exported_animation_names(OUTPUT_GLB)
    add_y_up_asset_root(OUTPUT_GLB)
    validate_export(OUTPUT_GLB)
    log("Export complete. Inspect the model, deformation, and all four actions visually before gameplay use.")


if __name__ == "__main__":
    main()

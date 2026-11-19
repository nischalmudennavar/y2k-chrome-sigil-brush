import bpy
from .materials import get_or_create_chrome_material

NODE_GROUP_NAME = "Y2K_Tribal_Geometry_Nodes"


def create_or_get_tribal_node_group():
    """Create or retrieve the procedural Y2K Tribal Geometry Nodes modifier tree."""
    tree = bpy.data.node_groups.get(NODE_GROUP_NAME)
    if tree:
        return tree

    tree = bpy.data.node_groups.new(name=NODE_GROUP_NAME, type='GeometryNodeTree')

    # Interface sockets setup (Blender 4.0+ vs 3.x compatibility)
    is_b4 = hasattr(tree, "interface")
    
    if is_b4:
        # Blender 4.0+ interface API
        tree.interface.new_socket(name="Geometry", in_out='INPUT', socket_type='NodeSocketGeometry')
        sock_width = tree.interface.new_socket(name="Ribbon Width", in_out='INPUT', socket_type='NodeSocketFloat')
        sock_width.default_value = 0.35
        sock_width.min_value = 0.01
        sock_width.max_value = 5.0

        sock_tin = tree.interface.new_socket(name="Taper Start", in_out='INPUT', socket_type='NodeSocketFloat')
        sock_tin.default_value = 0.25
        sock_tin.min_value = 0.01
        sock_tin.max_value = 0.99

        sock_tout = tree.interface.new_socket(name="Taper End", in_out='INPUT', socket_type='NodeSocketFloat')
        sock_tout.default_value = 0.25
        sock_tout.min_value = 0.01
        sock_tout.max_value = 0.99

        sock_depth = tree.interface.new_socket(name="Spine Depth", in_out='INPUT', socket_type='NodeSocketFloat')
        sock_depth.default_value = 0.18
        sock_depth.min_value = 0.0
        sock_depth.max_value = 3.0

        tree.interface.new_socket(name="Geometry", in_out='OUTPUT', socket_type='NodeSocketGeometry')
    else:
        # Legacy Blender 3.x
        tree.inputs.new('NodeSocketGeometry', "Geometry")
        tree.inputs.new('NodeSocketFloat', "Ribbon Width").default_value = 0.35
        tree.inputs.new('NodeSocketFloat', "Taper Start").default_value = 0.25
        tree.inputs.new('NodeSocketFloat', "Taper End").default_value = 0.25
        tree.inputs.new('NodeSocketFloat', "Spine Depth").default_value = 0.18
        tree.outputs.new('NodeSocketGeometry', "Geometry")

    nodes = tree.nodes
    links = tree.links
    nodes.clear()

    # 1. Input Node
    in_node = nodes.new(type="NodeGroupInput")
    in_node.location = (-600, 0)

    # 2. Output Node
    out_node = nodes.new(type="NodeGroupOutput")
    out_node.location = (800, 0)

    # 3. Spline Parameter (for arc-length factor 0 -> 1)
    spline_param = nodes.new(type="GeometryNodeSplineParameter")
    spline_param.location = (-400, -200)

    # 4. Float Curve or Math nodes for needle-like taper envelope
    # We use Math nodes: t / taper_in and (1 - t) / taper_out
    # Start taper ramp
    div_in = nodes.new(type="ShaderNodeMath")
    div_in.operation = 'DIVIDE'
    div_in.location = (-150, -100)
    links.new(spline_param.outputs["Factor"], div_in.inputs[0])
    links.new(in_node.outputs["Taper Start"], div_in.inputs[1])

    # End taper ramp: 1.0 - factor
    sub_t = nodes.new(type="ShaderNodeMath")
    sub_t.operation = 'SUBTRACT'
    sub_t.inputs[0].default_value = 1.0
    sub_t.location = (-350, -350)
    links.new(spline_param.outputs["Factor"], sub_t.inputs[1])

    div_out = nodes.new(type="ShaderNodeMath")
    div_out.operation = 'DIVIDE'
    div_out.location = (-150, -350)
    links.new(sub_t.outputs["Value"], div_out.inputs[0])
    links.new(in_node.outputs["Taper End"], div_out.inputs[1])

    # Min of both ramps
    min_env = nodes.new(type="ShaderNodeMath")
    min_env.operation = 'MINIMUM'
    min_env.location = (50, -200)
    links.new(div_in.outputs["Value"], min_env.inputs[0])
    links.new(div_out.outputs["Value"], min_env.inputs[1])

    # Clamp 0 to 1
    clamp_env = nodes.new(type="ShaderNodeClamp")
    clamp_env.location = (200, -200)
    links.new(min_env.outputs["Value"], clamp_env.inputs["Value"])

    # Scale by Ribbon Width
    scale_radius = nodes.new(type="ShaderNodeMath")
    scale_radius.operation = 'MULTIPLY'
    scale_radius.location = (350, -150)
    links.new(clamp_env.outputs["Result"], scale_radius.inputs[0])
    links.new(in_node.outputs["Ribbon Width"], scale_radius.inputs[1])

    # 5. Set Curve Radius
    set_radius = nodes.new(type="GeometryNodeSetCurveRadius")
    set_radius.location = (50, 50)
    links.new(in_node.outputs["Geometry"], set_radius.inputs["Curve"])
    links.new(scale_radius.outputs["Value"], set_radius.inputs["Radius"])

    # 6. Curve to Mesh with Profile Curve (Quadrilateral / Diamond profile)
    curve_to_mesh = nodes.new(type="GeometryNodeCurveToMesh")
    curve_to_mesh.location = (300, 50)
    curve_to_mesh.inputs["Fill Caps"].default_value = True

    # Profile: Curve Circle or Quadrilateral
    profile_circle = nodes.new(type="GeometryNodeCurvePrimitiveCircle")
    profile_circle.inputs["Resolution"].default_value = 4  # 4-sided diamond / chisel profile
    profile_circle.inputs["Radius"].default_value = 0.5
    profile_circle.location = (100, 300)

    links.new(set_radius.outputs["Curve"], curve_to_mesh.inputs["Curve"])
    links.new(profile_circle.outputs["Curve"], curve_to_mesh.inputs["Profile Curve"])

    # 7. Set Shade Smooth
    shade_smooth = nodes.new(type="GeometryNodeSetShadeSmooth")
    shade_smooth.location = (500, 50)
    links.new(curve_to_mesh.outputs["Mesh"], shade_smooth.inputs["Geometry"])

    # 8. Set Material
    chrome_mat = get_or_create_chrome_material()
    set_mat = nodes.new(type="GeometryNodeSetMaterial")
    set_mat.location = (650, 50)
    set_mat.inputs["Material"].default_value = chrome_mat
    links.new(shade_smooth.outputs["Geometry"], set_mat.inputs["Geometry"])

    # Final Output link
    links.new(set_mat.outputs["Geometry"], out_node.inputs["Geometry"])

    return tree


def set_gn_modifier_input(mod, input_name, value):
    """Set input parameter on a Geometry Nodes modifier across Blender 3.x, 4.x, and 5.x."""
    if not mod or not mod.node_group:
        return
    ng = mod.node_group

    # 1. Blender 5.0+ GeometryNodesModifierInterface
    if hasattr(mod, "properties") and hasattr(mod.properties, "inputs"):
        if hasattr(ng, "interface"):
            for item in ng.interface.items_tree:
                if getattr(item, "item_type", None) == 'SOCKET' and getattr(item, "in_out", None) == 'INPUT':
                    if item.name == input_name:
                        sock_id = item.identifier
                        if hasattr(mod.properties.inputs, sock_id):
                            sock_prop = getattr(mod.properties.inputs, sock_id)
                            if hasattr(sock_prop, "value"):
                                sock_prop.value = value
                                return

    # 2. Blender 4.0 - 4.4 / socket identifier indexing
    if hasattr(ng, "interface"):
        for item in ng.interface.items_tree:
            if getattr(item, "item_type", None) == 'SOCKET' and getattr(item, "in_out", None) == 'INPUT':
                if item.name == input_name:
                    try:
                        mod[item.identifier] = value
                        return
                    except Exception:
                        pass

    # 3. Direct name indexing fallback (Blender 3.x)
    try:
        mod[input_name] = value
    except Exception:
        pass


def apply_tribal_modifier(curve_obj, props):
    """Attach and configure the Geometry Nodes modifier on a curve object."""
    tree = create_or_get_tribal_node_group()
    mod = curve_obj.modifiers.get("Y2K_Tribal_Style")
    if not mod:
        mod = curve_obj.modifiers.new(name="Y2K_Tribal_Style", type='NODES')
    mod.node_group = tree

    # Set parameters safely across Blender versions
    set_gn_modifier_input(mod, "Ribbon Width", props.width)
    set_gn_modifier_input(mod, "Taper Start", props.taper_in)
    set_gn_modifier_input(mod, "Taper End", props.taper_out)
    set_gn_modifier_input(mod, "Spine Depth", props.depth)

    curve_obj.update_tag()
    return mod

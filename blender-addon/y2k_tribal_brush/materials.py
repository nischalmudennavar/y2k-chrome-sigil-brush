import bpy


MATERIAL_NAME = "Y2K_Liquid_Chrome"


def get_or_create_chrome_material():
    """Create or retrieve the procedural Y2K Liquid Chrome material."""
    mat = bpy.data.materials.get(MATERIAL_NAME)
    if mat and mat.use_nodes:
        return mat

    mat = bpy.data.materials.new(name=MATERIAL_NAME)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    # Output node
    out_node = nodes.new(type="ShaderNodeOutputMaterial")
    out_node.location = (400, 0)

    # Principled BSDF
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (100, 0)

    # Base Color: Clean silvery chrome
    bsdf.inputs["Base Color"].default_value = (0.94, 0.96, 0.99, 1.0)

    # Metallic: 1.0 (Full chrome mirror)
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = 1.0

    # Roughness: 0.05 (High gloss)
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.05

    # IOR
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1.5

    # Coat / Anisotropy if available
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.25
        if "Coat Roughness" in bsdf.inputs:
            bsdf.inputs["Coat Roughness"].default_value = 0.02
    elif "Clearcoat" in bsdf.inputs:
        bsdf.inputs["Clearcoat"].default_value = 0.25

    # Link BSDF to Output
    links.new(bsdf.outputs["BSDF"], out_node.inputs["Surface"])

    return mat

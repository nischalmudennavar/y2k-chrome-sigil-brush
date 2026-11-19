import bpy
from bpy.props import FloatProperty, EnumProperty, BoolProperty, PointerProperty
from bpy.types import PropertyGroup


def update_tribal_geometry(self, context):
    """Callback triggered whenever a tribal brush parameter changes."""
    obj = getattr(context, "active_object", None)
    if not obj:
        return
    # If the object has our geometry nodes modifier, update its inputs
    mod = obj.modifiers.get("Y2K_Tribal_Style")
    if mod and mod.node_group:
        from .geometry_nodes import set_gn_modifier_input
        set_gn_modifier_input(mod, "Ribbon Width", self.width)
        set_gn_modifier_input(mod, "Taper Start", self.taper_in)
        set_gn_modifier_input(mod, "Taper End", self.taper_out)
        set_gn_modifier_input(mod, "Spine Depth", self.depth)
        obj.update_tag()


class Y2KTribalProperties(PropertyGroup):
    width: FloatProperty(
        name="Ribbon Width",
        description="Overall width of the tribal stroke ribbon",
        default=0.35,
        min=0.005,
        max=5.0,
        update=update_tribal_geometry
    )

    taper_in: FloatProperty(
        name="Taper Start",
        description="Length of needle taper at stroke entry",
        default=0.25,
        min=0.01,
        max=0.99,
        update=update_tribal_geometry
    )

    taper_out: FloatProperty(
        name="Taper End",
        description="Length of needle taper at stroke exit",
        default=0.25,
        min=0.01,
        max=0.99,
        update=update_tribal_geometry
    )

    depth: FloatProperty(
        name="Spine Depth",
        description="Elevation / height of the chiseled knife-edge medial spine",
        default=0.18,
        min=0.0,
        max=3.0,
        update=update_tribal_geometry
    )

    chisel_power: FloatProperty(
        name="Chisel Sharpness",
        description="Facet sharpness of the knife-edge ridge vs rounded organic bevel",
        default=0.75,
        min=0.0,
        max=1.0,
        update=update_tribal_geometry
    )

    profile_style: EnumProperty(
        name="Profile Style",
        description="Cross-section shape of the tribal ribbon",
        items=[
            ('CHISEL_FLAT_BACK', "Chisel (Flat Back)", "Knife-edge ridge with flat bottom (for 3D printing & badges)"),
            ('CHISEL_DOUBLE', "Chisel (Double Sided)", "Diamond / dagger cross-section with ridges on both sides"),
            ('FLAT_EXTRUDED', "Flat Extruded (SVG/PNG)", "Uniform vertical slab extrusion with clean vertical walls"),
        ],
        default='CHISEL_FLAT_BACK',
        update=update_tribal_geometry
    )

    symmetry: EnumProperty(
        name="Symmetry",
        description="Symmetry mode to mirror or repeat across axes",
        items=[
            ('NONE', "None", "No symmetry applied"),
            ('MIRROR_X', "Mirror X", "Mirror across the global X axis"),
            ('MIRROR_Y', "Mirror Y", "Mirror across the global Y axis"),
            ('MIRROR_XY', "Mirror X + Y", "Four-way mirror across both X and Y axes"),
            ('RADIAL_4', "Radial 4x", "4-fold rotational symmetry around origin"),
            ('RADIAL_6', "Radial 6x", "6-fold rotational symmetry around origin"),
            ('RADIAL_8', "Radial 8x", "8-fold rotational symmetry around origin"),
        ],
        default='NONE',
        update=update_tribal_geometry
    )

    auto_chrome: BoolProperty(
        name="Auto Chrome",
        description="Automatically assign procedural Y2K Liquid Chrome material",
        default=True,
        update=update_tribal_geometry
    )


classes = (
    Y2KTribalProperties,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Object.tribal_props = PointerProperty(type=Y2KTribalProperties)


def unregister():
    del bpy.types.Object.tribal_props
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

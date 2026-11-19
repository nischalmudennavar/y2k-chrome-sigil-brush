import bpy
from bpy.types import Panel


class VIEW3D_PT_y2k_tribal_panel(Panel):
    """3D Viewport Sidebar Panel for Y2K Tribal Brush"""
    bl_label = "Y2K Tribal Brush"
    bl_idname = "VIEW3D_PT_y2k_tribal_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Tribal'

    def draw(self, context):
        layout = self.layout
        obj = context.active_object

        # Header box
        header_box = layout.box()
        col = header_box.column(align=True)
        col.label(text="Y2K Chrome Tribal", icon='CURVE_DATA')
        col.label(text="Vector Curve Styling & Chisel Spine", icon='MOD_CURVE')

        if obj and obj.type == 'MESH':
            box = layout.box()
            box.label(text=f"Selected Mesh: {obj.name}", icon='MESH_DATA')
            b_col = box.column(align=True)
            b_col.scale_y = 1.3
            b_col.operator("object.y2k_tribal_export_stl", text="Export Watertight STL", icon='EXPORT')
            box.label(text="Pure sigil mesh, no baseplate.", icon='CHECKMARK')
            box.separator()
            box.operator("object.y2k_tribal_add_preset", text="Add New Tribal Curve", icon='ADD')
            return

        if not obj or obj.type != 'CURVE':
            box = layout.box()
            box.label(text="Select or draw a Curve object.", icon='INFO')
            box.operator("object.y2k_tribal_add_preset", text="Add Sample Tribal Curve", icon='ADD')
            return

        props = obj.tribal_props
        has_modifier = "Y2K_Tribal_Style" in obj.modifiers

        # Main Actions
        row = layout.row(align=True)
        row.scale_y = 1.4
        if not has_modifier:
            row.operator("object.y2k_tribal_apply", text="Apply Tribal Style", icon='PLAY')
        else:
            row.operator("object.y2k_tribal_apply", text="Update Tribal Style", icon='FILE_REFRESH')
            row.operator("object.y2k_tribal_remove", text="", icon='X')

        # Ribbon Geometry Parameters
        geom_box = layout.box()
        geom_box.label(text="Ribbon & Taper", icon='ARROW_LEFTRIGHT')
        col = geom_box.column(align=True)
        col.prop(props, "width")
        col.prop(props, "taper_in")
        col.prop(props, "taper_out")

        # 3D Spine & Chisel Parameters
        spine_box = layout.box()
        spine_box.label(text="Chisel & Cross-Section", icon='MESH_CONE')
        col = spine_box.column(align=True)
        col.prop(props, "depth")
        col.prop(props, "chisel_power")
        col.prop(props, "profile_style")

        # Symmetry Section
        sym_box = layout.box()
        sym_box.label(text="Symmetry", icon='MOD_MIRROR')
        sym_box.prop(props, "symmetry", text="")

        # Material Section
        mat_box = layout.box()
        mat_box.label(text="Chrome Shader", icon='MATERIAL')
        mat_box.prop(props, "auto_chrome", text="Liquid Chrome Material")

        # Bake & Export Section
        bake_box = layout.box()
        bake_box.label(text="Bake & 3D Print", icon='EXPORT')
        b_col = bake_box.column(align=True)
        b_col.scale_y = 1.3
        b_col.operator("object.y2k_tribal_bake", text="Bake to Watertight Mesh", icon='MESH_DATA')
        b_col.operator("object.y2k_tribal_export_stl", text="Direct Export STL (No Base)", icon='FILE_3D')
        bake_box.label(text="Watertight manifold STL ready.", icon='CHECKMARK')


classes = (
    VIEW3D_PT_y2k_tribal_panel,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

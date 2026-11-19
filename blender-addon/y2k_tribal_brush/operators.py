import bpy
from bpy.types import Operator
from bpy.props import StringProperty
from bpy_extras.io_utils import ExportHelper
from .mesh_generator import generate_tribal_bmesh
from .geometry_nodes import apply_tribal_modifier
from .materials import get_or_create_chrome_material


class OBJECT_OT_y2k_tribal_apply(Operator):
    """Impose Y2K Tribal Brush style onto selected curve"""
    bl_idname = "object.y2k_tribal_apply"
    bl_label = "Apply Tribal Style"
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, context):
        return context.active_object and context.active_object.type == 'CURVE'

    def execute(self, context):
        obj = context.active_object
        props = obj.tribal_props

        # Apply procedural modifier
        apply_tribal_modifier(obj, props)

        # Assign material to object slots if enabled
        if props.auto_chrome:
            mat = get_or_create_chrome_material()
            if not obj.data.materials or obj.data.materials[0] != mat:
                obj.data.materials.clear()
                obj.data.materials.append(mat)

        self.report({'INFO'}, f"Y2K Tribal Style applied to '{obj.name}'")
        return {'FINISHED'}


class OBJECT_OT_y2k_tribal_bake(Operator):
    """Bake the tribal curve into a watertight solid 3D mesh (ready for 3D printing / sculpting)"""
    bl_idname = "object.y2k_tribal_bake"
    bl_label = "Bake to Watertight Mesh"
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, context):
        return context.active_object and context.active_object.type == 'CURVE'

    def execute(self, context):
        curve_obj = context.active_object
        props = curve_obj.tribal_props

        # Generate bmesh directly using mathematical profile
        bm = generate_tribal_bmesh(curve_obj, props)

        # Create new Mesh Object
        mesh_name = f"{curve_obj.name}_Tribal_Mesh"
        mesh_data = bpy.data.meshes.new(mesh_name)
        bm.to_mesh(mesh_data)
        bm.free()

        mesh_obj = bpy.data.objects.new(mesh_name, mesh_data)
        mesh_obj.matrix_world = curve_obj.matrix_world.copy()

        # Link to active collection
        context.collection.objects.link(mesh_obj)

        # Assign Chrome material
        if props.auto_chrome:
            mat = get_or_create_chrome_material()
            mesh_data.materials.append(mat)

        # Select the new mesh
        bpy.ops.object.select_all(action='DESELECT')
        mesh_obj.select_set(True)
        context.view_layer.objects.active = mesh_obj

        self.report({'INFO'}, f"Baked tribal mesh: '{mesh_name}'")
        return {'FINISHED'}


class OBJECT_OT_y2k_tribal_add_preset(Operator):
    """Add a sample Bezier Curve tailored for tribal brush testing"""
    bl_idname = "object.y2k_tribal_add_preset"
    bl_label = "Add Sample Tribal Curve"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        # Create curve datablock
        curve_data = bpy.data.curves.new('Tribal_Curve', type='CURVE')
        curve_data.dimensions = '3D'
        curve_data.resolution_u = 16

        spline = curve_data.splines.new('BEZIER')
        spline.bezier_points.add(2) # 3 points total

        pts = spline.bezier_points
        # Point 1 (Start)
        pts[0].co = (-2.0, -1.0, 0.0)
        pts[0].handle_left = (-2.5, -1.5, 0.0)
        pts[0].handle_right = (-1.0, 0.5, 0.0)

        # Point 2 (Center arch)
        pts[1].co = (0.0, 1.2, 0.0)
        pts[1].handle_left = (-1.0, 1.5, 0.0)
        pts[1].handle_right = (1.0, 0.8, 0.0)

        # Point 3 (End wing)
        pts[2].co = (2.2, -0.6, 0.0)
        pts[2].handle_left = (1.5, 0.0, 0.0)
        pts[2].handle_right = (2.8, -1.2, 0.0)

        curve_obj = bpy.data.objects.new('Tribal_Curve', curve_data)
        context.collection.objects.link(curve_obj)

        bpy.ops.object.select_all(action='DESELECT')
        curve_obj.select_set(True)
        context.view_layer.objects.active = curve_obj

        # Immediately apply tribal style
        bpy.ops.object.y2k_tribal_apply()

        self.report({'INFO'}, "Added Sample Tribal Curve")
        return {'FINISHED'}


class OBJECT_OT_y2k_tribal_remove(Operator):
    """Remove tribal modifier from the curve"""
    bl_idname = "object.y2k_tribal_remove"
    bl_label = "Remove Tribal Style"
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, context):
        return (
            context.active_object and
            context.active_object.type == 'CURVE' and
            "Y2K_Tribal_Style" in context.active_object.modifiers
        )

    def execute(self, context):
        obj = context.active_object
        mod = obj.modifiers.get("Y2K_Tribal_Style")
        if mod:
            obj.modifiers.remove(mod)
        self.report({'INFO'}, "Removed Tribal Style")
        return {'FINISHED'}


class OBJECT_OT_y2k_tribal_export_stl(Operator, ExportHelper):
    """Export pure tribal sigil as watertight STL without baseplate or supports"""
    bl_idname = "object.y2k_tribal_export_stl"
    bl_label = "Export Watertight STL"
    bl_options = {'REGISTER'}

    filename_ext = ".stl"
    filter_glob: StringProperty(
        default="*.stl",
        options={'HIDDEN'},
        maxlen=255,
    )

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and (obj.type in {'CURVE', 'MESH'})

    def execute(self, context):
        obj = context.active_object
        mesh_to_export = None
        created_temp = False

        if obj.type == 'CURVE':
            # Generate mesh directly using bmesh
            bm = generate_tribal_bmesh(obj, obj.tribal_props)
            temp_name = f"{obj.name}_Temp_Export"
            temp_mesh = bpy.data.meshes.new(temp_name)
            bm.to_mesh(temp_mesh)
            bm.free()
            mesh_to_export = bpy.data.objects.new(temp_name, temp_mesh)
            mesh_to_export.matrix_world = obj.matrix_world.copy()
            context.collection.objects.link(mesh_to_export)
            created_temp = True
        elif obj.type == 'MESH':
            mesh_to_export = obj

        # Select only this mesh
        bpy.ops.object.select_all(action='DESELECT')
        mesh_to_export.select_set(True)
        context.view_layer.objects.active = mesh_to_export

        # Export STL
        success = False
        try:
            bpy.ops.wm.stl_export(filepath=self.filepath, export_selected_objects=True)
            success = True
        except Exception:
            try:
                bpy.ops.export_mesh.stl(filepath=self.filepath, use_selection=True)
                success = True
            except Exception as e:
                self.report({'ERROR'}, f"Failed to export STL: {e}")

        # Clean up temporary object if we created one
        if created_temp:
            bpy.data.objects.remove(mesh_to_export, do_unlink=True)
            if obj:
                obj.select_set(True)
                context.view_layer.objects.active = obj

        if success:
            self.report({'INFO'}, f"Watertight STL exported cleanly: {self.filepath}")
            return {'FINISHED'}
        return {'CANCELLED'}


classes = (
    OBJECT_OT_y2k_tribal_apply,
    OBJECT_OT_y2k_tribal_bake,
    OBJECT_OT_y2k_tribal_add_preset,
    OBJECT_OT_y2k_tribal_remove,
    OBJECT_OT_y2k_tribal_export_stl,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

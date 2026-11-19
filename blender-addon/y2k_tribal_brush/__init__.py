bl_info = {
    "name": "Y2K Tribal Brush",
    "author": "Antigravity & User",
    "version": (1, 0, 0),
    "blender": (4, 0, 0),
    "location": "View3D > Sidebar (N) > Tribal",
    "description": "Impose Y2K Chrome Tribal Brush styles onto curves with needle tapers, chiseled spines, symmetry, and liquid chrome.",
    "warning": "",
    "doc_url": "",
    "category": "Curve",
}

from . import properties
from . import materials
from . import geometry_nodes
from . import mesh_generator
from . import operators
from . import ui_panel

modules = (
    properties,
    operators,
    ui_panel,
)


def register():
    for mod in modules:
        mod.register()


def unregister():
    for mod in reversed(modules):
        mod.unregister()


if __name__ == "__main__":
    register()

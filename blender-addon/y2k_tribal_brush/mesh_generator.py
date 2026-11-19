import math
import bpy
import bmesh
from mathutils import Vector, Matrix


def smoothstep(edge0, edge1, x):
    """Hermite interpolation smoothstep."""
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0 if edge1 != edge0 else 1e-6)))
    return t * t * (3.0 - 2.0 * t)


def width_at(s, length, base_width, taper_in, taper_out):
    """
    Calculate the tribal ribbon half-width at distance s along the spline.
    Translates the web app's needle taper envelope and organic flare.
    """
    if length <= 1e-6:
        return 0.001

    factor = s / length
    # Taper envelope: needle sharp at start and end
    t_in = max(0.01, taper_in)
    t_out = max(0.01, taper_out)
    
    env_in = smoothstep(0.0, t_in, factor)
    env_out = smoothstep(0.0, t_out, 1.0 - factor)
    env = min(env_in, env_out)

    # Subtle organic tribal sine modulation along curve
    mod = 0.94 + 0.06 * math.sin(factor * math.pi * 3.0)

    half_w = max(0.001, (base_width * 0.5) * mod * env)
    return half_w


def evaluate_spline_points(spline, resolution=64):
    """Sample smooth points along a Blender curve spline."""
    pts = []
    if spline.type == 'BEZIER':
        # Use Blender's built-in bezier sampling or evaluate knots
        n_points = len(spline.bezier_points)
        if n_points < 2:
            return []
        
        # Collect evaluated points using standard resolution
        # For Bezier, we sample points between consecutive knots
        for i in range(n_points - 1 if not spline.use_cyclic_u else n_points):
            p0 = spline.bezier_points[i]
            p1 = spline.bezier_points[(i + 1) % n_points]
            v0 = p0.co
            v1 = p0.handle_right
            v2 = p1.handle_left
            v3 = p1.co

            sub_steps = max(4, resolution // max(1, n_points - 1))
            for step in range(sub_steps if i < n_points - 1 else sub_steps + 1):
                t = step / float(sub_steps)
                # Cubic Bezier formula
                u = 1.0 - t
                pos = (u**3) * v0 + 3 * (u**2) * t * v1 + 3 * u * (t**2) * v2 + (t**3) * v3
                pts.append(pos.copy())
    else:
        # Poly or NURBS spline
        for p in spline.points:
            pts.append(Vector((p.co.x, p.co.y, p.co.z)))

    return pts


def generate_tribal_bmesh(curve_obj, props):
    """
    Generate a 3D watertight tribal mesh from all splines in the given curve object.
    Supports knife-edge chiseled spine, needle-sharp tip capping, and symmetry.
    """
    bm = bmesh.new()
    curve_data = curve_obj.data

    base_width = props.width
    taper_in = props.taper_in
    taper_out = props.taper_out
    spine_depth = props.depth
    profile_style = props.profile_style

    # Collect symmetry transforms
    transforms = [Matrix.Identity(4)]
    if props.symmetry == 'MIRROR_X':
        m = Matrix.Scale(-1.0, 4, Vector((1, 0, 0)))
        transforms.append(m)
    elif props.symmetry == 'MIRROR_Y':
        m = Matrix.Scale(-1.0, 4, Vector((0, 1, 0)))
        transforms.append(m)
    elif props.symmetry == 'MIRROR_XY':
        mx = Matrix.Scale(-1.0, 4, Vector((1, 0, 0)))
        my = Matrix.Scale(-1.0, 4, Vector((0, 1, 0)))
        mxy = mx @ my
        transforms.extend([mx, my, mxy])
    elif props.symmetry.startswith('RADIAL_'):
        n_rot = int(props.symmetry.split('_')[1])
        transforms = [Matrix.Rotation(i * (2.0 * math.pi / n_rot), 4, 'Z') for i in range(n_rot)]

    for spline in curve_data.splines:
        raw_pts = evaluate_spline_points(spline, resolution=max(32, curve_data.resolution_u * 4))
        if len(raw_pts) < 2:
            continue

        # Calculate cumulative arc lengths
        arc_lengths = [0.0]
        for i in range(1, len(raw_pts)):
            d = (raw_pts[i] - raw_pts[i - 1]).length
            arc_lengths.append(arc_lengths[-1] + d)
        total_len = arc_lengths[-1]
        if total_len < 1e-6:
            continue

        for T in transforms:
            # Transform spline points
            spline_pts = [T @ p for p in raw_pts]
            n_pts = len(spline_pts)

            # Compute tangents, normals, and binormals along spline
            ring_verts = [] # list of 4-vertex rings per spline sample

            for i in range(n_pts):
                p = spline_pts[i]
                s = arc_lengths[i]

                # Tangent
                if i == 0:
                    tangent = (spline_pts[1] - spline_pts[0]).normalized()
                elif i == n_pts - 1:
                    tangent = (spline_pts[-1] - spline_pts[-2]).normalized()
                else:
                    tangent = (spline_pts[i + 1] - spline_pts[i - 1]).normalized()

                # Binormal in XY plane (perpendicular to tangent)
                # Standard curve up vector is Z
                up = Vector((0, 0, 1))
                if abs(tangent.dot(up)) > 0.95:
                    up = Vector((0, 1, 0))
                
                binormal = tangent.cross(up).normalized()
                normal = binormal.cross(tangent).normalized()

                # Width at this point
                hw = width_at(s, total_len, base_width, taper_in, taper_out)
                
                # Height profile scale proportional to width and depth
                depth_scale = spine_depth * min(1.0, hw / (base_width * 0.5 + 1e-6))

                # Create cross-section vertices:
                # 0: Left edge (hw along -binormal)
                # 1: Center top spine (depth along +normal)
                # 2: Right edge (hw along +binormal)
                # 3: Bottom center / back (flat at z=0 or bottom spine)
                v_left = p - binormal * hw
                v_right = p + binormal * hw

                if profile_style == 'CHISEL_FLAT_BACK':
                    v_top = p + normal * depth_scale
                    v_bot = p # flat back along spline center
                    r0 = bm.verts.new(v_left)
                    r1 = bm.verts.new(v_top)
                    r2 = bm.verts.new(v_right)
                    r3 = bm.verts.new(v_bot)
                    ring_verts.append([r0, r1, r2, r3])
                elif profile_style == 'CHISEL_DOUBLE':
                    v_top = p + normal * depth_scale
                    v_bot = p - normal * depth_scale
                    r0 = bm.verts.new(v_left)
                    r1 = bm.verts.new(v_top)
                    r2 = bm.verts.new(v_right)
                    r3 = bm.verts.new(v_bot)
                    ring_verts.append([r0, r1, r2, r3])
                else: # FLAT_EXTRUDED
                    v_tl = v_left + normal * depth_scale
                    v_tr = v_right + normal * depth_scale
                    v_bl = v_left
                    v_br = v_right
                    r0 = bm.verts.new(v_bl)
                    r1 = bm.verts.new(v_tl)
                    r2 = bm.verts.new(v_tr)
                    r3 = bm.verts.new(v_br)
                    ring_verts.append([r0, r1, r2, r3])

            # Bridge consecutive cross-section rings
            for i in range(len(ring_verts) - 1):
                c0 = ring_verts[i]
                c1 = ring_verts[i + 1]

                # Facet 1: Left to Top ridge
                try:
                    bm.faces.new([c0[0], c1[0], c1[1], c0[1]])
                except ValueError:
                    pass

                # Facet 2: Top ridge to Right
                try:
                    bm.faces.new([c0[1], c1[1], c1[2], c0[2]])
                except ValueError:
                    pass

                # Facet 3: Right to Bottom
                try:
                    bm.faces.new([c0[2], c1[2], c1[3], c0[3]])
                except ValueError:
                    pass

                # Facet 4: Bottom to Left
                try:
                    bm.faces.new([c0[3], c1[3], c1[0], c0[0]])
                except ValueError:
                    pass

            # Cap the needle-point tips at start and end
            if not spline.use_cyclic_u and len(ring_verts) > 1:
                # Start cap (tip point)
                start_tip = bm.verts.new(spline_pts[0])
                r_start = ring_verts[0]
                for k in range(4):
                    try:
                        bm.faces.new([start_tip, r_start[k], r_start[(k + 1) % 4]])
                    except ValueError:
                        pass

                # End cap (tip point)
                end_tip = bm.verts.new(spline_pts[-1])
                r_end = ring_verts[-1]
                for k in range(4):
                    try:
                        bm.faces.new([end_tip, r_end[(k + 1) % 4], r_end[k]])
                    except ValueError:
                        pass

    # Clean up duplicate overlapping vertices and recalculate normals
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    return bm

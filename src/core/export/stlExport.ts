export function createBinarySTL(positions: Float32Array, indices: Uint32Array): Blob {
  const numTris = indices.length / 3;
  const buffer = new ArrayBuffer(84 + numTris * 50);
  const view = new DataView(buffer);

  const headerStr = 'Binary STL - Y2K Chrome Tribal Brush Watertight Solid';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < headerStr.length ? headerStr.charCodeAt(i) : 0);
  }
  view.setUint32(80, numTris, true);

  let offset = 84;
  const p = positions;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const ax = p[i0],
      ay = p[i0 + 1],
      az = p[i0 + 2];
    const bx = p[i1],
      by = p[i1 + 1],
      bz = p[i1 + 2];
    const cx = p[i2],
      cy = p[i2 + 1],
      cz = p[i2 + 2];

    const abx = bx - ax,
      aby = by - ay,
      abz = bz - az;
    const acx = cx - ax,
      acy = cy - ay,
      acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    view.setFloat32(offset, nx, true);
    offset += 4;
    view.setFloat32(offset, ny, true);
    offset += 4;
    view.setFloat32(offset, nz, true);
    offset += 4;

    view.setFloat32(offset, ax, true);
    offset += 4;
    view.setFloat32(offset, ay, true);
    offset += 4;
    view.setFloat32(offset, az, true);
    offset += 4;

    view.setFloat32(offset, bx, true);
    offset += 4;
    view.setFloat32(offset, by, true);
    offset += 4;
    view.setFloat32(offset, bz, true);
    offset += 4;

    view.setFloat32(offset, cx, true);
    offset += 4;
    view.setFloat32(offset, cy, true);
    offset += 4;
    view.setFloat32(offset, cz, true);
    offset += 4;

    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'application/octet-stream' });
}

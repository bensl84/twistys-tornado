// =====================================================================================================
// INPUT — one finger. Screen point -> ray -> ground plane (y = 0) -> finger target. Shared by touch and bot.
// =====================================================================================================
function screenToGround(cam, sx, sy, w, h, out) {
  // cam: {x,y,z, pitch, fov, aspect}. Build the ray without THREE so the logic stays self-contained.
  const nx = (sx / w) * 2 - 1, ny = 1 - (sy / h) * 2;
  const tanF = Math.tan(cam.fov * Math.PI / 360);
  // camera looks toward -z pitched down by cam.pitch; camera basis: right = +x
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  // forward vector in world: (0, -sp, -cp); up vector: (0, cp, -sp)
  const dxv = nx * tanF * cam.aspect, dyv = ny * tanF;
  const rx = dxv, ry = -sp + dyv * cp, rz = -cp - dyv * sp;
  if (ry >= -1e-4) { // pointing at or above the horizon: clamp to a far point in that direction
    const t = 4000 / Math.hypot(rx, rz); out.x = cam.x + rx * t; out.z = cam.z + rz * t; return out;
  }
  const t = -cam.y / ry;
  out.x = cam.x + rx * t; out.z = cam.z + rz * t; return out;
}


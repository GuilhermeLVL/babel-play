import type { Vec3 } from './tipos';

/** Álgebra mínima (vetores e quaternions [x,y,z,w]) para interpolar orientação sem `three`. */
export type Quat = readonly [number, number, number, number];

export const norma = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cruz = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const unitario = (v: Vec3): Vec3 => {
  const n = norma(v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};
export const lerpV = (a: Vec3, b: Vec3, u: number): Vec3 => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u,
  a[2] + (b[2] - a[2]) * u,
];

/** Rotação de `v` em torno de x, depois y, depois z (graus, regra da mão direita numérica). */
export function girarXYZ(v: Vec3, graus: Vec3): Vec3 {
  let [x, y, z] = v;
  const [rx, ry, rz] = graus.map((g) => (g * Math.PI) / 180);
  if (rx) {
    const c = Math.cos(rx);
    const s = Math.sin(rx);
    [y, z] = [y * c - z * s, y * s + z * c];
  }
  if (ry) {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    [x, z] = [x * c + z * s, -x * s + z * c];
  }
  if (rz) {
    const c = Math.cos(rz);
    const s = Math.sin(rz);
    [x, y] = [x * c - y * s, x * s + y * c];
  }
  return [x, y, z];
}

/** Quaternion da base (F, N, F x N), com N ortogonalizado em relação a F. */
export function quatDeFN(F: Vec3, N: Vec3): Quat {
  const f = unitario(F);
  const d = dot(N, f);
  const n = unitario([N[0] - f[0] * d, N[1] - f[1] * d, N[2] - f[2] * d]);
  const t = cruz(f, n);
  // matriz com colunas f, n, t
  const m00 = f[0];
  const m01 = n[0];
  const m02 = t[0];
  const m10 = f[1];
  const m11 = n[1];
  const m12 = t[1];
  const m20 = f[2];
  const m21 = n[2];
  const m22 = t[2];
  const tr = m00 + m11 + m22;
  let q: [number, number, number, number];
  if (tr > 0) {
    const s = 2 * Math.sqrt(tr + 1);
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  const l = Math.hypot(...q) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function slerp(a: Quat, b: Quat, u: number): Quat {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const sinal = cos < 0 ? -1 : 1;
  cos *= sinal;
  let wa: number;
  let wb: number;
  if (cos > 0.9995) {
    wa = 1 - u;
    wb = u * sinal;
  } else {
    const ang = Math.acos(cos);
    const s = Math.sin(ang);
    wa = Math.sin((1 - u) * ang) / s;
    wb = (Math.sin(u * ang) / s) * sinal;
  }
  const q: [number, number, number, number] = [
    a[0] * wa + b[0] * wb,
    a[1] * wa + b[1] * wb,
    a[2] * wa + b[2] * wb,
    a[3] * wa + b[3] * wb,
  ];
  const l = Math.hypot(...q) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Aplica o quaternion a um vetor. */
export function girarPorQuat(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

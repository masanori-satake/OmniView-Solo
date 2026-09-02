import assert from 'node:assert/strict';
import { getHomography, toMatrix3d } from './projects/app/js/matrix3d-calc.js';

const cw = 640, ch = 360;
const corners = [{x: 0, y: 0}, {x: cw, y: 0}, {x: cw, y: ch}, {x: 0, y: ch}];

// This extreme narrow-top trapezoid produces wCenter < 0 before sign normalization.
const points = [{x: 45, y: 20}, {x: 55, y: 20}, {x: 95, y: 80}, {x: 5, y: 80}];
const target = points.map(p => ({ x: (p.x/100)*cw, y: (p.y/100)*ch }));

const H_inv = getHomography(target, corners);
assert.equal(H_inv[8], -1, 'expected getHomography to flip the raw h8=1 matrix sign');

const cx = target.reduce((sum, point) => sum + point.x, 0) / target.length;
const cy = target.reduce((sum, point) => sum + point.y, 0) / target.length;
const normalizedCenterW = H_inv[6] * cx + H_inv[7] * cy + H_inv[8];
const rawCenterW = -normalizedCenterW;
assert.ok(rawCenterW < 0, `test input must produce a negative raw center w, got ${rawCenterW}`);
assert.ok(normalizedCenterW > 0, `normalized center w must be positive, got ${normalizedCenterW}`);

target.forEach((point, index) => {
    const w = H_inv[6] * point.x + H_inv[7] * point.y + H_inv[8];
    const projected = {
        x: (H_inv[0] * point.x + H_inv[1] * point.y + H_inv[2]) / w,
        y: (H_inv[3] * point.x + H_inv[4] * point.y + H_inv[5]) / w
    };
    assert.ok(Math.abs(projected.x - corners[index].x) < 1e-7);
    assert.ok(Math.abs(projected.y - corners[index].y) < 1e-7);
});

const matrix3d = toMatrix3d(H_inv);
assert.equal(matrix3d, `matrix3d(${[
    H_inv[0], H_inv[3], 0, H_inv[6],
    H_inv[1], H_inv[4], 0, H_inv[7],
    0, 0, 1, 0,
    H_inv[2], H_inv[5], 0, H_inv[8]
].join(',')})`);

console.log('Homography sign regression test passed.');

import assert from 'node:assert/strict';
import { getHomography, toMatrix3d } from './projects/app/js/matrix3d-calc.js';

const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function project(h, point) {
    const w = h[6] * point.x + h[7] * point.y + h[8];
    return {
        x: (h[0] * point.x + h[1] * point.y + h[2]) / w,
        y: (h[3] * point.x + h[4] * point.y + h[5]) / w
    };
}

function assertPointClose(actual, expected, epsilon = 1e-7) {
    assert.ok(Math.abs(actual.x - expected.x) < epsilon, `x: ${actual.x} !== ${expected.x}`);
    assert.ok(Math.abs(actual.y - expected.y) < epsilon, `y: ${actual.y} !== ${expected.y}`);
}

function expectedMatrix3d(h) {
    return `matrix3d(${[
        h[0], h[3], 0, h[6],
        h[1], h[4], 0, h[7],
        0, 0, 1, 0,
        h[2], h[5], 0, h[8]
    ].join(',')})`;
}

// Test 1: What if canvas.clientWidth or clientHeight is 0?
let cw = 0, ch = 0;
let corners = [{x: 0, y: 0}, {x: cw, y: 0}, {x: cw, y: ch}, {x: 0, y: ch}];
let points = [{x: 20, y: 20}, {x: 80, y: 20}, {x: 80, y: 80}, {x: 20, y: 80}];
let target = points.map(p => ({ x: (p.x/100)*cw, y: (p.y/100)*ch }));
let H_inv = getHomography(target, corners);
assert.deepEqual(H_inv, identity);
assert.equal(toMatrix3d(H_inv), expectedMatrix3d(identity));

// Test 2: Normal canvas size (e.g. 640x360)
cw = 640; ch = 360;
corners = [{x: 0, y: 0}, {x: cw, y: 0}, {x: cw, y: ch}, {x: 0, y: ch}];
target = points.map(p => ({ x: (p.x/100)*cw, y: (p.y/100)*ch }));
H_inv = getHomography(target, corners);
target.forEach((point, index) => assertPointClose(project(H_inv, point), corners[index]));
assert.equal(toMatrix3d(H_inv), expectedMatrix3d(H_inv));

console.log('Homography regression tests passed.');

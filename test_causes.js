import { getHomography, toMatrix3d } from './projects/app/js/matrix3d-calc.js';

// Test 1: What if canvas.clientWidth or clientHeight is 0?
let cw = 0, ch = 0;
let corners = [{x: 0, y: 0}, {x: cw, y: 0}, {x: cw, y: ch}, {x: 0, y: ch}];
let points = [{x: 20, y: 20}, {x: 80, y: 20}, {x: 80, y: 80}, {x: 20, y: 80}];
let target = points.map(p => ({ x: (p.x/100)*cw, y: (p.y/100)*ch }));
let H_inv = getHomography(target, corners);
console.log('Test 1 (cw=0, ch=0) H_inv:', H_inv);
console.log('Test 1 matrix3d:', toMatrix3d(H_inv));

// Test 2: Normal canvas size (e.g. 640x360)
cw = 640; ch = 360;
corners = [{x: 0, y: 0}, {x: cw, y: 0}, {x: cw, y: ch}, {x: 0, y: ch}];
target = points.map(p => ({ x: (p.x/100)*cw, y: (p.y/100)*ch }));
H_inv = getHomography(target, corners);
console.log('Test 2 (cw=640, ch=360) H_inv:', H_inv);
console.log('Test 2 matrix3d:', toMatrix3d(H_inv));

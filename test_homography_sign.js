import { getHomography, toMatrix3d } from './projects/app/js/matrix3d-calc.js';

const cw = 640, ch = 360;
const corners = [{x: 0, y: 0}, {x: cw, y: 0}, {x: cw, y: ch}, {x: 0, y: ch}];

// Suppose user adjusts handles into a trapezoid (narrow top: TL(35%, 20%), TR(65%, 20%), BR(90%, 80%), BL(10%, 80%))
const points = [{x: 35, y: 20}, {x: 65, y: 20}, {x: 90, y: 80}, {x: 10, y: 80}];
const target = points.map(p => ({ x: (p.x/100)*cw, y: (p.y/100)*ch }));

const H_inv = getHomography(target, corners);
console.log('H_inv:', H_inv);

// Check center W
const centerW = H_inv[6]*(cw/2) + H_inv[7]*(ch/2) + H_inv[8];
console.log('centerW:', centerW);

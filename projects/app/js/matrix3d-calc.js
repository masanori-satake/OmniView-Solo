/**
 * Matrix calculation utility for homography and CSS matrix3d.
 */

/**
 * Solves a system of linear equations using Gaussian elimination.
 * @param {number[][]} A - Matrix A
 * @param {number[]} b - Vector b
 * @returns {number[]} Solution vector x
 */
function solve(A, b) {
    const n = A.length;
    for (let i = 0; i < n; i++) {
        // Pivot selection
        let max = i;
        for (let j = i + 1; j < n; j++) {
            if (Math.abs(A[j][i]) > Math.abs(A[max][i])) {
                max = j;
            }
        }
        [A[i], A[max]] = [A[max], A[i]];
        [b[i], b[max]] = [b[max], b[i]];

        if (Math.abs(A[i][i]) < 1e-9) {
            return null;
        }
        // Eliminate
        for (let j = i + 1; j < n; j++) {
            const factor = A[j][i] / A[i][i];
            b[j] -= factor * b[i];
            for (let k = i; k < n; k++) {
                A[j][k] -= factor * A[i][k];
            }
        }
    }

    // Back substitution
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) {
            sum += A[i][j] * x[j];
        }
        x[i] = (b[i] - sum) / A[i][i];
    }
    return x;
}

/**
 * Computes the homography matrix that maps src points to dst points.
 * Points are expected as [{x, y}, {x, y}, {x, y}, {x, y}]
 */
export function getHomography(src, dst) {
    const A = [];
    const b = [];

    for (let i = 0; i < 4; i++) {
        const { x, y } = src[i];
        const { x: u, y: v } = dst[i];
        A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
        b.push(u);
        A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
        b.push(v);
    }

    const res = solve(A, b);
    if (!res) {
        return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
    return [
        res[0], res[1], res[2],
        res[3], res[4], res[5],
        res[6], res[7], 1
    ];
}

/**
 * Converts a 3x3 homography matrix to a CSS matrix3d string.
 */
export function toMatrix3d(h) {
    // 3x3 Homography H = [h0, h1, h2, h3, h4, h5, h6, h7, h8]
    // CSS matrix3d is column-major 4x4
    const m = [
        h[0], h[3], 0, h[6],
        h[1], h[4], 0, h[7],
        0,    0,    1, 0,
        h[2], h[5], 0, h[8]
    ];
    return `matrix3d(${m.join(',')})`;
}

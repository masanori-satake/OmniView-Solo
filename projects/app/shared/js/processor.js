import { getHomography, toMatrix3d } from '../../js/matrix3d-calc.js';

/**
 * Image processing logic using CSS 3D Transforms and Canvas API.
 */
export class PerspectiveTransformer {
    constructor(video, canvas, points, onPointsChange) {
        this.video = video;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.points = points; // [{x, y}, ...] (0-100 percentage)
        this.onPointsChange = onPointsChange;
        this.draggingPoint = null;
        this.showHandles = false;

        this.boundMouseMove = (e) => {
            if (this.draggingPoint !== null) {
                const rect = this.canvas.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                this.points[this.draggingPoint] = {
                    x: Math.max(0, Math.min(100, x)),
                    y: Math.max(0, Math.min(100, y))
                };
                this.updateTransform();
            }
        };

        this.boundMouseUp = () => {
            if (this.draggingPoint !== null) {
                this.draggingPoint = null;
                if (this.onPointsChange) this.onPointsChange(this.points);
            }
        };

        this.boundMouseDown = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            this.draggingPoint = this.points.findIndex(p => {
                const px = (p.x / 100) * rect.width;
                const py = (p.y / 100) * rect.height;
                return Math.hypot(px - x, py - y) < 20;
            });
        };

        this.initEvents();
        this.updateTransform();
    }

    initEvents() {
        this.canvas.addEventListener('mousedown', this.boundMouseDown);
        window.addEventListener('mousemove', this.boundMouseMove);
        window.addEventListener('mouseup', this.boundMouseUp);
    }

    setShowingHandles(visible) {
        this.showHandles = visible;
        this.draw();
    }

    resetPoints() {
        this.points.splice(0, this.points.length,
            {x: 20, y: 20}, {x: 80, y: 20}, {x: 80, y: 80}, {x: 20, y: 80}
        );
        this.updateTransform();
        this.draw();
        if (this.onPointsChange) this.onPointsChange(this.points);
    }

    updateTransform() {
        if (this.showHandles) {
            this.video.style.transform = '';
            this.video.style.width = '100%';
            this.video.style.height = '100%';
            this.video.style.objectFit = 'contain';
            return;
        }

        const cw = this.canvas.clientWidth || 300;
        const ch = this.canvas.clientHeight || 169;

        // Output corners (full container area)
        const corners = [
            {x: 0, y: 0}, {x: cw, y: 0}, {x: cw, y: ch}, {x: 0, y: ch}
        ];

        // Video resolution and its placement within 'object-fit: contain'
        const vw = this.video.videoWidth || 16;
        const vh = this.video.videoHeight || 9;
        const vRatio = vw / vh;
        const cRatio = cw / ch;
        let rW = cw, rH = ch, xO = 0, yO = 0;
        if (vRatio > cRatio) {
            rH = cw / vRatio; yO = (ch - rH) / 2;
        } else {
            rW = ch * vRatio; xO = (cw - rW) / 2;
        }

        // We want to map points from the 'video' coordinate system to the 'container' coordinate system.
        // BUT matrix3d is applied to the video element itself.
        // If we use object-fit: fill, the video matches the container exactly.
        // If we use object-fit: contain, we need to account for the offset/scaling.

        // Actually, using 'object-fit: fill' is simpler for the math,
        // as long as we only use it when NOT showing handles.
        this.video.style.objectFit = 'fill';

        const target = this.points.map(p => ({
            x: (p.x / 100) * cw,
            y: (p.y / 100) * ch
        }));

        const H_inv = getHomography(target, corners);

        this.video.style.transformOrigin = '0 0';
        this.video.style.transform = toMatrix3d(H_inv);
        this.video.style.width = '100%';
        this.video.style.height = '100%';
    }

    destroy() {
        this.canvas.removeEventListener('mousedown', this.boundMouseDown);
        window.removeEventListener('mousemove', this.boundMouseMove);
        window.removeEventListener('mouseup', this.boundMouseUp);
        this.video.style.transform = '';
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    draw() {
        this.updateTransform();
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.showHandles) return;

        // Draw polygon
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#00e676'; // M3 Accent
        this.ctx.lineWidth = 2;
        this.points.forEach((p, i) => {
            const x = (p.x / 100) * this.canvas.width;
            const y = (p.y / 100) * this.canvas.height;
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        });
        this.ctx.closePath();
        this.ctx.stroke();

        // Draw handles
        this.points.forEach(p => {
            const x = (p.x / 100) * this.canvas.width;
            const y = (p.y / 100) * this.canvas.height;
            this.ctx.fillStyle = '#00e676';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 6, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff';
            this.ctx.stroke();
        });
    }

    async getWarpedFrame(imageData) {
        // Pure JS implementation of warpPerspective
        const w = imageData.width;
        const h = imageData.height;
        const out = new ImageData(w, h);

        const cw = this.canvas.clientWidth || 100;
        const ch = this.canvas.clientHeight || 100;
        const vRatio = w / h;
        const cRatio = cw / ch;
        let rW = cw, rH = ch, xO = 0, yO = 0;
        if (vRatio > cRatio) {
            rH = cw / vRatio; yO = (ch - rH) / 2;
        } else {
            rW = ch * vRatio; xO = (cw - rW) / 2;
        }

        const target = this.points.map(p => ({
            x: (((p.x / 100) * cw - xO) / rW) * w,
            y: (((p.y / 100) * ch - yO) / rH) * h
        }));
        const corners = [
            {x: 0, y: 0}, {x: w, y: 0}, {x: w, y: h}, {x: 0, y: h}
        ];

        // H maps corners to target. We need H_inv to map target back to corners for sampling.
        // Actually, we want to map output pixels (corners area) to input pixels (target area).
        // So H: Corners -> Target.
        const H = getHomography(corners, target);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                // Compute source coordinates
                const denominator = H[6] * x + H[7] * y + H[8];
                const sx = (H[0] * x + H[1] * y + H[2]) / denominator;
                const sy = (H[3] * x + H[4] * y + H[5]) / denominator;

                if (sx >= 0 && sx < w - 1 && sy >= 0 && sy < h - 1) {
                    const ix = Math.floor(sx);
                    const iy = Math.floor(sy);
                    const idx = (iy * w + ix) * 4;
                    const oidx = (y * w + x) * 4;

                    // Nearest neighbor for speed, or bilinear for quality.
                    // Given the 5s interval and "Capture" only, bilinear is fine.
                    const dx = sx - ix;
                    const dy = sy - iy;

                    for (let c = 0; c < 4; c++) {
                        const p00 = imageData.data[idx + c];
                        const p10 = imageData.data[idx + 4 + c];
                        const p01 = imageData.data[idx + w * 4 + c];
                        const p11 = imageData.data[idx + w * 4 + 4 + c];

                        const val = p00 * (1 - dx) * (1 - dy) +
                                    p10 * dx * (1 - dy) +
                                    p01 * (1 - dx) * dy +
                                    p11 * dx * dy;
                        out.data[oidx + c] = val;
                    }
                }
            }
        }
        return out;
    }
}

export class MedianStacker {
    constructor(video) {
        this.video = video;
        this.history = []; // Array of ImageData
        this.maxHistory = 5;
        this.interval = null;
        this.lastMedian = null; // ImageData

        this.start();
    }

    start() {
        this.interval = setInterval(() => this.capture(), 5000);
    }

    capture() {
        const w = this.video.videoWidth;
        const h = this.video.videoHeight;
        if (!w || !h) return;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);
        const data = ctx.getImageData(0, 0, w, h);

        this.history.push(data);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }

    computeMedian() {
        if (this.history.length === 0) {
            this.lastMedian = null;
            return;
        }
        if (this.history.length < 2) {
            this.lastMedian = this.history[0];
            return;
        }

        const w = this.history[0].width;
        const h = this.history[0].height;
        const size = w * h * 4;
        const result = new ImageData(w, h);
        const len = this.history.length;
        const vals = new Uint8Array(len);

        for (let i = 0; i < size; i += 4) {
            for (let c = 0; c < 3; c++) {
                for (let j = 0; j < len; j++) {
                    vals[j] = this.history[j].data[i + c];
                }
                // In-place insertion sort
                for (let k = 1; k < len; k++) {
                    const key = vals[k];
                    let l = k - 1;
                    while (l >= 0 && vals[l] > key) {
                        vals[l + 1] = vals[l];
                        l--;
                    }
                    vals[l + 1] = key;
                }
                result.data[i + c] = vals[Math.floor(len / 2)];
            }
            result.data[i + 3] = 255;
        }
        this.lastMedian = result;
    }

    cleanup() {
        if (this.interval) clearInterval(this.interval);
        this.history = [];
    }

    async getMedianFrame(transformer) {
        this.computeMedian();
        const base = this.lastMedian || (this.history.length > 0 ? this.history[this.history.length - 1] : null);
        if (!base) return null;

        // Apply perspective warp
        const warped = await transformer.getWarpedFrame(base);

        // Simple enhancement: Contrast stretch
        const enhanced = this.enhance(warped);

        const canvas = document.createElement('canvas');
        canvas.width = enhanced.width;
        canvas.height = enhanced.height;
        canvas.getContext('2d').putImageData(enhanced, 0, 0);

        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }

    enhance(imageData) {
        const data = imageData.data;
        let min = 255, max = 0;

        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            if (avg < min) min = avg;
            if (avg > max) max = avg;
        }

        const range = max - min || 1;
        for (let i = 0; i < data.length; i += 4) {
            for (let c = 0; c < 3; c++) {
                data[i + c] = ((data[i + c] - min) / range) * 255;
            }
        }
        return imageData;
    }
}

import { getHomography, toMatrix3d } from '../../js/matrix3d-calc.js';

/**
 * Perspective transformation logic.
 */
export class PerspectiveTransformer {
    constructor(video, canvas, points, onPointsChange, labels = []) {
        this.video = video;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.points = points;
        this.onPointsChange = onPointsChange;
        this.labels = labels;
        this.draggingPoint = null;
        this.showHandles = false;
        this.processedCanvas = null;
        this.lastTransform = '';
        this.lastObjectFit = '';
        this.lastElementCount = 0;

        this.resizeObserver = new ResizeObserver(() => {
            this.updateTransform();
            this.draw();
        });
        this.resizeObserver.observe(this.canvas);

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
            if (!this.showHandles) return;
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
        if (this.showHandles === visible) return;
        this.showHandles = visible;
        this.updateTransform();
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
        const elements = [this.video];
        if (this.processedCanvas) elements.push(this.processedCanvas);

        let transform = '';
        let objectFit = 'fill';

        if (this.showHandles) {
            transform = '';
            objectFit = 'contain';
        } else {
            const cw = this.canvas.clientWidth || 300;
            const ch = this.canvas.clientHeight || 169;
            const corners = [{x: 0, y: 0}, {x: cw, y: 0}, {x: cw, y: ch}, {x: 0, y: ch}];

            const target = this.points.map(p => ({
                x: (p.x / 100) * cw,
                y: (p.y / 100) * ch
            }));

            const H_inv = getHomography(target, corners);
            transform = toMatrix3d(H_inv);
            objectFit = 'fill';
        }

        if (this.lastTransform === transform && this.lastObjectFit === objectFit && this.lastElementCount === elements.length) {
            return;
        }

        elements.forEach(el => {
            el.style.transformOrigin = '0 0';
            el.style.transform = transform;
            el.style.width = '100%';
            el.style.height = '100%';
            el.style.objectFit = objectFit;
        });

        this.lastTransform = transform;
        this.lastObjectFit = objectFit;
        this.lastElementCount = elements.length;
    }

    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        this.canvas.removeEventListener('mousedown', this.boundMouseDown);
        window.removeEventListener('mousemove', this.boundMouseMove);
        window.removeEventListener('mouseup', this.boundMouseUp);
        this.video.style.transform = '';
        this.video.style.objectFit = 'contain';
        this.video.style.visibility = 'visible';
        if (this.processedCanvas) {
            this.processedCanvas.style.transform = '';
            this.processedCanvas.style.display = 'none';
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    draw() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.showHandles) return;

        this.ctx.beginPath();
        this.ctx.strokeStyle = '#00e676';
        this.ctx.lineWidth = 2;
        this.points.forEach((p, i) => {
            const x = (p.x / 100) * this.canvas.width;
            const y = (p.y / 100) * this.canvas.height;
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        });
        this.ctx.closePath();
        this.ctx.stroke();

        const centerX = this.points.reduce((sum, p) => sum + p.x, 0) / this.points.length;
        const centerY = this.points.reduce((sum, p) => sum + p.y, 0) / this.points.length;

        this.points.forEach((p, i) => {
            const x = (p.x / 100) * this.canvas.width;
            const y = (p.y / 100) * this.canvas.height;
            this.ctx.fillStyle = '#00e676';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 6, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff';
            this.ctx.stroke();

            // Draw label
            if (this.labels[i] && this.draggingPoint !== i) {
                this.ctx.font = 'bold 14px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';

                // Position outside the quad
                const dx = p.x - centerX;
                const dy = p.y - centerY;
                const mag = Math.hypot(dx, dy) || 1;
                const offsetX = (dx / mag) * 20;
                const offsetY = (dy / mag) * 20;

                this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
                this.ctx.shadowBlur = 4;
                this.ctx.shadowOffsetX = 2;
                this.ctx.shadowOffsetY = 2;
                this.ctx.fillText(this.labels[i], x + offsetX, y + offsetY);

                // Reset shadow
                this.ctx.shadowColor = 'transparent';
                this.ctx.shadowBlur = 0;
                this.ctx.shadowOffsetX = 0;
                this.ctx.shadowOffsetY = 0;
            }
        });
    }

    async getWarpedFrame(imageData) {
        const w = imageData.width;
        const h = imageData.height;
        const out = new ImageData(w, h);
        const cw = this.canvas.clientWidth || 100;
        const ch = this.canvas.clientHeight || 100;
        const vRatio = w / h;
        const cRatio = cw / ch;
        let rW = cw, rH = ch, xO = 0, yO = 0;
        if (vRatio > cRatio) { rH = cw / vRatio; yO = (ch - rH) / 2; }
        else { rW = ch * vRatio; xO = (cw - rW) / 2; }

        const target = this.points.map(p => ({
            x: (((p.x / 100) * cw - xO) / rW) * w,
            y: (((p.y / 100) * ch - yO) / rH) * h
        }));
        const corners = [{x: 0, y: 0}, {x: w, y: 0}, {x: w, y: h}, {x: 0, y: h}];
        const H = getHomography(corners, target);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const den = H[6] * x + H[7] * y + H[8];
                const sx = (H[0] * x + H[1] * y + H[2]) / den;
                const sy = (H[3] * x + H[4] * y + H[5]) / den;
                if (sx >= 0 && sx < w - 1 && sy >= 0 && sy < h - 1) {
                    const ix = Math.floor(sx), iy = Math.floor(sy);
                    const idx = (iy * w + ix) * 4, oidx = (y * w + x) * 4;
                    const dx = sx - ix, dy = sy - iy;
                    for (let c = 0; c < 4; c++) {
                        const p00 = imageData.data[idx + c], p10 = imageData.data[idx + 4 + c];
                        const p01 = imageData.data[idx + w * 4 + c], p11 = imageData.data[idx + w * 4 + 4 + c];
                        out.data[oidx + c] = p00 * (1 - dx) * (1 - dy) + p10 * dx * (1 - dy) + p01 * (1 - dx) * dy + p11 * dx * dy;
                    }
                }
            }
        }
        return out;
    }
}

/**
 * Accumulates frames and computes median to remove moving objects.
 */
export class MedianStacker {
    constructor(video) {
        this.video = video;
        this.history = [];
        this.maxHistory = 5;
        this.interval = null;
        this.lastMedian = null;
    }

    start() {
        if (this.interval) return;
        this.interval = setInterval(() => this.capture(), 2000);
    }

    capture() {
        const w = this.video.videoWidth;
        const h = this.video.videoHeight;
        if (!w || !h) return;

        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);
        const data = ctx.getImageData(0, 0, w, h);

        this.history.push(data);
        if (this.history.length > this.maxHistory) this.history.shift();
        this.computeMedian();
    }

    computeMedian() {
        if (this.history.length === 0) { this.lastMedian = null; return; }
        if (this.history.length < 2) { this.lastMedian = this.history[0]; return; }

        const w = this.history[0].width, h = this.history[0].height;
        const size = w * h * 4;
        const result = new ImageData(new Uint8ClampedArray(size), w, h);
        const len = this.history.length;
        const vals = new Uint8Array(len);

        for (let i = 0; i < size; i += 4) {
            for (let c = 0; c < 3; c++) {
                for (let j = 0; j < len; j++) vals[j] = this.history[j].data[i + c];
                vals.sort(); // Optimized sort
                result.data[i + c] = vals[Math.floor(len / 2)];
            }
            result.data[i + 3] = 255;
        }
        this.lastMedian = result;
    }

    cleanup() {
        if (this.interval) { clearInterval(this.interval); this.interval = null; }
        this.history = [];
        this.lastMedian = null;
    }

    async getMedianFrame(transformer) {
        const base = this.lastMedian || (this.history.length > 0 ? this.history[this.history.length - 1] : null);
        if (!base) return null;
        const warped = await transformer.getWarpedFrame(base);
        const canvas = document.createElement('canvas');
        canvas.width = warped.width; canvas.height = warped.height;
        canvas.getContext('2d').putImageData(warped, 0, 0);
        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }

    async getWarpedCurrentFrame(transformer) {
        const w = this.video.videoWidth, h = this.video.videoHeight;
        if (!w || !h) return null;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);
        const data = ctx.getImageData(0, 0, w, h);
        return await transformer.getWarpedFrame(data);
    }
}

/**
 * Orchestrates whiteboard features.
 */
export class WhiteboardProcessor {
    constructor(video, overlayCanvas, processedCanvas, points, onPointsChange, labels = []) {
        this.video = video;
        this.overlayCanvas = overlayCanvas;
        this.processedCanvas = processedCanvas;
        this.ctx = processedCanvas.getContext('2d', { willReadFrequently: true });
        this.transformer = new PerspectiveTransformer(video, overlayCanvas, points, onPointsChange, labels);
        this.transformer.processedCanvas = processedCanvas;
        this.stacker = new MedianStacker(video);
        this.occlusionRemoval = false;
        this.animationFrame = null;
        this.lastVisibility = '';
        this.lastDisplay = '';
    }

    setOcclusionRemoval(enabled) {
        if (this.occlusionRemoval === enabled) return;
        this.occlusionRemoval = enabled;
        if (enabled) this.stacker.start();
        else this.stacker.cleanup();
        this.transformer.updateTransform();
    }

    start() {
        const loop = () => { this.render(); this.animationFrame = requestAnimationFrame(loop); };
        loop();
    }

    stop() {
        if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
        this.transformer.destroy();
        this.stacker.cleanup();
    }

    render() {
        if (this.transformer.showHandles) {
            this.transformer.draw();
        }

        const showProcessed = this.occlusionRemoval && !!this.stacker.lastMedian;
        const visibility = showProcessed ? 'hidden' : 'visible';
        const display = showProcessed ? 'block' : 'none';

        if (this.lastVisibility !== visibility) {
            this.video.style.visibility = visibility;
            this.lastVisibility = visibility;
        }
        if (this.lastDisplay !== display) {
            this.processedCanvas.style.display = display;
            this.lastDisplay = display;
        }

        if (this.occlusionRemoval) {
            this.drawProcessedFrame();
        }
    }

    drawProcessedFrame() {
        const w = this.video.videoWidth, h = this.video.videoHeight;
        if (!w || !h) return;
        if (this.processedCanvas.width !== w || this.processedCanvas.height !== h) {
            this.processedCanvas.width = w; this.processedCanvas.height = h;
        }

        let imageData = this.stacker.lastMedian;
        if (!imageData) return;
        if (imageData.width !== w || imageData.height !== h) {
            this.stacker.cleanup();
            this.stacker.start();
            return;
        }

        this.ctx.putImageData(imageData, 0, 0);
    }

    async capture() {
        const base = (this.occlusionRemoval && this.stacker.lastMedian) ? this.stacker.lastMedian : null;
        let imageData = base;
        if (!imageData) {
            const canvas = document.createElement('canvas');
            canvas.width = this.video.videoWidth; canvas.height = this.video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(this.video, 0, 0);
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
        const warped = await this.transformer.getWarpedFrame(imageData);
        const outCanvas = document.createElement('canvas');
        outCanvas.width = warped.width; outCanvas.height = warped.height;
        outCanvas.getContext('2d').putImageData(warped, 0, 0);
        return new Promise(resolve => outCanvas.toBlob(resolve, 'image/png'));
    }
}

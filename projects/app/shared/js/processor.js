import { getHomography, toMatrix3d } from '../../js/matrix3d-calc.js';

/**
 * Perspective transformation logic.
 */
export class PerspectiveTransformer {
    constructor(video, canvas, points, onPointsChange, labels = [], rotation = 0, onRotationChange = null) {
        this.video = video;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.points = points;
        this.onPointsChange = onPointsChange;
        this.labels = labels;
        this.rotation = rotation;
        this.onRotationChange = onRotationChange;
        this.draggingPoint = null;
        this.isMultiDragging = false;
        this.lastDragX = 0;
        this.lastDragY = 0;
        this.showHandles = false;
        this.showGuidelines = false;
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
            if (this.draggingPoint !== null && this.draggingPoint !== -1) {
                const rect = this.canvas.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                this.points[this.draggingPoint] = {
                    x: Math.max(0, Math.min(100, x)),
                    y: Math.max(0, Math.min(100, y))
                };
                this.updateTransform();
            } else if (this.isMultiDragging) {
                const rect = this.canvas.getBoundingClientRect();
                const dxPct = ((e.clientX - this.lastDragX) / rect.width) * 100;
                const dyPct = ((e.clientY - this.lastDragY) / rect.height) * 100;

                let minDx = -Infinity;
                let maxDx = Infinity;
                let minDy = -Infinity;
                let maxDy = Infinity;

                this.points.forEach(p => {
                    const minAllowedX = -p.x;
                    const maxAllowedX = 100 - p.x;
                    if (minAllowedX > minDx) minDx = minAllowedX;
                    if (maxAllowedX < maxDx) maxDx = maxAllowedX;

                    const minAllowedY = -p.y;
                    const maxAllowedY = 100 - p.y;
                    if (minAllowedY > minDy) minDy = minAllowedY;
                    if (maxAllowedY < maxDy) maxDy = maxAllowedY;
                });

                const actualDx = Math.max(minDx, Math.min(maxDx, dxPct));
                const actualDy = Math.max(minDy, Math.min(maxDy, dyPct));

                if (actualDx !== 0 || actualDy !== 0) {
                    this.points.forEach(p => {
                        p.x += actualDx;
                        p.y += actualDy;
                        p.x = Math.max(0, Math.min(100, p.x));
                        p.y = Math.max(0, Math.min(100, p.y));
                    });
                    this.updateTransform();
                }

                this.lastDragX += (actualDx / 100) * rect.width;
                this.lastDragY += (actualDy / 100) * rect.height;
            }
        };

        this.boundMouseUp = () => {
            if (this.draggingPoint !== null && this.draggingPoint !== -1) {
                this.draggingPoint = null;
                if (this.onPointsChange) this.onPointsChange(this.points);
            } else if (this.isMultiDragging) {
                this.isMultiDragging = false;
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

            if (this.draggingPoint === -1) {
                this.isMultiDragging = true;
                this.lastDragX = e.clientX;
                this.lastDragY = e.clientY;
            } else {
                this.isMultiDragging = false;
            }
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

        // Custom event or callback could be triggered here to toggle rotation buttons visibility.
        if (this.canvas) {
            const slotEl = this.canvas.closest('.camera-slot');
            if (slotEl) {
                const rotLeft = slotEl.querySelector('.rot-left-btn');
                const rotRight = slotEl.querySelector('.rot-right-btn');
                if (rotLeft && rotRight) {
                    if (visible) {
                        rotLeft.classList.remove('hidden');
                        rotRight.classList.remove('hidden');
                    } else {
                        rotLeft.classList.add('hidden');
                        rotRight.classList.add('hidden');
                    }
                }
            }
        }
    }

    rotatePoints(direction) {
        // direction is 'left' or 'right'
        // Rotate points rotation states (which shifts how targets/corners map)
        if (direction === 'right') {
            const last = this.points.pop();
            this.points.unshift(last);
        } else if (direction === 'left') {
            const first = this.points.shift();
            this.points.push(first);
        }
        this.updateTransform();
        this.draw();
        if (this.onPointsChange) this.onPointsChange(this.points);
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

        if (this.showGuidelines && !this.showHandles) {
            this.drawGuidelines();
        }

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

        if (this.draggingPoint === null && !this.isMultiDragging) {
            this.drawLandmarkF();
        }

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
                const pixelCenterX = (centerX / 100) * this.canvas.width;
                const pixelCenterY = (centerY / 100) * this.canvas.height;
                const dx = x - pixelCenterX;
                const dy = y - pixelCenterY;
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

    drawGuidelines() {
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        this.ctx.save();
        this.ctx.strokeStyle = '#00e676';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
        this.ctx.shadowBlur = 2;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;

        // Draw vertical lines
        for (let i = 1; i <= 3; i++) {
            const x = (i / 4) * cw;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, ch);
            this.ctx.stroke();
        }

        // Draw horizontal lines
        for (let i = 1; i <= 3; i++) {
            const y = (i / 4) * ch;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(cw, y);
            this.ctx.stroke();
        }

        // Draw labels
        this.ctx.setLineDash([]);
        this.ctx.font = 'bold 24px sans-serif';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.shadowColor = 'rgba(0,0,0,1.0)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;

        const cols = ['A', 'B', 'C', 'D'];
        for (let i = 0; i < 4; i++) {
            // Columns (A, B, C, D)
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';
            this.ctx.fillText(cols[i], (i / 4 + 1 / 8) * cw, 10);

            // Rows (1, 2, 3, 4)
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText((i + 1).toString(), 10, (i / 4 + 1 / 8) * ch);
        }

        this.ctx.restore();
    }

    drawLandmarkF() {
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const src = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 }
        ];
        const dst = this.points.map(p => ({
            x: (p.x / 100) * cw,
            y: (p.y / 100) * ch
        }));

        const H = getHomography(src, dst);

        const transform = (x, y) => {
            const den = H[6] * x + H[7] * y + H[8];
            if (Math.abs(den) < 1e-9) return { x: 0, y: 0 };
            return {
                x: (H[0] * x + H[1] * y + H[2]) / den,
                y: (H[3] * x + H[4] * y + H[5]) / den
            };
        };

        const fLines = [
            // Vertical bar
            [{ x: 30, y: 20 }, { x: 30, y: 80 }],
            // Top bar
            [{ x: 30, y: 20 }, { x: 70, y: 20 }],
            // Middle bar
            [{ x: 30, y: 50 }, { x: 60, y: 50 }]
        ];

        this.ctx.save();
        this.ctx.strokeStyle = '#00e676';
        this.ctx.globalAlpha = 0.4;
        this.ctx.lineWidth = 10;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        fLines.forEach(line => {
            const p1 = transform(line[0].x, line[0].y);
            const p2 = transform(line[1].x, line[1].y);
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
        });

        this.ctx.restore();
    }

    async getWarpedFrame(imageData) {
        const w = imageData.width;
        const h = imageData.height;

        const slotEl = this.canvas.closest('.camera-slot');
        const rawScale = slotEl ? parseFloat(slotEl.dataset.vScale) : 1.0;
        const vScale = isNaN(rawScale) || rawScale <= 0 ? 1.0 : rawScale;

        const outW = w;
        const outH = Math.round(h * vScale);
        const out = new ImageData(outW, outH);

        // Map handle points as percentages of a 16:9 canvas to find their coordinates in the source frame.
        // During handle adjustment, the canvas is forced to 16:9.
        const cw169 = 1600;
        const ch169 = 900;
        const vRatio = w / h;
        const cRatio = cw169 / ch169; // 16/9
        let rW = cw169, rH = ch169, xO = 0, yO = 0;
        if (vRatio > cRatio) {
            rH = cw169 / vRatio;
            yO = (ch169 - rH) / 2;
        } else {
            rW = ch169 * vRatio;
            xO = (cw169 - rW) / 2;
        }

        const target = this.points.map(p => ({
            x: (((p.x / 100) * cw169 - xO) / rW) * w,
            y: (((p.y / 100) * ch169 - yO) / rH) * h
        }));

        const corners = [{x: 0, y: 0}, {x: outW, y: 0}, {x: outW, y: outH}, {x: 0, y: outH}];
        const H = getHomography(corners, target);

        for (let y = 0; y < outH; y++) {
            for (let x = 0; x < outW; x++) {
                const den = H[6] * x + H[7] * y + H[8];
                if (Math.abs(den) < 1e-9) continue;
                const sx = (H[0] * x + H[1] * y + H[2]) / den;
                const sy = (H[3] * x + H[4] * y + H[5]) / den;
                if (sx >= 0 && sx < w - 1 && sy >= 0 && sy < h - 1) {
                    const ix = Math.floor(sx), iy = Math.floor(sy);
                    const idx = (iy * w + ix) * 4, oidx = (y * outW + x) * 4;
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

        if (this.history.length > 0 && (this.history[0].width !== w || this.history[0].height !== h)) {
            this.history = [];
        }

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

                // Insertion sort for small array
                for (let j = 1; j < len; j++) {
                    const key = vals[j];
                    let k = j - 1;
                    while (k >= 0 && vals[k] > key) {
                        vals[k + 1] = vals[k];
                        k--;
                    }
                    vals[k + 1] = key;
                }

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
        if (this.transformer.showHandles || this.transformer.showGuidelines) {
            this.transformer.draw();
        } else {
            const canvas = this.transformer.canvas;
            this.transformer.ctx.clearRect(0, 0, canvas.width, canvas.height);
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

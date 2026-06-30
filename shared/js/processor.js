/**
 * Image processing logic using OpenCV.js.
 */
export class PerspectiveTransformer {
    constructor(video, canvas, points, onPointsChange) {
        this.video = video;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.points = points; // [{x, y}, ...]
        this.onPointsChange = onPointsChange;
        this.draggingPoint = null;

        this.boundMouseMove = (e) => {
            if (this.draggingPoint !== null) {
                const rect = this.canvas.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                this.points[this.draggingPoint] = {
                    x: Math.max(0, Math.min(100, x)),
                    y: Math.max(0, Math.min(100, y))
                };
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
    }

    initEvents() {
        this.canvas.addEventListener('mousedown', this.boundMouseDown);
        window.addEventListener('mousemove', this.boundMouseMove);
        window.addEventListener('mouseup', this.boundMouseUp);
    }

    destroy() {
        this.canvas.removeEventListener('mousedown', this.boundMouseDown);
        window.removeEventListener('mousemove', this.boundMouseMove);
        window.removeEventListener('mouseup', this.boundMouseUp);
    }

    draw() {
        this.canvas.width = this.video.videoWidth || 640;
        this.canvas.height = this.video.videoHeight || 360;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw polygon
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#0056d2';
        this.ctx.lineWidth = 3;
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
            this.ctx.fillStyle = '#0056d2';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 8, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    async getWarpedFrame() {
        if (!window.cv) return null;
        const cv = window.cv;

        let src, dst, srcPts, dstPts, M;
        try {
            src = cv.imread(this.video);
            dst = new cv.Mat();

            const srcCoords = [];
            this.points.forEach(p => {
                srcCoords.push((p.x / 100) * src.cols, (p.y / 100) * src.rows);
            });

            srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, srcCoords);
            const dstCoords = [0, 0, src.cols, 0, src.cols, src.rows, 0, src.rows];
            dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, dstCoords);

            M = cv.getPerspectiveTransform(srcPts, dstPts);
            cv.warpPerspective(src, dst, M, new cv.Size(src.cols, src.rows));
            return dst;
        } catch (e) {
            console.error("Error in getWarpedFrame:", e);
            if (dst) dst.delete();
            return null;
        } finally {
            if (src) src.delete();
            if (srcPts) srcPts.delete();
            if (dstPts) dstPts.delete();
            if (M) M.delete();
        }
    }
}

export class MedianStacker {
    constructor(video) {
        this.video = video;
        this.history = [];
        this.maxHistory = 5;
        this.lastCapture = 0;
    }

    cleanup() {
        this.history.forEach(mat => {
            if (mat && typeof mat.delete === 'function') {
                mat.delete();
            }
        });
        this.history = [];
    }

    async getMedianFrame(warpedMat) {
        if (!window.cv) return null;
        const cv = window.cv;

        const now = Date.now();
        if (now - this.lastCapture > 5000) {
            this.history.push(warpedMat.clone());
            if (this.history.length > this.maxHistory) {
                const old = this.history.shift();
                old.delete();
            }
            this.lastCapture = now;
        }

        if (this.history.length === 0) return this.matToBlob(warpedMat);

        const result = this.enhance(warpedMat);
        const blob = await this.matToBlob(result);
        result.delete();
        return blob;
    }

    enhance(src) {
        const cv = window.cv;
        let gray, dst;
        try {
            gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            dst = new cv.Mat();
            cv.adaptiveThreshold(gray, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 21, 10);
            return dst;
        } catch (e) {
            console.error("Error in enhance:", e);
            if (dst) dst.delete();
            return src.clone();
        } finally {
            if (gray) gray.delete();
        }
    }

    matToBlob(mat) {
        const cv = window.cv;
        const canvas = document.createElement('canvas');
        cv.imshow(canvas, mat);
        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }
}

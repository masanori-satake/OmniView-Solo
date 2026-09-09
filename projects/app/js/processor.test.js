// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { PerspectiveTransformer, MedianStacker, WhiteboardProcessor } from './processor.js';

// ImageData polyfill for jsdom environment if not natively provided in jsdom
if (typeof ImageData === 'undefined') {
    global.ImageData = class ImageData {
        constructor(dataOrWidth, widthOrHeight, height) {
            if (dataOrWidth instanceof Uint8ClampedArray) {
                this.data = dataOrWidth;
                this.width = widthOrHeight;
                this.height = height;
            } else {
                this.width = dataOrWidth;
                this.height = widthOrHeight;
                this.data = new Uint8ClampedArray(this.width * this.height * 4);
            }
        }
    };
}

describe('processor.js パフォーマンス最適化単体テスト', () => {
    let mockVideo, mockOverlayCanvas, mockProcessedCanvas, mockCtx, mockOverlayCtx;

    beforeEach(() => {
        mockCtx = {
            putImageData: vi.fn(),
            getImageData: vi.fn(),
            drawImage: vi.fn(),
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            closePath: vi.fn(),
            stroke: vi.fn(),
            fill: vi.fn(),
            arc: vi.fn(),
            fillText: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
            setLineDash: vi.fn(),
        };

        mockOverlayCtx = { ...mockCtx, clearRect: vi.fn() };

        mockVideo = {
            videoWidth: 640,
            videoHeight: 480,
            style: {}
        };

        mockOverlayCanvas = {
            clientWidth: 640,
            clientHeight: 480,
            width: 640,
            height: 480,
            style: {},
            getContext: () => mockOverlayCtx,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            closest: () => null,
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 })
        };

        mockProcessedCanvas = {
            width: 640,
            height: 480,
            style: {},
            getContext: () => mockCtx
        };

        // Mock ResizeObserver
        global.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    });

    describe('MedianStacker バージョン追跡と計算の最適化', () => {
        test('computeMedian 呼び出し時に version がインクリメントされる', () => {
            const stacker = new MedianStacker(mockVideo);
            const initialVersion = stacker.version;

            stacker.history = [
                new ImageData(new Uint8ClampedArray(400), 10, 10),
                new ImageData(new Uint8ClampedArray(400), 10, 10)
            ];

            stacker.computeMedian();
            expect(stacker.version).toBeGreaterThan(initialVersion);
        });

        test('cleanup 実行時に version がインクリメントされ履歴がクリアされる', () => {
            const stacker = new MedianStacker(mockVideo);
            stacker.history = [new ImageData(new Uint8ClampedArray(400), 10, 10)];
            const v1 = stacker.version;

            stacker.cleanup();
            expect(stacker.history.length).toBe(0);
            expect(stacker.version).toBeGreaterThan(v1);
        });

        test('MedianStacker は複数フレームのピクセル中央値を正確に計算する', () => {
            const stacker = new MedianStacker(mockVideo);
            // 3つの 1x1 ImageData フレーム（R値がそれぞれ 10, 50, 30）
            const f1 = new ImageData(new Uint8ClampedArray([10, 0, 0, 255]), 1, 1);
            const f2 = new ImageData(new Uint8ClampedArray([50, 0, 0, 255]), 1, 1);
            const f3 = new ImageData(new Uint8ClampedArray([30, 0, 0, 255]), 1, 1);

            stacker.history = [f1, f2, f3];
            stacker.computeMedian();

            expect(stacker.lastMedian).not.toBeNull();
            // 中央値 30 がセットされていること
            expect(stacker.lastMedian.data[0]).toBe(30);
        });
    });

    describe('PerspectiveTransformer 描画の最適化', () => {
        test('状態に変更がない場合、重複する draw() 呼び出しでの clearRect をスキップする', () => {
            const pts = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }];
            const transformer = new PerspectiveTransformer(mockVideo, mockOverlayCanvas, pts, null);

            mockOverlayCtx.clearRect.mockClear();
            transformer.draw(); // 1回目描画
            const clearCount1 = mockOverlayCtx.clearRect.mock.calls.length;

            transformer.draw(); // 重複描画（状態変更なし）
            const clearCount2 = mockOverlayCtx.clearRect.mock.calls.length;

            expect(clearCount2).toBe(clearCount1); // スキップされたため増加しない
        });

        test('force = true の場合は状態変更がなくても再描画を実行する', () => {
            const pts = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }];
            const transformer = new PerspectiveTransformer(mockVideo, mockOverlayCanvas, pts, null);

            mockOverlayCtx.clearRect.mockClear();
            transformer.draw();
            const countBefore = mockOverlayCtx.clearRect.mock.calls.length;

            transformer.draw(true); // 強制描画
            const countAfter = mockOverlayCtx.clearRect.mock.calls.length;

            expect(countAfter).toBeGreaterThan(countBefore);
        });
    });

    describe('WhiteboardProcessor putImageData 及び clearRect の最適化', () => {
        test('stacker.version が変化しない場合、drawProcessedFrame は putImageData をスキップする', () => {
            const pts = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }];
            const processor = new WhiteboardProcessor(mockVideo, mockOverlayCanvas, mockProcessedCanvas, pts, null);

            processor.occlusionRemoval = true;
            processor.stacker.lastMedian = new ImageData(new Uint8ClampedArray(640 * 480 * 4), 640, 480);
            processor.stacker.version = 1;

            mockCtx.putImageData.mockClear();

            processor.drawProcessedFrame(); // 1回目: 描画実行
            expect(mockCtx.putImageData).toHaveBeenCalledTimes(1);

            processor.drawProcessedFrame(); // 2回目: バージョン未変化のためスキップ
            expect(mockCtx.putImageData).toHaveBeenCalledTimes(1);

            // バージョン更新時
            processor.stacker.version = 2;
            processor.drawProcessedFrame(); // 3回目: バージョン変化のため描画実行
            expect(mockCtx.putImageData).toHaveBeenCalledTimes(2);
        });

        test('ハンドル非表示時、render() は最初に1回のみ clearRect を呼び出す', () => {
            const pts = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }];
            const processor = new WhiteboardProcessor(mockVideo, mockOverlayCanvas, mockProcessedCanvas, pts, null);

            processor.transformer.showHandles = false;
            processor.transformer.showGuidelines = false;

            mockOverlayCtx.clearRect.mockClear();

            processor.render(); // 1回目
            const count1 = mockOverlayCtx.clearRect.mock.calls.length;

            processor.render(); // 2回目（スキップされるべき）
            const count2 = mockOverlayCtx.clearRect.mock.calls.length;

            expect(count1).toBe(1);
            expect(count2).toBe(1);
        });
    });
});

import os
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import sync_playwright


class QuietHTTPRequestHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


@contextmanager
def serve_repository():
    handler = partial(QuietHTTPRequestHandler, directory=os.getcwd())
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        thread.join()


def run():
    with serve_repository() as base_url, sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.add_init_script("""
            const storage = {};
            window.chrome = {
                i18n: { getMessage: (key) => key },
                runtime: { getManifest: () => ({ version: '1.0.6' }), getURL: (path) => path },
                storage: {
                    local: {
                        get: (keys, cb) => {
                            const result = {};
                            const requested = Array.isArray(keys) ? keys : [keys];
                            requested.forEach(key => result[key] = storage[key]);
                            if (cb) cb(result);
                            return Promise.resolve(result);
                        },
                        set: (data, cb) => {
                            Object.assign(storage, data);
                            if (cb) cb();
                            return Promise.resolve();
                        }
                    }
                }
            };

            const source = document.createElement('canvas');
            source.width = 640;
            source.height = 360;
            const sourceContext = source.getContext('2d');
            sourceContext.fillStyle = '#d32f2f';
            sourceContext.fillRect(0, 0, source.width, source.height);
            sourceContext.fillStyle = '#ffffff';
            sourceContext.fillRect(160, 90, 320, 180);
            window.testCameraStream = source.captureStream(30);
            Object.defineProperty(navigator, 'mediaDevices', {
                configurable: true,
                value: {
                    enumerateDevices: () => Promise.resolve([
                        { deviceId: 'test-cam-1', kind: 'videoinput', label: 'Test Camera 1' }
                    ]),
                    getUserMedia: () => Promise.resolve(window.testCameraStream),
                    addEventListener: () => {}
                }
            });
        """)

        page.goto(f"{base_url}/projects/app/app.html")
        page.wait_for_timeout(1000)

        result = page.evaluate("""
            async () => {
                const { app, appReady } = await import('./js/app.js');
                await appReady;
                await app.saveCameraSetting('test-cam-1', { defaultRole: 'whiteboard' });
                await app.addCamera({ deviceId: 'test-cam-1', label: 'Test Camera 1' });

                const slot = app.slots.get('test-cam-1');
                const probe = document.createElement('canvas');
                probe.width = 64;
                probe.height = 36;
                const context = probe.getContext('2d');
                context.drawImage(slot.video, 0, 0, probe.width, probe.height);
                const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
                let nonBlackPixels = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i] || pixels[i + 1] || pixels[i + 2]) nonBlackPixels++;
                }

                const frame = document.createElement('canvas');
                frame.width = slot.video.videoWidth;
                frame.height = slot.video.videoHeight;
                const frameContext = frame.getContext('2d');
                frameContext.drawImage(slot.video, 0, 0, frame.width, frame.height);
                slot.processor.stacker.lastMedian = frameContext.getImageData(0, 0, frame.width, frame.height);
                slot.processor.occlusionRemoval = true;
                slot.processor.render();
                const processedPixels = slot.processedCanvas.getContext('2d')
                    .getImageData(0, 0, slot.processedCanvas.width, slot.processedCanvas.height).data;
                let processedNonBlackPixels = 0;
                for (let i = 0; i < processedPixels.length; i += 4) {
                    if (processedPixels[i] || processedPixels[i + 1] || processedPixels[i + 2]) {
                        processedNonBlackPixels++;
                    }
                }

                const transformer = slot.processor.transformer;
                const capturedPointers = [];
                const releasedPointers = [];
                transformer.canvas.setPointerCapture = pointerId => capturedPointers.push(pointerId);
                transformer.canvas.releasePointerCapture = pointerId => releasedPointers.push(pointerId);
                transformer.boundPointerDown({ pointerId: 11, button: 0, clientX: 10, clientY: 10 });
                transformer.boundPointerDown({ pointerId: 22, button: 0, clientX: 20, clientY: 20 });
                transformer.boundPointerMove({ pointerId: 22, clientX: 30, clientY: 30 });
                transformer.boundPointerUp({ pointerId: 22 });
                const foreignPointerIgnored = transformer.activePointerId === 11
                    && transformer.isSimpleDragging
                    && transformer.lastDragX === 10
                    && transformer.lastDragY === 10;
                transformer.boundPointerUp({ pointerId: 11 });

                return {
                    processorInitialized: Boolean(slot.processor),
                    streamAttached: slot.stream === window.testCameraStream,
                    nonBlackPixels,
                    processedNonBlackPixels,
                    foreignPointerIgnored,
                    capturedPointers,
                    releasedPointers,
                    pointerReleased: transformer.activePointerId === null && !transformer.isSimpleDragging
                };
            }
        """)
        assert result["processorInitialized"], "whiteboard processor was not initialized"
        assert result["streamAttached"], "addCamera did not attach the mocked MediaStream"
        assert result["nonBlackPixels"] > 0, "camera video rendered only black pixels"
        assert result["processedNonBlackPixels"] > 0, "whiteboard processor drew only black pixels"
        assert result["foreignPointerIgnored"], "a second pointer changed the active drag"
        assert result["capturedPointers"] == [11], "the initiating pointer was not captured"
        assert result["releasedPointers"] == [11], "the initiating pointer capture was not released"
        assert result["pointerReleased"], "the active drag did not end with its initiating pointer"
        browser.close()

run()

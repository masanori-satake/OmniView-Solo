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
        context = browser.new_context()
        page = context.new_page()

        # Inject mock chrome API & mock mediaDevices with a fake video track
        page.add_init_script("""
            const storage = {};
            window.chrome = {
                i18n: { getMessage: (key) => key },
                runtime: { getManifest: () => ({ version: '1.0.6' }), getURL: (path) => path },
                storage: {
                    local: {
                        get: (keys, cb) => {
                            const res = {};
                            const requested = Array.isArray(keys) ? keys : [keys];
                            requested.forEach(key => res[key] = storage[key]);
                            if (cb) cb(res);
                            return Promise.resolve(res);
                        },
                        set: (data, cb) => {
                            Object.assign(storage, data);
                            if (cb) cb();
                            return Promise.resolve();
                        }
                    }
                }
            };

            const canvas = document.createElement('canvas');
            canvas.width = 1280; canvas.height = 720;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 1280, 720);
            ctx.fillStyle = 'white'; ctx.font = '60px sans-serif';
            ctx.fillText('CAMERA STREAM TEST', 200, 360);
            window.testCameraStream = canvas.captureStream(30);

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

                return {
                    streamAttached: slot.stream === window.testCameraStream,
                    videoWidth: slot.video.videoWidth,
                    nonBlackPixels
                };
            }
        """)
        assert result["streamAttached"], "addCamera did not receive the mocked MediaStream"
        assert result["videoWidth"] > 0, "camera video never became ready"
        assert result["nonBlackPixels"] > 0, "camera rendering produced only black pixels"
        browser.close()

run()

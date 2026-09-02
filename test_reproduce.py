import os
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        app_html = os.path.abspath("projects/app/app.html")

        # Inject mock chrome API & mock mediaDevices with a fake video track
        page.add_init_script("""
            window.chrome = {
                i18n: { getMessage: (key) => key },
                runtime: { getManifest: () => ({ version: '1.0.6' }), getURL: (path) => path },
                storage: {
                    local: {
                        get: (keys, cb) => {
                            const res = {};
                            if (typeof keys === 'string') res[keys] = {};
                            if (Array.isArray(keys)) keys.forEach(k => res[k] = {});
                            if (cb) cb(res);
                            return Promise.resolve(res);
                        },
                        set: (data, cb) => { if (cb) cb(); return Promise.resolve(); }
                    }
                }
            };

            const canvas = document.createElement('canvas');
            canvas.width = 1280; canvas.height = 720;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 1280, 720);
            ctx.fillStyle = 'white'; ctx.font = '60px sans-serif';
            ctx.fillText('CAMERA STREAM TEST', 200, 360);
            const stream = canvas.captureStream(30);

            navigator.mediaDevices.enumerateDevices = () => Promise.resolve([
                { deviceId: 'test-cam-1', kind: 'videoinput', label: 'Test Camera 1' }
            ]);
            navigator.mediaDevices.getUserMedia = () => Promise.resolve(stream);
            navigator.mediaDevices.addEventListener = () => {};
        """)

        page.goto(f"file://{app_html}")
        page.wait_for_timeout(1000)

        page.evaluate("""
            async () => {
                document.getElementById('initial-overlay').classList.add('hidden');
                // Directly call addCamera via app instance
                const camera = { deviceId: 'test-cam-1', label: 'Test Camera 1' };
                // Find app instance or trigger addCamera
            }
        """)

run()

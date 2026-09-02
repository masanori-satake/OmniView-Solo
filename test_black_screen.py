import os
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        app_html = os.path.abspath("projects/app/app.html")

        page.add_init_script("""
            window.chrome = {
                i18n: { getMessage: (key) => key },
                runtime: { getManifest: () => ({ version: '1.0.6' }), getURL: (path) => path },
                storage: {
                    local: {
                        get: (keys, cb) => cb({}),
                        set: (data, cb) => cb && cb()
                    }
                }
            };
        """)

        page.goto(f"file://{app_html}")
        page.wait_for_timeout(1000)

        # Add a dummy camera slot manually or test initProcessor
        result = page.evaluate("""
            () => {
                const slot = {
                    element: document.createElement('div'),
                    video: document.createElement('video'),
                    canvas: document.createElement('canvas'),
                    processedCanvas: document.createElement('canvas'),
                    freezeCanvas: document.createElement('canvas')
                };
                slot.canvas.width = 640; slot.canvas.height = 360;
                slot.video.videoWidth = 640; slot.video.videoHeight = 360;

                // Set initial transform
                window.slotTest = slot;
                return "created";
            }
        """)
        print("Init result:", result)
        browser.close()

run()

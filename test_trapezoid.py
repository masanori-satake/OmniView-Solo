import os
from playwright.sync_api import sync_playwright

html_content = """
<!DOCTYPE html>
<html>
<head>
<link rel="stylesheet" href="projects/app/css/m3-theme.css">
<link rel="stylesheet" href="projects/app/css/style.css">
</head>
<body>
<div id="app" class="layout-narrow">
<main id="camera-container">
<div class="container camera-slot zoom-1 active">
    <div class="video-wrapper">
        <canvas id="c" class="overlay-canvas" width="640" height="360"></canvas>
    </div>
</div>
</main>
</div>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(0, 0, 640, 360);
ctx.fillStyle = 'white';
ctx.font = '40px sans-serif';
ctx.fillText('WHITEBOARD TEST', 50, 180);

// Extreme trapezoid matrix3d string
const m = "matrix3d(1.1173184357541897,-5.396917480816733e-18,0,-5.843279076974509e-19,-0.9435133457479822,0.055865921787709855,0,-0.0029484792054624443,0,0,1,0,-37.54189944134078,-2.0111731843575518,0,1)";
canvas.style.transform = m;
</script>
</body>
</html>
"""
html_content = html_content.rstrip() + "\n"

with open("test_trap.html", "w") as f:
    f.write(html_content)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("file://" + os.path.abspath("test_trap.html"))
    page.screenshot(path="test_trap.png")
    browser.close()

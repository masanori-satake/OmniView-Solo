import os
from playwright.sync_api import sync_playwright

html_content = """
<!DOCTYPE html>
<html>
<head>
<style>
.container {
    width: 640px;
    height: 360px;
    background: #000;
    position: relative;
    overflow: hidden;
}
canvas {
    width: 100%;
    height: 100%;
    transform-origin: 0 0;
    object-fit: fill;
}
</style>
</head>
<body>
<div class="container">
    <canvas id="c" width="640" height="360"></canvas>
</div>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(0, 0, 640, 360);
ctx.fillStyle = 'white';
ctx.font = '40px sans-serif';
ctx.fillText('TEST IMAGE', 100, 100);

const m = "matrix3d(1.6666666666666667,0,0,0,0,1.6666666666666667,0,0,0,0,1,0,-213.33333333333334,-120,0,1)";
canvas.style.transform = m;
</script>
</body>
</html>
"""

with open("test.html", "w") as f:
    f.write(html_content)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("file://" + os.path.abspath("test.html"))
    page.screenshot(path="test_transform.png")
    browser.close()

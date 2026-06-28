import { getCameras, loadCameraSettings, saveCameraSetting, startCamera } from './camera.js';
import { PerspectiveTransformer, MedianStacker } from '../shared/js/processor.js';

class App {
  constructor() {
    this.container = document.getElementById('camera-container');
    this.cameras = [];
    this.settings = {};
    this.slots = new Map();
    this.currentLayout = null;
    this.snackbarTimeout = null;
  }

  async init() {
    this.settings = await loadCameraSettings();
    this.cameras = await getCameras();
    await this.render();
    this.setupResizeObserver();
  }

  setupResizeObserver() {
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        const width = entry.contentRect.width;
        const app = document.getElementById('app');
        const nextLayout = width > 500 ? 'wide' : 'narrow';

        if (this.currentLayout !== nextLayout) {
          this.currentLayout = nextLayout;
          if (nextLayout === 'wide') {
            app.classList.remove('layout-narrow');
            app.classList.add('layout-wide');
            this.reorganizeForWide();
          } else {
            app.classList.remove('layout-wide');
            app.classList.add('layout-narrow');
            this.reorganizeForNarrow();
          }
        }
      }
    });
    observer.observe(document.body);
  }

  reorganizeForNarrow() {
    this.slots.forEach(slot => {
        this.container.appendChild(slot.element);
        slot.element.classList.remove('main-region', 'sub-region-item');
    });
    const mr = this.container.querySelector('.main-region');
    if (mr) mr.remove();
    const sr = this.container.querySelector('.sub-region');
    if (sr) sr.remove();
  }

  reorganizeForWide() {
    let mainRegion = this.container.querySelector('.main-region');
    if (!mainRegion) {
        mainRegion = document.createElement('div');
        mainRegion.className = 'main-region';
        this.container.appendChild(mainRegion);
    }

    let subRegion = this.container.querySelector('.sub-region');
    if (!subRegion) {
        subRegion = document.createElement('div');
        subRegion.className = 'sub-region';
        this.container.appendChild(subRegion);
    }

    this.slots.forEach((slot, deviceId) => {
        const setting = this.settings[deviceId] || {};
        if (setting.role === 'whiteboard') {
            mainRegion.appendChild(slot.element);
            slot.element.classList.add('main-region');
            slot.element.classList.remove('sub-region-item');
        } else {
            subRegion.appendChild(slot.element);
            slot.element.classList.add('sub-region-item');
            slot.element.classList.remove('main-region');
        }
    });
  }

  async render() {
    this.slots.forEach(slot => {
      if (slot.stream) {
        slot.stream.getTracks().forEach(track => track.stop());
      }
      if (slot.processor) {
        slot.processor.stop();
      }
    });
    this.slots.clear();
    this.container.innerHTML = '';
    for (const camera of this.cameras) {
      const slot = await this.createCameraSlot(camera);
      this.slots.set(camera.deviceId, slot);
      this.container.appendChild(slot.element);
    }
  }

  async createCameraSlot(camera) {
    const deviceId = camera.deviceId;
    const setting = this.settings[deviceId] || { role: 'person', customLabel: camera.label || 'Camera' };

    const element = document.createElement('div');
    element.className = 'camera-slot';
    element.innerHTML = `
      <div class="video-wrapper">
        <video autoplay playsinline muted></video>
        <canvas class="overlay-canvas"></canvas>
      </div>
      <div class="slot-controls">
        <div class="control-row">
          <select class="m3-select role-select">
            <option value="whiteboard" ${setting.role === 'whiteboard' ? 'selected' : ''}>Whiteboard</option>
            <option value="person" ${setting.role === 'person' ? 'selected' : ''}>Person</option>
          </select>
          <input type="text" class="m3-textfield label-input">
        </div>
        <div class="control-row whiteboard-only ${setting.role === 'whiteboard' ? '' : 'hidden'}">
            <button class="m3-button-filled copy-btn">
                <span class="material-symbols-outlined">content_copy</span>
                Capture
            </button>
        </div>
      </div>
    `;

    const video = element.querySelector('video');
    const canvas = element.querySelector('.overlay-canvas');
    element.querySelector('.label-input').value = setting.customLabel;
    let processor = null;
    let stream = null;

    try {
      stream = await startCamera(deviceId);
      video.srcObject = stream;

      if (setting.role === 'whiteboard') {
          processor = this.initProcessor(video, canvas, deviceId);
      }
    } catch (e) {
      console.error('Failed to start camera', e);
    }

    const roleSelect = element.querySelector('.role-select');
    roleSelect.addEventListener('change', async (e) => {
      const role = e.target.value;
      await saveCameraSetting(deviceId, { role });
      this.settings[deviceId] = { ...this.settings[deviceId], role };

      const wbControls = element.querySelector('.whiteboard-only');
      if (role === 'whiteboard') {
          wbControls.classList.remove('hidden');
          if (!processor) processor = this.initProcessor(video, canvas, deviceId);
      } else {
          wbControls.classList.add('hidden');
          if (processor) {
              processor.stop();
              processor = null;
          }
      }

      if (document.getElementById('app').classList.contains('layout-wide')) {
          this.reorganizeForWide();
      }
    });

    const copyBtn = element.querySelector('.copy-btn');
    copyBtn.addEventListener('click', async () => {
        if (processor) {
            try {
                const blob = await processor.capture();
                if (!blob) {
                    throw new Error('Failed to capture frame.');
                }
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                this.showSnackbar('クリップボードにコピーしました');
            } catch (err) {
                console.error('Clipboard copy failed:', err);
                this.showSnackbar('コピーに失敗しました: ' + err.message);
            }
        }
    });

    const labelInput = element.querySelector('.label-input');
    labelInput.addEventListener('blur', async (e) => {
      const customLabel = e.target.value;
      await saveCameraSetting(deviceId, { customLabel });
      this.settings[deviceId] = { ...this.settings[deviceId], customLabel };
    });

    return { element, video, processor, stream };
  }

  initProcessor(video, canvas, deviceId) {
      const pts = (this.settings[deviceId] && this.settings[deviceId].points) || [
          {x: 50, y: 50}, {x: 250, y: 50}, {x: 250, y: 150}, {x: 50, y: 150}
      ];
      const transformer = new PerspectiveTransformer(video, canvas, pts, (newPts) => {
          saveCameraSetting(deviceId, { points: newPts });
      });
      const stacker = new MedianStacker(video);

      let animationFrame;
      const loop = () => {
          transformer.draw();
          animationFrame = requestAnimationFrame(loop);
      };
      loop();

      return {
          stop: () => {
              cancelAnimationFrame(animationFrame);
              transformer.destroy();
              stacker.cleanup();
          },
          capture: async () => {
              const baseFrame = await transformer.getWarpedFrame();
              if (!baseFrame) return null;
              try {
                  const cleanFrame = await stacker.getMedianFrame(baseFrame);
                  return cleanFrame;
              } finally {
                  baseFrame.delete();
              }
          }
      };
  }

  showSnackbar(message) {
      const snackbar = document.getElementById('snackbar');
      const snackbarMsg = document.getElementById('snackbar-message');
      snackbarMsg.textContent = message;
      snackbar.classList.remove('hidden');

      if (this.snackbarTimeout) {
          clearTimeout(this.snackbarTimeout);
      }
      this.snackbarTimeout = setTimeout(() => {
          snackbar.classList.add('hidden');
          this.snackbarTimeout = null;
      }, 3000);
  }
}

const app = new App();
app.init();

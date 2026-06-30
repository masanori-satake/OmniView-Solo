import { getCameras, loadCameraSettings, saveCameraSetting, startCamera, loadGlobalSettings, saveGlobalSettings } from './camera.js';
import { PerspectiveTransformer, MedianStacker } from '../shared/js/processor.js';

class App {
  constructor() {
    this.container = document.getElementById('camera-container');
    this.cameras = [];
    this.settings = {};
    this.globalSettings = { interval: 5 };
    this.slots = new Map();
    this.slotOrder = []; // Array of deviceIds
    this.activeSlotIndex = -1;
    this.cycleTimeoutId = null;
    this.currentLayout = null;
    this.snackbarTimeout = null;
  }

  async init() {
    this.settings = await loadCameraSettings();
    this.globalSettings = await loadGlobalSettings();
    this.cameras = await getCameras();
    this.setupStartButton();
    this.setupResizeObserver();
    this.setupSettingsPanel();
  }

  setupStartButton() {
    const overlay = document.getElementById('initial-overlay');
    const btn = document.getElementById('start-btn');
    const selectionUI = document.getElementById('camera-selection-ui');
    btn.addEventListener('click', async () => {
      overlay.classList.add('hidden');
      selectionUI.classList.remove('hidden');
      await this.setupCameraSelection();
    });
  }

  setupSettingsPanel() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const overlay = document.getElementById('settings-overlay');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const intervalInput = document.getElementById('interval-input');
    const intervalUp = document.getElementById('interval-up');
    const intervalDown = document.getElementById('interval-down');

    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.remove('hidden');
        intervalInput.value = this.globalSettings.interval;
    });

    overlay.addEventListener('click', () => settingsPanel.classList.add('hidden'));

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
        });
    });

    const updateInterval = async (val) => {
        this.globalSettings.interval = Math.max(1, parseInt(val) || 1);
        intervalInput.value = this.globalSettings.interval;
        await saveGlobalSettings(this.globalSettings);
    };

    intervalInput.addEventListener('change', (e) => updateInterval(e.target.value));
    intervalUp.addEventListener('click', () => updateInterval(this.globalSettings.interval + 1));
    intervalDown.addEventListener('click', () => updateInterval(this.globalSettings.interval - 1));
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

    this.slotOrder.forEach((deviceId) => {
        const slot = this.slots.get(deviceId);
        if (!slot) return;
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

  async setupCameraSelection() {
    const dropdown = document.getElementById('camera-dropdown');
    const addBtn = document.getElementById('add-camera-btn');

    this.cameras = await getCameras();
    if (this.cameras.length > 0 && !this.cameras[0].label) {
        this.showSnackbar(
            'カメラの権限が必要です',
            '許可する',
            () => chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') })
        );
        window.addEventListener('focus', () => this.setupCameraSelection(), { once: true });
        return;
    }

    dropdown.innerHTML = '';
    this.cameras.forEach(camera => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        option.textContent = camera.label || `Camera ${camera.deviceId.slice(0, 4)}`;
        dropdown.appendChild(option);
    });

    addBtn.onclick = async () => {
        const deviceId = dropdown.value;
        if (this.slots.has(deviceId)) {
            this.showSnackbar('このカメラは既に追加されています');
            return;
        }
        const camera = this.cameras.find(c => c.deviceId === deviceId);
        await this.addCamera(camera);
    };
  }

  async addCamera(camera) {
    const slot = await this.createCameraSlot(camera);
    this.slots.set(camera.deviceId, slot);
    this.slotOrder.push(camera.deviceId);
    this.container.appendChild(slot.element);

    if (this.currentLayout === 'wide') {
        this.reorganizeForWide();
    }

    if (this.slotOrder.length === 1) {
        await this.startCycling();
    }
  }

  async startCycling() {
    if (this.cycleTimeoutId) clearTimeout(this.cycleTimeoutId);
    await this.nextCamera();
  }

  async nextCamera() {
    if (this.slotOrder.length === 0) return;

    // 1. Capture and stop current active slot
    if (this.activeSlotIndex !== -1) {
        const currentDeviceId = this.slotOrder[this.activeSlotIndex];
        const slot = this.slots.get(currentDeviceId);
        if (slot) {
            await this.deactivateSlot(slot);
        }
    }

    // 2. Advance index
    this.activeSlotIndex = (this.activeSlotIndex + 1) % this.slotOrder.length;

    // 3. Start next slot
    const nextDeviceId = this.slotOrder[this.activeSlotIndex];
    const nextSlot = this.slots.get(nextDeviceId);
    if (nextSlot) {
        await this.activateSlot(nextSlot, nextDeviceId);
    }

    // 4. Schedule next switch
    this.cycleTimeoutId = setTimeout(() => this.nextCamera(), this.globalSettings.interval * 1000);
  }

  async activateSlot(slot, deviceId) {
    try {
        const stream = await startCamera(deviceId);
        slot.stream = stream;
        slot.video.srcObject = stream;
        slot.element.classList.add('active');

        await new Promise((resolve) => {
            slot.video.onplaying = resolve;
            if (slot.video.readyState >= 3) resolve();
        });

        const setting = this.settings[deviceId] || {};
        if (setting.role === 'whiteboard') {
            slot.processor = this.initProcessor(slot.video, slot.canvas, deviceId);
        }
    } catch (e) {
        console.error('Failed to start camera:', e);
        this.showSnackbar(`カメラの起動に失敗しました: ${e.message}`);
    }
  }

  async deactivateSlot(slot) {
    // Capture current frame to freezeCanvas
    const { video, freezeCanvas, processor } = slot;
    if (video.videoWidth > 0) {
        freezeCanvas.width = video.videoWidth;
        freezeCanvas.height = video.videoHeight;
        const ctx = freezeCanvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
    }

    // Stop processor
    if (processor) {
        processor.stop();
        slot.processor = null;
    }

    // Stop stream
    if (slot.stream) {
        slot.stream.getTracks().forEach(track => track.stop());
        slot.stream = null;
    }
    video.srcObject = null;
    slot.element.classList.remove('active');
  }

  async moveCamera(deviceId, direction) {
    const index = this.slotOrder.indexOf(deviceId);
    if (index === -1) return;

    const oldActiveDeviceId = this.slotOrder[this.activeSlotIndex];

    if (direction === 'up' && index > 0) {
        [this.slotOrder[index], this.slotOrder[index - 1]] = [this.slotOrder[index - 1], this.slotOrder[index]];
    } else if (direction === 'down' && index < this.slotOrder.length - 1) {
        [this.slotOrder[index], this.slotOrder[index + 1]] = [this.slotOrder[index + 1], this.slotOrder[index]];
    } else {
        return;
    }

    // Update index of active slot if it moved
    if (oldActiveDeviceId) {
        this.activeSlotIndex = this.slotOrder.indexOf(oldActiveDeviceId);
    }

    // Re-render order
    if (this.currentLayout === 'wide') {
        this.reorganizeForWide();
    } else {
        this.slotOrder.forEach(id => {
            const slot = this.slots.get(id);
            if (slot) this.container.appendChild(slot.element);
        });
    }
  }

  async createCameraSlot(camera) {
    const deviceId = camera.deviceId;
    const savedSetting = this.settings[deviceId] || {};
    const setting = {
      role: savedSetting.role || 'person',
      customLabel: savedSetting.customLabel || camera.label || 'Camera'
    };

    const element = document.createElement('div');
    element.className = 'camera-slot';
    element.innerHTML = `
      <div class="video-wrapper">
        <video autoplay playsinline muted></video>
        <canvas class="freeze-canvas"></canvas>
        <canvas class="overlay-canvas"></canvas>
      </div>
      <div class="slot-controls">
        <div class="control-row">
          <div class="slot-move-controls">
              <button class="m3-icon-button-small move-up-btn" title="上へ移動">
                  <span class="material-symbols-outlined">arrow_upward</span>
              </button>
              <button class="m3-icon-button-small move-down-btn" title="下へ移動">
                  <span class="material-symbols-outlined">arrow_downward</span>
              </button>
          </div>
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
    const freezeCanvas = element.querySelector('.freeze-canvas');
    element.querySelector('.label-input').value = setting.customLabel;

    element.querySelector('.move-up-btn').onclick = () => this.moveCamera(deviceId, 'up');
    element.querySelector('.move-down-btn').onclick = () => this.moveCamera(deviceId, 'down');

    const roleSelect = element.querySelector('.role-select');
    roleSelect.addEventListener('change', async (e) => {
      const role = e.target.value;
      await saveCameraSetting(deviceId, { role });
      this.settings[deviceId] = { ...this.settings[deviceId], role };

      const wbControls = element.querySelector('.whiteboard-only');
      if (role === 'whiteboard') {
          wbControls.classList.remove('hidden');
      } else {
          wbControls.classList.add('hidden');
      }

      if (this.currentLayout === 'wide') {
          this.reorganizeForWide();
      }
    });

    const copyBtn = element.querySelector('.copy-btn');
    copyBtn.addEventListener('click', async () => {
        const slot = this.slots.get(deviceId);
        if (slot && slot.processor) {
            try {
                const blob = await slot.processor.capture();
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

    return { element, video, canvas, freezeCanvas, processor: null, stream: null };
  }

  initProcessor(video, canvas, deviceId) {
      const pts = (this.settings[deviceId] && this.settings[deviceId].points) || [
          {x: 20, y: 20}, {x: 80, y: 20}, {x: 80, y: 80}, {x: 20, y: 80}
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
              return await stacker.getMedianFrame(transformer);
          }
      };
  }

  showSnackbar(message, actionLabel = null, actionCallback = null) {
      const snackbar = document.getElementById('snackbar');
      const snackbarMsg = document.getElementById('snackbar-message');
      snackbarMsg.textContent = message;

      // Clear existing action button
      const oldBtn = snackbar.querySelector('.snackbar-action');
      if (oldBtn) oldBtn.remove();

      if (actionLabel && actionCallback) {
          const btn = document.createElement('button');
          btn.className = 'snackbar-action';
          btn.textContent = actionLabel;
          btn.onclick = () => {
              actionCallback();
              snackbar.classList.add('hidden');
          };
          snackbar.appendChild(btn);
      }

      snackbar.classList.remove('hidden');

      if (this.snackbarTimeout) {
          clearTimeout(this.snackbarTimeout);
      }
      const duration = actionLabel ? 10000 : 3000;
      this.snackbarTimeout = setTimeout(() => {
          snackbar.classList.add('hidden');
          this.snackbarTimeout = null;
      }, duration);
  }
}

const app = new App();
app.init();

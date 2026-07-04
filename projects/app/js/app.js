import { getCameras, loadCameraSettings, saveCameraSetting, startCamera, loadGlobalSettings, saveGlobalSettings, saveSessionState, loadSessionState, RESOLUTION_LEVELS } from './camera.js';
import { WhiteboardProcessor } from '../shared/js/processor.js';

class App {
  constructor() {
    this.container = document.getElementById('camera-container');
    this.cameras = [];
    this.settings = {};
    this.globalSettings = { interval: 5, cyclingEnabled: true };
    this.slots = new Map();
    this.slotOrder = []; // Array of deviceIds
    this.activeSlotIndex = -1;
    this.cycleTimeoutId = null;
    this.cycleCount = 0;
    this.currentLayout = null;
    this.snackbarTimeout = null;
    this.switchRequestCount = 0;
    this.cameraInfoCache = new Map();
    this.logs = [];
  }

  async init() {
    this.settings = await loadCameraSettings();
    this.globalSettings = await loadGlobalSettings();
    this.addLog(`Global settings loaded: cyclingEnabled=${this.globalSettings.cyclingEnabled}, interval=${this.globalSettings.interval}`);
    this.cameras = await getCameras();

    this.setupStartButton();
    this.setupResizeObserver();
    this.setupSettingsPanel();
    this.setupAddCameraButton();

    // Log initial device list
    this.addLog('--- App initialized ---');
    this.logDeviceList();
    navigator.mediaDevices.addEventListener('devicechange', () => {
        this.addLog('Device configuration changed');
        this.logDeviceList();
    });

    // Restore session state
    const session = await loadSessionState();
    if (session && session.slotOrder && session.slotOrder.length > 0) {
        const connectedSlotOrder = [];
        // Recreate slots
        for (const deviceId of session.slotOrder) {
            const camera = this.cameras.find(c => c.deviceId === deviceId);
            if (camera) {
                const slot = await this.createCameraSlot(camera);
                this.slots.set(deviceId, slot);
                this.container.appendChild(slot.element);
                connectedSlotOrder.push(deviceId);
            }
        }

        if (connectedSlotOrder.length > 0) {
            document.getElementById('initial-overlay').classList.add('hidden');
            this.slotOrder = connectedSlotOrder;

            if (this.currentLayout === 'wide') {
                this.reorganizeForWide();
            }

            const activeIndex = (session.activeSlotIndex >= 0 && session.activeSlotIndex < this.slotOrder.length)
                ? session.activeSlotIndex
                : 0;

            if (this.globalSettings.cyclingEnabled) {
                await this.switchActiveCamera(this.slotOrder[activeIndex]);
            } else {
                this.activeSlotIndex = activeIndex;
                await this.activateAllCameras();
            }
        }
    }
  }

  setupStartButton() {
    const overlay = document.getElementById('initial-overlay');
    const btn = document.getElementById('start-btn');
    btn.addEventListener('click', async () => {
      overlay.classList.add('hidden');
      await this.showCameraDialog();
    });
  }

  setupAddCameraButton() {
      const addBtn = document.getElementById('add-camera-nav-btn');
      addBtn.addEventListener('click', () => this.showCameraDialog());
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
    const cyclingSwitch = document.getElementById('cycling-switch');
    const copyLogsBtn = document.getElementById('copy-logs-btn');
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    const exportBtn = document.getElementById('export-btn');
    const importBtnTrigger = document.getElementById('import-btn-trigger');
    const importInput = document.getElementById('import-input');
    const importModeSelect = document.getElementById('import-mode-select');

    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.remove('hidden');
        intervalInput.value = this.globalSettings.interval;
        cyclingSwitch.checked = this.globalSettings.cyclingEnabled !== false;
        cyclingSwitch.disabled = this.slotOrder.length < 2;
        this.updateCameraInfoTab();
        this.renderLogs();
    });

    overlay.addEventListener('click', () => settingsPanel.classList.add('hidden'));

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
            if (btn.dataset.tab === 'camera-info') {
                this.updateCameraInfoTab();
            }
            if (btn.dataset.tab === 'logs') {
                this.renderLogs();
            }
        });
    });

    const infoCameraSelect = document.getElementById('info-camera-select');
    infoCameraSelect.addEventListener('change', () => this.displayCameraInfo(infoCameraSelect.value));

    copyLogsBtn.addEventListener('click', async () => {
        const text = this.logs.map(l => `[${l.time}] ${l.message}`).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            this.showSnackbar('ログをコピーしました');
        } catch (e) {
            this.showSnackbar('コピーに失敗しました');
        }
    });

    clearLogsBtn.addEventListener('click', () => {
        this.logs = [];
        this.renderLogs();
    });

    const updateInterval = async (val) => {
        this.globalSettings.interval = Math.max(1, parseInt(val) || 1);
        intervalInput.value = this.globalSettings.interval;
        this.addLog(`Interval changed to ${this.globalSettings.interval}s`);
        await saveGlobalSettings(this.globalSettings);
    };

    intervalInput.addEventListener('change', (e) => updateInterval(e.target.value));
    intervalUp.addEventListener('click', () => updateInterval(this.globalSettings.interval + 1));
    intervalDown.addEventListener('click', () => updateInterval(this.globalSettings.interval - 1));

    cyclingSwitch.addEventListener('change', async (e) => {
        this.globalSettings.cyclingEnabled = e.target.checked;
        this.addLog(`Cycling enabled: ${this.globalSettings.cyclingEnabled}`);
        await saveGlobalSettings(this.globalSettings);
        if (this.globalSettings.cyclingEnabled) {
            this.startCycling();
        } else {
            this.cycleCount++; // Invalidate pending nextCamera callbacks
            if (this.cycleTimeoutId) {
                clearTimeout(this.cycleTimeoutId);
                this.cycleTimeoutId = null;
            }
            if (this.slotOrder.length > 1) {
                await this.activateMultipleCameras();
            } else {
                await this.activateAllCameras();
            }
        }
    });

    exportBtn.addEventListener('click', async () => {
        const settingsToExport = await loadCameraSettings();
        // Record current mode as defaultRole for export
        for (const deviceId of Object.keys(settingsToExport)) {
            const slot = this.slots.get(deviceId);
            if (slot) {
                const role = slot.element.querySelector('.role-switch').checked ? 'whiteboard' : 'person';
                settingsToExport[deviceId].defaultRole = role;
            }
        }

        const exportData = {
            version: 1,
            global_settings: this.globalSettings,
            camera_settings: settingsToExport
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `omniview_settings_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.addLog('Settings exported successfully');
    });

    importBtnTrigger.addEventListener('click', () => importInput.click());

    importInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                const mode = importModeSelect.value;
                this.addLog(`Importing settings (mode: ${mode})`);

                if (data.global_settings) {
                    this.globalSettings = { ...this.globalSettings, ...data.global_settings };
                    await saveGlobalSettings(this.globalSettings);
                    intervalInput.value = this.globalSettings.interval;

                    if (cyclingSwitch.checked !== this.globalSettings.cyclingEnabled) {
                        cyclingSwitch.checked = this.globalSettings.cyclingEnabled;
                        cyclingSwitch.dispatchEvent(new Event('change'));
                    } else if (this.globalSettings.cyclingEnabled) {
                        this.startCycling();
                    }
                }

                if (data.camera_settings) {
                    let currentSettings = mode === 'overwrite' ? {} : await loadCameraSettings();

                    for (const [deviceId, imported] of Object.entries(data.camera_settings)) {
                        if (mode === 'overwrite') {
                            currentSettings[deviceId] = imported;
                        } else if (mode === 'add') {
                            if (!currentSettings[deviceId]) {
                                currentSettings[deviceId] = imported;
                            }
                        }
                    }
                    await chrome.storage.local.set({ camera_settings: currentSettings });
                    this.settings = currentSettings;

                    // Refresh existing slots with new settings if applicable
                    for (const [deviceId, slot] of this.slots.entries()) {
                        const s = this.settings[deviceId];
                        if (s) {
                            if (s.customLabel) {
                                slot.element.querySelector('.label-input').value = s.customLabel;
                            }
                            if (s.defaultRole) {
                                const roleSwitch = slot.element.querySelector('.role-switch');
                                const currentRole = roleSwitch.checked ? 'whiteboard' : 'person';
                                if (currentRole !== s.defaultRole) {
                                    roleSwitch.checked = s.defaultRole === 'whiteboard';
                                    roleSwitch.dispatchEvent(new Event('change'));
                                }
                            }
                        }
                    }
                }

                this.showSnackbar('設定をインポートしました。反映するには、必要に応じてカメラを再起動してください。');
                this.addLog('Settings imported successfully');
            } catch (err) {
                this.addLog('Import failed: ' + err.message, true);
                this.showSnackbar('インポートに失敗しました: ' + err.message);
            }
            importInput.value = '';
        };
        reader.readAsText(file);
    });
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
    this.slotOrder.forEach(deviceId => {
        const slot = this.slots.get(deviceId);
        if (slot) {
            this.container.appendChild(slot.element);
            slot.element.classList.remove('main-region', 'sub-region-item');
        }
    });
    const mr = this.container.querySelector('.main-region');
    if (mr) mr.remove();
    const sr = this.container.querySelector('.sub-region');
    if (sr) sr.remove();
  }

  reorganizeForWide() {
    this.slotOrder.forEach((deviceId) => {
        const slot = this.slots.get(deviceId);
        if (slot) this.container.appendChild(slot.element);
    });
  }

  async showCameraDialog() {
    const dialog = document.getElementById('camera-dialog');
    const overlay = document.getElementById('camera-dialog-overlay');
    const listContainer = document.getElementById('camera-list-container');
    const cancelBtn = document.getElementById('dialog-cancel-btn');
    const addBtn = document.getElementById('dialog-add-btn');

    this.cameras = await getCameras();
    if (this.cameras.length > 0 && !this.cameras[0].label) {
        this.showSnackbar(
            'カメラの権限が必要です',
            '許可する',
            () => chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') })
        );
        window.addEventListener('focus', () => this.showCameraDialog(), { once: true });
        return;
    }

    // Refresh settings to get potential custom labels for disconnected cameras
    this.settings = await loadCameraSettings();

    listContainer.innerHTML = '';

    // "All Cameras" checkbox
    const allAdded = this.cameras.every(camera => this.slots.has(camera.deviceId));
    const selectAllItem = document.createElement('label');
    selectAllItem.className = `camera-list-item ${allAdded ? 'disabled' : ''}`;
    selectAllItem.innerHTML = `
        <input type="checkbox" id="select-all-cameras" ${allAdded ? 'checked disabled' : ''}>
        <span style="font-weight: bold;">全てのカメラ</span>
    `;
    listContainer.appendChild(selectAllItem);

    this.cameras.forEach(camera => {
        const isAdded = this.slots.has(camera.deviceId);
        const item = document.createElement('label');
        item.className = `camera-list-item ${isAdded ? 'disabled' : ''}`;

        const savedSetting = this.settings[camera.deviceId];
        const defaultLabel = `${camera.label || 'Camera'} (${camera.deviceId.slice(0, 4)})`;
        const displayName = (savedSetting && savedSetting.customLabel) ? savedSetting.customLabel : defaultLabel;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'camera-checkbox';
        checkbox.value = camera.deviceId;
        if (isAdded) {
            checkbox.checked = true;
            checkbox.disabled = true;
        }

        const nameSpan = document.createElement('span');
        nameSpan.textContent = displayName;

        item.appendChild(checkbox);
        item.appendChild(nameSpan);
        listContainer.appendChild(item);
    });

    const selectAllCheckbox = document.getElementById('select-all-cameras');
    const cameraCheckboxes = listContainer.querySelectorAll('.camera-checkbox:not(:disabled)');

    selectAllCheckbox.addEventListener('change', (e) => {
        cameraCheckboxes.forEach(cb => {
            cb.checked = e.target.checked;
        });
    });

    cameraCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            const allChecked = Array.from(cameraCheckboxes).every(c => c.checked);
            selectAllCheckbox.checked = allChecked;
        });
    });

    dialog.classList.remove('hidden');

    const closeDialog = () => dialog.classList.add('hidden');
    overlay.onclick = closeDialog;
    cancelBtn.onclick = closeDialog;

    addBtn.onclick = async () => {
        const checkedBoxes = listContainer.querySelectorAll('.camera-checkbox:checked:not(:disabled)');
        const camerasToAdd = [];
        for (const box of checkedBoxes) {
            const deviceId = box.value;
            const camera = this.cameras.find(c => c.deviceId === deviceId);
            if (camera) {
                camerasToAdd.push(camera);
            }
        }

        if (camerasToAdd.length > 0) {
            this.addLog(`--- Adding ${camerasToAdd.length} cameras ---`);
            for (const camera of camerasToAdd) {
                this.addLog(`Adding camera: ${camera.label} (${camera.deviceId.slice(0, 8)})`);
                const slot = await this.createCameraSlot(camera);
                this.slots.set(camera.deviceId, slot);
                this.slotOrder.push(camera.deviceId);
                this.container.appendChild(slot.element);
            }

            const cyclingSwitch = document.getElementById('cycling-switch');
            if (cyclingSwitch) cyclingSwitch.disabled = this.slotOrder.length < 2;

            if (this.currentLayout === 'wide') {
                this.reorganizeForWide();
            }

            if (this.globalSettings.cyclingEnabled) {
                const lastCamera = camerasToAdd[camerasToAdd.length - 1];
                await this.switchActiveCamera(lastCamera.deviceId);
            } else {
                await this.activateAllCameras();
            }
            saveSessionState(this.slotOrder, this.activeSlotIndex);
        }
        closeDialog();
    };
  }

  updateCameraInfoTab() {
    const infoCameraSelect = document.getElementById('info-camera-select');
    const currentValue = infoCameraSelect.value;
    infoCameraSelect.innerHTML = '';

    if (this.slotOrder.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'カメラなし';
        infoCameraSelect.appendChild(option);
        this.displayCameraInfo(null);
        return;
    }

    this.slotOrder.forEach(deviceId => {
        const slot = this.slots.get(deviceId);
        if (slot) {
            const option = document.createElement('option');
            option.value = deviceId;
            option.textContent = slot.element.querySelector('.label-input').value;
            infoCameraSelect.appendChild(option);
        }
    });

    if (this.slots.has(currentValue)) {
        infoCameraSelect.value = currentValue;
    }
    this.displayCameraInfo(infoCameraSelect.value);
  }

  addLog(message, isError = false) {
    const now = new Date();
    const time = now.toLocaleTimeString('ja-JP', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    this.logs.push({ time, message, isError });
    if (this.logs.length > 500) this.logs.shift();
    console.log(`[${time}] ${message}`);
    this.renderLogs();
  }

  async logDeviceList() {
      const devices = await getCameras();
      this.addLog(`Connected devices: ${devices.length}`);
      devices.forEach(d => {
          this.addLog(`- [${d.deviceId.slice(0, 8)}] ${d.label}`);
      });
  }

  renderLogs() {
    const container = document.getElementById('logs-container');
    if (!container) return;

    container.innerHTML = '';
    this.logs.forEach(log => {
        const div = document.createElement('div');
        div.className = 'log-entry';
        if (log.isError) div.classList.add('log-error');
        if (log.message.startsWith('---')) div.classList.add('log-separator');

        if (log.message.startsWith('---')) {
            div.innerHTML = `<div class="separator-line"></div><div class="separator-text">${log.message}</div><div class="separator-line"></div>`;
        } else {
            div.innerHTML = `<span class="log-time">${log.time}</span>${log.message}`;
        }
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
  }

  async displayCameraInfo(deviceId) {
    const infoCameraSelect = document.getElementById('info-camera-select');
    const shouldRender = !infoCameraSelect || infoCameraSelect.value === deviceId;
    const listContainer = document.getElementById('camera-capabilities-list');

    if (shouldRender && listContainer) {
        listContainer.innerHTML = '';
    }

    const slot = this.slots.get(deviceId);
    let info = null;

    if (slot && slot.stream) {
        const track = slot.stream.getVideoTracks()[0];
        if (track) {
            const capabilities = track.getCapabilities ? track.getCapabilities() : {};
            const settings = track.getSettings ? track.getSettings() : {};
            info = {
                'デバイスID': settings.deviceId || 'N/A',
                '解像度': (settings.width && settings.height) ? `${settings.width}x${settings.height}` : 'N/A',
                'フレームレート': settings.frameRate ? settings.frameRate.toFixed(2) + ' fps' : 'N/A',
                'アスペクト比': settings.aspectRatio ? settings.aspectRatio.toFixed(2) : 'N/A',
                'フォーカスモード': (capabilities.focusMode ? capabilities.focusMode.join(', ') : 'N/A') + ` (現在: ${settings.focusMode || 'N/A'})`,
                'フォーカス距離': settings.focusDistance !== undefined ? settings.focusDistance : 'N/A',
                '露出モード': (capabilities.exposureMode ? capabilities.exposureMode.join(', ') : 'N/A') + ` (現在: ${settings.exposureMode || 'N/A'})`,
                '露出時間': settings.exposureTime !== undefined ? settings.exposureTime : 'N/A',
                'ホワイトバランスモード': (capabilities.whiteBalanceMode ? capabilities.whiteBalanceMode.join(', ') : 'N/A') + ` (現在: ${settings.whiteBalanceMode || 'N/A'})`,
                '色温度': settings.colorTemperature !== undefined ? settings.colorTemperature : 'N/A',
                'ISO': settings.iso !== undefined ? settings.iso : 'N/A',
                '明るさ': settings.brightness !== undefined ? settings.brightness : 'N/A',
                'コントラスト': settings.contrast !== undefined ? settings.contrast : 'N/A',
                '彩度': settings.saturation !== undefined ? settings.saturation : 'N/A',
                'シャープネス': settings.sharpness !== undefined ? settings.sharpness : 'N/A'
            };
            this.cameraInfoCache.set(deviceId, info);
        }
    }

    if (!info) {
        info = this.cameraInfoCache.get(deviceId);
    }

    if (!info) {
        if (shouldRender && listContainer) {
            listContainer.innerHTML = '<p>ストリームが有効ではなく、キャッシュもありません。</p>';
        }
        return;
    }

    if (!shouldRender) return;

    for (const [label, value] of Object.entries(info)) {
        const item = document.createElement('div');
        item.className = 'info-item';
        item.innerHTML = `
            <span class="info-label">${label}</span>
            <span class="info-value">${value}</span>
        `;
        listContainer.appendChild(item);
    }
  }

  async switchActiveCamera(deviceId) {
    this.switchRequestCount++;
    const currentRequest = this.switchRequestCount;

    if (this.cycleTimeoutId) {
        clearTimeout(this.cycleTimeoutId);
        this.cycleTimeoutId = null;
    }

    const index = this.slotOrder.indexOf(deviceId);
    if (index === -1) return;

    if (this.globalSettings.cyclingEnabled) {
        if (this.activeSlotIndex !== -1 && this.activeSlotIndex !== index) {
            const currentDeviceId = this.slotOrder[this.activeSlotIndex];
            const currentSlot = this.slots.get(currentDeviceId);
            if (currentSlot) {
                await this.deactivateSlot(currentSlot);
                // Hardware release delay
                await new Promise(r => setTimeout(r, 750));
            }
        }
    } else {
        // When cycling is OFF, multiple cameras might be active.
        // Add a small delay if other slots exist and the target camera is not yet active to avoid hardware contention.
        const slot = this.slots.get(deviceId);
        if (this.slotOrder.length > 1 && slot && !slot.stream) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Abort if a newer request has started
    if (this.switchRequestCount !== currentRequest) return;

    this.activeSlotIndex = index;
    const slot = this.slots.get(deviceId);
    if (slot) {
        if (!slot.stream) {
            await this.activateSlot(slot, deviceId);
        }
    }

    if (this.switchRequestCount !== currentRequest) return;

    if (this.globalSettings.cyclingEnabled) {
        this.startCycling();
    }

    saveSessionState(this.slotOrder, this.activeSlotIndex);
  }

  async activateAllCameras() {
    if (this.globalSettings.cyclingEnabled) return;

    if (this.slotOrder.length > 1) {
        await this.activateMultipleCameras();
        return;
    }

    this.addLog(`Activating all cameras (cyclingEnabled=${this.globalSettings.cyclingEnabled})`);
    for (const deviceId of this.slotOrder) {
        const slot = this.slots.get(deviceId);
        if (slot && !slot.stream) {
            await this.activateSlot(slot, deviceId);
            // Sequential initialization with a small delay to avoid contention
            await new Promise(r => setTimeout(r, 1000));
        }
    }
  }

  async activateMultipleCameras() {
    const initialOrder = [...this.slotOrder];
    this.addLog(`--- Starting multi-camera activation search (Cameras: ${initialOrder.length}) ---`);

    const isStateChanged = () => {
        return this.globalSettings.cyclingEnabled ||
            this.slotOrder.length !== initialOrder.length ||
            !this.slotOrder.every((id, idx) => id === initialOrder[idx]);
    };

    for (let levelIdx = 0; levelIdx < RESOLUTION_LEVELS.length; levelIdx++) {
        if (isStateChanged()) {
            this.addLog('Multi-camera activation search aborted: state changed');
            return false;
        }

        const resolution = RESOLUTION_LEVELS[levelIdx];
        this.addLog(`Attempting activation at resolution level: ${resolution.label}`);

        // 1. Stop all current streams to release bandwidth
        for (const deviceId of initialOrder) {
            const slot = this.slots.get(deviceId);
            if (slot) await this.deactivateSlot(slot);
        }

        // Wait a bit for hardware release
        await new Promise(r => setTimeout(r, 1000));

        let allSuccessful = true;
        const activatedSlots = [];

        // 2. Try to activate each camera sequentially
        for (const deviceId of initialOrder) {
            if (isStateChanged()) {
                this.addLog('Multi-camera activation search aborted: state changed');
                for (const slot of activatedSlots) {
                    await this.deactivateSlot(slot);
                }
                return false;
            }

            const slot = this.slots.get(deviceId);
            if (slot) {
                const success = await this.activateSlot(slot, deviceId, resolution);
                if (success) {
                    activatedSlots.push(slot);
                    // Small delay between activations to mitigate spikes
                    await new Promise(r => setTimeout(r, 1000));
                } else {
                    this.addLog(`Failed to activate ${deviceId.slice(0, 8)} at ${resolution.label}`);
                    allSuccessful = false;
                    break;
                }
            }
        }

        if (isStateChanged()) {
            this.addLog('Multi-camera activation search aborted: state changed');
            for (const slot of activatedSlots) {
                await this.deactivateSlot(slot);
            }
            return false;
        }

        if (allSuccessful) {
            this.addLog(`Successfully activated all cameras at ${resolution.label}`);
            if (levelIdx > 0) {
                this.showSnackbar(`帯域確保のため、解像度を ${resolution.label} に下げて接続しました`);
            }
            return true;
        }

        // If not all successful, clean up before trying next level
        for (const slot of activatedSlots) {
            await this.deactivateSlot(slot);
        }
    }

    this.addLog('Failed to activate all cameras even at the lowest resolution level. Falling back to single camera mode.', true);
    this.showSnackbar('すべてのカメラを同時に起動できませんでした。帯域不足のため、1台のみ表示します。');

    if (isStateChanged()) return false;

    if (this.slotOrder.length > 0) {
        const fallbackIdx = (this.activeSlotIndex >= 0 && this.activeSlotIndex < this.slotOrder.length) ? this.activeSlotIndex : 0;
        this.activeSlotIndex = fallbackIdx;
        const fallbackDeviceId = this.slotOrder[fallbackIdx];
        const slot = this.slots.get(fallbackDeviceId);
        if (slot) {
            await this.activateSlot(slot, fallbackDeviceId);
            saveSessionState(this.slotOrder, this.activeSlotIndex);
        }
    }
    return false;
  }

  async addCamera(camera) {
    const slot = await this.createCameraSlot(camera);
    this.slots.set(camera.deviceId, slot);
    this.slotOrder.push(camera.deviceId);
    this.container.appendChild(slot.element);

    const cyclingSwitch = document.getElementById('cycling-switch');
    if (cyclingSwitch) cyclingSwitch.disabled = this.slotOrder.length < 2;

    if (this.currentLayout === 'wide') {
        this.reorganizeForWide();
    }

    await this.switchActiveCamera(camera.deviceId);
    saveSessionState(this.slotOrder, this.activeSlotIndex);
  }

  async startCycling() {
    if (this.cycleTimeoutId) clearTimeout(this.cycleTimeoutId);
    if (this.slotOrder.length < 2) return;
    const interval = this.globalSettings.interval || 5;
    this.cycleTimeoutId = setTimeout(() => this.nextCamera(), interval * 1000);
  }

  async nextCamera() {
    if (this.slotOrder.length < 2) return;
    if (!this.globalSettings.cyclingEnabled && this.activeSlotIndex !== -1) {
        return;
    }

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
    this.cycleCount++;
    const currentCycle = this.cycleCount;

    // 3. Small hardware delay to ensure device is released before next acquisition
    if (this.slotOrder.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 750));
    }

    // Abort if a new cycle was started during the delay
    if (this.cycleCount !== currentCycle) {
        return;
    }

    // 4. Start next slot
    const nextDeviceId = this.slotOrder[this.activeSlotIndex];
    const nextSlot = this.slots.get(nextDeviceId);
    if (nextSlot) {
        await this.activateSlot(nextSlot, nextDeviceId);
    }

    // 5. Schedule next switch
    this.cycleTimeoutId = setTimeout(() => this.nextCamera(), this.globalSettings.interval * 1000);
  }

  async activateSlot(slot, deviceId, resolution = null) {
    if (slot.isActivating) {
        this.addLog(`Skipping activation for ${deviceId.slice(0, 8)} - already in progress`);
        return false;
    }
    slot.isActivating = true;

    const maxRetries = resolution ? 1 : 3; // No retries during multi-camera search
    try {
        for (let i = 0; i < maxRetries; i++) {
            // Check if camera is still needed
            const isStillNeeded = this.globalSettings.cyclingEnabled
                ? (this.slotOrder[this.activeSlotIndex] === deviceId)
                : this.slotOrder.includes(deviceId);
            if (!isStillNeeded) {
                this.addLog(`Activation aborted for ${deviceId.slice(0, 8)} - no longer needed`);
                return false;
            }

            const targetRes = resolution || (i === maxRetries - 1 ? RESOLUTION_LEVELS[RESOLUTION_LEVELS.length - 1] : RESOLUTION_LEVELS[0]);
            this.addLog(`Activating camera ${deviceId.slice(0, 8)} (Attempt ${i + 1}/${maxRetries}) at ${targetRes.label}`);

            try {
                const stream = await startCamera(deviceId, targetRes);

                // Check if still needed after async acquisition to prevent leaks
                const isStillNeededPost = this.globalSettings.cyclingEnabled
                    ? (this.slotOrder[this.activeSlotIndex] === deviceId)
                    : this.slotOrder.includes(deviceId);
                if (!isStillNeededPost) {
                    this.addLog(`Activation aborted post-acquisition for ${deviceId.slice(0, 8)}`);
                    stream.getTracks().forEach(track => track.stop());
                    return false;
                }

                slot.stream = stream;
                slot.video.srcObject = stream;
                slot.element.classList.add('active');

                await new Promise((resolve) => {
                const timeoutId = setTimeout(() => {
                    cleanup();
                    resolve();
                }, 5000);
                const cleanup = () => {
                    clearTimeout(timeoutId);
                    slot.video.removeEventListener('playing', onPlaying);
                    slot.video.removeEventListener('error', onError);
                };
                const onPlaying = () => {
                    cleanup();
                    resolve();
                };
                const onError = () => {
                    cleanup();
                    resolve();
                };
                slot.video.addEventListener('playing', onPlaying);
                slot.video.addEventListener('error', onError);
                if (slot.video.readyState >= 3) {
                    onPlaying();
                }
            });

                const setting = this.settings[deviceId] || {};
                const role = setting.defaultRole || 'person';
                if (role === 'whiteboard') {
                    slot.processor = this.initProcessor(slot.video, slot.canvas, slot.processedCanvas, deviceId);
                }
                const track = stream.getVideoTracks()[0];
                const settings = track ? track.getSettings() : {};
                this.addLog(`Camera ${deviceId.slice(0, 8)} activated successfully. Obtained: ${settings.width}x${settings.height}@${settings.frameRate?.toFixed(2)}fps`);

                // Update cache
                this.displayCameraInfo(deviceId);

                // Restore lock state if saved
                if (setting.mediaSettingsFixed) {
                    const success = await this.applyMediaLock(track, true);
                    if (success) {
                        const lockBtn = slot.element.querySelector('.lock-btn');
                        if (lockBtn) {
                            lockBtn.classList.add('locked');
                            lockBtn.querySelector('.material-symbols-outlined').textContent = 'lock';
                        }
                    }
                }

                return true; // Success
            } catch (e) {
                const errorDetail = `${e.name}: ${e.message}`;
                this.addLog(`Attempt ${i + 1} failed for ${deviceId.slice(0, 8)}: ${errorDetail}`, true);

                // Cleanup partial stream
                if (slot.stream) {
                    slot.stream.getTracks().forEach(track => track.stop());
                    slot.stream = null;
                }
                slot.video.srcObject = null;
                slot.element.classList.remove('active');

                if (i < maxRetries - 1) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                const suffix = (deviceId || 'unknown').slice(0, 4);
                if (!resolution) {
                    this.showSnackbar(`カメラの起動に失敗しました (${suffix}): ${e.name} - ${e.message}`);
                }
            }
        }
    } finally {
        slot.isActivating = false;
    }
    return false;
  }

  async deactivateSlot(slot) {
    // Capture current frame to freezeCanvas
    const { video, freezeCanvas, canvas, processor } = slot;
    if (processor) {
        const warpedData = await processor.stacker.getWarpedCurrentFrame(processor.transformer);
        if (warpedData) {
            freezeCanvas.width = warpedData.width;
            freezeCanvas.height = warpedData.height;
            const ctx = freezeCanvas.getContext('2d');
            ctx.putImageData(warpedData, 0, 0);
        }
    } else if (video.videoWidth > 0) {
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

    // Clear overlay canvas and reset Set button
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const setBtn = slot.element.querySelector('.set-btn');
    if (setBtn) setBtn.classList.remove('active');

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
        this.addLog(`Moving camera ${deviceId.slice(0, 8)} up`);
        [this.slotOrder[index], this.slotOrder[index - 1]] = [this.slotOrder[index - 1], this.slotOrder[index]];
    } else if (direction === 'down' && index < this.slotOrder.length - 1) {
        this.addLog(`Moving camera ${deviceId.slice(0, 8)} down`);
        [this.slotOrder[index], this.slotOrder[index + 1]] = [this.slotOrder[index + 1], this.slotOrder[index]];
    } else {
        return;
    }

    // Update index of active slot if it moved
    if (oldActiveDeviceId) {
        this.activeSlotIndex = this.slotOrder.indexOf(oldActiveDeviceId);
    }

    saveSessionState(this.slotOrder, this.activeSlotIndex);

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
    const defaultLabel = (camera.label || 'Camera') + ` (${deviceId.slice(0, 4)})`;
    const setting = {
      role: savedSetting.defaultRole || 'person',
      customLabel: savedSetting.customLabel || defaultLabel
    };

    const element = document.createElement('div');
    element.className = 'camera-slot';
    element.innerHTML = `
      <div class="video-wrapper">
        <video autoplay playsinline muted></video>
        <canvas class="processed-canvas whiteboard-only ${setting.role === 'whiteboard' ? '' : 'hidden'}"></canvas>
        <canvas class="freeze-canvas"></canvas>
        <canvas class="overlay-canvas"></canvas>
        <div class="adjustment-panel">
            <div class="adj-row">
                <span class="adj-label">写り込み排除</span>
                <div class="adj-control">
                    <button class="m3-button-outlined-small occlusion-btn-adj fixed-width-btn">OFF</button>
                </div>
            </div>
            <div class="adj-row">
                <span class="adj-label">強調</span>
                <div class="adj-control adj-group">
                    <button class="m3-button-outlined-small enhance-btn-adj" data-mode="none">ORIG</button>
                    <button class="m3-button-outlined-small enhance-btn-adj" data-mode="bw">B&W</button>
                    <button class="m3-button-outlined-small enhance-btn-adj" data-mode="color">CLR</button>
                </div>
            </div>
            <div class="adj-row">
                <span class="adj-label">しきい値</span>
                <div class="adj-control">
                    <input type="range" class="m3-slider threshold-slider" min="0" max="100" value="45">
                </div>
            </div>
        </div>
        <div class="video-overlay-top-left pause-indicator">
            <span class="material-symbols-outlined">pause_circle</span>
        </div>
        <button class="video-overlay-top-right delete-btn-overlay" title="削除">
            <span class="material-symbols-outlined">close</span>
        </button>
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
          <div class="role-switch-wrapper" title="モード切替 (Person / Whiteboard)">
              <span class="material-symbols-outlined switch-label-icon">person</span>
              <label class="m3-switch role-switch-container">
                <input type="checkbox" class="role-switch" ${setting.role === 'whiteboard' ? 'checked' : ''}>
                <span class="slider">
                    <span class="material-symbols-outlined slider-icon icon-left">person</span>
                    <span class="material-symbols-outlined slider-icon icon-right">edit_square</span>
                </span>
              </label>
              <span class="material-symbols-outlined switch-label-icon">edit_square</span>
          </div>
          <input type="text" class="m3-textfield label-input" placeholder="Camera Name">

          <button class="m3-icon-button-small lock-btn" title="フォーカス・露出を固定">
              <span class="material-symbols-outlined">lock_open</span>
          </button>

          <button class="m3-icon-button-small adjust-btn whiteboard-only ${setting.role === 'whiteboard' ? '' : 'hidden'}" title="画質調整">
              <span class="material-symbols-outlined">tune</span>
          </button>

          <button class="m3-icon-button-small set-btn whiteboard-only ${setting.role === 'whiteboard' ? '' : 'hidden'}" title="台形補正">
              <span class="material-symbols-outlined">settings_overscan</span>
          </button>
          <button class="m3-icon-button-small reset-btn whiteboard-only ${setting.role === 'whiteboard' ? '' : 'hidden'}" title="リセット">
              <span class="material-symbols-outlined">restart_alt</span>
          </button>
          <button class="m3-icon-button-small copy-btn whiteboard-only ${setting.role === 'whiteboard' ? '' : 'hidden'}" title="キャプチャ">
              <span class="material-symbols-outlined">photo_camera</span>
          </button>
        </div>
      </div>
    `;

    const video = element.querySelector('video');
    const canvas = element.querySelector('.overlay-canvas');
    const processedCanvas = element.querySelector('.processed-canvas');
    const freezeCanvas = element.querySelector('.freeze-canvas');
    element.querySelector('.label-input').value = setting.customLabel;

    element.querySelector('.move-up-btn').onclick = () => this.moveCamera(deviceId, 'up');
    element.querySelector('.move-down-btn').onclick = () => this.moveCamera(deviceId, 'down');

    element.querySelector('.video-wrapper').onclick = (e) => {
        // Prevent click if clicking adjustment panel
        if (e.target.closest('.adjustment-panel')) return;
        this.switchActiveCamera(deviceId);
    };

    const lockBtn = element.querySelector('.lock-btn');
    lockBtn.addEventListener('click', async () => {
        const slot = this.slots.get(deviceId);
        if (!slot || !slot.stream) return;
        const track = slot.stream.getVideoTracks()[0];
        if (!track) return;

        const isLocked = lockBtn.classList.contains('locked');
        const nextLocked = !isLocked;

        const success = await this.applyMediaLock(track, nextLocked);
        if (success || !nextLocked) {
            lockBtn.classList.toggle('locked', nextLocked);
            lockBtn.querySelector('.material-symbols-outlined').textContent = nextLocked ? 'lock' : 'lock_open';
            saveCameraSetting(deviceId, { mediaSettingsFixed: nextLocked });
            this.addLog(`Camera ${deviceId.slice(0, 8)} settings ${nextLocked ? 'locked' : 'unlocked'}`);
        } else {
            this.showSnackbar('このカメラは設定の固定に対応していない可能性があります');
        }
    });

    const roleSwitch = element.querySelector('.role-switch');
    roleSwitch.addEventListener('change', async (e) => {
      const role = e.target.checked ? 'whiteboard' : 'person';
      this.addLog(`Camera ${deviceId.slice(0, 8)} mode changed to ${role}`);

      // Update local settings first to ensure subsequent calls use the new role
      if (!this.settings[deviceId]) {
        this.settings[deviceId] = { modes: { person: {}, whiteboard: {} } };
      }

      // Persist the current mode as defaultRole so it's restored on next load/export
      await saveCameraSetting(deviceId, { defaultRole: role });
      this.settings[deviceId].defaultRole = role;

      const wbControls = element.querySelectorAll('.whiteboard-only');
      wbControls.forEach(ctrl => {
          if (role === 'whiteboard') ctrl.classList.remove('hidden');
          else ctrl.classList.add('hidden');
      });

      const slot = this.slots.get(deviceId);
      if (slot) {
          const setBtn = slot.element.querySelector('.set-btn');
          if (setBtn) setBtn.classList.remove('active');

          if (slot.element.classList.contains('active')) {
              if (role === 'whiteboard') {
                  if (slot.processor) {
                      slot.processor.stop();
                  }
                  // Restore points will happen inside initProcessor
                  slot.processor = this.initProcessor(slot.video, slot.canvas, slot.processedCanvas, deviceId);
              } else {
                  if (slot.processor) {
                      slot.processor.stop();
                      slot.processor = null;
                  }
                  slot.video.style.transform = '';
                  const ctx = slot.canvas.getContext('2d');
                  ctx.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
              }
          }
      }
    });

    const adjPanel = element.querySelector('.adjustment-panel');
    const adjustBtn = element.querySelector('.adjust-btn');
    const occlusionBtnAdj = element.querySelector('.occlusion-btn-adj');
    const enhanceBtnsAdj = element.querySelectorAll('.enhance-btn-adj');
    const thresholdSlider = element.querySelector('.threshold-slider');

    const updateWhiteboardUI = () => {
        const s = this.settings[deviceId]?.modes?.whiteboard || {};
        occlusionBtnAdj.textContent = s.occlusionRemoval ? 'ON' : 'OFF';
        occlusionBtnAdj.classList.toggle('active-mode', !!s.occlusionRemoval);

        const currentMode = s.enhanceMode || 'none';
        enhanceBtnsAdj.forEach(btn => {
            btn.classList.toggle('active-mode', btn.dataset.mode === currentMode);
        });

        const threshold = s.threshold !== undefined ? s.threshold : 0.45;
        thresholdSlider.value = threshold * 100;
    };
    updateWhiteboardUI();

    adjustBtn.addEventListener('click', () => {
        adjPanel.classList.toggle('visible');
        adjustBtn.classList.toggle('active', adjPanel.classList.contains('visible'));
    });

    occlusionBtnAdj.addEventListener('click', async () => {
        const slot = this.slots.get(deviceId);
        if (slot && !slot.processor) await this.switchActiveCamera(deviceId);
        if (slot && slot.processor) {
            const current = !!(this.settings[deviceId]?.modes?.whiteboard?.occlusionRemoval);
            const newValue = !current;
            slot.processor.setOcclusionRemoval(newValue);
            if (!this.settings[deviceId]) this.settings[deviceId] = {};
            if (!this.settings[deviceId].modes) this.settings[deviceId].modes = { person: {}, whiteboard: {} };
            if (!this.settings[deviceId].modes.whiteboard) this.settings[deviceId].modes.whiteboard = {};
            this.settings[deviceId].modes.whiteboard.occlusionRemoval = newValue;
            saveCameraSetting(deviceId, { modes: { whiteboard: { occlusionRemoval: newValue } } });
            updateWhiteboardUI();
        }
    });

    enhanceBtnsAdj.forEach(btn => {
        btn.addEventListener('click', async () => {
            const slot = this.slots.get(deviceId);
            if (slot && !slot.processor) await this.switchActiveCamera(deviceId);
            if (slot && slot.processor) {
                const next = btn.dataset.mode;
                slot.processor.setEnhanceMode(next);
                if (!this.settings[deviceId]) this.settings[deviceId] = {};
                if (!this.settings[deviceId].modes) this.settings[deviceId].modes = { person: {}, whiteboard: {} };
                if (!this.settings[deviceId].modes.whiteboard) this.settings[deviceId].modes.whiteboard = {};
                this.settings[deviceId].modes.whiteboard.enhanceMode = next;
                saveCameraSetting(deviceId, { modes: { whiteboard: { enhanceMode: next } } });
                updateWhiteboardUI();
            }
        });
    });

    thresholdSlider.addEventListener('input', (e) => {
        const slot = this.slots.get(deviceId);
        const val = parseFloat(e.target.value) / 100;
        if (slot && slot.processor) {
            slot.processor.setThreshold(val);
        }
        if (!this.settings[deviceId]) this.settings[deviceId] = {};
        if (!this.settings[deviceId].modes) this.settings[deviceId].modes = { person: {}, whiteboard: {} };
        if (!this.settings[deviceId].modes.whiteboard) this.settings[deviceId].modes.whiteboard = {};
        this.settings[deviceId].modes.whiteboard.threshold = val;
    });

    thresholdSlider.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value) / 100;
        saveCameraSetting(deviceId, { modes: { whiteboard: { threshold: val } } });
    });

    const setBtn = element.querySelector('.set-btn');
    setBtn.addEventListener('click', async () => {
        const slot = this.slots.get(deviceId);
        if (slot && !slot.processor) {
            await this.switchActiveCamera(deviceId);
        }
        if (slot && slot.processor) {
            const isVisible = !slot.processor.transformer.showHandles;
            slot.processor.transformer.setShowingHandles(isVisible);
            setBtn.classList.toggle('active', isVisible);
        }
    });

    const resetBtn = element.querySelector('.reset-btn');
    resetBtn.addEventListener('click', async () => {
        const slot = this.slots.get(deviceId);
        if (slot && !slot.processor) {
            await this.switchActiveCamera(deviceId);
        }
        if (slot && slot.processor) {
            this.addLog(`Resetting perspective for camera ${deviceId.slice(0, 8)}`);
            slot.processor.transformer.resetPoints();
            this.showSnackbar('調整をリセットしました');
        } else if (slot) {
            this.addLog(`Resetting transform for camera ${deviceId.slice(0, 8)}`);
            slot.video.style.transform = '';
            this.showSnackbar('調整をリセットしました');
        }
    });

    const copyBtn = element.querySelector('.copy-btn');
    copyBtn.addEventListener('click', async () => {
        const slot = this.slots.get(deviceId);
        if (!slot) return;
        this.addLog(`Capturing frame for camera ${deviceId.slice(0, 8)} (mode: ${this.settings[deviceId]?.defaultRole || 'person'})`);
        try {
            let blob;
            if (slot.processor) {
                blob = await slot.processor.capture();
            } else {
                const canvas = document.createElement('canvas');
                const isActive = slot.element.classList.contains('active');
                const source = isActive ? slot.video : slot.freezeCanvas;
                const w = isActive ? slot.video.videoWidth : slot.freezeCanvas.width;
                const h = isActive ? slot.video.videoHeight : slot.freezeCanvas.height;

                if (!w || !h) {
                    throw new Error('No image data available to capture.');
                }

                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(source, 0, 0);
                blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            }

            if (!blob) throw new Error('Failed to capture frame.');
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            this.showSnackbar('クリップボードにコピーしました');
        } catch (err) {
            console.error('Clipboard copy failed:', err);
            this.showSnackbar('コピーに失敗しました: ' + err.message);
        }
    });

    const deleteBtn = element.querySelector('.delete-btn-overlay');
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const slot = this.slots.get(deviceId);
        if (slot) {
            this.addLog(`Deleting camera slot: ${deviceId.slice(0, 8)}`);
            const index = this.slotOrder.indexOf(deviceId);
            const wasActive = index === this.activeSlotIndex;

            await this.deactivateSlot(slot);
            slot.element.remove();
            this.slots.delete(deviceId);
            this.slotOrder = this.slotOrder.filter(id => id !== deviceId);

            // We no longer delete camera settings here to allow persistence
            saveSessionState(this.slotOrder, this.activeSlotIndex);

            if (this.slotOrder.length === 0) {
                this.activeSlotIndex = -1;
                if (this.cycleTimeoutId) {
                    clearTimeout(this.cycleTimeoutId);
                    this.cycleTimeoutId = null;
                }
            } else {
                if (wasActive) {
                    this.activeSlotIndex = index % this.slotOrder.length;
                    const nextDeviceId = this.slotOrder[this.activeSlotIndex];
                    const nextSlot = this.slots.get(nextDeviceId);
                    if (nextSlot) {
                        await this.activateSlot(nextSlot, nextDeviceId);
                    }
                    if (this.globalSettings.cyclingEnabled) {
                        this.startCycling();
                    }
                } else {
                    if (index < this.activeSlotIndex) {
                        this.activeSlotIndex--;
                    }
                }
            }
            const cyclingSwitch = document.getElementById('cycling-switch');
            if (cyclingSwitch) cyclingSwitch.disabled = this.slotOrder.length < 2;
        }
    });

    const labelInput = element.querySelector('.label-input');
    labelInput.addEventListener('blur', async (e) => {
      let customLabel = e.target.value.trim();
      if (customLabel === '') {
        customLabel = defaultLabel;
        e.target.value = customLabel;
      }
      await saveCameraSetting(deviceId, { customLabel });
      this.settings[deviceId] = { ...this.settings[deviceId], customLabel };
    });

    return { element, video, canvas, processedCanvas, freezeCanvas, processor: null, stream: null };
  }

  initProcessor(video, canvas, processedCanvas, deviceId) {
      const wbSettings = this.settings[deviceId]?.modes?.whiteboard || {};
      const pts = wbSettings.points || [
          {x: 20, y: 20}, {x: 80, y: 20}, {x: 80, y: 80}, {x: 20, y: 80}
      ];

      const processor = new WhiteboardProcessor(video, canvas, processedCanvas, pts, (newPts) => {
          const ptsStr = newPts.map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(', ');
          this.addLog(`Perspective adjusted for ${deviceId.slice(0, 8)}: [${ptsStr}]`);
          saveCameraSetting(deviceId, { modes: { whiteboard: { points: newPts } } });
          if (!this.settings[deviceId]) {
              this.settings[deviceId] = { modes: { person: {}, whiteboard: {} } };
          }
          if (!this.settings[deviceId].modes) this.settings[deviceId].modes = { person: {}, whiteboard: {} };
          if (!this.settings[deviceId].modes.whiteboard) this.settings[deviceId].modes.whiteboard = {};
          this.settings[deviceId].modes.whiteboard.points = newPts;
      });

      processor.setEnhanceMode(wbSettings.enhanceMode || 'none');
      processor.setThreshold(wbSettings.threshold !== undefined ? wbSettings.threshold : 0.45);
      processor.setOcclusionRemoval(!!wbSettings.occlusionRemoval);
      processor.start();

      return processor;
  }

  async applyMediaLock(track, locked) {
      if (!track || typeof track.getCapabilities !== 'function' || typeof track.getSettings !== 'function') return false;
      const capabilities = track.getCapabilities();
      const constraints = { advanced: [] };
      const adv = {};

      this.addLog(`ApplyMediaLock: locked=${locked}`);

      const modeProps = [
          { prop: 'focusMode', constr: 'focusMode', valProp: 'focusDistance' },
          { prop: 'exposureMode', constr: 'exposureMode', valProp: 'exposureTime' },
          { prop: 'whiteBalanceMode', constr: 'whiteBalanceMode', valProp: 'colorTemperature' }
      ];

      if (locked) {
          for (const m of modeProps) {
              if (capabilities[m.prop]) {
                  if (capabilities[m.prop].includes('manual')) {
                      adv[m.constr] = 'manual';
                      constraints[m.constr] = 'manual'; // Also set as top-level constraint
                  } else if (capabilities[m.prop].includes('single-shot')) {
                      adv[m.constr] = 'single-shot';
                      constraints[m.constr] = 'single-shot';
                  }
              }
          }
      } else {
          for (const m of modeProps) {
              if (capabilities[m.prop]) {
                  const mode = capabilities[m.prop].includes('continuous') ? 'continuous' :
                             (capabilities[m.prop].includes('single-shot') ? 'single-shot' : null);
                  if (mode) {
                      adv[m.constr] = mode;
                      constraints[m.constr] = mode;
                  }
              }
          }
      }

      if (Object.keys(adv).length > 0) {
          constraints.advanced.push(adv);
          try {
              this.addLog(`Applying constraints: ${JSON.stringify(constraints)}`);
              await track.applyConstraints(constraints);

              // Verification & Fallback
              const newSettings = track.getSettings();
              const failedModes = [];
              if (locked) {
                  for (const m of modeProps) {
                      if (adv[m.constr] && newSettings[m.constr] !== adv[m.constr]) {
                          failedModes.push(m);
                      }
                  }
              }

              if (failedModes.length > 0) {
                  this.addLog(`Some modes failed to lock (current: ${failedModes.map(m => `${m.constr}=${newSettings[m.constr]}`).join(', ')}). Attempting fallback with values...`);
                  const fallbackAdv = { ...adv };
                  const fallbackConstraints = { ...constraints, advanced: [fallbackAdv] };
                  let hasFallbackValues = false;

                  for (const m of failedModes) {
                      if (m.valProp && newSettings[m.valProp] !== undefined) {
                          fallbackAdv[m.valProp] = newSettings[m.valProp];
                          fallbackConstraints[m.valProp] = newSettings[m.valProp];
                          this.addLog(`Fallback for ${m.constr}: manual + ${m.valProp}=${newSettings[m.valProp]}`);
                          hasFallbackValues = true;
                      }
                  }

                  if (hasFallbackValues) {
                      try {
                          await track.applyConstraints(fallbackConstraints);
                      } catch (fallbackError) {
                          this.addLog(`Failed to apply fallback constraints: ${fallbackError.message}`, true);
                      }
                  }
              }

              const finalSettings = track.getSettings();
              this.addLog(`Final settings: focus=${finalSettings.focusMode}(${finalSettings.focusDistance}), exposure=${finalSettings.exposureMode}(${finalSettings.exposureTime}), wb=${finalSettings.whiteBalanceMode}(${finalSettings.colorTemperature})`);
              return true;
          } catch (e) {
              this.addLog(`Failed to apply constraints: ${e.message}`, true);
              return false;
          }
      }
      return true;
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

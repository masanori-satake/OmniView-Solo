import { getCameras, loadCameraSettings, saveCameraSetting as saveCameraSettingToStorage, startCamera, loadGlobalSettings, saveGlobalSettings, saveSessionState, loadSessionState, RESOLUTION_LEVELS, RESOLUTION_PRESETS_2K } from './camera.js';
import { WhiteboardProcessor } from './processor.js';


class App {
  constructor() {
    this.container = document.getElementById('camera-container');
    this.cameras = [];
    this.settings = {};
    this.globalSettings = {
      interval: 5,
      cyclingEnabled: true,
      excludeWhiteboard: true,
      cameraResolutionFpsDisplay: false,
      wbAutoFocusEnabled: true,
      wbAutoFocusPrevWbSize: 'zoom4',
      wbAutoFocusNewWbSize: 'zoom1',
      pinReleaseEnabled: true,
      pinReleaseTime: 3
    };
    this.slots = new Map();
    this.slotOrder = []; // Array of deviceIds
    this.activeSlotIndex = -1;
    this.pinnedDeviceId = null; // Currently pinned camera's deviceId, or null
    this.pinTimerId = null; // Timer for auto-release
    this.cycleTimeoutId = null;
    this.cycleCount = 0;
    this.currentLayout = null;
    this.snackbarTimeout = null;
    this.switchRequestCount = 0;
    this.cameraInfoCache = new Map();
    this.logs = [];
  }

  initI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      let message;
      if (key === 'aboutVersion') {
          message = chrome.i18n.getMessage(key, [chrome.runtime.getManifest().version]);
      } else {
          message = chrome.i18n.getMessage(key);
      }
      if (message) el.textContent = message;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const message = chrome.i18n.getMessage(key);
      if (message) el.title = message;
    });
    document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
      const key = el.getAttribute('data-i18n-tooltip');
      const message = chrome.i18n.getMessage(key);
      if (message) el.dataset.tooltip = message;
    });
  }

  async init() {
    this.initI18n();
    this.settings = await loadCameraSettings();
    this.globalSettings = await loadGlobalSettings();
    this.addLog(chrome.i18n.getMessage('logGlobalSettings', [String(this.globalSettings.cyclingEnabled), String(this.globalSettings.interval)]));
    this.cameras = await getCameras();

    this.setupStartButton();
    this.setupResizeObserver();
    this.setupSettingsPanel();
    this.setupAddCameraButton();

    // Log initial device list
    this.addLog(chrome.i18n.getMessage('logAppInitialized'));
    this.logDeviceList();
    navigator.mediaDevices.addEventListener('devicechange', () => {
        this.addLog(chrome.i18n.getMessage('logDeviceConfigChanged'));
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

            this.activeSlotIndex = activeIndex;
            await this.updateCyclingAndActivationState();
        } else {
            // No connected cameras found in session
            document.getElementById('initial-overlay').classList.add('hidden');
            this.showCameraDialog();
        }
    } else {
        // No session or empty session
        document.getElementById('initial-overlay').classList.add('hidden');
        this.showCameraDialog();
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
    const intervalLabel = document.getElementById('interval-label');
    const excludeWhiteboardSwitch = document.getElementById('exclude-whiteboard-switch');
    const excludeWhiteboardLabel = document.getElementById('exclude-whiteboard-label');
    const cameraResolutionFpsDisplaySwitch = document.getElementById('camera-resolution-fps-display-switch');
    const copyLogsBtn = document.getElementById('copy-logs-btn');
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    const exportBtn = document.getElementById('export-btn');
    const importBtnTrigger = document.getElementById('import-btn-trigger');
    const importInput = document.getElementById('import-input');
    const importModeSelect = document.getElementById('import-mode-select');
    const resolutionZoom1Select = document.getElementById('resolution-zoom1-select');
    const resolutionZoom2Select = document.getElementById('resolution-zoom2-select');
    const resolutionZoom4Select = document.getElementById('resolution-zoom4-select');
    const wbAutoFocusSwitch = document.getElementById('wb-autofocus-switch');
    const wbAutoFocusPrevWbSizeSelect = document.getElementById('wb-autofocus-prev-wb-size-select');
    const wbAutoFocusNewWbSizeSelect = document.getElementById('wb-autofocus-new-wb-size-select');

    const pinReleaseSwitch = document.getElementById('pin-release-switch');
    const pinReleaseTimeInput = document.getElementById('pin-release-time-input');
    const pinReleaseTimeUp = document.getElementById('pin-release-time-up');
    const pinReleaseTimeDown = document.getElementById('pin-release-time-down');
    const pinReleaseLabel = document.getElementById('pin-release-time-label');

    if (pinReleaseSwitch) {
        pinReleaseSwitch.addEventListener('change', async (e) => {
            this.globalSettings.pinReleaseEnabled = e.target.checked;
            this.addLog(chrome.i18n.getMessage('pinReleaseLabel') + ': ' + String(e.target.checked));
            await saveGlobalSettings(this.globalSettings);
            updateIntervalUI();
            this.updatePinTimer();
        });
    }

    const updatePinTime = async (val) => {
        this.globalSettings.pinReleaseTime = Math.max(1, Math.min(15, parseInt(val) || 3));
        if (pinReleaseTimeInput) pinReleaseTimeInput.value = this.globalSettings.pinReleaseTime;
        this.addLog(chrome.i18n.getMessage('logPinReleaseConfigChanged', [String(this.globalSettings.pinReleaseEnabled), String(this.globalSettings.pinReleaseTime)]));
        await saveGlobalSettings(this.globalSettings);
        this.updatePinTimer();
    };

    if (pinReleaseTimeInput) {
        pinReleaseTimeInput.addEventListener('change', (e) => updatePinTime(e.target.value));
    }
    if (pinReleaseTimeUp) {
        pinReleaseTimeUp.addEventListener('click', () => updatePinTime((this.globalSettings.pinReleaseTime || 3) + 1));
    }
    if (pinReleaseTimeDown) {
        pinReleaseTimeDown.addEventListener('click', () => updatePinTime((this.globalSettings.pinReleaseTime || 3) - 1));
    }

    if (wbAutoFocusSwitch) {
        wbAutoFocusSwitch.addEventListener('change', async (e) => {
            this.globalSettings.wbAutoFocusEnabled = e.target.checked;
            this.addLog(chrome.i18n.getMessage('wbAutoFocusLabel') + ': ' + String(e.target.checked));
            await saveGlobalSettings(this.globalSettings);
            updateIntervalUI();
            // If turning ON, let's enforce autofocus if there are multiple cameras
            if (e.target.checked && this.slotOrder.length >= 2) {
                await this.enforceWhiteboardAutoFocus();
                await this.updateCyclingAndActivationState();
            }
        });
    }

    if (wbAutoFocusPrevWbSizeSelect) {
        wbAutoFocusPrevWbSizeSelect.addEventListener('change', async (e) => {
            this.globalSettings.wbAutoFocusPrevWbSize = e.target.value;
            await saveGlobalSettings(this.globalSettings);
        });
    }

    if (wbAutoFocusNewWbSizeSelect) {
        wbAutoFocusNewWbSizeSelect.addEventListener('change', async (e) => {
            this.globalSettings.wbAutoFocusNewWbSize = e.target.value;
            await saveGlobalSettings(this.globalSettings);
        });
    }

    if (resolutionZoom1Select) {
        resolutionZoom1Select.addEventListener('change', async (e) => {
            this.globalSettings.resolutionZoom1 = e.target.value;
            await saveGlobalSettings(this.globalSettings);
            await this.updateResolutionSelects();
            await this.reconnectActiveCameras();
        });
    }

    if (resolutionZoom2Select) {
        resolutionZoom2Select.addEventListener('change', async (e) => {
            this.globalSettings.resolutionZoom2 = e.target.value;
            await saveGlobalSettings(this.globalSettings);
            await this.updateResolutionSelects();
            await this.reconnectActiveCameras();
        });
    }

    if (resolutionZoom4Select) {
        resolutionZoom4Select.addEventListener('change', async (e) => {
            this.globalSettings.resolutionZoom4 = e.target.value;
            await saveGlobalSettings(this.globalSettings);
            await this.updateResolutionSelects();
            await this.reconnectActiveCameras();
        });
    }

    const updateIntervalUI = () => {
        const enabled = this.globalSettings.cyclingEnabled && this.slotOrder.length >= 2;
        intervalInput.disabled = !enabled;
        intervalUp.disabled = !enabled;
        intervalDown.disabled = !enabled;
        if (enabled) {
            intervalLabel.classList.remove('disabled');
        } else {
            intervalLabel.classList.add('disabled');
        }

        const cyclingEnabled = this.globalSettings.cyclingEnabled;
        const excludeWhiteboardSwitchInput = document.getElementById('exclude-whiteboard-switch');
        if (excludeWhiteboardSwitchInput) {
            excludeWhiteboardSwitchInput.disabled = !cyclingEnabled;
        }
        if (cyclingEnabled) {
            excludeWhiteboardLabel.classList.remove('disabled');
        } else {
            excludeWhiteboardLabel.classList.add('disabled');
        }

        const pinReleaseEnabled = !!this.globalSettings.pinReleaseEnabled;
        if (pinReleaseSwitch) pinReleaseSwitch.checked = pinReleaseEnabled;
        if (pinReleaseTimeInput) {
            pinReleaseTimeInput.disabled = !pinReleaseEnabled;
            pinReleaseTimeInput.value = this.globalSettings.pinReleaseTime || 3;
        }
        if (pinReleaseTimeUp) pinReleaseTimeUp.disabled = !pinReleaseEnabled;
        if (pinReleaseTimeDown) pinReleaseTimeDown.disabled = !pinReleaseEnabled;
        if (pinReleaseLabel) {
            if (pinReleaseEnabled) {
                pinReleaseLabel.classList.remove('disabled');
            } else {
                pinReleaseLabel.classList.add('disabled');
            }
        }

        const wbAutoFocusEnabled = !!this.globalSettings.wbAutoFocusEnabled;
        if (wbAutoFocusSwitch) wbAutoFocusSwitch.checked = wbAutoFocusEnabled;
        if (wbAutoFocusPrevWbSizeSelect) wbAutoFocusPrevWbSizeSelect.disabled = !wbAutoFocusEnabled;
        if (wbAutoFocusNewWbSizeSelect) wbAutoFocusNewWbSizeSelect.disabled = !wbAutoFocusEnabled;

        const wbPrevWbSizeLabel = document.getElementById('wb-autofocus-prev-wb-size-label');
        const wbNewWbSizeLabel = document.getElementById('wb-autofocus-new-wb-size-label');
        if (wbPrevWbSizeLabel) {
            wbPrevWbSizeLabel.classList.toggle('disabled', !wbAutoFocusEnabled);
        }
        if (wbNewWbSizeLabel) {
            wbNewWbSizeLabel.classList.toggle('disabled', !wbAutoFocusEnabled);
        }
    };
    this.updateIntervalUI = updateIntervalUI;

    settingsBtn.addEventListener('click', async () => {
        settingsPanel.classList.remove('hidden');
        intervalInput.value = this.globalSettings.interval;
        cyclingSwitch.checked = this.globalSettings.cyclingEnabled !== false;
        cyclingSwitch.disabled = this.slotOrder.length < 2;

        excludeWhiteboardSwitch.checked = !!this.globalSettings.excludeWhiteboard;
        cameraResolutionFpsDisplaySwitch.checked = !!this.globalSettings.cameraResolutionFpsDisplay;

        if (wbAutoFocusSwitch) {
            wbAutoFocusSwitch.checked = !!this.globalSettings.wbAutoFocusEnabled;
        }

        if (pinReleaseSwitch) {
            pinReleaseSwitch.checked = this.globalSettings.pinReleaseEnabled !== false;
        }
        if (pinReleaseTimeInput) {
            pinReleaseTimeInput.value = this.globalSettings.pinReleaseTime || 3;
        }
        if (wbAutoFocusPrevWbSizeSelect) {
            wbAutoFocusPrevWbSizeSelect.value = this.globalSettings.wbAutoFocusPrevWbSize || 'zoom4';
        }
        if (wbAutoFocusNewWbSizeSelect) {
            wbAutoFocusNewWbSizeSelect.value = this.globalSettings.wbAutoFocusNewWbSize || 'zoom1';
        }

        updateIntervalUI();
        await this.updateResolutionSelects();
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
            this.showSnackbar(chrome.i18n.getMessage('snackbarLogsCopied'));
        } catch (e) {
            this.showSnackbar(chrome.i18n.getMessage('snackbarCopyFailed'));
        }
    });

    clearLogsBtn.addEventListener('click', () => {
        this.logs = [];
        this.renderLogs();
    });

    const updateInterval = async (val) => {
        this.globalSettings.interval = Math.max(1, parseInt(val) || 1);
        intervalInput.value = this.globalSettings.interval;
        this.addLog(chrome.i18n.getMessage('logIntervalChanged', [String(this.globalSettings.interval)]));
        await saveGlobalSettings(this.globalSettings);
    };

    intervalInput.addEventListener('change', (e) => updateInterval(e.target.value));
    intervalUp.addEventListener('click', () => updateInterval(this.globalSettings.interval + 1));
    intervalDown.addEventListener('click', () => updateInterval(this.globalSettings.interval - 1));

    cyclingSwitch.addEventListener('change', async (e) => {
        this.globalSettings.cyclingEnabled = e.target.checked;
        this.addLog(chrome.i18n.getMessage('logCyclingEnabled', [String(this.globalSettings.cyclingEnabled)]));
        await saveGlobalSettings(this.globalSettings);
        updateIntervalUI();
        if (!e.target.checked) {
            // Force release pin if cycling is turned off
            this.releasePin(false);
        }
        await this.updateCyclingAndActivationState();
    });

    excludeWhiteboardSwitch.addEventListener('change', async (e) => {
        this.globalSettings.excludeWhiteboard = e.target.checked;
        this.addLog(chrome.i18n.getMessage('logExcludeWhiteboard', [String(this.globalSettings.excludeWhiteboard)]));
        await saveGlobalSettings(this.globalSettings);
        if (e.target.checked) {
            // If the currently pinned device is a whiteboard, unpin it since whiteboard pins are disabled
            if (this.pinnedDeviceId && this.getSlotRole(this.pinnedDeviceId) === 'whiteboard') {
                this.releasePin(false);
            }
        }
        await this.updateCyclingAndActivationState();
    });

    cameraResolutionFpsDisplaySwitch.addEventListener('change', async (e) => {
        this.globalSettings.cameraResolutionFpsDisplay = e.target.checked;
        this.addLog(chrome.i18n.getMessage('logCameraResolutionFpsDisplay', [String(this.globalSettings.cameraResolutionFpsDisplay)]));
        await saveGlobalSettings(this.globalSettings);
        this.updateAllResolutionFpsDisplays();
    });

    exportBtn.addEventListener('click', async () => {
        const settingsToExport = await loadCameraSettings();
        // Record current mode and zoom as default for export
        for (const deviceId of Object.keys(settingsToExport)) {
            const slot = this.slots.get(deviceId);
            if (slot) {
                const role = slot.element.querySelector('.role-switch').checked ? 'whiteboard' : 'person';
                settingsToExport[deviceId].defaultRole = role;
                const currentZoom = parseInt(slot.element.dataset.zoom || '1');
                settingsToExport[deviceId].zoom = currentZoom;
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
        setTimeout(() => URL.revokeObjectURL(url), 100);
        this.addLog(chrome.i18n.getMessage('logExportSuccess'));
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
                this.addLog(chrome.i18n.getMessage('logImporting', [mode]));

                if (data.global_settings) {
                    this.globalSettings = { ...this.globalSettings, ...data.global_settings };
                    await saveGlobalSettings(this.globalSettings);
                    intervalInput.value = this.globalSettings.interval;

                    cyclingSwitch.checked = !!this.globalSettings.cyclingEnabled;
                    excludeWhiteboardSwitch.checked = !!this.globalSettings.excludeWhiteboard;
                    cameraResolutionFpsDisplaySwitch.checked = !!this.globalSettings.cameraResolutionFpsDisplay;

                    if (wbAutoFocusSwitch) {
                        wbAutoFocusSwitch.checked = !!this.globalSettings.wbAutoFocusEnabled;
                    }
                    if (wbAutoFocusPrevWbSizeSelect) {
                        wbAutoFocusPrevWbSizeSelect.value = this.globalSettings.wbAutoFocusPrevWbSize || 'zoom4';
                    }
                    if (wbAutoFocusNewWbSizeSelect) {
                        wbAutoFocusNewWbSizeSelect.value = this.globalSettings.wbAutoFocusNewWbSize || 'zoom1';
                    }

                    if (this.globalSettings.pinReleaseEnabled === undefined) {
                        this.globalSettings.pinReleaseEnabled = true;
                    }
                    if (this.globalSettings.pinReleaseTime === undefined) {
                        this.globalSettings.pinReleaseTime = 3;
                    }

                    updateIntervalUI();
                    this.updatePinTimer();
                    await this.updateResolutionSelects();
                    await this.updateCyclingAndActivationState();
                    this.updateAllResolutionFpsDisplays();
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
                            if (s.zoom) {
                                const zoomInBtn = slot.element.querySelector('.zoom-in-btn');
                                const zoomOutBtn = slot.element.querySelector('.zoom-out-btn');

                                const updateZoomUI = (zoom) => {
                                    slot.element.classList.remove('zoom-1', 'zoom-2', 'zoom-4');
                                    slot.element.classList.add(`zoom-${zoom}`);
                                    slot.element.dataset.zoom = zoom;
                                    if (zoomInBtn) zoomInBtn.disabled = (zoom === 1);
                                    if (zoomOutBtn) zoomOutBtn.disabled = (zoom === 4);
                                };
                                updateZoomUI(s.zoom);
                            }
                        }
                    }
                }

                await this.reconnectActiveCameras();
                this.showSnackbar(chrome.i18n.getMessage('snackbarImportSuccess'));
                this.addLog(chrome.i18n.getMessage('logImportSuccess'));
            } catch (err) {
                this.addLog(chrome.i18n.getMessage('logImportFailed', [err.message]), true);
                this.showSnackbar(chrome.i18n.getMessage('snackbarImportFailed', [err.message]));
            }
            importInput.value = '';
        };
        reader.readAsText(file);
    });
  }

  getInitialResolutionForSlot(slot) {
    if (!slot || !slot.element) {
        return { label: '720p HD (16:9)', width: 1280, height: 720 };
    }
    const zoom = parseInt(slot.element.dataset.zoom || '1');
    let label = '720p HD (16:9)'; // Default fallback
    if (zoom === 1) {
        label = this.globalSettings.resolutionZoom1 || '720p HD (16:9)';
    } else if (zoom === 2) {
        label = this.globalSettings.resolutionZoom2 || '480p WVGA (16:9)';
    } else if (zoom === 4) {
        label = this.globalSettings.resolutionZoom4 || '360p nHD (16:9)';
    }

    const preset = RESOLUTION_PRESETS_2K.find(p => p.label === label);
    return preset || { label: '720p HD (16:9)', width: 1280, height: 720 };
  }

  getSteppedDownResolution(slot, step) {
    const initialPreset = this.getInitialResolutionForSlot(slot);
    let startIdx = RESOLUTION_PRESETS_2K.findIndex(p => p.label === initialPreset.label);
    if (startIdx === -1) startIdx = 4; // fallback to 720p HD (16:9)
    const targetIdx = Math.max(0, Math.min(RESOLUTION_PRESETS_2K.length - 1, startIdx + step));
    return RESOLUTION_PRESETS_2K[targetIdx];
  }

  async updateResolutionSelects() {
    const select1 = document.getElementById('resolution-zoom1-select');
    const select2 = document.getElementById('resolution-zoom2-select');
    const select4 = document.getElementById('resolution-zoom4-select');
    if (!select1 || !select2 || !select4) return;

    const val1 = this.globalSettings.resolutionZoom1 || '720p HD (16:9)';
    const val2 = this.globalSettings.resolutionZoom2 || '480p WVGA (16:9)';
    const val4 = this.globalSettings.resolutionZoom4 || '360p nHD (16:9)';

    let changed = false;

    // 1. Populate Zoom 1 select (all options)
    select1.innerHTML = '';
    RESOLUTION_PRESETS_2K.forEach(preset => {
        const opt = document.createElement('option');
        opt.value = preset.label;
        opt.textContent = preset.label;
        select1.appendChild(opt);
    });
    select1.value = val1;
    let idx1 = RESOLUTION_PRESETS_2K.findIndex(p => p.label === val1);
    if (idx1 === -1) idx1 = 4; // fallback 720p

    // 2. Populate Zoom 2 select (only index >= idx1, as descending order)
    select2.innerHTML = '';
    for (let i = idx1; i < RESOLUTION_PRESETS_2K.length; i++) {
        const preset = RESOLUTION_PRESETS_2K[i];
        const opt = document.createElement('option');
        opt.value = preset.label;
        opt.textContent = preset.label;
        select2.appendChild(opt);
    }
    // Check constraint for Zoom 2
    let idx2 = RESOLUTION_PRESETS_2K.findIndex(p => p.label === val2);
    if (idx2 === -1 || idx2 < idx1) {
        this.globalSettings.resolutionZoom2 = RESOLUTION_PRESETS_2K[idx1].label;
        select2.value = RESOLUTION_PRESETS_2K[idx1].label;
        idx2 = idx1;
        changed = true;
    } else {
        select2.value = val2;
    }

    // 3. Populate Zoom 4 select (only index >= idx2, as descending order)
    select4.innerHTML = '';
    for (let i = idx2; i < RESOLUTION_PRESETS_2K.length; i++) {
        const preset = RESOLUTION_PRESETS_2K[i];
        const opt = document.createElement('option');
        opt.value = preset.label;
        opt.textContent = preset.label;
        select4.appendChild(opt);
    }
    // Check constraint for Zoom 4
    let idx4 = RESOLUTION_PRESETS_2K.findIndex(p => p.label === val4);
    if (idx4 === -1 || idx4 < idx2) {
        this.globalSettings.resolutionZoom4 = RESOLUTION_PRESETS_2K[idx2].label;
        select4.value = RESOLUTION_PRESETS_2K[idx2].label;
        changed = true;
    } else {
        select4.value = val4;
    }

    if (changed) {
        await saveGlobalSettings(this.globalSettings);
    }
  }

  async reconnectActiveCameras() {
    this.cameraOperationsQueue = this.cameraOperationsQueue || Promise.resolve();
    await (this.cameraOperationsQueue = this.cameraOperationsQueue.then(async () => {
        this.addLog("Reconnecting active cameras to apply updated resolution settings...");
        const activeDeviceIds = [];
        for (const [deviceId, slot] of this.slots.entries()) {
            if (slot.stream) {
                activeDeviceIds.push(deviceId);
            }
        }

        for (const deviceId of activeDeviceIds) {
            const slot = this.slots.get(deviceId);
            if (slot) {
                await this.deactivateSlot(slot);
                await new Promise(r => setTimeout(r, 750));
                await this.activateSlot(slot, deviceId);
            }
        }
    }).catch(err => console.error("Error in reconnectActiveCameras queue:", err)));
  }

  getSlotRole(deviceId) {
    const slot = this.slots.get(deviceId);
    if (slot) {
        const roleSwitch = slot.element.querySelector('.role-switch');
        if (roleSwitch) {
            return roleSwitch.checked ? 'whiteboard' : 'person';
        }
    }
    const savedSetting = this.settings[deviceId] || {};
    return savedSetting.defaultRole || 'person';
  }

  shouldCycle() {
    if (!this.globalSettings.cyclingEnabled) return false;
    if (this.slotOrder.length < 2) return false;

    if (this.globalSettings.excludeWhiteboard) {
        const personCount = this.slotOrder.filter(id => this.getSlotRole(id) === 'person').length;
        return personCount >= 2;
    }

    return true;
  }

  getCyclingTargetDeviceIds() {
    if (this.globalSettings.excludeWhiteboard) {
        return this.slotOrder.filter(id => this.getSlotRole(id) === 'person');
    }
    return this.slotOrder;
  }

  async enforceWhiteboardAutoFocus(triggeredByDeviceId = null) {
    if (this.isAutoFocusing) return;
    this.isAutoFocusing = true;

    try {
      if (!this.globalSettings.wbAutoFocusEnabled || this.slotOrder.length < 2) {
        return;
      }

      // 1. Identify existing whiteboard slots
      const wbSlots = [];
      for (const deviceId of this.slotOrder) {
        const slot = this.slots.get(deviceId);
        if (slot) {
          const roleSwitch = slot.element.querySelector('.role-switch');
          if (roleSwitch && roleSwitch.checked) {
            wbSlots.push({ deviceId, slot });
          }
        }
      }

      if (wbSlots.length === 0) {
        return;
      }

      // Determine the target whiteboard slot that should be focused.
      // If triggeredByDeviceId is provided and is a whiteboard slot, use it.
      // Otherwise, pick the first whiteboard slot in the current slotOrder.
      let targetWb = null;
      if (triggeredByDeviceId) {
        targetWb = wbSlots.find(item => item.deviceId === triggeredByDeviceId);
      }
      if (!targetWb) {
        targetWb = wbSlots[0];
      }

      // 2. Move the target whiteboard slot to the front of slotOrder
      const idx = this.slotOrder.indexOf(targetWb.deviceId);
      if (idx > 0) {
        this.slotOrder.splice(idx, 1);
        this.slotOrder.unshift(targetWb.deviceId);
      }

      // 3. Set the target whiteboard slot size as configured
      const newSizeConfig = this.globalSettings.wbAutoFocusNewWbSize || 'zoom1';
      let targetZoomLevel = 1;
      if (newSizeConfig === 'zoom1') targetZoomLevel = 1;
      else if (newSizeConfig === 'zoom2') targetZoomLevel = 2;
      else if (newSizeConfig === 'zoom4') targetZoomLevel = 4;
      else if (newSizeConfig === 'keep') {
        targetZoomLevel = parseInt(targetWb.slot.element.dataset.zoom || '1');
      }

      const targetZoomChanged = parseInt(targetWb.slot.element.dataset.zoom || '1') !== targetZoomLevel;

      targetWb.slot.element.classList.remove('zoom-1', 'zoom-2', 'zoom-4');
      targetWb.slot.element.classList.add(`zoom-${targetZoomLevel}`);
      targetWb.slot.element.dataset.zoom = targetZoomLevel;
      const targetZoomInBtn = targetWb.slot.element.querySelector('.zoom-in-btn');
      const targetZoomOutBtn = targetWb.slot.element.querySelector('.zoom-out-btn');
      if (targetZoomInBtn) targetZoomInBtn.disabled = (targetZoomLevel === 1);
      if (targetZoomOutBtn) targetZoomOutBtn.disabled = (targetZoomLevel === 4);

      await this.saveCameraSetting(targetWb.deviceId, { zoom: targetZoomLevel, defaultRole: 'whiteboard' });

      if (targetZoomChanged && targetWb.slot.stream) {
        await this.deactivateSlot(targetWb.slot);
      }

      // 4. Turn all OTHER whiteboard slots to Person mode, and set their size as configured.
      const prevSizeConfig = this.globalSettings.wbAutoFocusPrevWbSize || 'zoom4';
      for (const item of wbSlots) {
        if (item.deviceId !== targetWb.deviceId) {
          const otherSlot = item.slot;

          // Apply display size
          let zoomLevel = 4;
          if (prevSizeConfig === 'zoom2') zoomLevel = 2;
          else if (prevSizeConfig === 'zoom4') zoomLevel = 4;
          else if (prevSizeConfig === 'keep') {
            zoomLevel = parseInt(otherSlot.element.dataset.zoom || '1');
          }

          const otherZoomChanged = parseInt(otherSlot.element.dataset.zoom || '1') !== zoomLevel;

          otherSlot.element.classList.remove('zoom-1', 'zoom-2', 'zoom-4');
          otherSlot.element.classList.add(`zoom-${zoomLevel}`);
          otherSlot.element.dataset.zoom = zoomLevel;
          const zoomInBtn = otherSlot.element.querySelector('.zoom-in-btn');
          const zoomOutBtn = otherSlot.element.querySelector('.zoom-out-btn');
          if (zoomInBtn) zoomInBtn.disabled = (zoomLevel === 1);
          if (zoomOutBtn) zoomOutBtn.disabled = (zoomLevel === 4);

          await this.saveCameraSetting(item.deviceId, { zoom: zoomLevel, defaultRole: 'person' });

          if (otherZoomChanged && otherSlot.stream) {
            await this.deactivateSlot(otherSlot);
          }

          // Update UI and state directly instead of dispatching a DOM event to avoid race conditions
          const roleSwitch = otherSlot.element.querySelector('.role-switch');
          if (roleSwitch) {
            roleSwitch.checked = false;
          }

          this.addLog(chrome.i18n.getMessage('logModeChanged', [item.deviceId.slice(0, 8), 'person']));

          const videoWrapper = otherSlot.element.querySelector('.video-wrapper');
          if (videoWrapper) {
            videoWrapper.style.aspectRatio = '16 / 9';
          }

          const wbControls = otherSlot.element.querySelectorAll('.whiteboard-only');
          wbControls.forEach(ctrl => ctrl.classList.add('hidden'));

          if (otherSlot.adjustingTimeoutId) {
            clearTimeout(otherSlot.adjustingTimeoutId);
            otherSlot.adjustingTimeoutId = null;
            const adjOverlay = otherSlot.element.querySelector('.adjusting-overlay');
            if (adjOverlay) adjOverlay.classList.add('hidden');
          }

          const lockBtn = otherSlot.element.querySelector('.lock-btn');
          if (lockBtn && lockBtn.classList.contains('locked')) {
            lockBtn.classList.remove('locked');
            const icon = lockBtn.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = 'lock_open';
            await this.saveCameraSetting(item.deviceId, { mediaSettingsFixed: false });
            if (otherSlot.stream) {
              const track = otherSlot.stream.getVideoTracks()[0];
              if (track) {
                await this.applyMediaLock(track, false);
              }
            }
          }

          if (otherSlot.processor) {
            otherSlot.processor.stop();
            otherSlot.processor = null;
          } else {
            otherSlot.video.style.transform = '';
            otherSlot.video.style.objectFit = 'contain';
            if (otherSlot.processedCanvas) {
              otherSlot.processedCanvas.style.transform = '';
              otherSlot.processedCanvas.style.display = 'none';
            }
          }
          const ctx = otherSlot.canvas.getContext('2d');
          ctx.clearRect(0, 0, otherSlot.canvas.width, otherSlot.canvas.height);
        }
      }

      // Save session state with new slotOrder & index
      this.activeSlotIndex = 0;
      saveSessionState(this.slotOrder, this.activeSlotIndex);

      // Reorganize DOM to reflect order change
      if (this.currentLayout === 'wide') {
        this.reorganizeForWide();
      } else {
        this.reorganizeForNarrow();
      }
    } catch (error) {
      this.addLog('Error during whiteboard auto-focus: ' + error.message, true);
    } finally {
      this.isAutoFocusing = false;
    }
  }

  async updateCyclingAndActivationState() {
    this.cameraOperationsQueue = this.cameraOperationsQueue || Promise.resolve();
    await (this.cameraOperationsQueue = this.cameraOperationsQueue.then(async () => {
      this.updateAllPinButtonsVisibility();

      if (this.shouldCycle()) {
        const allowedIds = this.getCyclingTargetDeviceIds();
        let targetId = null;

        if (this.pinnedDeviceId && allowedIds.includes(this.pinnedDeviceId)) {
          targetId = this.pinnedDeviceId;
        } else {
          if (this.activeSlotIndex >= 0 && this.activeSlotIndex < this.slotOrder.length) {
              const currentId = this.slotOrder[this.activeSlotIndex];
              if (allowedIds.includes(currentId)) {
                  targetId = currentId;
              }
          }
          if (!targetId && allowedIds.length > 0) {
              targetId = allowedIds[0];
          }
        }

        // Deactivate slots that are NOT the targetId AND are NOT whiteboard mode when excludeWhiteboard is ON
        let deactivatedAny = false;
        for (const [deviceId, slot] of this.slots.entries()) {
            const isWhiteboard = this.getSlotRole(deviceId) === 'whiteboard';
            const keepActive = this.globalSettings.excludeWhiteboard && isWhiteboard;
            if (deviceId !== targetId && !keepActive && slot.stream) {
                await this.deactivateSlot(slot);
                deactivatedAny = true;
            }
        }

        if (deactivatedAny) {
            // Wait for old camera hardware resources to be released before starting the new camera
            await new Promise(r => setTimeout(r, 750));
        }

        if (targetId) {
            this.activeSlotIndex = this.slotOrder.indexOf(targetId);
            const slot = this.slots.get(targetId);
            if (slot && !slot.stream) {
                await this.activateSlot(slot, targetId);
            }
        }

        // Additionally, if excludeWhiteboard is ON, activate all whiteboard mode slots that are not currently running
        if (this.globalSettings.excludeWhiteboard) {
            for (const [deviceId, slot] of this.slots.entries()) {
                if (this.getSlotRole(deviceId) === 'whiteboard' && !slot.stream) {
                    await this.activateSlot(slot, deviceId);
                }
            }
        }

        if (!this.pinnedDeviceId) {
          this.startCycling();
        } else {
          if (this.cycleTimeoutId) {
            clearTimeout(this.cycleTimeoutId);
            this.cycleTimeoutId = null;
          }
        }
      } else {
        this.cycleCount++; // Invalidate pending nextCamera callbacks
        if (this.cycleTimeoutId) {
            clearTimeout(this.cycleTimeoutId);
            this.cycleTimeoutId = null;
        }

        // When cycling is OFF, multiple/all cameras should be active
        if (this.slotOrder.length > 1) {
            await this.activateMultipleCameras();
        } else {
            await this.activateAllCameras();
        }
      }
    }).catch(err => console.error("Error in camera operations queue:", err)));
  }

  updateResolutionFpsDisplay(slot) {
    const overlay = slot.element.querySelector('.camera-resolution-fps-overlay');
    if (!overlay) return;

    if (!this.globalSettings.cameraResolutionFpsDisplay || !slot.stream) {
        overlay.classList.add('hidden');
        overlay.textContent = '';
        return;
    }

    const track = slot.stream.getVideoTracks()[0];
    if (track) {
        const settings = track.getSettings ? track.getSettings() : {};
        const width = settings.width;
        const height = settings.height;
        const fps = settings.frameRate;
        if (width && height && fps) {
            overlay.textContent = `${width}x${height} @ ${Math.round(fps)}fps`;
            overlay.classList.remove('hidden');
        } else if (width && height) {
            overlay.textContent = `${width}x${height}`;
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    } else {
        overlay.classList.add('hidden');
    }
  }

  updateAllResolutionFpsDisplays() {
    for (const slot of this.slots.values()) {
        this.updateResolutionFpsDisplay(slot);
    }
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
    this.slotOrder.forEach((deviceId, index) => {
        const slot = this.slots.get(deviceId);
        if (slot) {
            this.container.appendChild(slot.element);
            slot.element.classList.remove('main-region', 'sub-region-item');
            this.updateMoveButtons(slot, index);
        }
    });
    const mr = this.container.querySelector('.main-region');
    if (mr) mr.remove();
    const sr = this.container.querySelector('.sub-region');
    if (sr) sr.remove();
  }

  reorganizeForWide() {
    this.slotOrder.forEach((deviceId, index) => {
        const slot = this.slots.get(deviceId);
        if (slot) {
            this.container.appendChild(slot.element);
            this.updateMoveButtons(slot, index);
        }
    });
  }

  updateMoveButtons(slot, index) {
      const upBtn = slot.element.querySelector('.move-up-btn');
      const downBtn = slot.element.querySelector('.move-down-btn');
      if (upBtn && downBtn) {
          upBtn.disabled = (index === 0);
          downBtn.disabled = (index === this.slotOrder.length - 1);
      }
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
            chrome.i18n.getMessage('snackbarPermissionRequired'),
            chrome.i18n.getMessage('snackbarGrantPermission'),
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
        <span style="font-weight: bold;">${chrome.i18n.getMessage('selectAllCameras')}</span>
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
            this.addLog(chrome.i18n.getMessage('logAddingCameras', [String(camerasToAdd.length)]));
            for (const camera of camerasToAdd) {
                this.addLog(chrome.i18n.getMessage('logAddingCamera', [camera.label, camera.deviceId.slice(0, 8)]));
                // Force Zoom 4 (smallest size, 25%) and persist immediately
                await this.saveCameraSetting(camera.deviceId, { zoom: 4 });
                const slot = await this.createCameraSlot(camera);
                this.slots.set(camera.deviceId, slot);
                this.slotOrder.push(camera.deviceId);
                this.container.appendChild(slot.element);
            }

            const cyclingSwitch = document.getElementById('cycling-switch');
            if (cyclingSwitch) cyclingSwitch.disabled = this.slotOrder.length < 2;

            if (this.currentLayout === 'wide') {
                this.reorganizeForWide();
            } else {
                this.reorganizeForNarrow();
            }

            if (this.shouldCycle()) {
                const lastCamera = camerasToAdd[camerasToAdd.length - 1];
                this.activeSlotIndex = this.slotOrder.indexOf(lastCamera.deviceId);
            }
            await this.updateCyclingAndActivationState();
            saveSessionState(this.slotOrder, this.activeSlotIndex);
        }
        closeDialog();
    };
  }

  showBandwidthDialog() {
    const dialog = document.getElementById('bandwidth-dialog');
    const overlay = document.getElementById('bandwidth-dialog-overlay');
    const noBtn = document.getElementById('bandwidth-dialog-no-btn');
    const yesBtn = document.getElementById('bandwidth-dialog-yes-btn');

    if (!dialog) return;

    dialog.classList.remove('hidden');

    const closeDialog = () => {
        dialog.classList.add('hidden');
    };

    overlay.onclick = closeDialog;
    noBtn.onclick = closeDialog;

    yesBtn.onclick = async () => {
        closeDialog();

        this.globalSettings.cyclingEnabled = true;
        this.addLog(chrome.i18n.getMessage('logCyclingEnabled', [String(this.globalSettings.cyclingEnabled)]));
        await saveGlobalSettings(this.globalSettings);

        const cyclingSwitch = document.getElementById('cycling-switch');
        if (cyclingSwitch) {
            cyclingSwitch.checked = true;
        }

        if (this.updateIntervalUI) {
            this.updateIntervalUI();
        }

        await this.updateCyclingAndActivationState();
    };
  }

  updateCameraInfoTab() {
    const infoCameraSelect = document.getElementById('info-camera-select');
    const currentValue = infoCameraSelect.value;
    infoCameraSelect.innerHTML = '';

    if (this.slotOrder.length === 0) {
        const option = document.createElement('option');
        option.textContent = chrome.i18n.getMessage('noCameras');
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
      this.addLog(chrome.i18n.getMessage('logConnectedDevices', [String(devices.length)]));
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
            const curMsg = (val) => chrome.i18n.getMessage('infoCurrent', [String(val || 'N/A')]);

            info = [
                { key: 'infoDeviceId', value: settings.deviceId || 'N/A' },
                { key: 'infoResolution', value: (settings.width && settings.height) ? `${settings.width}x${settings.height}` : 'N/A' },
                { key: 'infoFrameRate', value: settings.frameRate ? settings.frameRate.toFixed(2) + ' fps' : 'N/A' },
                { key: 'infoAspectRatio', value: settings.aspectRatio ? settings.aspectRatio.toFixed(2) : 'N/A' },
                { key: 'infoFocusMode', value: (capabilities.focusMode ? capabilities.focusMode.join(', ') : 'N/A') + ' ' + curMsg(settings.focusMode) },
                { key: 'infoFocusDistance', value: settings.focusDistance !== undefined ? settings.focusDistance : 'N/A' },
                { key: 'infoExposureMode', value: (capabilities.exposureMode ? capabilities.exposureMode.join(', ') : 'N/A') + ' ' + curMsg(settings.exposureMode) },
                { key: 'infoExposureTime', value: settings.exposureTime !== undefined ? settings.exposureTime : 'N/A' },
                { key: 'infoWhiteBalanceMode', value: (capabilities.whiteBalanceMode ? capabilities.whiteBalanceMode.join(', ') : 'N/A') + ' ' + curMsg(settings.whiteBalanceMode) },
                { key: 'infoColorTemperature', value: settings.colorTemperature !== undefined ? settings.colorTemperature : 'N/A' },
                { key: 'infoIso', value: settings.iso !== undefined ? settings.iso : 'N/A' },
                { key: 'infoBrightness', value: settings.brightness !== undefined ? settings.brightness : 'N/A' },
                { key: 'infoContrast', value: settings.contrast !== undefined ? settings.contrast : 'N/A' },
                { key: 'infoSaturation', value: settings.saturation !== undefined ? settings.saturation : 'N/A' },
                { key: 'infoSharpness', value: settings.sharpness !== undefined ? settings.sharpness : 'N/A' }
            ];
            this.cameraInfoCache.set(deviceId, info);
        }
    }

    if (!info) {
        info = this.cameraInfoCache.get(deviceId);
    }

    if (!info) {
        if (shouldRender && listContainer) {
            listContainer.innerHTML = `<p>${chrome.i18n.getMessage('noStreamInfo')}</p>`;
        }
        return;
    }

    if (!shouldRender) return;

    for (const entry of info) {
        const item = document.createElement('div');
        item.className = 'info-item';
        item.innerHTML = `
            <span class="info-label">${chrome.i18n.getMessage(entry.key)}</span>
            <span class="info-value">${entry.value}</span>
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
    this.cycleCount++;

    const index = this.slotOrder.indexOf(deviceId);
    if (index === -1) return;

    if (this.pinnedDeviceId) {
        // A camera is pinned. As per requirements, clicking other camera slots (non-pin buttons)
        // must not release the pin, and the pinned camera's video stream must be maintained.
        return;
    }

    if (this.shouldCycle()) {
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

    if (this.shouldCycle() && !this.pinnedDeviceId) {
        this.startCycling();
    }

    saveSessionState(this.slotOrder, this.activeSlotIndex);
  }

  async activateAllCameras() {
    if (this.shouldCycle()) return;

    if (this.slotOrder.length > 1) {
        await this.activateMultipleCameras();
        return;
    }

    this.addLog(chrome.i18n.getMessage('logActivatingAll', [String(this.shouldCycle())]));
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
    this.addLog(chrome.i18n.getMessage('logMultiActivationStart', [String(initialOrder.length)]));

    const isStateChanged = () => {
        return this.shouldCycle() ||
            this.slotOrder.length !== initialOrder.length ||
            !this.slotOrder.every((id, idx) => id === initialOrder[idx]);
    };

    // We search up to 4 fallback step-down levels
    for (let levelIdx = 0; levelIdx < 4; levelIdx++) {
        if (isStateChanged()) {
            this.addLog(chrome.i18n.getMessage('logMultiActivationAborted'));
            return false;
        }

        this.addLog(`Attempting multi-camera activation at step-down level ${levelIdx}...`);

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
                const resolution = this.getSteppedDownResolution(slot, levelIdx);
                const success = await this.activateSlot(slot, deviceId, resolution);
                if (success) {
                    activatedSlots.push(slot);
                    // Small delay between activations to mitigate spikes
                    await new Promise(r => setTimeout(r, 1000));
                } else {
                    this.addLog(chrome.i18n.getMessage('logActivationFailed', [deviceId.slice(0, 8), resolution.label]));
                    allSuccessful = false;
                    break;
                }
            }
        }

        if (isStateChanged()) {
            this.addLog(chrome.i18n.getMessage('logMultiActivationAborted'));
            for (const slot of activatedSlots) {
                await this.deactivateSlot(slot);
            }
            return false;
        }

        if (allSuccessful) {
            const resLabels = activatedSlots.map(s => {
                const res = this.getSteppedDownResolution(s, levelIdx);
                return res.label.split(' ')[0];
            }).join(', ');
            this.addLog(`Successfully activated all cameras at step-down level ${levelIdx}: ${resLabels}`);
            if (levelIdx > 0) {
                this.showSnackbar(chrome.i18n.getMessage('snackbarResolutionReduced', [resLabels]));
            }
            return true;
        }

        // If not all successful, clean up before trying next level
        for (const slot of activatedSlots) {
            await this.deactivateSlot(slot);
        }
    }

    this.addLog(chrome.i18n.getMessage('logMultiActivationFallback'), true);
    this.showSnackbar(chrome.i18n.getMessage('snackbarMultiActivationFailed'));

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

    // Only show the bandwidth suggestion dialog if cycling is OFF and at least one camera failed to start (has no stream)
    if (!this.globalSettings.cyclingEnabled) {
        const hasFailedCamera = this.slotOrder.some(deviceId => {
            const s = this.slots.get(deviceId);
            return s && !s.stream;
        });
        if (hasFailedCamera) {
            this.showBandwidthDialog();
        }
    }

    return false;
  }

  async addCamera(camera) {
    // Force Zoom 4 (smallest size, 25%) and persist immediately
    await this.saveCameraSetting(camera.deviceId, { zoom: 4 });
    const slot = await this.createCameraSlot(camera);
    this.slots.set(camera.deviceId, slot);
    this.slotOrder.push(camera.deviceId);
    this.container.appendChild(slot.element);

    const cyclingSwitch = document.getElementById('cycling-switch');
    if (cyclingSwitch) cyclingSwitch.disabled = this.slotOrder.length < 2;

    if (this.currentLayout === 'wide') {
        this.reorganizeForWide();
    }

    if (this.shouldCycle()) {
        this.activeSlotIndex = this.slotOrder.indexOf(camera.deviceId);
    }
    await this.updateCyclingAndActivationState();
    saveSessionState(this.slotOrder, this.activeSlotIndex);
  }

  async startCycling() {
    if (this.cycleTimeoutId) clearTimeout(this.cycleTimeoutId);
    if (!this.shouldCycle()) return;
    if (this.pinnedDeviceId) return;
    const interval = this.globalSettings.interval || 5;
    this.cycleTimeoutId = setTimeout(() => this.nextCamera(), interval * 1000);
  }

  async nextCamera() {
    if (!this.shouldCycle()) return;
    if (this.pinnedDeviceId) return;

    // 1. Capture and stop current active slot (only if it is not whiteboard mode with excludeWhiteboard enabled)
    if (this.activeSlotIndex !== -1) {
        const currentDeviceId = this.slotOrder[this.activeSlotIndex];
        const slot = this.slots.get(currentDeviceId);
        const isWhiteboard = this.getSlotRole(currentDeviceId) === 'whiteboard';
        const keepActive = this.globalSettings.excludeWhiteboard && isWhiteboard;
        if (slot && !keepActive) {
            await this.deactivateSlot(slot);
        }
    }

    if (this.pinnedDeviceId) return;

    // 2. Advance index
    const allowedIds = this.getCyclingTargetDeviceIds();
    let nextDeviceId = null;
    if (allowedIds.length > 0) {
        const currentActiveId = this.activeSlotIndex !== -1 ? this.slotOrder[this.activeSlotIndex] : null;
        let allowedIdx = allowedIds.indexOf(currentActiveId);
        if (allowedIdx === -1) {
            nextDeviceId = allowedIds[0];
        } else {
            allowedIdx = (allowedIdx + 1) % allowedIds.length;
            nextDeviceId = allowedIds[allowedIdx];
        }
    }

    if (!nextDeviceId) return;

    this.activeSlotIndex = this.slotOrder.indexOf(nextDeviceId);
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
    if (this.pinnedDeviceId) return;

    // 4. Start next slot
    const nextSlot = this.slots.get(nextDeviceId);
    if (nextSlot) {
        await this.activateSlot(nextSlot, nextDeviceId);
    }

    if (this.pinnedDeviceId) return;

    // 5. Schedule next switch
    this.cycleTimeoutId = setTimeout(() => this.nextCamera(), this.globalSettings.interval * 1000);
  }

  async activateSlot(slot, deviceId, resolution = null) {
    if (slot.isActivating) {
        this.addLog(chrome.i18n.getMessage('logSkippingActivation', [deviceId.slice(0, 8)]));
        return false;
    }
    if (slot.stream && !resolution) {
        return true;
    }
    slot.isActivating = true;

    const maxRetries = resolution ? 1 : 3; // No retries during multi-camera search
    try {
        for (let i = 0; i < maxRetries; i++) {
            // Check if camera is still needed
            const isWhiteboard = this.getSlotRole(deviceId) === 'whiteboard';
            const alwaysKeepActive = this.globalSettings.excludeWhiteboard && isWhiteboard;
            const isStillNeeded = this.slotOrder.includes(deviceId) && (alwaysKeepActive || (this.shouldCycle()
                ? (this.slotOrder[this.activeSlotIndex] === deviceId)
                : true));
            if (!isStillNeeded) {
                this.addLog(chrome.i18n.getMessage('logActivationAborted', [deviceId.slice(0, 8)]));
                return false;
            }

            const targetRes = resolution || this.getSteppedDownResolution(slot, i);
            this.addLog(chrome.i18n.getMessage('logActivatingAttempt', [deviceId.slice(0, 8), String(i + 1), String(maxRetries), targetRes.label]));

            try {
                const stream = await startCamera(deviceId, targetRes);

                // Check if still needed after async acquisition to prevent leaks
                const isStillNeededPost = this.slotOrder.includes(deviceId) && (alwaysKeepActive || (this.shouldCycle()
                    ? (this.slotOrder[this.activeSlotIndex] === deviceId)
                    : true));
                if (!isStillNeededPost) {
                    this.addLog(chrome.i18n.getMessage('logActivationAbortedPost', [deviceId.slice(0, 8)]));
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
                    if (slot.processor) {
                        slot.processor.stop();
                    }
                    slot.processor = this.initProcessor(slot, deviceId);
                }
                const track = stream.getVideoTracks()[0];
                const settings = track ? track.getSettings() : {};
                this.addLog(chrome.i18n.getMessage('logActivationSuccess', [deviceId.slice(0, 8), String(settings.width), String(settings.height), settings.frameRate?.toFixed(2)]));

                // Update cache
                this.displayCameraInfo(deviceId);

                this.updateResolutionFpsDisplay(slot);

                // Restore lock state if saved
                if (setting.mediaSettingsFixed) {
                    if (slot.adjustingTimeoutId) {
                        clearTimeout(slot.adjustingTimeoutId);
                    }
                    const adjOverlay = slot.element.querySelector('.adjusting-overlay');
                    if (adjOverlay) adjOverlay.classList.remove('hidden');

                    // Small delay to let camera stabilize (auto-focus) before locking
                    slot.adjustingTimeoutId = setTimeout(async () => {
                        slot.adjustingTimeoutId = null;
                        // Check if still active and track is still live
                        if (slot.stream && track.readyState === 'live') {
                            const success = await this.applyMediaLock(track, true);
                            if (success) {
                                const lockBtn = slot.element.querySelector('.lock-btn');
                                if (lockBtn) {
                                    lockBtn.classList.add('locked');
                                    lockBtn.querySelector('.material-symbols-outlined').textContent = 'lock';
                                }
                            }
                        }
                        if (adjOverlay) adjOverlay.classList.add('hidden');
                    }, 3000);
                }

                return true; // Success
            } catch (e) {
                const errorDetail = `${e.name}: ${e.message}`;
                this.addLog(chrome.i18n.getMessage('logAttemptFailed', [String(i + 1), deviceId.slice(0, 8), errorDetail]), true);

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
                    this.showSnackbar(chrome.i18n.getMessage('snackbarCameraStartFailed', [suffix, e.name + ' - ' + e.message]));
                }
            }
        }
    } finally {
        slot.isActivating = false;
    }
    return false;
  }

  async deactivateSlot(slot) {
    if (slot.adjustingTimeoutId) {
        clearTimeout(slot.adjustingTimeoutId);
        slot.adjustingTimeoutId = null;
        const adjOverlay = slot.element.querySelector('.adjusting-overlay');
        if (adjOverlay) adjOverlay.classList.add('hidden');
    }

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

    // Reset adjustment states to ensure clean state on re-activation
    const videoWrapper = slot.element.querySelector('.video-wrapper');
    if (videoWrapper) {
        videoWrapper.classList.remove('adjusting-perspective');
    }
    const vOverlay = slot.element.querySelector('.vscale-overlay');
    const role = slot.element.querySelector('.role-switch')?.checked ? 'whiteboard' : 'person';
    if (vOverlay && role === 'whiteboard') {
        vOverlay.classList.remove('hidden');
    }

    // Stop stream
    if (slot.stream) {
        slot.stream.getTracks().forEach(track => track.stop());
        slot.stream = null;
    }
    video.srcObject = null;
    slot.element.classList.remove('active');

    this.updateResolutionFpsDisplay(slot);
  }

  async moveCamera(deviceId, direction) {
    const index = this.slotOrder.indexOf(deviceId);
    if (index === -1) return;

    const oldActiveDeviceId = this.slotOrder[this.activeSlotIndex];

    if (direction === 'up' && index > 0) {
        this.addLog(chrome.i18n.getMessage('logMovingUp', [deviceId.slice(0, 8)]));
        [this.slotOrder[index], this.slotOrder[index - 1]] = [this.slotOrder[index - 1], this.slotOrder[index]];
    } else if (direction === 'down' && index < this.slotOrder.length - 1) {
        this.addLog(chrome.i18n.getMessage('logMovingDown', [deviceId.slice(0, 8)]));
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
        this.reorganizeForNarrow();
    }
  }

  async createCameraSlot(camera) {
    const deviceId = camera.deviceId;
    const savedSetting = this.settings[deviceId] || {};
    const defaultLabel = (camera.label || 'Camera') + ` (${deviceId.slice(0, 4)})`;
    const setting = {
      role: savedSetting.defaultRole || 'person',
      customLabel: savedSetting.customLabel || defaultLabel,
      zoom: savedSetting.zoom || 1,
      vScale: savedSetting.modes?.whiteboard?.vScale || 1.0
    };

    const element = document.createElement('div');
    element.className = `camera-slot zoom-${setting.zoom}`;
    element.dataset.zoom = setting.zoom;
    element.dataset.vScale = setting.vScale;

    const vScaleHiddenClass = (setting.role !== 'whiteboard') ? 'hidden' : '';
    const initialAspectRatio = (setting.role === 'whiteboard') ? `16 / ${9 * setting.vScale}` : '16 / 9';

    element.innerHTML = `
      <div class="video-wrapper" style="aspect-ratio: ${initialAspectRatio}">
        <video autoplay playsinline muted></video>
        <canvas class="processed-canvas whiteboard-only ${setting.role === 'whiteboard' ? '' : 'hidden'}"></canvas>
        <canvas class="freeze-canvas"></canvas>
        <canvas class="overlay-canvas"></canvas>

        <!-- Rotation overlays -->
        <button class="video-overlay-top-left rot-left-btn hidden" title="${chrome.i18n.getMessage('rotLeftBtnTitle')}">
            <span class="material-symbols-outlined">rotate_left</span>
        </button>
        <button class="video-overlay-top-right-rot rot-right-btn hidden" title="${chrome.i18n.getMessage('rotRightBtnTitle')}">
            <span class="material-symbols-outlined">rotate_right</span>
        </button>

        <!-- Left Side Pin Button Overlay -->
        <div class="video-overlay-bottom-left pin-overlay hidden">
            <button class="pin-btn-overlay" title="${chrome.i18n.getMessage('pinBtnTitle')}">
                <span class="material-symbols-outlined">push_pin</span>
            </button>
        </div>

        <!-- Right Side Control Overlays -->
        <div class="video-overlay-top-right flex-row-overlay">
            <div class="pause-indicator">
                <span class="material-symbols-outlined">pause_circle</span>
            </div>
            <button class="delete-btn-overlay" title="${chrome.i18n.getMessage('deleteBtnOverlay')}">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>

        <!-- Resolution & FPS Display Overlay -->
        <div class="camera-resolution-fps-overlay hidden"></div>

        <div class="video-overlay-top-left-vscale vscale-overlay whiteboard-only ${vScaleHiddenClass}">
            <button class="vscale-btn-overlay vscale-reset-btn" title="${chrome.i18n.getMessage('vResetBtnTitle')}">
                <span class="material-symbols-outlined">restart_alt</span>
            </button>
            <button class="vscale-btn-overlay vscale-compress-btn" title="${chrome.i18n.getMessage('vCompressBtnTitle')}">
                <span class="material-symbols-outlined">compress</span>
            </button>
            <button class="vscale-btn-overlay vscale-expand-btn" title="${chrome.i18n.getMessage('vExpandBtnTitle')}">
                <span class="material-symbols-outlined">expand</span>
            </button>
            <button class="vscale-btn-overlay vscale-max-btn" title="${chrome.i18n.getMessage('vMaximizeBtnTitle')}">
                <span class="material-symbols-outlined">crop_portrait</span>
            </button>
        </div>
        <div class="video-overlay-bottom-right">
            <button class="zoom-btn-overlay zoom-out-btn" title="${chrome.i18n.getMessage('zoomOutBtnTitle')}">
                <span class="material-symbols-outlined">zoom_out</span>
            </button>
            <button class="zoom-btn-overlay zoom-in-btn" title="${chrome.i18n.getMessage('zoomInBtnTitle')}">
                <span class="material-symbols-outlined">zoom_in</span>
            </button>
        </div>
        <div class="adjusting-overlay hidden">
            <span class="material-symbols-outlined">sync</span>
            <span data-i18n="adjustingMsg">${chrome.i18n.getMessage('adjustingMsg')}</span>
        </div>
      </div>
      <div class="slot-controls">
        <div class="control-row">
          <div class="slot-move-controls">
              <button class="m3-icon-button-small move-up-btn" title="${chrome.i18n.getMessage('moveUpBtn')}">
                  <span class="material-symbols-outlined">arrow_upward</span>
              </button>
              <button class="m3-icon-button-small move-down-btn" title="${chrome.i18n.getMessage('moveDownBtn')}">
                  <span class="material-symbols-outlined">arrow_downward</span>
              </button>
          </div>
          <div class="role-switch-wrapper" title="${chrome.i18n.getMessage('roleSwitchTitle')}">
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
          <input type="text" class="m3-textfield label-input" placeholder="${chrome.i18n.getMessage('cameraNamePlaceholder')}">

          <button class="m3-icon-button-small guideline-btn whiteboard-only ${setting.role === 'whiteboard' ? '' : 'hidden'}" title="${chrome.i18n.getMessage('guidelineBtnTitle')}">
              <span class="material-symbols-outlined">grid_on</span>
          </button>

          <button class="m3-icon-button-small lock-btn" title="${chrome.i18n.getMessage('lockBtnTitle')}">
              <span class="material-symbols-outlined">lock_open</span>
          </button>

          <button class="m3-icon-button-small occlusion-btn whiteboard-only ${setting.role === 'whiteboard' ? '' : 'hidden'}" title="${chrome.i18n.getMessage('occlusionBtnTitle')}">
              <span class="material-symbols-outlined">person_off</span>
          </button>

          <button class="m3-icon-button-small set-btn whiteboard-only ${setting.role === 'whiteboard' ? '' : 'hidden'}" title="${chrome.i18n.getMessage('setBtnTitle')}">
              <span class="material-symbols-outlined">settings_overscan</span>
          </button>
          <button class="m3-icon-button-small reset-btn whiteboard-only ${setting.role === 'whiteboard' ? '' : 'hidden'}" title="${chrome.i18n.getMessage('resetBtnTitle')}">
              <span class="material-symbols-outlined">restart_alt</span>
          </button>
          <button class="m3-icon-button-small copy-btn whiteboard-only ${setting.role === 'whiteboard' ? '' : 'hidden'}" title="${chrome.i18n.getMessage('copyBtnTitle')}">
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

    const zoomInBtn = element.querySelector('.zoom-in-btn');
    const zoomOutBtn = element.querySelector('.zoom-out-btn');
    const deleteBtn = element.querySelector('.delete-btn-overlay');
    const pinBtn = element.querySelector('.pin-btn-overlay');

    if (pinBtn) {
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePin(deviceId);
        });
    }

    const vExpandBtn = element.querySelector('.vscale-expand-btn');
    const vCompressBtn = element.querySelector('.vscale-compress-btn');
    const vResetBtn = element.querySelector('.vscale-reset-btn');
    const vMaxBtn = element.querySelector('.vscale-max-btn');
    const videoWrapper = element.querySelector('.video-wrapper');

    const updateZoomUI = (zoom) => {
        element.classList.remove('zoom-1', 'zoom-2', 'zoom-4');
        element.classList.add(`zoom-${zoom}`);
        element.dataset.zoom = zoom;
        zoomInBtn.disabled = (zoom === 1);
        zoomOutBtn.disabled = (zoom === 4);
    };

    updateZoomUI(setting.zoom);

    zoomInBtn.onclick = async (e) => {
        e.stopPropagation();
        const currentZoom = parseInt(element.dataset.zoom || '1');
        let nextZoom = currentZoom;
        if (currentZoom === 2) {
            nextZoom = 1;
        } else if (currentZoom === 4) {
            nextZoom = 2;
        }
        if (nextZoom !== currentZoom) {
            zoomInBtn.disabled = true;
            zoomOutBtn.disabled = true;
            updateZoomUI(nextZoom);
            await this.saveCameraSetting(deviceId, { zoom: nextZoom });
            const slot = this.slots.get(deviceId);
            if (slot) {
                await this.deactivateSlot(slot);
                await new Promise(r => setTimeout(r, 750));
                await this.activateSlot(slot, deviceId);
            }
            updateZoomUI(nextZoom);
        }
    };

    zoomOutBtn.onclick = async (e) => {
        e.stopPropagation();
        const currentZoom = parseInt(element.dataset.zoom || '1');
        let nextZoom = currentZoom;
        if (currentZoom === 1) {
            nextZoom = 2;
        } else if (currentZoom === 2) {
            nextZoom = 4;
        }
        if (nextZoom !== currentZoom) {
            zoomInBtn.disabled = true;
            zoomOutBtn.disabled = true;
            updateZoomUI(nextZoom);
            await this.saveCameraSetting(deviceId, { zoom: nextZoom });
            const slot = this.slots.get(deviceId);
            if (slot) {
                await this.deactivateSlot(slot);
                await new Promise(r => setTimeout(r, 750));
                await this.activateSlot(slot, deviceId);
            }
            updateZoomUI(nextZoom);
        }
    };

    const updateVScaleUI = (scale) => {
        element.dataset.vScale = scale;
        const role = element.querySelector('.role-switch').checked ? 'whiteboard' : 'person';
        if (role === 'whiteboard' && !videoWrapper.classList.contains('adjusting-perspective')) {
            videoWrapper.style.aspectRatio = `16 / ${9 * scale}`;
        } else {
            videoWrapper.style.aspectRatio = '16 / 9';
        }

        // Upper limit: 9:16 (scale ≈ 3.1605)
        // Lower limit: 16:9 (scale = 1.0)
        vExpandBtn.disabled = (scale >= 3.1);
        vCompressBtn.disabled = (scale <= 1.05); // Use slightly more than 1.0 to handle floating point
        vMaxBtn.disabled = (scale >= 3.16);
    };

    updateVScaleUI(setting.vScale);

    vExpandBtn.onclick = (e) => {
        e.stopPropagation();
        const currentScale = parseFloat(element.dataset.vScale || '1.0');
        const nextScale = Math.min(3.1605, currentScale + 0.1);
        updateVScaleUI(nextScale);
        this.saveCameraSetting(deviceId, { modes: { whiteboard: { vScale: nextScale } } });
        this.addLog(chrome.i18n.getMessage('logVScaleChanged', [deviceId.slice(0, 8), nextScale.toFixed(2)]));
    };

    vCompressBtn.onclick = (e) => {
        e.stopPropagation();
        const currentScale = parseFloat(element.dataset.vScale || '1.0');
        const nextScale = Math.max(1.0, currentScale - 0.1);
        updateVScaleUI(nextScale);
        this.saveCameraSetting(deviceId, { modes: { whiteboard: { vScale: nextScale } } });
        this.addLog(chrome.i18n.getMessage('logVScaleChanged', [deviceId.slice(0, 8), nextScale.toFixed(2)]));
    };

    vResetBtn.onclick = (e) => {
        e.stopPropagation();
        updateVScaleUI(1.0);
        this.saveCameraSetting(deviceId, { modes: { whiteboard: { vScale: 1.0 } } });
        this.addLog(chrome.i18n.getMessage('logVScaleChanged', [deviceId.slice(0, 8), '1.00']));
    };

    vMaxBtn.onclick = (e) => {
        e.stopPropagation();
        const nextScale = 3.1605;
        updateVScaleUI(nextScale);
        this.saveCameraSetting(deviceId, { modes: { whiteboard: { vScale: nextScale } } });
        this.addLog(chrome.i18n.getMessage('logVScaleChangedMax', [deviceId.slice(0, 8)]));
    };

    element.querySelector('.video-wrapper').onclick = (e) => {
        if (e.target.closest('.zoom-btn-overlay')) return;
        if (e.target.closest('.vscale-btn-overlay')) return;
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
            await this.saveCameraSetting(deviceId, { mediaSettingsFixed: nextLocked });
            const status = chrome.i18n.getMessage(nextLocked ? 'lockStatusLocked' : 'lockStatusUnlocked');
            this.addLog(chrome.i18n.getMessage('logLockSettingsChanged', [deviceId.slice(0, 8), status]));
        } else {
            this.showSnackbar(chrome.i18n.getMessage('snackbarLockNotSupported'));
        }
    });

    const roleSwitch = element.querySelector('.role-switch');
    roleSwitch.addEventListener('change', async (e) => {
      const role = e.target.checked ? 'whiteboard' : 'person';
      this.addLog(chrome.i18n.getMessage('logModeChanged', [deviceId.slice(0, 8), role]));

      // If switching to whiteboard mode and excludeWhiteboard is ON, we must release the pin if this camera is pinned
      if (role === 'whiteboard' && this.globalSettings.excludeWhiteboard && this.pinnedDeviceId === deviceId) {
          this.releasePin(false);
      }

      // Update aspect ratio based on mode
      const currentVScale = parseFloat(element.dataset.vScale || '1.0');
      if (role === 'whiteboard') {
          videoWrapper.style.aspectRatio = `16 / ${9 * currentVScale}`;
      } else {
          videoWrapper.style.aspectRatio = '16 / 9';
      }

      // If whiteboard auto-focus is enabled, and we switched to whiteboard mode,
      // and there are multiple cameras, trigger autofocus!
      if (role === 'whiteboard' && this.globalSettings.wbAutoFocusEnabled && this.slotOrder.length >= 2) {
          // Trigger the whiteboard auto-focus before updateCyclingAndActivationState
          await this.enforceWhiteboardAutoFocus(deviceId);
      }

      // If switching from whiteboard to person, unlock focus if it was locked
      if (role === 'person') {
          const slot = this.slots.get(deviceId);
          const lockBtn = element.querySelector('.lock-btn');
          const isLocked = lockBtn && lockBtn.classList.contains('locked');
          const hasPendingTimeout = slot && slot.adjustingTimeoutId;

          if (isLocked || hasPendingTimeout) {
              if (slot && slot.adjustingTimeoutId) {
                  clearTimeout(slot.adjustingTimeoutId);
                  slot.adjustingTimeoutId = null;
                  const adjOverlay = slot.element.querySelector('.adjusting-overlay');
                  if (adjOverlay) adjOverlay.classList.add('hidden');
              }

              if (lockBtn) {
                  lockBtn.classList.remove('locked');
                  const icon = lockBtn.querySelector('.material-symbols-outlined');
                  if (icon) icon.textContent = 'lock_open';
              }

              await this.saveCameraSetting(deviceId, { mediaSettingsFixed: false });
              this.addLog(chrome.i18n.getMessage('logLockSettingsChanged', [deviceId.slice(0, 8), chrome.i18n.getMessage('lockStatusUnlocked')]));

              if (slot && slot.stream) {
                  const track = slot.stream.getVideoTracks()[0];
                  if (track) {
                      await this.applyMediaLock(track, false);
                  }
              }
          }
      }

      // Update local settings first to ensure subsequent calls use the new role
      if (!this.settings[deviceId]) {
        this.settings[deviceId] = { modes: { person: {}, whiteboard: {} } };
      }

      // Persist the current mode as defaultRole so it's restored on next load/export
      await this.saveCameraSetting(deviceId, { defaultRole: role });

      const wbControls = element.querySelectorAll('.whiteboard-only');
      const vScaleOverlay = element.querySelector('.vscale-overlay');

      wbControls.forEach(ctrl => {
          if (role === 'whiteboard') {
              ctrl.classList.remove('hidden');
          } else {
              ctrl.classList.add('hidden');
          }
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
                  slot.processor = this.initProcessor(slot, deviceId);

                  // Auto-enter perspective adjustment if points are default
                  const pts = this.settings[deviceId]?.modes?.whiteboard?.points;
                  const isDefault = !pts || (
                      pts[0].x === 20 && pts[0].y === 20 &&
                      pts[1].x === 80 && pts[1].y === 20 &&
                      pts[2].x === 80 && pts[2].y === 80 &&
                      pts[3].x === 20 && pts[3].y === 80
                  );
                  if (isDefault) {
                      slot.processor.transformer.setShowingHandles(true);
                  }
                  await updateAdjustingUI(slot, slot.processor.transformer.showHandles);
              } else {
                  if (slot.processor) {
                      slot.processor.stop();
                      slot.processor = null;
                  } else {
                      // Fallback: Ensure no other leaked transformer is affecting the video or canvas
                      slot.video.style.transform = '';
                      slot.video.style.objectFit = 'contain';
                      if (slot.processedCanvas) {
                          slot.processedCanvas.style.transform = '';
                          slot.processedCanvas.style.display = 'none';
                      }
                  }
                  const ctx = slot.canvas.getContext('2d');
                  ctx.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
              }
          }
      }
      await this.updateCyclingAndActivationState();
    });

    const occlusionBtn = element.querySelector('.occlusion-btn');
    const guidelineBtn = element.querySelector('.guideline-btn');

    const updateWhiteboardUI = () => {
        const s = this.settings[deviceId]?.modes?.whiteboard || {};
        occlusionBtn.classList.toggle('active', !!s.occlusionRemoval);
        guidelineBtn.classList.toggle('active', !!s.guidelines);
    };
    updateWhiteboardUI();

    occlusionBtn.addEventListener('click', async () => {
        const slot = this.slots.get(deviceId);
        if (slot && !slot.processor) await this.switchActiveCamera(deviceId);
        if (slot && slot.processor) {
            const current = !!(this.settings[deviceId]?.modes?.whiteboard?.occlusionRemoval);
            const newValue = !current;
            slot.processor.setOcclusionRemoval(newValue);
            await this.saveCameraSetting(deviceId, { modes: { whiteboard: { occlusionRemoval: newValue } } });
            updateWhiteboardUI();
        }
    });

    guidelineBtn.addEventListener('click', async () => {
        const slot = this.slots.get(deviceId);
        if (slot && !slot.processor) await this.switchActiveCamera(deviceId);
        if (slot && slot.processor) {
            const current = !!(this.settings[deviceId]?.modes?.whiteboard?.guidelines);
            const newValue = !current;
            slot.processor.transformer.showGuidelines = newValue;
            await this.saveCameraSetting(deviceId, { modes: { whiteboard: { guidelines: newValue } } });
            updateWhiteboardUI();
            const status = chrome.i18n.getMessage(newValue ? 'guidelineStatusOn' : 'guidelineStatusOff');
            this.addLog(chrome.i18n.getMessage('logGuidelineChanged', [deviceId.slice(0, 8), status]));
        }
    });

    const updateAdjustingUI = async (slot, isAdjusting) => {
        const sBtn = slot.element.querySelector('.set-btn');
        const gBtn = slot.element.querySelector('.guideline-btn');
        const vOverlay = slot.element.querySelector('.vscale-overlay');
        const vWrapper = slot.element.querySelector('.video-wrapper');
        const role = slot.element.querySelector('.role-switch').checked ? 'whiteboard' : 'person';

        if (sBtn) sBtn.classList.toggle('active', isAdjusting);
        if (gBtn) gBtn.disabled = isAdjusting;

        if (isAdjusting) {
            if (vOverlay) vOverlay.classList.add('hidden');
            if (vWrapper) vWrapper.classList.add('adjusting-perspective');

            // Turn off guidelines if they were ON
            if (slot.processor && slot.processor.transformer.showGuidelines) {
                slot.processor.transformer.showGuidelines = false;
                if (this.settings[deviceId]?.modes?.whiteboard) {
                    await this.saveCameraSetting(deviceId, { modes: { whiteboard: { guidelines: false } } });
                }
                if (gBtn) gBtn.classList.remove('active');
            }
        } else {
            if (role === 'whiteboard' && vOverlay) vOverlay.classList.remove('hidden');
            if (vWrapper) vWrapper.classList.remove('adjusting-perspective');
        }
    };

    const setBtn = element.querySelector('.set-btn');
    setBtn.addEventListener('click', async () => {
        const slot = this.slots.get(deviceId);
        if (slot && !slot.processor) {
            await this.switchActiveCamera(deviceId);
        }
        if (slot && slot.processor) {
            const nextAdjusting = !slot.processor.transformer.showHandles;
            slot.processor.transformer.setShowingHandles(nextAdjusting);
            await updateAdjustingUI(slot, nextAdjusting);
        }
    });

    const resetBtn = element.querySelector('.reset-btn');
    resetBtn.addEventListener('click', async () => {
        const slot = this.slots.get(deviceId);
        if (slot && !slot.processor) {
            await this.switchActiveCamera(deviceId);
        }
        if (slot) {
            if (slot.processor) {
                this.addLog(chrome.i18n.getMessage('logResetPerspective', [deviceId.slice(0, 8)]));
                slot.processor.transformer.resetPoints();
            } else {
                this.addLog(chrome.i18n.getMessage('logResetTransform', [deviceId.slice(0, 8)]));
                slot.video.style.transform = '';
            }

            // Also reset vertical scale if applicable
            if (slot.updateVScaleUI) {
                slot.updateVScaleUI(1.0);
                await this.saveCameraSetting(deviceId, { modes: { whiteboard: { vScale: 1.0 } } });
                this.addLog(chrome.i18n.getMessage('logVScaleChanged', [deviceId.slice(0, 8), '1.00']));
            }

            this.showSnackbar(chrome.i18n.getMessage('snackbarResetDone'));
        }
    });

    const copyBtn = element.querySelector('.copy-btn');
    copyBtn.addEventListener('click', async () => {
        const slot = this.slots.get(deviceId);
        if (!slot) return;
        this.addLog(chrome.i18n.getMessage('logCapturing', [deviceId.slice(0, 8), this.settings[deviceId]?.defaultRole || 'person']));
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
            this.showSnackbar(chrome.i18n.getMessage('snackbarCaptured'));
        } catch (err) {
            console.error('Clipboard copy failed:', err);
            this.showSnackbar(chrome.i18n.getMessage('snackbarCaptureFailed', [err.message]));
        }
    });

    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const slot = this.slots.get(deviceId);
        if (slot) {
            this.addLog(chrome.i18n.getMessage('logDeletingSlot', [deviceId.slice(0, 8)]));
            const index = this.slotOrder.indexOf(deviceId);
            const wasActive = index === this.activeSlotIndex;

            if (this.pinnedDeviceId === deviceId) {
                this.releasePin(false);
            }

            await this.deactivateSlot(slot);
            slot.element.remove();
            this.slots.delete(deviceId);
            this.slotOrder = this.slotOrder.filter(id => id !== deviceId);

            if (this.slotOrder.length === 0) {
                this.activeSlotIndex = -1;
                if (this.cycleTimeoutId) {
                    clearTimeout(this.cycleTimeoutId);
                    this.cycleTimeoutId = null;
                }
                this.showCameraDialog();
            } else {
                if (this.currentLayout === 'wide') {
                    this.reorganizeForWide();
                } else {
                    this.reorganizeForNarrow();
                }
                if (index < this.activeSlotIndex) {
                    this.activeSlotIndex--;
                }
                this.activeSlotIndex = this.activeSlotIndex % this.slotOrder.length;

                await this.updateCyclingAndActivationState();
            }
            const cyclingSwitch = document.getElementById('cycling-switch');
            if (cyclingSwitch) cyclingSwitch.disabled = this.slotOrder.length < 2;
            saveSessionState(this.slotOrder, this.activeSlotIndex);
        }
    });

    const labelInput = element.querySelector('.label-input');
    labelInput.addEventListener('blur', async (e) => {
      let customLabel = e.target.value.trim();
      if (customLabel === '') {
        customLabel = defaultLabel;
        e.target.value = customLabel;
      }
      await this.saveCameraSetting(deviceId, { customLabel });
    });

    const slotObj = { element, video, canvas, processedCanvas, freezeCanvas, processor: null, stream: null, updateVScaleUI };
    return slotObj;
  }

  handlePerspectiveAdjustmentComplete(deviceId, slot) {
      if (!slot || !slot.processor) return;
      const processor = slot.processor;
      if (!processor.transformer.rotatedDuringAdjustment) {
          // Fの向き（回転操作）を変えていない場合は何もしない
          return;
      }

      const points = processor.transformer.points;
      if (!Array.isArray(points) || points.length !== 4 || points.some(p => !p || typeof p.x !== 'number' || typeof p.y !== 'number')) return;

      // 16:9 のパーセンテージ空間の歪みを補正するためのアスペクト比
      const aspect = 16 / 9;

      // 頂点 0:左上, 1:右上, 2:右下, 3:左下 の距離（辺の長さ）をアスペクト比補正した上で算出
      const dTop = Math.hypot((points[0].x - points[1].x) * aspect, points[0].y - points[1].y);
      const dBottom = Math.hypot((points[3].x - points[2].x) * aspect, points[3].y - points[2].y);
      const dLeft = Math.hypot((points[0].x - points[3].x) * aspect, points[0].y - points[3].y);
      const dRight = Math.hypot((points[1].x - points[2].x) * aspect, points[1].y - points[2].y);

      const horizontalSum = dTop + dBottom;
      const verticalSum = dLeft + dRight;

      if (horizontalSum < verticalSum) {
          // 縦長対象（9:16表示）
          const nextScale = 3.1605;
          if (slot.updateVScaleUI) slot.updateVScaleUI(nextScale);
          this.saveCameraSetting(deviceId, { modes: { whiteboard: { vScale: nextScale } } });

          const label = slot.element.querySelector('.label-input')?.value || deviceId.slice(0, 8);
          this.addLog(chrome.i18n.getMessage('logVScaleAutoChanged', [label, '9:16']));
          this.showSnackbar(chrome.i18n.getMessage('snackbarVScaleAutoToVertical', [label]));
      } else {
          // 横長対象（16:9表示）
          const nextScale = 1.0;
          if (slot.updateVScaleUI) slot.updateVScaleUI(nextScale);
          this.saveCameraSetting(deviceId, { modes: { whiteboard: { vScale: nextScale } } });

          const label = slot.element.querySelector('.label-input')?.value || deviceId.slice(0, 8);
          this.addLog(chrome.i18n.getMessage('logVScaleAutoChanged', [label, '16:9']));
      }

      // 補正中の回転検知フラグをリセット
      processor.transformer.rotatedDuringAdjustment = false;
  }

  initProcessor(slot, deviceId) {
      const { video, canvas, processedCanvas } = slot;
      const wbSettings = this.settings[deviceId]?.modes?.whiteboard || {};
      const pts = wbSettings.points || [
          {x: 20, y: 20}, {x: 80, y: 20}, {x: 80, y: 80}, {x: 20, y: 80}
      ];

      const showGuidelines = !!wbSettings.guidelines;

      const labels = [
          chrome.i18n.getMessage('handleTopLeft'),
          chrome.i18n.getMessage('handleTopRight'),
          chrome.i18n.getMessage('handleBottomRight'),
          chrome.i18n.getMessage('handleBottomLeft')
      ];

      const processor = new WhiteboardProcessor(video, canvas, processedCanvas, pts, (newPts) => {
          const ptsStr = newPts.map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(', ');
          this.addLog(chrome.i18n.getMessage('logPerspectiveAdjusted', [deviceId.slice(0, 8)]) + ': [' + ptsStr + ']');
          this.saveCameraSetting(deviceId, { modes: { whiteboard: { points: newPts } } });
      }, labels, (handlesVisible) => {
          if (!handlesVisible) {
              // updateAdjustingUI が実行されて .adjusting-perspective クラスが削除された後に
              // アスペクト比の自動調整を適用するため、setTimeout で実行を遅延させます。
              setTimeout(() => {
                  this.handlePerspectiveAdjustmentComplete(deviceId, slot);
              }, 0);
          }
      });

      // Bind rotation buttons
      const rotLeftBtn = slot.element.querySelector('.rot-left-btn');
      const rotRightBtn = slot.element.querySelector('.rot-right-btn');
      if (rotLeftBtn && rotRightBtn) {
          rotLeftBtn.onclick = (e) => {
              e.stopPropagation();
              processor.transformer.rotatePoints('left');
              this.addLog(chrome.i18n.getMessage('logRotateLeft', [deviceId.slice(0, 8)]));
          };
          rotRightBtn.onclick = (e) => {
              e.stopPropagation();
              processor.transformer.rotatePoints('right');
              this.addLog(chrome.i18n.getMessage('logRotateRight', [deviceId.slice(0, 8)]));
          };
      }

      processor.setOcclusionRemoval(!!wbSettings.occlusionRemoval);
      processor.transformer.showGuidelines = showGuidelines;
      processor.start();

      return processor;
  }

  async applyMediaLock(track, locked) {
      if (!track || typeof track.getCapabilities !== 'function' || typeof track.getSettings !== 'function') return false;
      const capabilities = track.getCapabilities();
      const constraints = { advanced: [] };
      const adv = {};

      this.addLog(chrome.i18n.getMessage('logApplyMediaLock', [String(locked)]));

      const modeProps = [
          { prop: 'focusMode', constr: 'focusMode', valProp: 'focusDistance' }
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
              this.addLog(chrome.i18n.getMessage('logApplyingConstraints', [JSON.stringify(constraints)]));
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
                  const modesStr = failedModes.map(m => `${m.constr}=${newSettings[m.constr]}`).join(', ');
                  this.addLog(chrome.i18n.getMessage('logLockFailedModes', [modesStr]));
                  const fallbackAdv = { ...adv };
                  const fallbackConstraints = { ...constraints, advanced: [fallbackAdv] };
                  let hasFallbackValues = false;

                  for (const m of failedModes) {
                      if (m.valProp && newSettings[m.valProp] !== undefined) {
                          fallbackAdv[m.valProp] = newSettings[m.valProp];
                          fallbackConstraints[m.valProp] = newSettings[m.valProp];
                          this.addLog(chrome.i18n.getMessage('logLockFallback', [m.constr, m.valProp, String(newSettings[m.valProp])]));
                          hasFallbackValues = true;
                      }
                  }

                  if (hasFallbackValues) {
                      try {
                          await track.applyConstraints(fallbackConstraints);
                      } catch (fallbackError) {
                          this.addLog(chrome.i18n.getMessage('logLockFallbackFailed', [fallbackError.message]), true);
                      }
                  }
              }

              const finalSettings = track.getSettings();
              this.addLog(chrome.i18n.getMessage('logLockFinal', [
                  String(finalSettings.focusMode), String(finalSettings.focusDistance)
              ]));
              return true;
          } catch (e) {
              this.addLog(chrome.i18n.getMessage('logLockError', [e.message]), true);
              return false;
          }
      }
      return true;
  }

  updatePinTimer() {
      if (this.pinTimerId) {
          clearTimeout(this.pinTimerId);
          this.pinTimerId = null;
      }

      if (this.pinnedDeviceId && this.globalSettings.pinReleaseEnabled) {
          const minutes = Math.max(1, Math.min(15, parseInt(this.globalSettings.pinReleaseTime) || 3));
          this.pinTimerId = setTimeout(() => {
              this.addLog(`Auto-releasing pin for camera ${this.pinnedDeviceId.slice(0, 8)} after ${minutes} minutes...`);
              this.showSnackbar(chrome.i18n.getMessage('snackbarPinReleased', [String(minutes)]));
              this.releasePin(true);
          }, minutes * 60 * 1000);
      }
  }

  togglePin(deviceId) {
      if (this.pinnedDeviceId === deviceId) {
          // Unpin
          this.releasePin(true);
      } else {
          // Pin this camera
          this.pinCamera(deviceId);
      }
  }

  async pinCamera(deviceId) {
      const prevPinnedId = this.pinnedDeviceId;
      this.pinnedDeviceId = deviceId;
      this.addLog(chrome.i18n.getMessage('logPinEnabled', [deviceId.slice(0, 8)]));

      // Stop cycling if it's running
      if (this.cycleTimeoutId) {
          clearTimeout(this.cycleTimeoutId);
          this.cycleTimeoutId = null;
      }

      this.updatePinTimer();

      // Update UI for the previous pinned camera
      if (prevPinnedId && prevPinnedId !== deviceId) {
          const prevSlot = this.slots.get(prevPinnedId);
          if (prevSlot) {
              const pinBtnEl = prevSlot.element.querySelector('.pin-btn-overlay');
              if (pinBtnEl) {
                  pinBtnEl.classList.remove('pinned');
                  pinBtnEl.title = chrome.i18n.getMessage('pinBtnTitle');
              }
          }
      }

      // Update UI for the newly pinned camera
      const slot = this.slots.get(deviceId);
      if (slot) {
          const pinBtnEl = slot.element.querySelector('.pin-btn-overlay');
          if (pinBtnEl) {
              pinBtnEl.classList.add('pinned');
              pinBtnEl.title = chrome.i18n.getMessage('unpinBtnTitle');
          }
      }

      // Delegate activation and deactivation to the serialized queue
      await this.updateCyclingAndActivationState();
  }

  async releasePin(shouldRestartCycling = true) {
      if (!this.pinnedDeviceId) return;

      const prevPinnedId = this.pinnedDeviceId;
      this.pinnedDeviceId = null;
      this.addLog(chrome.i18n.getMessage('logPinDisabled', [prevPinnedId.slice(0, 8)]));

      if (this.pinTimerId) {
          clearTimeout(this.pinTimerId);
          this.pinTimerId = null;
      }

      const slot = this.slots.get(prevPinnedId);
      if (slot) {
          const pinBtnEl = slot.element.querySelector('.pin-btn-overlay');
          if (pinBtnEl) {
              pinBtnEl.classList.remove('pinned');
              pinBtnEl.title = chrome.i18n.getMessage('pinBtnTitle');
          }
      }

      if (shouldRestartCycling) {
          await this.updateCyclingAndActivationState();
      }
  }

  updateAllPinButtonsVisibility() {
      // Pin buttons should only be shown if:
      // - cycling is enabled
      // - there are at least 2 cameras in total
      const totalCameras = this.slotOrder.length;
      const canShowPin = this.globalSettings.cyclingEnabled && totalCameras >= 2;

      for (const [deviceId, slot] of this.slots.entries()) {
          const pinOverlay = slot.element.querySelector('.pin-overlay');
          if (!pinOverlay) continue;

          // If excludeWhiteboard is ON, whiteboard cameras do not show pin button
          const isWhiteboard = this.getSlotRole(deviceId) === 'whiteboard';
          const isExcluded = this.globalSettings.excludeWhiteboard && isWhiteboard;

          if (canShowPin && !isExcluded) {
              pinOverlay.classList.remove('hidden');
          } else {
              pinOverlay.classList.add('hidden');
              // If it was pinned, release it
              if (this.pinnedDeviceId === deviceId) {
                  this.releasePin(false);
              }
          }
      }
  }

  async saveCameraSetting(deviceId, settings) {
      const existing = this.settings[deviceId] || {};
      const existingModes = existing.modes || { person: {}, whiteboard: {} };
      const updated = {
          customLabel: '',
          defaultRole: 'person',
          mediaSettingsFixed: false,
          ...existing,
          ...settings,
          modes: {
              person: { ...(existingModes.person || {}), ...(settings.modes?.person || {}) },
              whiteboard: { ...(existingModes.whiteboard || {}), ...(settings.modes?.whiteboard || {}) }
          }
      };
      this.settings[deviceId] = updated;
      await saveCameraSettingToStorage(deviceId, settings);
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

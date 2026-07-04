/**
 * Camera initialization and persistence logic.
 */
export async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(device => device.kind === 'videoinput');
}

export async function loadCameraSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['camera_settings'], (result) => {
      const settings = result.camera_settings || {};
      const migrated = migrateSettings(settings);
      resolve(migrated);
    });
  });
}

function migrateSettings(settings) {
  let changed = false;
  const migrated = {};

  for (const [deviceId, s] of Object.entries(settings)) {
    // Check if it's the old format
    if (s.role !== undefined && s.modes === undefined) {
      migrated[deviceId] = {
        customLabel: s.customLabel,
        defaultRole: s.role,
        modes: {
          person: {},
          whiteboard: {
            points: s.points
          }
        }
      };
      changed = true;
    } else {
      migrated[deviceId] = s;
    }
  }

  if (changed) {
    chrome.storage.local.set({ camera_settings: migrated });
  }
  return migrated;
}

export async function saveSessionState(slotOrder, activeSlotIndex) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      session_state: {
        slotOrder,
        activeSlotIndex
      }
    }, () => {
      resolve();
    });
  });
}

export async function loadSessionState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['session_state'], (result) => {
      resolve(result.session_state || null);
    });
  });
}

export async function loadGlobalSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['global_settings'], (result) => {
      const defaults = { interval: 5, cyclingEnabled: true };
      resolve({ ...defaults, ...(result?.global_settings || {}) });
    });
  });
}

export async function saveGlobalSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ global_settings: settings }, () => {
      resolve();
    });
  });
}

let saveQueue = Promise.resolve();

export async function saveCameraSetting(deviceId, settings) {
  saveQueue = saveQueue.then(async () => {
    const currentSettings = await loadCameraSettings();
    const existing = currentSettings[deviceId] || {};
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

    currentSettings[deviceId] = updated;
    return new Promise((resolve) => {
      chrome.storage.local.set({ camera_settings: currentSettings }, () => {
        resolve();
      });
    });
  });
  return saveQueue;
}

export const RESOLUTION_LEVELS = [
    { width: 1280, height: 720, frameRate: 15, label: '720p (15fps)' },
    { width: 960, height: 540, frameRate: 15, label: '540p (15fps)' },
    { width: 640, height: 360, frameRate: 15, label: '360p (15fps)' },
    { width: 426, height: 240, frameRate: 10, label: '240p (10fps)' }
];

export async function startCamera(deviceId, resolution = null) {
  const res = resolution || RESOLUTION_LEVELS[0];
  const constraints = {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      aspectRatio: { ideal: 1.7777777778 },
      width: { ideal: res.width },
      height: { ideal: res.height },
      frameRate: { ideal: res.frameRate }
    },
    audio: false
  };
  return await navigator.mediaDevices.getUserMedia(constraints);
}

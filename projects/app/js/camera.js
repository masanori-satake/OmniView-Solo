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
      resolve(result.camera_settings || {});
    });
  });
}

export async function loadGlobalSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['global_settings'], (result) => {
      resolve(result.global_settings || { interval: 5 });
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
    currentSettings[deviceId] = {
      ...(currentSettings[deviceId] || {}),
      ...settings
    };
    return new Promise((resolve) => {
      chrome.storage.local.set({ camera_settings: currentSettings }, () => {
        resolve();
      });
    });
  });
  return saveQueue;
}

export async function startCamera(deviceId, isFallback = false) {
  const constraints = {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      // USB bandwidth contention is a common issue with multiple high-res cameras.
      // Start with a lower resolution and frame rate to increase success rate.
      width: { ideal: isFallback ? 320 : 640 },
      height: { ideal: isFallback ? 240 : 480 },
      frameRate: { ideal: isFallback ? 10 : 15 }
    },
    audio: false
  };
  return await navigator.mediaDevices.getUserMedia(constraints);
}

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

export async function startCamera(deviceId) {
  const constraints = {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };
  return await navigator.mediaDevices.getUserMedia(constraints);
}

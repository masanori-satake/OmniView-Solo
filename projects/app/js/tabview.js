import { app, appReady } from './app.js';
import { initViewModeSwitch } from './viewModeSwitch.js';
import { getViewMode } from './storageManager.js';
import { saveSessionState } from './camera.js';

export async function setupTabViewModeSwitch() {
  const switchContainer = document.querySelector('.view-mode-switch');
  if (!switchContainer) return;

  let viewMode = 'tab';
  try {
    viewMode = await getViewMode();
  } catch (err) {
    app.showSnackbar(chrome.i18n.getMessage('snackbarStorageError') || 'ストレージの読み込みに失敗しました');
  }

  initViewModeSwitch(switchContainer, viewMode, async (nextMode) => {
    if (nextMode === 'sidepanel') {
      await saveSessionState(app.slotOrder, app.activeSlotIndex);
      let tabId = undefined;
      try {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.getCurrent) {
          const tab = await chrome.tabs.getCurrent();
          tabId = tab?.id;
        }
      } catch (err) {
        console.error('Failed to get current tab id:', err);
      }
      chrome.runtime.sendMessage({
        type: 'switch_to_sidepanel',
        tabId,
      });
    }
  });
}

// ページ初期化
await appReady;
await setupTabViewModeSwitch();

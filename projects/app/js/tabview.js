import { app, appReady } from './app.js';
import { initViewModeSwitch } from './viewModeSwitch.js';
import { saveSessionState } from './camera.js';
import { getTileMode, setTileMode } from './storageManager.js';

export async function setupTabViewModeSwitch() {
  const switchContainer = document.querySelector('.view-mode-switch');
  if (!switchContainer) return;

  initViewModeSwitch(switchContainer, 'tab', async (nextMode) => {
    if (nextMode === 'sidepanel') {
      await saveSessionState(app.slotOrder, app.activeSlotIndex);
      let tabId = undefined;
      try {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.getCurrent) {
          const tab = await chrome.tabs.getCurrent();
          tabId = tab?.id;
        }
      } catch {
        console.error('Failed to get current tab id:', err);
      }
      chrome.runtime.sendMessage({
        type: 'switch_to_sidepanel',
        tabId,
      });
    }
  });
}

export async function setupTileModeSwitch() {
  const container = document.getElementById('tile-mode-switch-container');
  if (!container) return;

  const buttons = container.querySelectorAll('.segmented-btn');

  const initialTileMode = await getTileMode();
  await app.setTileMode(initialTileMode);

  const updateSelection = (selectedMode) => {
    buttons.forEach(button => {
      const isSelected = button.dataset.tileMode === selectedMode;
      button.classList.toggle('active', isSelected);
      button.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });
  };

  buttons.forEach(btn => {
    const mode = btn.dataset.tileMode;

    btn.addEventListener('click', async () => {
      const previousMode = container.querySelector('.segmented-btn.active')?.dataset.tileMode || initialTileMode;
      try {
        await setTileMode(mode);
        await app.setTileMode(mode);
        updateSelection(mode);
      } catch (err) {
        updateSelection(previousMode);
        app.showSnackbar(chrome.i18n.getMessage('snackbarTileModeSaveFailed') || 'タイル表示設定の保存に失敗しました');
      }
    });
  });

  updateSelection(initialTileMode);
}

// ページ初期化
await appReady;
await setupTabViewModeSwitch();
await setupTileModeSwitch();

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

export async function setupTileModeSwitch() {
  const container = document.getElementById('tile-mode-switch-container');
  if (!container) return;

  const buttons = container.querySelectorAll('.segmented-btn');

  const initialTileMode = await getTileMode();
  await app.setTileMode(initialTileMode);

  buttons.forEach(btn => {
    const mode = btn.dataset.tileMode;
    const isSelected = mode === initialTileMode;
    btn.classList.toggle('active', isSelected);
    btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');

    btn.addEventListener('click', async () => {
      buttons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');

      await setTileMode(mode);
      await app.setTileMode(mode);
    });
  });
}

// ページ初期化
await appReady;
await setupTabViewModeSwitch();
await setupTileModeSwitch();

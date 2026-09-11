import { app, appReady } from './app.js';
import { initViewModeSwitch } from './viewModeSwitch.js';
import { saveSessionState } from './camera.js';
import { getTileMode, setTileMode } from './storageManager.js';

/**
 * タブ表示からサイドパネル表示へ切り替えるスイッチを初期化する。
 *
 * @returns {Promise<void>}
 */
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

/**
 * 保存済みのタイルモードを復元し、切り替えボタンを初期化する。
 *
 * @returns {Promise<void>}
 */
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
      buttons.forEach(button => { button.disabled = true; });
      try {
        await setTileMode(mode);
        await app.setTileMode(mode);
        updateSelection(mode);
      } catch (err) {
        updateSelection(previousMode);
        app.showSnackbar(chrome.i18n.getMessage('snackbarTileModeSaveFailed') || 'タイル表示設定の保存に失敗しました');
      } finally {
        buttons.forEach(button => { button.disabled = false; });
      }
    });
  });

  updateSelection(initialTileMode);
}

/**
 * 全画面表示切り替えボタンを初期化する。
 *
 * @returns {void}
 */
export function setupFullscreenToggle() {
  const btn = document.getElementById('fullscreen-btn');
  if (!btn) return;

  const updateUI = () => {
    const isFullscreen = !!document.fullscreenElement;
    const iconSpan = btn.querySelector('.material-symbols-outlined');
    const msgKey = isFullscreen ? 'fullscreenExitBtnTitle' : 'fullscreenBtnTitle';
    const message = (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage)
      ? chrome.i18n.getMessage(msgKey) || (isFullscreen ? '全画面表示を解除' : '全画面表示')
      : (isFullscreen ? '全画面表示を解除' : '全画面表示');

    if (iconSpan) {
      iconSpan.textContent = isFullscreen ? 'fullscreen_exit' : 'fullscreen';
    }
    btn.title = message;
    btn.setAttribute('aria-label', message);
  };

  btn.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.error('Fullscreen toggle error:', err);
    }
  });

  document.addEventListener('fullscreenchange', updateUI);
  updateUI();
}

// ページ初期化
await appReady;
await setupTabViewModeSwitch();
await setupTileModeSwitch();
setupFullscreenToggle();

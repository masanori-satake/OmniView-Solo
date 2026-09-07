// OmniView-Solo Background Service Worker
import { getViewMode, setViewMode } from './storageManager.js';

/**
 * テスト用純粋関数: ViewMode と windowId からアクションを決定する
 * @param {"sidepanel"|"tab"} viewMode
 * @param {number} windowId
 * @returns {{ type: "create_tab"|"open_sidepanel", windowId: number }}
 */
export function resolveIconClickAction(viewMode, windowId) {
  if (viewMode === 'tab') {
    return { type: 'create_tab', windowId };
  }
  return { type: 'open_sidepanel', windowId };
}

/**
 * viewMode に基づいて setPanelBehavior を同期する
 */
export async function syncPanelBehavior() {
  try {
    const viewMode = await getViewMode();
    const openPanelOnActionClick = viewMode === 'sidepanel';
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick });
  } catch (err) {
    console.error('[OmniView-Solo] syncPanelBehavior に失敗しました:', err);
  }
}

/**
 * 表示モード切り替えメッセージを処理する。
 * @returns {Promise<{ok: boolean, error?: string}|undefined>}
 */
export async function handleRuntimeMessage(message, sender) {
  if (message?.type === 'switch_to_tab') {
    try {
      await setViewMode('tab');
      await syncPanelBehavior();
      await chrome.tabs.create({ url: chrome.runtime.getURL('tabview.html') });
      return { ok: true };
    } catch (err) {
      console.error('[OmniView-Solo] タブを開くのに失敗しました:', err);
      try {
        await setViewMode('sidepanel');
        await syncPanelBehavior();
      } catch (rollbackError) {
        console.error('[OmniView-Solo] 表示モードの復元に失敗しました:', rollbackError);
      }
      return { ok: false, error: err?.message || String(err) };
    }
  }

  if (message?.type === 'switch_to_sidepanel') {
    const windowId = sender?.tab?.windowId;
    try {
      if (windowId !== undefined) {
        await chrome.sidePanel.open({ windowId });
      }
      await setViewMode('sidepanel');
      await syncPanelBehavior();
      if (message.tabId !== undefined) {
        await chrome.tabs.remove(message.tabId);
      }
      return { ok: true };
    } catch (err) {
      console.error('[OmniView-Solo] サイドパネルを開くのに失敗しました:', err);
      return { ok: false, error: err?.message || String(err) };
    }
  }

  return undefined;
}

// 拡張機能起動時の同期
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled?.addListener(() => syncPanelBehavior());
  chrome.runtime.onStartup?.addListener(() => syncPanelBehavior());

  // アクションアイコンクリックハンドラー
  // openPanelOnActionClick が false（タブモード）のときに呼ばれる
  chrome.action?.onClicked?.addListener(async (tab) => {
    try {
      const viewMode = await getViewMode();
      const action = resolveIconClickAction(viewMode, tab.windowId);
      if (action.type === 'create_tab') {
        await chrome.tabs.create({
          url: chrome.runtime.getURL('tabview.html'),
          windowId: tab.windowId,
        });
      }
    } catch (err) {
      console.error('[OmniView-Solo] アイコンクリック処理に失敗しました:', err);
    }
  });

  // メッセージハンドラー
  chrome.runtime.onMessage?.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'switch_to_tab' && message?.type !== 'switch_to_sidepanel') return false;

    handleRuntimeMessage(message, sender).then(sendResponse);
    return true;
  });
}

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
    if (message?.type === 'switch_to_tab') {
      (async () => {
        await setViewMode('tab');
        await syncPanelBehavior();
        await chrome.tabs.create({ url: chrome.runtime.getURL('tabview.html') });
      })();
      return true;
    }

    if (message?.type === 'switch_to_sidepanel') {
      (async () => {
        await setViewMode('sidepanel');
        await syncPanelBehavior();
        try {
          const windowId = sender?.tab?.windowId;
          if (windowId !== undefined) {
            await chrome.sidePanel.open({ windowId });
          }
          if (message.tabId !== undefined) {
            await chrome.tabs.remove(message.tabId);
          }
        } catch (err) {
          console.error('[OmniView-Solo] サイドパネルを開くのに失敗しました:', err);
        }
      })();
      return true;
    }
  });
}

import { describe, test, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { resolveIconClickAction, syncPanelBehavior } from './background.js';

describe('background.js', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Property 4: アイコンクリックのルーティングはウィンドウ固有で ViewMode に対して排他的', () => {
    test('resolveIconClickAction の返り値が viewMode と windowId に対して排他的かつ正確である', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('tab', 'sidepanel'),
          fc.integer({ min: 1, max: 100000 }),
          (viewMode, windowId) => {
            const action = resolveIconClickAction(viewMode, windowId);
            if (viewMode === 'tab') {
              return action.type === 'create_tab' && action.windowId === windowId;
            } else {
              return action.type === 'open_sidepanel' && action.windowId === windowId;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('syncPanelBehavior & onMessage ユニットテスト', () => {
    let store;

    beforeEach(() => {
      store = new Map();
      global.chrome = {
        storage: {
          local: {
            get: vi.fn((keys, cb) => {
              const res = {};
              [keys].flat().forEach((k) => {
                if (store.has(k)) res[k] = store.get(k);
              });
              cb(res);
            }),
            set: vi.fn((obj, cb) => {
              Object.entries(obj).forEach(([k, v]) => store.set(k, v));
              cb?.();
            }),
          },
        },
        sidePanel: {
          setPanelBehavior: vi.fn().mockResolvedValue(undefined),
          open: vi.fn().mockResolvedValue(undefined),
        },
        tabs: {
          create: vi.fn().mockResolvedValue({ id: 100 }),
          remove: vi.fn().mockResolvedValue(undefined),
        },
        runtime: {
          getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`),
        },
      };
    });

    test('viewMode が sidepanel のとき openPanelOnActionClick: true が設定される', async () => {
      store.set('view_mode', 'sidepanel');
      await syncPanelBehavior();
      expect(chrome.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
        openPanelOnActionClick: true,
      });
    });

    test('viewMode が tab のとき openPanelOnActionClick: false が設定される', async () => {
      store.set('view_mode', 'tab');
      await syncPanelBehavior();
      expect(chrome.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
        openPanelOnActionClick: false,
      });
    });
  });
});

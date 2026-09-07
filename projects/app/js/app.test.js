// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// ResizeObserver のダミー定義
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

if (!global.navigator.mediaDevices) {
  global.navigator.mediaDevices = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

let mockViewMode = 'sidepanel';
let executionSequence = [];

vi.mock('./storageManager.js', () => ({
  getViewMode: vi.fn(async () => mockViewMode),
}));

vi.mock('./camera.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadCameraSettings: vi.fn(async () => ({})),
    loadGlobalSettings: vi.fn(async () => ({
      interval: 5,
      cyclingEnabled: true,
      excludeWhiteboard: true,
    })),
    getCameras: vi.fn(async () => []),
    loadSessionState: vi.fn(async () => ({ slotOrder: [], activeSlotIndex: 0 })),
    saveSessionState: vi.fn(async (order, index) => {
      executionSequence.push({ action: 'saveSessionState', order, index });
    }),
  };
});

describe('app.js - SidePanel ViewModeSwitch integration', () => {
  beforeEach(() => {
    mockViewMode = 'sidepanel';
    executionSequence = [];

    // DOM モック
    document.body.innerHTML = `
      <div id="app">
        <div id="view-mode-switch-container">
          <div class="view-mode-switch" role="switch">
            <div class="vms-track"></div>
          </div>
        </div>
        <div id="camera-container"></div>
        <div id="initial-overlay" class="hidden"></div>
        <button id="start-btn"></button>
        <button id="add-camera-nav-btn"></button>
        <button id="settings-btn"></button>
        <div id="settings-panel" class="hidden"></div>
        <div id="settings-overlay"></div>
        <input type="number" id="interval-input" value="5">
        <button id="interval-up"></button>
        <button id="interval-down"></button>
        <input type="checkbox" id="cycling-switch">
        <label id="interval-label"></label>
        <input type="checkbox" id="exclude-whiteboard-switch">
        <label id="exclude-whiteboard-label"></label>
        <input type="checkbox" id="camera-resolution-fps-display-switch">
        <button id="copy-logs-btn"></button>
        <button id="clear-logs-btn"></button>
        <button id="export-btn"></button>
        <button id="import-btn-trigger"></button>
        <input type="file" id="import-input">
        <select id="import-mode-select"></select>
        <select id="resolution-zoom1-select"></select>
        <select id="resolution-zoom2-select"></select>
        <select id="resolution-zoom4-select"></select>
        <input type="checkbox" id="wb-autofocus-switch">
        <select id="wb-autofocus-prev-wb-size-select"></select>
        <select id="wb-autofocus-new-wb-size-select"></select>
        <input type="checkbox" id="pin-release-switch">
        <input type="number" id="pin-release-time-input">
        <button id="pin-release-time-up"></button>
        <button id="pin-release-time-down"></button>
        <label id="pin-release-time-label"></label>
        <select id="info-camera-select"></select>
        <div id="welcome-container" class="hidden"></div>
        <div id="snackbar" class="hidden"><span id="snackbar-message"></span></div>
      </div>
    `;

    global.chrome = {
      i18n: { getMessage: vi.fn((key) => key) },
      runtime: {
        getManifest: vi.fn(() => ({ version: '1.0.8' })),
        sendMessage: vi.fn((msg) => {
          executionSequence.push({ action: 'sendMessage', message: msg });
        }),
      },
      storage: {
        local: { get: vi.fn(), set: vi.fn() },
      },
    };

    global.window.close = vi.fn(() => {
      executionSequence.push({ action: 'windowClose' });
    });
  });

  test('setupViewModeSwitch は getViewMode の値に応じて ViewModeSwitch を初期化する', async () => {
    const { app } = await import('./app.js');
    mockViewMode = 'sidepanel';
    await app.setupViewModeSwitch();

    const switchEl = document.querySelector('.view-mode-switch');
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
  });

  describe('Property 3: モード切り替え前に必ずカメラ状態が保存される', () => {
    test('任意のカメラスロット状態で切り替え時、saveSessionState が sendMessage より前に実行される', async () => {
      const { app } = await import('./app.js');

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1 })),
          fc.integer({ min: 0 }),
          async (slotOrder, activeIndex) => {
            // 各イテレーションごとに要素を再生成してイベントリスナーの重複登録を防ぐ
            const container = document.getElementById('view-mode-switch-container');
            container.innerHTML = `
              <div class="view-mode-switch" role="switch">
                <div class="vms-track"></div>
              </div>
            `;

            executionSequence = [];
            app.slotOrder = slotOrder;
            app.activeSlotIndex = activeIndex;

            await app.setupViewModeSwitch();

            const switchEl = container.querySelector('.view-mode-switch');
            switchEl.click(); // sidepanel -> tab

            await new Promise((r) => setTimeout(r, 20));

            expect(executionSequence.length).toBeGreaterThanOrEqual(2);
            expect(executionSequence[0].action).toBe('saveSessionState');
            expect(executionSequence[0].order).toEqual(slotOrder);
            expect(executionSequence[1].action).toBe('sendMessage');
            expect(executionSequence[1].message).toEqual({ type: 'switch_to_tab' });
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

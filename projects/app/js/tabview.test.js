// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';

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

let savedSlotOrder = [];
let savedActiveIndex = -1;
let sentMessages = [];

vi.mock('./storageManager.js', () => ({
  getViewMode: vi.fn(async () => 'sidepanel'),
  getTileMode: vi.fn(async () => 'normal'),
  setTileMode: vi.fn(async () => {}),
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
    getCameras: vi.fn(async () => [
      { deviceId: 'cam1', label: 'Camera 1' },
      { deviceId: 'cam2', label: 'Camera 2' },
    ]),
    loadSessionState: vi.fn(async () => ({ slotOrder: ['cam1', 'cam2'], activeSlotIndex: 0 })),
    saveSessionState: vi.fn(async (order, index) => {
      savedSlotOrder = order;
      savedActiveIndex = index;
    }),
  };
});

describe('tabview.js - TabView ViewModeSwitch integration', () => {
  beforeEach(() => {
    savedSlotOrder = [];
    savedActiveIndex = -1;
    sentMessages = [];

    document.body.innerHTML = `
      <div id="app" class="layout-wide">
        <div class="view-mode-switch" role="switch">
          <div class="vms-track"></div>
        </div>
        <div id="tile-mode-switch-container">
          <button class="segmented-btn active" data-tile-mode="normal"></button>
          <button class="segmented-btn" data-tile-mode="tile2x2"></button>
          <button class="segmented-btn" data-tile-mode="tile3x3"></button>
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
    document.body.dataset.viewMode = 'tab';

    global.chrome = {
      i18n: { getMessage: vi.fn((key) => key) },
      runtime: {
        getManifest: vi.fn(() => ({ version: '1.0.8' })),
        sendMessage: vi.fn((msg) => sentMessages.push(msg)),
      },
      tabs: {
        getCurrent: vi.fn(async () => ({ id: 999 })),
      },
      storage: {
        local: { get: vi.fn(), set: vi.fn() },
      },
    };
  });

  test('保存済みモードが sidepanel でも ViewModeSwitch を tab 状態で初期化する', async () => {
    const { setupTabViewModeSwitch } = await import('./tabview.js');
    await setupTabViewModeSwitch();

    const switchEl = document.querySelector('.view-mode-switch');
    expect(switchEl.getAttribute('aria-checked')).toBe('false');
  });

  test('スイッチを sidepanel に変更した際、saveSessionState → switch_to_sidepanel 送信が実行される', async () => {
    const { app } = await import('./app.js');
    const { setupTabViewModeSwitch } = await import('./tabview.js');

    app.slotOrder = ['cam1', 'cam2'];
    app.activeSlotIndex = 0;

    await setupTabViewModeSwitch();

    const switchEl = document.querySelector('.view-mode-switch');
    expect(switchEl.getAttribute('aria-checked')).toBe('false');
    switchEl.click(); // tab -> sidepanel

    await new Promise((r) => setTimeout(r, 50));

    expect(savedSlotOrder).toEqual(['cam1', 'cam2']);
    expect(savedActiveIndex).toBe(0);
    expect(sentMessages).toEqual([{ type: 'switch_to_sidepanel', tabId: 999 }]);
  });

  test('setupTileModeSwitch が正常に動作し、タイルボタンのクリックで setTileMode が適用される', async () => {
    const { app } = await import('./app.js');
    const { setupTileModeSwitch } = await import('./tabview.js');

    await setupTileModeSwitch();

    const btn2x2 = document.querySelector('[data-tile-mode="tile2x2"]');
    btn2x2.click();

    await new Promise((r) => setTimeout(r, 50));

    expect(app.tileMode).toBe('tile2x2');
    expect(app.container.classList.contains('tile-mode-2x2')).toBe(true);

    const btnNormal = document.querySelector('[data-tile-mode="normal"]');
    btnNormal.click();

    await new Promise((r) => setTimeout(r, 50));

    expect(app.tileMode).toBe('normal');
    expect(app.container.classList.contains('tile-mode-2x2')).toBe(false);
  });
});

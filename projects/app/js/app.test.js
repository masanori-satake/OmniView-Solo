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
let mockCameraSettings = {};
let mockCameras = [];
let loadSessionStateImpl = async () => ({ slotOrder: [], activeSlotIndex: 0 });
let mockSwitchResponse = { ok: true };
const i18nMessages = {
  incrementInterval: 'Increase switching interval',
  decrementInterval: 'Decrease switching interval',
  incrementPinReleaseTime: 'Increase pin retention period',
  decrementPinReleaseTime: 'Decrease pin retention period',
};

vi.mock('./storageManager.js', () => ({
  getViewMode: vi.fn(async () => mockViewMode),
}));

vi.mock('./camera.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadCameraSettings: vi.fn(async () => mockCameraSettings),
    loadGlobalSettings: vi.fn(async () => ({
      interval: 5,
      cyclingEnabled: true,
      excludeWhiteboard: true,
    })),
    getCameras: vi.fn(async () => mockCameras),
    loadSessionState: vi.fn(() => loadSessionStateImpl()),
    saveSessionState: vi.fn(async (order, index) => {
      executionSequence.push({ action: 'saveSessionState', order, index });
    }),
  };
});

describe('app.js - SidePanel ViewModeSwitch integration', () => {
  beforeEach(() => {
    vi.resetModules();
    mockViewMode = 'sidepanel';
    executionSequence = [];
    mockCameraSettings = {};
    mockCameras = [];
    loadSessionStateImpl = async () => ({ slotOrder: [], activeSlotIndex: 0 });
    mockSwitchResponse = { ok: true };

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
        <button id="interval-up" data-i18n-title="incrementInterval"></button>
        <button id="interval-down" data-i18n-title="decrementInterval"></button>
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
        <button id="pin-release-time-up" data-i18n-title="incrementPinReleaseTime"></button>
        <button id="pin-release-time-down" data-i18n-title="decrementPinReleaseTime"></button>
        <label id="pin-release-time-label"></label>
        <select id="info-camera-select"></select>
        <div id="camera-capabilities-list"></div>
        <div id="welcome-container" class="hidden"></div>
        <div id="logs-container"></div>
        <div id="snackbar" class="hidden"><span id="snackbar-message"></span></div>
      </div>
    `;
    document.body.dataset.viewMode = 'sidepanel';

    global.chrome = {
      i18n: { getMessage: vi.fn((key) => i18nMessages[key] || key) },
      runtime: {
        getManifest: vi.fn(() => ({ version: '1.0.8' })),
        sendMessage: vi.fn(async (msg) => {
          executionSequence.push({ action: 'sendMessage', message: msg });
          return mockSwitchResponse;
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
    const { appReady } = await import('./app.js');
    mockViewMode = 'sidepanel';
    await appReady;

    const switchEl = document.querySelector('.view-mode-switch');
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
  });

  test('セッション復元中は切り替えを受け付けず、復元後のカメラ構成を保存する', async () => {
    let resolveSession;
    loadSessionStateImpl = () => new Promise((resolve) => {
      resolveSession = resolve;
    });
    mockCameraSettings = {
      cam1: { customLabel: '復元済みカメラ', defaultRole: 'whiteboard' },
    };
    mockCameras = [{ deviceId: 'cam1', label: 'Camera 1' }];

    const { app, appReady } = await import('./app.js');
    const cameraModule = await import('./camera.js');
    await vi.waitFor(() => expect(cameraModule.loadSessionState).toHaveBeenCalled());

    app.createCameraSlot = vi.fn(async () => ({ element: document.createElement('div') }));
    app.updateCyclingAndActivationState = vi.fn(async () => {});

    const switchEl = document.querySelector('.view-mode-switch');
    switchEl.click();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

    resolveSession({ slotOrder: ['cam1'], activeSlotIndex: 0 });
    await appReady;

    expect(app.slotOrder).toEqual(['cam1']);
    expect(app.settings).toEqual(mockCameraSettings);

    switchEl.click();
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalled());

    expect(executionSequence[0]).toEqual({
      action: 'saveSessionState',
      order: ['cam1'],
      index: 0,
    });
    expect(app.settings).toEqual(mockCameraSettings);
    expect(window.close).toHaveBeenCalledOnce();
  });

  test('タブ作成に失敗した場合はサイドパネル表示へ戻して Snackbar を表示する', async () => {
    mockSwitchResponse = { ok: false, error: 'tab creation failed' };
    const { appReady } = await import('./app.js');
    await appReady;

    const switchEl = document.querySelector('.view-mode-switch');
    switchEl.click();

    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalled());
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
    expect(document.getElementById('snackbar-message').textContent).toBe('snackbarSwitchToTabFailed');
    expect(document.getElementById('snackbar').classList.contains('hidden')).toBe(false);
    expect(window.close).not.toHaveBeenCalled();
  });

  test('renderLogs は HTMLタグやスクリプトをエスケープして安全にレンダリングする (XSS対策)', async () => {
    const { app, appReady } = await import('./app.js');
    await appReady;

    app.addLog('<script>alert("xss")</script>');
    const container = document.getElementById('logs-container');
    const logEntries = container.querySelectorAll('.log-entry');
    const lastEntry = logEntries[logEntries.length - 1];

    expect(lastEntry).not.toBeNull();
    expect(lastEntry.querySelector('script')).toBeNull();
    expect(lastEntry.textContent).toContain('<script>alert("xss")</script>');
  });

  test('displayCameraInfo は HTMLタグを含むカメラ情報エントリを安全にエスケープして表示する (XSS対策)', async () => {
    const { app, appReady } = await import('./app.js');
    await appReady;

    const malformedInfo = [
      { key: 'infoDeviceId', value: '<img src=x onerror=alert(1)>' }
    ];
    app.cameraInfoCache.set('cam-xss', malformedInfo);

    const infoSelect = document.getElementById('info-camera-select');
    infoSelect.innerHTML = '<option value="cam-xss">cam-xss</option>';
    infoSelect.value = 'cam-xss';

    await app.displayCameraInfo('cam-xss');

    const listContainer = document.getElementById('camera-capabilities-list');
    expect(listContainer.querySelector('img')).toBeNull();
    expect(listContainer.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  test('設定ファイルインポート時にプロトタイプ汚染キー (__proto__) を無視する', async () => {
    const { app, appReady } = await import('./app.js');
    await appReady;

    const cameraSettings = {
      validCam: { customLabel: 'Safe Label' }
    };
    Object.defineProperty(cameraSettings, '__proto__', {
      value: { polluted: true },
      enumerable: true,
    });
    const maliciousJson = JSON.stringify({
      version: 1,
      camera_settings: cameraSettings
    });

    const file = new Blob([maliciousJson], { type: 'application/json' });
    const importInput = document.getElementById('import-input');
    const importModeSelect = document.getElementById('import-mode-select');
    importModeSelect.innerHTML = '<option value="overwrite">overwrite</option>';
    importModeSelect.value = 'overwrite';

    const fileReaderMock = {
      readAsText: function() {
        this.onload({ target: { result: maliciousJson } });
      }
    };
    const origFileReader = global.FileReader;
    global.FileReader = vi.fn(() => fileReaderMock);

    Object.defineProperty(importInput, 'files', {
      value: [file],
      writable: true,
    });

    importInput.dispatchEvent(new Event('change'));

    await new Promise((r) => setTimeout(r, 50));

    expect(Object.prototype.polluted).toBeUndefined();
    expect(app.settings.validCam.customLabel).toBe('Safe Label');
    global.FileReader = origFileReader;
  });

  describe('Property 3: モード切り替え前に必ずカメラ状態が保存される', () => {
    test('任意のカメラスロット状態で切り替え時、saveSessionState が sendMessage より前に実行される', async () => {
      const { app, appReady } = await import('./app.js');
      await appReady;

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

    describe('Accessibility - ARIA Labels', () => {
      test('initI18n は data-i18n-title および data-i18n-tooltip を持つ要素に aria-label を設定する', async () => {
        const { app, appReady } = await import('./app.js');
        await appReady;

        const addBtn = document.getElementById('add-camera-nav-btn');
        addBtn.setAttribute('data-i18n-title', 'addCameraNavBtn');

        const generalTabBtn = document.createElement('button');
        generalTabBtn.setAttribute('data-i18n-tooltip', 'tabGeneral');
        document.body.appendChild(generalTabBtn);

        app.initI18n();

        expect(addBtn.getAttribute('aria-label')).toBe('addCameraNavBtn');
        expect(document.getElementById('interval-up').getAttribute('aria-label')).toBe('Increase switching interval');
        expect(document.getElementById('interval-down').getAttribute('aria-label')).toBe('Decrease switching interval');
        expect(document.getElementById('pin-release-time-up').getAttribute('aria-label')).toBe('Increase pin retention period');
        expect(document.getElementById('pin-release-time-down').getAttribute('aria-label')).toBe('Decrease pin retention period');
        expect(generalTabBtn.getAttribute('aria-label')).toBe('tabGeneral');
      });

      test('createCameraSlot は生成されたカメラスロット内の全アイコンボタンに aria-label を設定する', async () => {
        const { app, appReady } = await import('./app.js');
        await appReady;

        const slot = await app.createCameraSlot({ deviceId: 'test-cam', label: 'Test Camera' });
        const buttons = slot.element.querySelectorAll('button');

        expect(buttons.length).toBeGreaterThan(0);
        buttons.forEach(btn => {
          expect(btn.getAttribute('aria-label')).toBeTruthy();
        });
      });
    });
});

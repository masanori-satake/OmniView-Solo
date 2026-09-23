/**
 * camera.js — Property 2 プロパティテスト
 *
 * Property 2: カメラ状態は Storage 経由でモード間で引き継がれる
 *   saveSessionState → loadSessionState のラウンドトリップで
 *   slotOrder と activeSlotIndex が保持されることを検証する。
 *
 * Validates: Requirements 3.1, 3.2
 */
import { describe, test, beforeEach, expect } from 'vitest';
import fc from 'fast-check';
import { saveSessionState, loadSessionState, loadCameraSettings, saveCameraSetting, loadGlobalSettings } from './camera.js';

// chrome.storage.local をインメモリ Map でモックする
const store = new Map();

global.chrome = {
  storage: {
    local: {
      set: (obj, cb) => {
        Object.entries(obj).forEach(([k, v]) => store.set(k, v));
        cb?.();
      },
      get: (keys, cb) => {
        const result = {};
        [keys].flat().forEach((k) => {
          if (store.has(k)) result[k] = store.get(k);
        });
        cb(result);
      },
    },
  },
};

describe('Property 2: カメラ状態は Storage 経由でモード間で引き継がれる', () => {
  beforeEach(() => {
    store.clear();
  });

  test('saveSessionState した slotOrder を loadSessionState で取得できる', async () => {
    /**
     * Validates: Requirements 3.1, 3.2
     *
     * 任意の slotOrder（長さ 0 以上の文字列配列）と activeSlotIndex で
     * saveSessionState した後、loadSessionState で読み込んだ slotOrder が
     * 元の配列と常に一致することを検証する。
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1 })),
        fc.integer({ min: 0 }),
        async (slotOrder, activeIndex) => {
          store.clear();
          await saveSessionState(slotOrder, activeIndex);
          const loaded = await loadSessionState();
          return JSON.stringify(loaded.slotOrder) === JSON.stringify(slotOrder);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('saveSessionState した activeSlotIndex を loadSessionState で取得できる', async () => {
    /**
     * Validates: Requirements 3.1, 3.2
     *
     * activeSlotIndex についても同様にラウンドトリップを検証する。
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1 })),
        fc.integer({ min: 0, max: 1000 }),
        async (slotOrder, activeIndex) => {
          store.clear();
          await saveSessionState(slotOrder, activeIndex);
          const loaded = await loadSessionState();
          return loaded.activeSlotIndex === activeIndex;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('loadGlobalSettings は設定読み込み時にプロトタイプ汚染キー (__proto__, constructor, prototype) を除外する', async () => {
    store.set('global_settings', JSON.parse('{"interval":10,"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true}}'));

    const settings = await loadGlobalSettings();
    expect(settings.interval).toBe(10);
    expect(Object.prototype.hasOwnProperty.call(settings, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(settings, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(settings, 'prototype')).toBe(false);
    expect(Object.prototype.polluted).toBeUndefined();
  });

  test('loadCameraSettings は設定読み込み時にプロトタイプ汚染キー (__proto__, constructor, prototype) を除外する', async () => {
    store.set('camera_settings', JSON.parse('{"cam1":{"customLabel":"Cam 1","role":"person"},"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true}}'));

    const settings = await loadCameraSettings();
    expect(settings.cam1).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(settings, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(settings, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(settings, 'prototype')).toBe(false);
    expect(Object.prototype.polluted).toBeUndefined();
  });

  test('saveCameraSetting はプロトタイプ汚染キー (__proto__, constructor, prototype) の保存をブロックする', async () => {
    await saveCameraSetting('__proto__', { polluted: true });
    await saveCameraSetting('constructor', { polluted: true });
    await saveCameraSetting('prototype', { polluted: true });

    const settings = await loadCameraSettings();
    expect(Object.prototype.hasOwnProperty.call(settings, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(settings, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(settings, 'prototype')).toBe(false);
    expect(Object.prototype.polluted).toBeUndefined();
  });

  test('Storage が空のとき loadSessionState は null を返す', async () => {
    const loaded = await loadSessionState();
    if (loaded !== null) throw new Error(`Expected null, got ${JSON.stringify(loaded)}`);
  });

  test('loadSessionState はセッション状態読み込み時にプロトタイプ汚染キー (__proto__, constructor, prototype) を除外する', async () => {
    store.set('session_state', JSON.parse('{"slotOrder":["cam1"],"activeSlotIndex":0,"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true}}'));

    const loaded = await loadSessionState();
    expect(loaded.slotOrder).toEqual(['cam1']);
    expect(loaded.activeSlotIndex).toBe(0);
    expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(loaded, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(loaded, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(loaded, 'prototype')).toBe(false);
    expect(Object.prototype.polluted).toBeUndefined();
  });

  test('loadSessionState はストレージ読み込みエラー時に reject する', async () => {
    const storageError = new Error('storage read failed');
    chrome.runtime = { lastError: storageError };

    try {
      await expect(loadSessionState()).rejects.toBe(storageError);
    } finally {
      delete chrome.runtime;
    }
  });

  test('loadSessionState は session_state が配列やプリミティブ型の場合に null を返す', async () => {
    store.set('session_state', ['cam1', 'cam2']);
    let loaded = await loadSessionState();
    expect(loaded).toBeNull();

    store.set('session_state', 'invalid_string');
    loaded = await loadSessionState();
    expect(loaded).toBeNull();

    store.set('session_state', 12345);
    loaded = await loadSessionState();
    expect(loaded).toBeNull();
  });

  test('loadCameraSettings は camera_settings が配列やプリミティブ型の場合に空オブジェクトを返す', async () => {
    store.set('camera_settings', ['invalid']);
    let settings = await loadCameraSettings();
    expect(settings).toEqual({});

    store.set('camera_settings', 'invalid_string');
    settings = await loadCameraSettings();
    expect(settings).toEqual({});
  });

  test('上書き保存後は最新の slotOrder のみが読み込まれる', async () => {
    /**
     * Validates: Requirements 3.1, 3.2
     *
     * 連続して saveSessionState を呼んだ場合、最後に保存した値が
     * loadSessionState で返されることを検証する。
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1 })),
        fc.array(fc.string({ minLength: 1 })),
        fc.integer({ min: 0 }),
        async (firstOrder, secondOrder, activeIndex) => {
          store.clear();
          await saveSessionState(firstOrder, activeIndex);
          await saveSessionState(secondOrder, activeIndex);
          const loaded = await loadSessionState();
          return JSON.stringify(loaded.slotOrder) === JSON.stringify(secondOrder);
        }
      ),
      { numRuns: 50 }
    );
  });
});

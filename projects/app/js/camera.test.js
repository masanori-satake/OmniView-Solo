/**
 * camera.js — Property 2 プロパティテスト
 *
 * Property 2: カメラ状態は Storage 経由でモード間で引き継がれる
 *   saveSessionState → loadSessionState のラウンドトリップで
 *   slotOrder と activeSlotIndex が保持されることを検証する。
 *
 * Validates: Requirements 3.1, 3.2
 */
import { describe, test, beforeEach } from 'vitest';
import fc from 'fast-check';
import { saveSessionState, loadSessionState } from './camera.js';

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

  test('Storage が空のとき loadSessionState は null を返す', async () => {
    const loaded = await loadSessionState();
    if (loaded !== null) throw new Error(`Expected null, got ${JSON.stringify(loaded)}`);
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

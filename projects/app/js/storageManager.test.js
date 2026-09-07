/**
 * storageManager.js のプロパティテスト・ユニットテスト
 *
 * Property 1: 不正な ViewMode 値は "sidepanel" にフォールバックする
 *   Validates: Requirements 1.5, 6.4
 */

import fc from 'fast-check';
import { describe, test } from 'vitest';
import { getViewModeWithDefault } from './storageManager.js';

// ---------------------------------------------------------------------------
// Property 1: 不正な ViewMode 値は "sidepanel" にフォールバックする
// Validates: Requirements 1.5, 6.4
// ---------------------------------------------------------------------------
describe('Property 1: 不正な ViewMode 値は "sidepanel" にフォールバックする', () => {
  test('null / undefined / 空文字 / 不正文字列は常に "sidepanel" を返す', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.constant(''),
          fc.string().filter((s) => s !== 'sidepanel' && s !== 'tab')
        ),
        (invalidValue) => getViewModeWithDefault(invalidValue) === 'sidepanel'
      ),
      { numRuns: 100 }
    );
  });

  test('"sidepanel" はそのまま "sidepanel" を返す', () => {
    fc.assert(
      fc.property(fc.constant('sidepanel'), (v) => getViewModeWithDefault(v) === 'sidepanel'),
      { numRuns: 10 }
    );
  });

  test('"tab" はそのまま "tab" を返す', () => {
    fc.assert(
      fc.property(fc.constant('tab'), (v) => getViewModeWithDefault(v) === 'tab'),
      { numRuns: 10 }
    );
  });
});

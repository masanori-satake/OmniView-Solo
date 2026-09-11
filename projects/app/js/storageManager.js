/**
 * View mode persistence via chrome.storage.local.
 *
 * Camera state (session_state / camera_settings) is handled separately
 * by the existing functions in camera.js (saveSessionState / loadSessionState).
 *
 * @module storageManager
 */

/** @typedef {"sidepanel"|"tab"} ViewMode */
/** @typedef {"normal"|"tile2x2"|"tile3x3"} TileMode */

const VALID_MODES = new Set(['sidepanel', 'tab']);
const VALID_TILE_MODES = new Set(['normal', 'tile2x2', 'tile3x3']);

/**
 * 生の Storage 値を ViewMode に変換する純粋関数。
 * 値が "sidepanel" または "tab" 以外（null / undefined / 空文字 / 不正文字列）の場合は
 * "sidepanel" をデフォルト値として返す。
 *
 * @param {unknown} rawValue - chrome.storage.local から取得した生の値
 * @returns {ViewMode}
 */
export function getViewModeWithDefault(rawValue) {
  if (VALID_MODES.has(rawValue)) {
    return rawValue;
  }
  return 'sidepanel';
}

/**
 * 生の Storage 値を TileMode に変換する純粋関数。
 * 値が "normal", "tile2x2", "tile3x3" 以外（null / undefined / 空文字 / 不正文字列）の場合は
 * "normal" をデフォルト値として返す。
 *
 * @param {unknown} rawValue - chrome.storage.local から取得した生の値
 * @returns {TileMode}
 */
export function getTileModeWithDefault(rawValue) {
  if (VALID_TILE_MODES.has(rawValue)) {
    return rawValue;
  }
  return 'normal';
}

/**
 * chrome.storage.local から view_mode を読み込む。
 * 読み込み失敗・不正値の場合は "sidepanel" を返す。
 *
 * @returns {Promise<ViewMode>}
 */
export async function getViewMode() {
  try {
    return await new Promise((resolve) => {
      chrome.storage.local.get(['view_mode'], (result) => {
        resolve(getViewModeWithDefault(result?.view_mode));
      });
    });
  } catch (_err) {
    return 'sidepanel';
  }
}

/**
 * chrome.storage.local に view_mode を書き込む。
 *
 * @param {ViewMode} mode
 * @returns {Promise<void>}
 */
export async function setViewMode(mode) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ view_mode: mode }, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/**
 * chrome.storage.local から tile_mode を読み込む。
 * 読み込み失敗・不正値の場合は "normal" を返す。
 *
 * @returns {Promise<TileMode>}
 */
export async function getTileMode() {
  try {
    return await new Promise((resolve) => {
      chrome.storage.local.get(['tile_mode'], (result) => {
        resolve(getTileModeWithDefault(result?.tile_mode));
      });
    });
  } catch (_err) {
    return 'normal';
  }
}

/**
 * chrome.storage.local に tile_mode を書き込む。
 *
 * @param {TileMode} mode
 * @returns {Promise<void>}
 */
export async function setTileMode(mode) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ tile_mode: mode }, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

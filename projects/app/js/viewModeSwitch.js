/**
 * viewModeSwitch.js
 * M3 スタイルの表示モード切り替えスイッチコンポーネント。
 * app.html（サイドパネル）と tabview.html（タブビュー）の両方から使用される。
 *
 * HTML 構造（呼び出し側が用意する）:
 * <div class="view-mode-switch" role="switch" aria-checked="false" tabindex="0">
 *   <span class="vms-icon vms-icon--tab" aria-hidden="true">...</span>
 *   <div class="vms-track">
 *     <div class="vms-thumb"></div>
 *   </div>
 *   <span class="vms-icon vms-icon--sidepanel" aria-hidden="true">...</span>
 * </div>
 */

/**
 * ViewModeSwitch を初期化する。
 *
 * @param {HTMLElement} element - .view-mode-switch 要素
 * @param {"sidepanel"|"tab"} initialMode - 初期表示モード
 * @param {function("sidepanel"|"tab"): void} onChange - モード変更時コールバック
 */
export function initViewModeSwitch(element, initialMode, onChange) {
  if (!element) return;

  // 初期状態を反映する（アニメーションなし）
  _applyState(element, initialMode, false);

  // クリックで切り替え
  element.addEventListener('click', () => {
    const currentMode = element.getAttribute('aria-checked') === 'true' ? 'sidepanel' : 'tab';
    const nextMode = currentMode === 'sidepanel' ? 'tab' : 'sidepanel';
    setViewModeSwitchState(element, nextMode);
    onChange(nextMode);
  });

  // Space / Enter キーボード操作
  element.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      const currentMode = element.getAttribute('aria-checked') === 'true' ? 'sidepanel' : 'tab';
      const nextMode = currentMode === 'sidepanel' ? 'tab' : 'sidepanel';
      setViewModeSwitchState(element, nextMode);
      onChange(nextMode);
    }
  });
}

/**
 * スイッチの表示状態のみを更新する（副作用なし）。
 * アニメーション（.vms-track--animating）を 100ms 後に除去する。
 *
 * @param {HTMLElement} element - .view-mode-switch 要素
 * @param {"sidepanel"|"tab"} mode
 */
export function setViewModeSwitchState(element, mode) {
  if (!element) return;
  _applyState(element, mode, true);
}

/**
 * 内部ヘルパー: 状態を DOM に適用する。
 *
 * @param {HTMLElement} element
 * @param {"sidepanel"|"tab"} mode
 * @param {boolean} animate - true のとき .vms-track--animating を付与する
 */
function _applyState(element, mode, animate) {
  const isSidepanel = mode === 'sidepanel';

  // aria-checked: sidepanel = true, tab = false
  element.setAttribute('aria-checked', isSidepanel ? 'true' : 'false');

  const track = element.querySelector('.vms-track');
  if (!track) return;

  // モードクラスを排他的に切り替える
  track.classList.toggle('vms-track--sidepanel', isSidepanel);
  track.classList.toggle('vms-track--tab', !isSidepanel);

  if (animate) {
    track.classList.add('vms-track--animating');
    setTimeout(() => {
      track.classList.remove('vms-track--animating');
    }, 100);
  }
}

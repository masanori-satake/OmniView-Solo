# Implementation Plan: tab-view-mode

## Overview

サイドパネルとタブ全体表示を切り替える「表示位置切り替え」機能を段階的に実装する。
すべての実装先は `projects/app/` 配下。`extension/` ディレクトリは使用しない。

実装は以下の順序で進める：
1. manifest.chrome.json の改修と Vitest 環境のセットアップ
2. storageManager.js の新規実装
3. viewModeSwitch.js コンポーネントの新規実装
4. background.js の改修
5. app.html / app.js の改修（サイドパネル側）
6. tabview.html / tabview.js の新規実装（タブ側）
7. 統合プロパティテストと最終確認

## Tasks

- [x] 1. manifest と Vitest 環境の整備
  - `projects/app/manifest.chrome.json` に `tabview.html` を `web_accessible_resources` として追加する
  - `package.json` に Vitest と fast-check の設定を追加する
  - `vitest.config.js` を作成する（Node 環境、`projects/app/js/**/*.test.js` をテスト対象）
  - _Requirements: 2.2, 5.1_

  - [x] 1.1 manifest.chrome.json を改修する
    - `web_accessible_resources` に `tabview.html` を追加する（matches: `<all_urls>`）
    - _Requirements: 2.2, 5.1_

  - [x] 1.2 Vitest と fast-check のテスト環境を設定する
    - `package.json` の devDependencies に `vitest` と `fast-check` を追加する
    - `vitest.config.js` をリポジトリルートに作成する（`projects/app/js/` をテスト対象に含める）
    - _Requirements: なし（テスト基盤）_

- [x] 2. storageManager.js の実装
  - `projects/app/js/storageManager.js` を新規作成する
  - `getViewModeWithDefault(rawValue)`: 純粋関数、Property 1 のテスト用エクスポート
  - `getViewMode()`: `view_mode` キーを読み込み、失敗・不正値時は `"sidepanel"` を返す
  - `setViewMode(mode)`: `view_mode` キーに書き込む
  - カメラ状態の読み書きは `camera.js` の既存関数（`saveSessionState` / `loadSessionState`）を使うため、storageManager には含めない
  - _Requirements: 3.3, 6.1, 6.4_

  - [x] 2.1 storageManager.js を実装する
    - 上記3関数を実装する
    - `chrome.storage.local` の読み書きはすべてここに集約する
    - _Requirements: 3.3, 6.1, 6.4_

  - [x] 2.2 Property 1 のプロパティテストを書く
    - **Property 1: 不正な ViewMode 値は "sidepanel" にフォールバックする**
    - `fc.oneof(null, undefined, '', 不正文字列)` を入力として `getViewModeWithDefault` が常に `"sidepanel"` を返すことを検証する
    - テストファイル: `projects/app/js/storageManager.test.js`
    - **Validates: Requirements 1.5, 6.4**

  - [x] 2.3 Property 5 のプロパティテストを書く
    - **Property 5: ViewMode の書き込みと読み込みはラウンドトリップを保証する**
    - `chrome.storage.local` をインメモリ Map でモックし、`setViewMode` → `getViewMode` のラウンドトリップを検証する
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x] 2.4 Property 2 のプロパティテストを書く
    - **Property 2: カメラ状態は Storage 経由でモード間で引き継がれる**
    - `camera.js` の `saveSessionState` → `loadSessionState` のラウンドトリップを `fc.array` で検証する
    - `chrome.storage.local` をインメモリ Map でモックする
    - テストファイル: `projects/app/js/camera.test.js`
    - **Validates: Requirements 3.1, 3.2**

- [x] 3. ViewModeSwitch コンポーネントの実装
  - `projects/app/js/viewModeSwitch.js` を新規作成する
  - `projects/app/css/style.css` に `.vms-*` スタイルを追加する
  - アクセシビリティ属性（`role="switch"`、`aria-checked`、`tabindex`）を付与する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7_

  - [x] 3.1 viewModeSwitch.js を実装する
    - `initViewModeSwitch(element, initialMode, onChange)` を実装する
    - `setViewModeSwitchState(element, mode)` を実装する
    - クリック・キーボード（Space/Enter）操作で `onChange` コールバックを呼び出す
    - `.vms-track--animating` クラスを 100ms 後に除去するトランジション処理を含める
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7_

  - [x] 3.2 style.css に ViewModeSwitch スタイルを追加する
    - M3 カラートークン（`--md-sys-color-primary` 等）を使った `.vms-*` クラス群を定義する
    - サイドパネル側選択状態・タブ側選択状態のトラックカラーを切り替える
    - _Requirements: 1.3_

  - [x] 3.3 ViewModeSwitch のユニットテストを書く
    - 初期モードに応じた `aria-checked` の初期値を確認する
    - クリック操作で `onChange` が正しい引数で呼ばれることを確認する
    - テストファイル: `projects/app/js/viewModeSwitch.test.js`
    - _Requirements: 1.6, 1.7_

- [x] 4. background.js の改修
  - `projects/app/js/background.js` を改修する（1行の既存コードを置き換える）
  - `syncPanelBehavior()`: `view_mode` を読み込み `setPanelBehavior` を適切に設定する
  - `chrome.action.onClicked`: タブモード時のみ到達する（sidepanel モード時は setPanelBehavior が横取り）
  - `resolveIconClickAction(viewMode, windowId)`: Property 4 テスト用の純粋関数としてエクスポートする
  - `chrome.runtime.onMessage`: `switch_to_tab` / `switch_to_sidepanel` を処理する
  - _Requirements: 2.2, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3_

  - [x] 4.1 background.js に syncPanelBehavior と onClicked を実装する
    - `onInstalled` / `onStartup` で `syncPanelBehavior()` を呼び出す
    - `view_mode == "tab"` 時は `openPanelOnActionClick: false` に設定する
    - `onClicked` でタブモード時に `chrome.tabs.create({ url: tabview.html, windowId })` を実行する
    - `resolveIconClickAction(viewMode, windowId)` を純粋関数として実装・エクスポートする
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 4.2 background.js に onMessage ハンドラーを実装する
    - `switch_to_tab`: `setViewMode("tab")` → `syncPanelBehavior()` → `chrome.tabs.create({ url: tabview.html })`
    - `switch_to_sidepanel`: `setViewMode("sidepanel")` → `syncPanelBehavior()` → `chrome.sidePanel.open()` → 成功時 `chrome.tabs.remove(tabId)` / 失敗時 `console.error` のみ
    - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2, 4.3, 4.4_

  - [x] 4.3 Property 4 のプロパティテストを書く
    - **Property 4: アイコンクリックのルーティングはウィンドウ固有で ViewMode に対して排他的**
    - `resolveIconClickAction` の返り値が `view_mode` と `windowId` に対して排他的かつ正確であることを検証する
    - テストファイル: `projects/app/js/background.test.js`
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x] 4.4 background.js のユニットテストを書く
    - `switch_to_tab` メッセージ受信時に `chrome.tabs.create()` が呼ばれることを確認する
    - `switch_to_sidepanel` で `chrome.sidePanel.open()` が失敗した場合にタブが閉じられないことを確認する
    - `view_mode == "tab"` のアイコンクリックで `windowId` を指定して `chrome.tabs.create()` が呼ばれることを確認する
    - `chrome.*` API は `vi.fn()` でモックする
    - _Requirements: 2.2, 4.2, 4.4, 5.1_

- [x] 5. チェックポイント — ここまでのテストをすべて通過させる
  - `npm test` を実行し、すべてのユニットテスト・プロパティテストが通過することを確認する
  - 疑問があればユーザーに確認する

- [x] 6. app.html / app.js の改修（サイドパネル側）
  - `projects/app/app.html` のヘッダー左側に `.view-mode-switch` 要素を追加する
  - `projects/app/js/app.js` に `viewModeSwitch.js` と `storageManager.js` の import を追加する
  - 起動時に `getViewMode()` を呼び出し ViewModeSwitch を初期化する
  - タブ側に切り替えたとき: `saveSessionState()` → `sendMessage({ type: "switch_to_tab" })` → `window.close()`
  - _Requirements: 1.1, 1.4, 1.5, 1.6, 2.1, 2.3, 3.3, 6.2_

  - [x] 6.1 app.html に ViewModeSwitch を追加する
    - `.view-mode-switch` 要素をヘッダー左側に配置し、既存ボタン群のレイアウトを変更しない
    - `viewModeSwitch.js` と `storageManager.js` は `app.js` から ES module import する
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 6.2 app.js に起動時 ViewMode 読み込みと ViewModeSwitch 初期化を実装する
    - `App.init()` 内で `getViewMode()` を呼び出す
    - Storage 読み込み失敗時は Snackbar でエラー通知する
    - `initViewModeSwitch(el, viewMode, onModeChange)` を呼び出す
    - _Requirements: 1.5, 1.6, 6.2_

  - [x] 6.3 app.js にタブ切り替え処理を実装する
    - `onModeChange("tab")` で `saveSessionState(this.slotOrder, this.activeSlotIndex)` → `chrome.runtime.sendMessage({ type: "switch_to_tab" })` → `window.close()` を順に実行する
    - _Requirements: 2.1, 2.2, 2.3, 3.3_

  - [x] 6.4 app.js のユニットテストを書く
    - Storage に `"sidepanel"` が保存されているとき ViewModeSwitch が右選択状態で初期化されることを確認する
    - Storage に `"tab"` が保存されているとき左選択状態で初期化されることを確認する
    - スイッチ操作前に `saveSessionState()` が呼ばれ、その後 `sendMessage({ type: "switch_to_tab" })` が呼ばれることを確認する
    - テストファイル: `projects/app/js/app.test.js`
    - _Requirements: 1.6, 1.7, 2.1, 3.3_

- [x] 7. tabview.html / tabview.js の新規実装
  - `projects/app/tabview.html` を新規作成する（`app.html` と共通の UI 構造）
  - `projects/app/js/tabview.js` を新規作成する
  - 起動時に `getViewMode()`・`loadSessionState()`・`loadCameraSettings()` を読み込む
  - ViewModeSwitch の初期状態は `"tab"`
  - サイドパネル側に切り替えたとき: `saveSessionState()` → `sendMessage({ type: "switch_to_sidepanel", tabId })`
  - _Requirements: 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 6.3_

  - [x] 7.1 tabview.html を作成する
    - `app.html` と共通の HTML 構造（カメラコンテナ・ダイアログ・Snackbar 等）を再利用する
    - ヘッダーに ViewModeSwitch を配置する（タブ側選択状態が初期値）
    - `viewModeSwitch.js`・`storageManager.js`・`tabview.js` を `<script type="module">` で読み込む
    - _Requirements: 2.4, 2.5_

  - [x] 7.2 tabview.js に起動時 Storage 読み込みと ViewModeSwitch 初期化を実装する
    - `getViewMode()`・`loadSessionState()`・`loadCameraSettings()` を起動時に呼び出す
    - `session_state.slotOrder` に対応するカメラスロットを生成する
    - Storage 読み込み失敗時は Snackbar でエラー通知する
    - `initViewModeSwitch(el, "tab", onModeChange)` を呼び出す
    - _Requirements: 3.1, 3.4, 6.3_

  - [x] 7.3 tabview.js にサイドパネル切り替え処理を実装する
    - `onModeChange("sidepanel")` で `saveSessionState()` → `chrome.tabs.getCurrent()` → `sendMessage({ type: "switch_to_sidepanel", tabId })` を実行する
    - _Requirements: 3.2, 3.3, 4.1, 4.2, 4.3_

  - [x] 7.4 tabview.js のユニットテストを書く
    - `session_state.slotOrder` から読み込んだ deviceId と一致するカメラコンテナが生成されることを確認する
    - スイッチ操作時に `sendMessage({ type: "switch_to_sidepanel", tabId })` が呼ばれることを確認する
    - テストファイル: `projects/app/js/tabview.test.js`
    - _Requirements: 3.1, 4.1_

- [x] 8. Property 3 のプロパティテストを書く
  - [x] 8.1 Property 3 のプロパティテストを書く
    - **Property 3: モード切り替え前に必ずカメラ状態が保存される**
    - `saveSessionState` が `sendMessage` より先に呼ばれることをスパイで検証する
    - `app.js` と `tabview.js` の両方で検証する
    - テストファイル: `projects/app/js/app.test.js`（既存ファイルに追記）
    - **Validates: Requirements 3.3**

- [x] 9. 最終チェックポイント — すべてのテストを通過させる
  - `npm test` を実行し、すべてのユニットテスト・プロパティテストが通過することを確認する
  - 疑問があればユーザーに確認する

## Notes

- すべての実装ファイルは `projects/app/` 配下に置く。`extension/` ディレクトリは使用しない
- テストファイルは `projects/app/js/` 配下に `*.test.js` として配置する
- `chrome.*` API のモックは `vi.fn()` で構築し、テスト環境のグローバル `chrome` オブジェクトとして注入する
- `storageManager.js` の `getViewModeWithDefault` と `background.js` の `resolveIconClickAction` は純粋関数のためインメモリでテストする
- `camera.js` の既存関数（`saveSessionState`・`loadSessionState`・`loadCameraSettings`）は変更しない
- Property 2 のテストは `camera.js` の既存実装をそのままテストすることで実施する

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "4.1", "4.2"] },
    { "id": 4, "tasks": ["4.3", "4.4", "6.1"] },
    { "id": 5, "tasks": ["6.2", "7.1"] },
    { "id": 6, "tasks": ["6.3", "7.2"] },
    { "id": 7, "tasks": ["6.4", "7.3"] },
    { "id": 8, "tasks": ["7.4", "8.1"] }
  ]
}
```
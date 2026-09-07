# Requirements Document

## Introduction

OmniView-Solo は現在、Chrome のサイドパネルに限定されたレイアウトでカメラ映像を表示している。資料を参照しながら会議に参加する場面ではサイドパネルが有効だが、資料を使わず言葉だけで議論するシーンでは、カメラ映像をより大きく表示したいというニーズがある。

本フィーチャーは、サイドパネルとタブ全体表示をワンタップで切り替える「表示位置切り替え」機能を追加する。タブモードではブラウザウィンドウ全体を使って OmniView-Solo の全機能（カメラ映像・役割割り当て・ホワイトボード補正等）を表示し、カメラ接続状態はモード間で継続される。

---

## Glossary

- **Extension**（拡張機能）: OmniView-Solo Chrome 拡張機能全体を指す
- **SidePanel**（サイドパネル）: Chrome のサイドパネル内に表示される OmniView-Solo の UI（`app.html` / `app.js`）
- **TabView**（タブビュー）: タブ全体に表示される OmniView-Solo の UI ページ（`tabview.html` / `tabview.js`）
- **ViewMode**（表示モード）: `"sidepanel"` または `"tab"` の2値を取る、現在の表示位置の状態
- **ViewModeSwitch**（表示切り替えスイッチ）: ヘッダーに配置された M3 スタイルのスライドスイッチ UI コンポーネント（`js/viewModeSwitch.js`）
- **Background_Service_Worker**（バックグラウンドサービスワーカー）: Manifest V3 のサービスワーカー（`js/background.js`）
- **Storage**（ストレージ）: `chrome.storage.local` による永続化層

---

## Requirements

### Requirement 1:表示切り替えスイッチの配置

**User Story:** サイドパネル利用者として、ヘッダーのスイッチ一つで表示位置をタブに切り替えたい。カメラ映像を大きく見ながら会話に集中できるようにするため。

#### Acceptance Criteria

1. THE **Extension** SHALL サイドパネルのヘッダー左側に **ViewModeSwitch** を表示する。
2. THE **ViewModeSwitch** SHALL 左側に「タブ全体」を想起させるシンボルアイコン、右側に「サイドパネル」を想起させるシンボルアイコンを表示する。
3. THE **ViewModeSwitch** SHALL Material Design 3 のスライドスイッチ（Toggle Switch）デザイン仕様に準拠したスタイルで実装される。
4. THE **Extension** SHALL 既存のヘッダー右側ボタン群（「カメラ追加」「設定」）のレイアウトを変更しない。
5. WHEN **Storage** に保存された **ViewMode** が存在しない場合、THE **ViewModeSwitch** SHALL `"sidepanel"` を初期値として表示する。
6. WHEN **Storage** に保存された **ViewMode** が `"sidepanel"` の場合、THE **ViewModeSwitch** SHALL サイドパネル側（右）を選択状態で表示する。
7. WHEN **Storage** に保存された **ViewMode** が `"tab"` の場合、THE **ViewModeSwitch** SHALL タブ側（左）を選択状態で表示する。

---

### Requirement 2:サイドパネルからタブモードへの切り替え

**User Story:** 会議参加者として、スイッチをクリックするだけでカメラ映像をタブ全体に大きく表示させたい。資料を使わない議論の場面で全員の表情を見やすくするため。

#### Acceptance Criteria

1. WHEN **ViewModeSwitch** をタブ側（左）に切り替えた場合、THE **Extension** SHALL `"tab"` を **ViewMode** として **Storage** に保存する。
2. WHEN **ViewModeSwitch** をタブ側（左）に切り替えた場合、THE **Extension** SHALL OmniView-Solo の **TabView** を新規タブとして開く。
3. WHEN **ViewModeSwitch** をタブ側（左）に切り替えた場合、THE **Extension** SHALL サイドパネルを閉じる。
4. THE **TabView** SHALL サイドパネルで提供していたすべての機能（カメラ映像表示・役割割り当て・ホワイトボード補正・クリップボードコピー等）をタブ全体に表示する。
5. THE **TabView** SHALL ヘッダーに **ViewModeSwitch** を表示し、タブ側（左）を選択状態で表示する。

---

### Requirement 3:カメラ接続状態の継続性

**User Story:** 利用者として、サイドパネルとタブを切り替えても接続済みカメラが再接続なしで表示され続けるようにしたい。切り替えのたびにカメラを設定し直す手間をなくすため。

#### Acceptance Criteria

1. WHEN **ViewModeSwitch** をタブ側に切り替えた場合、THE **TabView** SHALL サイドパネルで接続・表示していたカメラと同一のカメラ一覧を表示する。
2. WHEN **ViewModeSwitch** をサイドパネル側に切り替えた場合、THE **SidePanel** SHALL タブモードで接続・表示していたカメラと同一のカメラ一覧を表示する。
3. THE **Storage** SHALL 現在アクティブなカメラの `deviceId` リスト（`session_state.slotOrder`）および各カメラの設定（`camera_settings`）をモード切り替え前に保存する。
4. IF **Storage** に保存されたカメラ設定の読み込みに失敗した場合、THEN THE **Extension** SHALL カメラ一覧を空の状態で起動し、エラーを通知する。

---

### Requirement 4:タブモードからサイドパネルモードへの戻り動作

**User Story:** 利用者として、タブに表示中の OmniView-Solo をサイドパネルに戻せるようにしたい。資料を参照しながら会議に戻る際にスムーズに切り替えられるようにするため。

#### Acceptance Criteria

1. WHEN **TabView** 上の **ViewModeSwitch** をサイドパネル側（右）に切り替えた場合、THE **Extension** SHALL `"sidepanel"` を **ViewMode** として **Storage** に保存する。
2. WHEN **TabView** 上の **ViewModeSwitch** をサイドパネル側（右）に切り替えた場合、THE **Extension** SHALL **SidePanel** を開く。
3. WHEN **TabView** 上の **ViewModeSwitch** をサイドパネル側（右）に切り替えた場合、THE **Extension** SHALL **TabView** のタブを閉じる。
4. IF サイドパネルを開く操作が失敗した場合、THEN THE **Extension** SHALL **TabView** を閉じずに維持し、エラーをコンソールに記録する。

---

### Requirement 5:拡張機能アイコンのクリック動作（マルチウィンドウ対応）

**User Story:** OmniView-Solo を使いながら、どのブラウザウィンドウでも拡張機能アイコンをクリックすればその時点のモード（タブ or サイドパネル）で即座に開けるようにしたい。複数ウィンドウで作業していても迷わず使えるようにするため。

#### Acceptance Criteria

1. WHILE **ViewMode** が `"tab"` の場合、WHEN 拡張機能アイコンがクリックされた場合、THE **Background_Service_Worker** SHALL クリックされたブラウザウィンドウに OmniView-Solo の **TabView** を新規タブとして開く。
2. WHILE **ViewMode** が `"tab"` の場合、WHEN 拡張機能アイコンがクリックされた場合、THE **Background_Service_Worker** SHALL サイドパネルを開く動作を行わない。
3. WHILE **ViewMode** が `"sidepanel"` の場合、WHEN 拡張機能アイコンがクリックされた場合、THE **Background_Service_Worker** SHALL クリックされたブラウザウィンドウのサイドパネルを開く。

---

### Requirement 6:表示モードの永続化

**User Story:** 利用者として、ブラウザを再起動した後も前回の表示モードが復元されるようにしたい。毎回設定し直す手間をなくすため。

#### Acceptance Criteria

1. WHEN **ViewMode** が変更された場合、THE **Extension** SHALL 新しい **ViewMode** 値を `chrome.storage.local` の `view_mode` キーに即時保存する。
2. WHEN サイドパネルが起動した場合、THE **SidePanel** SHALL `chrome.storage.local` から `view_mode` を読み込み、**ViewModeSwitch** の表示状態に反映する。
3. WHEN **TabView** が読み込まれた場合、THE **TabView** SHALL `chrome.storage.local` から `view_mode` を読み込み、**ViewModeSwitch** の表示状態に反映する。
4. IF `chrome.storage.local` の読み込みに失敗した場合、THEN THE **Extension** SHALL `"sidepanel"` を **ViewMode** のデフォルト値として使用する。
5. WHEN **Background_Service_Worker** が起動した場合、THE **Background_Service_Worker** SHALL `chrome.storage.local` から `view_mode` を読み込み、アイコンクリック時の動作を決定する。
# 技術スタック

## 実行環境・言語

- **プラットフォーム**: Chrome 拡張機能、Manifest V3、サイドパネル UI
- **言語**: HTML5、CSS3、Vanilla JavaScript（ES6+）
- **ビルド**: Python スクリプト（`scripts/create_package.py`）で zip 生成。ただし拡張機能自体はバンドラー不使用のプレーンファイル
- **外部依存禁止** — 必要なライブラリはすべて拡張機能パッケージ内に同梱すること

## 使用する Chrome API

- `chrome.sidePanel` — サイドパネルの登録とライフサイクル管理
- `chrome.storage.local` — `deviceId` をキーとしたカメラ設定の永続化
- `MediaDevices` API（`getUserMedia`、`enumerateDevices`）— カメラへのアクセスと列挙
- `Canvas` API — 画像処理（射影変換・二値化・中央値フィルタ）
- `Clipboard` API（`navigator.clipboard.write`）— 処理済み画像の PNG としてのコピー

## 多言語対応（i18n）

- Chrome の `_locales` 機構を使用（`chrome.i18n.getMessage`）
- `_locales/en/messages.json`、`_locales/ja/messages.json` の2言語を管理
- HTML 上では `data-i18n` / `data-i18n-title` / `data-i18n-tooltip` 属性でマーキングし、JS 側で一括適用

## UI / スタイリング

- **Material Design 3（M3）** への完全準拠
- **CSS カスタムプロパティ**（`--md-sys-color-*` 等）で独自実装 — Material Web Components ライブラリは使用しない
- `css/m3-theme.css` でカラートークンを定義、`css/style.css` でコンポーネントを実装
- `-Solo` シリーズのカラーパレット・コンポーネントスタイルとの統一を維持する
- Material Symbols Outlined フォント（`assets/` 内にベンダリング済み）を使用

## 画像処理方針

- すべての処理は **ブラウザ内の Canvas 上** で実行
- フレームキャプチャは数秒に1回に間引く（連続 30fps 処理は禁止）
- 使用アルゴリズム：射影変換（4点ホモグラフィ）、適応的二値化 / CLAHE、キャッシュ済みフレームを使った時間的中央値フィルタ
- 処理ロジックは `js/processor.js`（画像処理）と `js/matrix3d-calc.js`（射影変換）に分離

## Python ツーリング

`pyproject.toml` と `main.py` はスキャフォールドであり、**拡張機能のランタイムには含まれない**。ビルド・検証スクリプトは `scripts/` に配置。

- Python ≥ 3.12、`uv` / `.venv` で管理
- 仮想環境パス：`.venv`（VS Code で自動アクティベート）

## npm スクリプト

```powershell
npm run build         # バージョン検証 + zip パッケージ作成
npm run test          # バージョン整合性チェック + ビルド検証
npm run icons         # SVG → 各サイズ PNG アイコン生成
npm run version:bump  # バージョン番号をインクリメント
```

## マニフェスト主要設定（`manifest.chrome.json`）

- `permissions`: `sidePanel`, `storage`, `clipboardWrite`, `videoCapture`
- `side_panel.default_path`: `app.html`
- `background.service_worker`: `js/background.js`（type: module）
- `content_security_policy`: `default-src 'self'`（外部リソース一切禁止）
# プロジェクト構成

## 現状

リポジトリはアクティブ開発段階。Chrome 拡張機能のソースは `projects/app/` に存在する。

```
OmniView-Solo/
├── projects/
│   ├── app/                   # Chrome 拡張機能ソース（実際の成果物）
│   └── web/                   # 紹介ページ・プライバシーポリシー（GitHub Pages）
├── shared/                    # 共通アセット・CSS（複数プロジェクト間で共有）
├── scripts/                   # ビルド・ユーティリティスクリプト（Python / Node）
├── docs/                      # 要件定義・技術仕様書
├── .kiro/
│   ├── specs/                 # Spec ワークフロー（requirements / design / tasks）
│   └── steering/              # AI アシスタント用ステアリングルール
├── .gemini/                   # Gemini CLI コマンド定義
├── extension/                 # ※旧スキャフォールド（削除予定）— 参照しないこと
├── AGENTS.md                  # エージェント向け開発ガイドライン
├── package.json               # npm スクリプト（build / test / icons）
├── main.py                    # Python スキャフォールド（拡張機能とは無関係）
└── pyproject.toml             # Python プロジェクト設定（スキャフォールドのみ）
```

## 拡張機能ソース構成（`projects/app/`）

```
projects/app/
├── manifest.chrome.json       # MV3 マニフェスト（Chrome 用）
├── app.html                   # サイドパネルのエントリーポイント
├── permission.html            # カメラ権限要求ページ
├── version.json               # バージョン管理ファイル
├── css/
│   ├── m3-theme.css           # Material Design 3 カラートークン・テーマ定義
│   └── style.css              # コンポーネントスタイル
├── js/
│   ├── app.js                 # メイン UI ロジック（エントリーポイント）
│   ├── background.js          # サービスワーカー（MV3）
│   ├── camera.js              # カメラ管理・MediaDevices API ラッパー
│   ├── matrix3d-calc.js       # 射影変換（4点ホモグラフィ計算）
│   ├── processor.js           # 画像処理（二値化・CLAHE・中央値フィルタ）
│   └── permission.js          # カメラ権限要求ページのロジック
├── assets/                    # アイコン（16/32/48/128px PNG）
└── _locales/
    ├── en/                    # 英語 i18n メッセージ
    └── ja/                    # 日本語 i18n メッセージ
```

## ビルド・テストコマンド

```powershell
# ビルド（zip パッケージ作成）
npm run build

# テスト（バージョン整合性 + ビルド検証）
npm run test

# アイコン生成（SVG → 各サイズ PNG）
npm run icons   # または: python3 scripts/generate_png_icons.py

# バージョンバンプ
npm run version:bump
```

## Chrome への読み込み

`chrome://extensions` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」→ `projects/app/` フォルダを選択

## 主な規約

- ユーザー向け文字列はすべて `_locales/ja/messages.json`（および `en/messages.json`）で i18n 管理する
- HTML 上では `data-i18n` / `data-i18n-title` / `data-i18n-tooltip` 属性を使用する
- CSS 変数は `--md-sys-color-*` の命名規則に従う（Material Design 3 カラートークン）
- `chrome.storage.local` のデータは `deviceId` をキーとする
- ランタイム中に外部へのネットワークリクエストを行うファイルは作成しない
- 画像処理ロジックは `processor.js` / `matrix3d-calc.js` に分離し、UI ロジックと混在させない
- テスト・検証用の一時ファイルはリポジトリにコミットしない
# 要件定義書：OmniView-Solo (Chrome Extension)

1. プロジェクト概要
本プロジェクトは、リモート授業（生徒と先生、講師の混在）やハイブリッド会議において、心理的距離を縮め、かつ教材（ノート、テキストなど）やホワイトボードのUXを非常に向上させるためのChrome拡張機能（サイドパネル専用）である。
**外部のサーバーやクラウドAPIを一切利用せず、セキュリティが厳格な校内・社内環境でもスタンドアロンで動作する**完全ローカル完結（Vanilla JS / 軽量画像処理）を徹底する。

2. システム要件・制約事項
- **実行環境**: Chrome拡張機能（Manifest V3 / サイドパネル UI）
- **依存関係**: 外部依存（CDN等）は一切禁止。必要なライブラリ（OpenCV.js等）がある場合はすべてパッケージ内に同梱すること。
- **パフォーマンス制約**: Teams等のビデオ会議と同時にノートPC上で実行されるため、高負荷なリアルタイム処理（30fpsでの常時画像演算）やAI（機械学習）モデルの実行は禁止する。処理を数秒に1回に間引く、解像度を落として計算する等の超軽量・低負荷設計を必須とする。
- **デザイン・UI規約（新規追加）**:
  - **Google Material Design 3 (M3)** への完全準拠。
  - `QuickLog-Solo` や `Replace-Solo` をはじめとする、他の自作 `-Solo` シリーズ（ローカル完結型Chrome拡張機能群）と**統一感のあるUI/UXデザイン、カラーパレット、CSSコンポーネント設計**を踏襲すること（Vanilla JS / CSS変数を用いた独自実装）。

3. 機能要件 (Functional Requirements)

- カメラ識別・自動設定復元機能: 同じハードウェア構成で繰り返し利用することを想定し、カメラの固有識別子を用いた自動復元機能を備える。
  - デバイスの識別と永続化: navigator.mediaDevices.enumerateDevices() で取得できる deviceId をキーとして、設定情報（モード、カスタムラベル）を chrome.storage.local に保存する。
  - 初期設定の自動適用: サイドパネル起動時、接続されたカメラのIDが保存済みデータと一致した場合、設定（モード・カスタムラベル）を初期値として自動的に適用・復元する。
- カメラ配置・レイアウト設定機能（M3対応レスポンシブ）
  - カメラモード割り当て: M3スタイルのドロップダウン（Select）で、各カメラのモードを動的に変更可能とする。
  - レスポンシブ・レイアウト: サイドパネルの横幅（Width）の伸縮に応じ、以下のルールで表示を自動変更する（ResizeObserver 等を使用）。
    - 【幅が狭い場合（通常表示）】
      - すべての有効なカメラ（ホワイトボード、人物1、人物2...）を縦一列（シングルカラム）に等しいサイズでスクロール配置する。
    - 【幅が広い場合（拡大表示：議事録などの横に配置した状態）】
      - 画面を「上段」と「下段」に分割する。
      - 上段（メイン領域）: ホワイトボード用カメラの画像を横幅いっぱいに大きく配置。
      - 下段（サブ領域）: 人物用・雰囲気用のカメラ画像を、小さめのサイズで横並び（水平配置）で表示する。
- ホワイトボード補正・キャプチャ機能
  - 半自動・手動歪み補正（射影変換）:
    - ホワイトボード用カメラの映像上に、ドラッグ＆ドロップ可能な「4つのアンカーポイント（角）」をオーバーレイ表示し、正面を向いた綺麗な長方形に射影変換（Perspective Transform）する。
  - 写り込み（人・腕）の自動排除 (Occlusion Removal):
    - 時間的中央値（メディアン）フィルタを用いて、動いている人間をノイズとして排除した静止画をリアルタイム（数秒に1回更新）で生成する。
    - 処理が安定するまで（最初のメディアンフレームが生成されるまで）は元の映像を表示し続ける。
  - 補正後画像のクリップボードコピー:
    - ホワイトボード用カメラのコンテナ内に M3スタイルの 「Filled Button（またはExtended FAB）」仕様のキャプチャ（コピー）ボタン を常時表示する。
    - ボタン押下時、歪み補正およびコントラスト加工が適用された最新の静止画フレームを Clipboard API を用いて、PNG形式等でクリップボードに直接コピーする。

4. UIコンポーネント・意匠要件（M3 準拠 & -Solo シリーズ統一）

他の -Solo プロジェクトとの調和、および Material 3 のルック＆フィールを実現するため、以下の共通コンポーネント仕様を適用する。

- カラーシステム（Color Tokens）:
  - M3のベーストーンである Primary, Surface, On-Surface, Surface-Variant などのカラーをCSS変数（--md-sys-color-...）で定義し、他の拡張機能とトーンを統一する。
- 形状と角丸（Shape / Border Radius）:
  - ボタンや入力フィールド、カメラ映像のコンテナカードにはM3準拠の丸み（カード等の角丸は 12px または 16px、ボタンは完全な角丸等）を適用する。
- 入力フォーム（Text Fields / Selects）:
  - カメラのカスタムラベル入力用には、M3の Filled / Outlined Text Field（下線、または外枠のスタイル）を採用し、フォーカス時のアニメーションを実装する。
- フィードバック（Toasts / Snackbars）:
  - キャプチャボタンが押下され、クリップボードへのコピーが成功した際は、サイドパネル下部に一時的に表示される M3スタイルのスナックバー（Snackbar） で「クリップボードにコピーしました」と通知する。

5. 技術スタック・実装方針（AIエージェントへの指示）

- プロジェクト名: OmniView-Solo
- 言語: HTML5, CSS3, Vanilla JavaScript (ES6+)
- 利用API:
  - chrome.sidePanel API (Manifest V3)
  - chrome.storage.local (カメラIDごとの設定永続化用)
  - MediaDevices API (getUserMedia) / Canvas API (画像演算・コピー用)
  - Clipboard API (navigator.clipboard.write)
- データ構造の例 (chrome.storage.local):
```json
{
  "camera_settings": {
    "stored_device_id_abc123...": {
      "role": "whiteboard",
      "customLabel": "教室A正面黒板・ホワイトボード（教材用）",
      "points": [{"x": 10, "y": 10}, {"x": 200, "y": 10}, ...]
    },
    "stored_device_id_xyz789...": {
      "role": "person",
      "customLabel": "先生・講師（全体）"
    }
  }
}
```

6. 参照プロジェクト

- `QuickLog-Solo`: https://github.com/masanori-satake/QuickLog-Solo
- `Replace-Solo`: https://github.com/masanori-satake/Replace-Solo
- `Issues-Solo`: https://github.com/masanori-satake/Issues-Solo
- `ServiceRoute-Solo`: https://github.com/masanori-satake/ServiceRoute-Solo
- `TabMagnet-Solo`: https://github.com/masanori-satake/TabMagnet-Solo
- `ActionsBoard-Solo`: https://github.com/masanori-satake/ActionsBoard-Solo
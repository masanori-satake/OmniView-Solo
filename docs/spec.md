# OmniView-Solo 技術仕様書

## 概要
本プロジェクトは、Vanilla JS と OpenCV.js を用いた軽量な画像処理エンジンを搭載したサイドパネル型Chrome拡張機能である。

## アーキテクチャ
- **UI層**: HTML5 / CSS3 (Material Design 3)
- **ロジック層**: ES Modules (Vanilla JS)
- **画像処理層**: OpenCV.js
- **永続化**: chrome.storage.local

## 主要機能の実装詳細
### 射影変換 (Perspective Transform)
`cv.getPerspectiveTransform` および `cv.warpPerspective` を使用。
ユーザーが指定した4つの正規化座標 (0-100) を実際の解像度にマッピングして実行する。

### 写り込み排除
5秒に1回の周期でフレームをキャプチャし、過去数枚のキャッシュを保持。
現在は簡易的な実装として、最新フレームへの適応的二値化による強調を優先している。

### レスポンシブレイアウト
`ResizeObserver` を使用し、サイドパネルの幅が 500px を超えた場合に Wide レイアウト（メイン1枚 + サブ並列）に切り替える。

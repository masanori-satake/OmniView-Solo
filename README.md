# OmniView-Solo

[![Version](https://img.shields.io/badge/version-0.1.16-blue)](https://github.com/masanori-satake/OmniView-Solo)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Privacy](https://img.shields.io/badge/Privacy-Local%20Only-brightgreen)](SECURITY.md)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange)](projects/app/manifest.chrome.json)
[![CI](https://github.com/masanori-satake/OmniView-Solo/actions/workflows/ci.yml/badge.svg)](https://github.com/masanori-satake/OmniView-Solo/actions/workflows/ci.yml)

『OmniView-Solo』は、ハイブリッド会議においてホワイトボードの視認性を劇的に向上させるためのChrome拡張機能（サイドパネル専用）です。

## 特徴

- **完全ローカル完結**: 外部サーバーやクラウドAPIを一切利用せず、セキュリティが厳格な社内環境でもスタンドアロンで動作します。
- **射影変換 (Perspective Transform)**: ホワイトボードの歪みを補正し、正面から見たような綺麗な長方形に変換します。
- **適応的二値化**: 背景の白を飛ばし、マーカーの文字をくっきり強調します。
- **写り込み排除**: タイムラプス的な合成処理により、ホワイトボード前の人や腕をノイズとして排除します。
- **M3準拠のUI/UX**: Google Material Design 3に完全準拠し、他の-Soloシリーズと統一感のあるデザインを提供します。

## インストール方法

1. リリースページから最新の `OmniView-Solo-vX.X.X.zip` をダウンロードします。
2. `chrome://extensions` を開き、デベロッパーモードをオンにします。
3. 解凍したフォルダを「パッケージ化されていない拡張機能を読み込む」で選択します。

## 使い方

1. ブラウザのサイドパネルから OmniView-Solo を開きます。
2. カメラを選択し、役割を「Whiteboard」に設定します。
3. プレビュー上の4つの点をドラッグしてホワイトボードの四隅に合わせます。
4. 「Capture」ボタンを押すと、補正された画像がクリップボードにコピーされます。

## 免責事項

本ソフトウェアは無保証であり、利用により生じたいかなる損害についても開発者は責任を負いません。自己責任でご利用ください。

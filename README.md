<p align="center">
  <img src="projects/app/assets/icon128.png" width="128" height="128" alt="OmniView-Solo Logo">
</p>

# OmniView-Solo - Whiteboard Perspective Corrector & Enhancer

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/jnkmbcicplfobgllfljekhlaofkdooam?logo=google-chrome&logoColor=white&label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/omniview-solo/jnkmbcicplfobgllfljekhlaofkdooam)
[![version](https://img.shields.io/badge/version-1.1.8-blue)](projects/app/manifest.json)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Privacy: 100% Local](https://img.shields.io/badge/Privacy-100%25%20Local-brightgreen)](#-privacy--security)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange)](projects/app/manifest.json)
[![Tests](https://img.shields.io/github/actions/workflow/status/masanori-satake/OmniView-Solo/code-quality.yml?branch=main&label=Tests)](https://github.com/masanori-satake/OmniView-Solo/actions/workflows/code-quality.yml)
[![Coverage](https://img.shields.io/github/actions/workflow/status/masanori-satake/OmniView-Solo/coverage.yml?branch=main&label=Coverage)](https://github.com/masanori-satake/OmniView-Solo/actions/workflows/coverage.yml)
[![Pure Vanilla JS](https://img.shields.io/badge/Pure%20Vanilla%20JS-Zero%20Dependencies-informational?logo=javascript&logoColor=white)](#-privacy--security)

An essential **chrome-extension** for remote classes, online lectures, and hybrid meetings. OmniView-Solo works as a powerful **whiteboard-enhancer** that performs real-time **perspective-transform** and **image-correction** on angled camera feeds, transforming distorted whiteboards, notebooks, and teaching materials into crisp, front-facing rectangular images ready for instant 1-click sharing.

---

## 🚀 Key Features

- **Perspective Correction (`perspective-transform`)**: Easily adjust perspective four-point handles to rectify angled whiteboards, teaching materials, and notebooks into clear, front-facing rectangles.
- **Occlusion & Reflection Removal**: Advanced median frame stacking acts as an intelligent **whiteboard-enhancer**, removing teachers, presenters, and arm shadows passing across the board.
- **1-Click Capture & Copy (`image-correction`)**: Instantly copy enhanced, high-contrast whiteboard captures to your clipboard for seamless pasting into chat tools, slides, or learning management systems.
- **Multi-Camera Display & Auto-Switching**: Manage multiple camera feeds effortlessly in both Side Panel and Tab View modes, ideal for **hybrid-meeting** rooms and remote classrooms.
- **Material Design 3 Interface**: Clean, accessible UI with dark mode support and local offline operation.

---

## 🔒 Privacy & Security

- **100% Local Execution**: Operates entirely within your browser without sending any video, image, or analytics data to external servers or cloud APIs.
- **Zero External Dependencies**: Built with Pure Vanilla JavaScript and CSS with no third-party tracking, analytics, or runtime library calls.
- **Zero Data Collection**: Your camera streams, settings, and captures remain strictly on your local machine.

---

## 💻 Installation

### Install from Chrome Web Store (Recommended)

Get it directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/omniview-solo/jnkmbcicplfobgllfljekhlaofkdooam).

### Install from Source Code

1. Download the latest `OmniView-Solo-vX.X.X.zip` from the Releases page.
2. Open `chrome://extensions` in your browser and enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped directory.

---

## 📖 How to Use

1. Open OmniView-Solo from your browser side panel or action icon.
2. Toggle between **Side Panel** and **Tab View** modes as needed.
3. Select your web camera and set the mode to **Whiteboard**.
4. Drag the 4 handle points on the preview screen to align with the corners of your whiteboard or notebook.
5. Click **Capture** to copy the perspective-corrected, cleaned image to your clipboard.

---

## ⚠️ Disclaimer

This software is provided "as is" without warranty of any kind. The developer assumes no responsibility for any damages arising from its use.

---

## 🇯🇵 日本語

### 概要

『OmniView-Solo - オンライン会議・授業用 ホワイトボード画像補正』は、リモート授業やオンライン講義、ハイブリッド会議の学習・作業効率を向上させるChrome拡張機能（サイドパネル表示 / タブ全体表示対応）です。斜めから撮影されたホワイトボード、教科書、ノート、スケッチブックなどの歪みをリアルタイムで正面画像へ自動・手動で正しく補正します。

### 主な特徴

- **100% 完全ローカル動作**: 外部サーバーやクラウドAPIを一切使用せず、セキュリティが厳格な学校・企業環境でも安心して利用できます。
- **射影変換 (Perspective Transform)**: 4箇所のポイントを操作するだけで、斜めから撮影されたホワイトボードや教材を正面から見たきれいな長方形に補正します。
- **写り込み排除・ノイズ除去**: タイムラプス的な画像合成処理により、ホワイトボードの前を横切る先生や発表者、腕の影を自動的に取り除きます。
- **1クリックキャプチャ**: 補正・クリーン化された画像を1クリックでクリップボードにコピーし、チャットツールやスライドにすぐ貼り付けることができます。
- **マルチカメラ & 自動切り替え**: 複数台のカメラを登録し、自動巡回表示やピン留め固定が可能です。

### インストール方法

#### Chrome ウェブストアからインストール（推奨）
[Chrome ウェブストア](https://chromewebstore.google.com/detail/omniview-solo/jnkmbcicplfobgllfljekhlaofkdooam) から入手してください。

#### ソースコードからのインストール
1. リリースページから最新の `OmniView-Solo-vX.X.X.zip` をダウンロードします。
2. `chrome://extensions` を開き、デベロッパーモードをオンにします。
3. 「パッケージ化されていない拡張機能を読み込む」を選択し、解凍したフォルダを指定します。

### 使い方

1. サイドパネルまたはアイコンから OmniView-Solo を起動します。
2. ヘッダーの切り替えボタンで「サイドパネル」と「タブ全体表示」を切り替えることができます。
3. カメラを選択し、モードを「Whiteboard」に設定します。
4. 画面上の4つの緑色ハンドルをドラッグして、ホワイトボードやノートの四隅に合わせます。
5. 「Capture」ボタンを押すと、綺麗に補正された画像がクリップボードにコピーされます。

### 免責事項

本ソフトウェアは無保証であり、利用により生じたいかなる損害についても開発者は責任を負いません。自己責任でご利用ください。

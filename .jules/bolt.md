## 2026-03-31 - Canvas 2D 変換ループにおける不要な putImageData と clearRect のスキップ
**学び:** WhiteboardProcessor の requestAnimationFrame (60 FPS) ループ内で、変更されていない静的な MedianStacker の ImageData バッファに対して毎フレーム `putImageData()` を呼ぶと、毎秒数GBクラスの不要な CPU→2D Canvas コンテキスト転送が発生していた。また、オーバーレイキャンバスに描画要素がない状態で毎フレーム `clearRect()` を呼び出すのも無駄な描画オーバーヘッドとなっていた。スタックフレームにバージョン番号 (`version`) を導入し、描画キー (`drawStateKey`) を用いたメモ化・状態フラグ制御により、描画が必要なタイミングのみ Canvas 操作を実行することで大幅に CPU/GPU 負荷を削減できた。
**アクション:** 今後 Canvas や Media Stream を扱うリアルタイム処理を追加・変更する際は、毎フレーム描画を愚直に呼び出さず、入力・状態変更時の差分駆動 (Event-driven / Dirty checking) 描画パターンを優先適用する。

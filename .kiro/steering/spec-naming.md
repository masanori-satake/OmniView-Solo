# Spec ディレクトリ命名規則

## 概要

Spec の作成・実施順序を明確にするため、すべての Spec ディレクトリ名には4桁のゼロ埋め連番プレフィックスを付ける。

## 命名フォーマット

```
.kiro/specs/{NNNN}_{feature-name}/
```

- `{NNNN}` — 4桁のゼロ埋め連番（例：`0001`、`0002`、`0010`）
- `{feature-name}` — ケバブケースのフィーチャー名（例：`user-authentication`）
- 最初の Spec は `0001_` から開始する

## 例

```
.kiro/specs/
├── 0001_camera-setup/
│   ├── requirements.md
│   ├── design.md
│   └── tasks.md
├── 0002_whiteboard-correction/
│   ├── requirements.md
│   ├── design.md
│   └── tasks.md
└── 0003_clipboard-copy/
    ├── requirements.md
    ├── design.md
    └── tasks.md
```

## 連番の決定方法

新しい Spec を作成するときは、以下の手順で次の番号を決定する：

1. `.kiro/specs/` 以下のディレクトリ一覧を取得する
2. 既存のプレフィックス（`NNNN`）の最大値を確認する
3. `最大値 + 1` を次の連番とする（ゼロ埋め4桁）
4. `.kiro/specs/` が存在しない、またはサブディレクトリが1つもない場合は `0001` から開始する

## 規約

- プレフィックスは**作成順**を表す — 実装優先度や重要度とは無関係
- 一度付けたプレフィックスは変更しない（順序の記録として保持する）
- プレフィックスなしのディレクトリ名は使用しない

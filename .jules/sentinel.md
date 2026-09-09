## 2026/03/31 - ログ一覧レンダリングにおける DOM 型 XSS の防止
**脆弱性:** `App.prototype.renderLogs` 内で `div.innerHTML` を直接使用してログメッセージを挿入していたため、カメラのカスタムラベルや外部インポートデータ、エラー詳細メッセージ等に悪意ある script / HTML タグが含まれている場合、DOM型 XSS (Cross-Site Scripting) や HTML インジェクションが実行される恐れがあった。
**学び:** `innerHTML` に文字列を結合・流し込む実装は、開発時に可読性が高く思えてもユーザー制御や外部データ入力が混入するリスクを伴う。
**予防策:** ログやメッセージなど文字列のみの表示箇所では `textContent` や `document.createTextNode()` を使用し、常に安全な DOM 構造構築パターンを適用する。

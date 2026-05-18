# フィードバック収集システム — セットアップ手順

## Phase 1: 複数クライアント対応

### 1. Google Sheets 構造の変更

#### 1-1. `feedback` シートを `feedback_makuake` にリネーム

1. Google Sheets を開く
2. 下部の `feedback` タブを右クリック → 「名前を変更」
3. `feedback_makuake` に変更して Enter

#### 1-2. `clients` シートを新規作成

1. 「＋」ボタンで新しいシートを追加
2. シート名を `clients` に変更
3. 1行目（ヘッダー）に以下を入力：

| A | B | C | D | E |
|---|---|---|---|---|
| client_id | token | pin | display_name | active |

#### 1-3. Makuake の行を追加（2行目）

| client_id | token | pin | display_name | active |
|---|---|---|---|---|
| makuake | 1TL4Uhg0fSCdlPUdztyAd1JNRN6ipFe5 | 482051 | Makuake Blueprint Lab | TRUE |

> **PIN変更方法**: `pin` 列の値を直接書き換えるだけでOK（6桁数字を推奨）

---

### 2. Apps Script の更新

1. 拡張機能 > Apps Script を開く
2. `apps-script.gs` の内容を全選択して貼り付け
3. 保存（Ctrl+S）
4. デプロイ > **デプロイの管理** を開く
5. 鉛筆アイコン（編集）→ バージョンを「新しいバージョン」に変更 → デプロイ

> **注意**: デプロイURLは変わらないため、staff.html / dashboard.html の `ENDPOINT_URL` の変更は不要。

---

### 3. 新クライアント追加時のトークン生成

Apps Script エディタで `generateToken()` 関数を実行：

1. Apps Script エディタを開く
2. 関数の選択ドロップダウンで `generateToken` を選択
3. 「実行」をクリック
4. ログに表示された32文字のトークンをコピー
5. `clients` シートに新しい行として追加

---

### 4. Makuake 向けダッシュボード URL

```
URL: https://www.a9tion.com/feedback/dashboard.html?token=1TL4Uhg0fSCdlPUdztyAd1JNRN6ipFe5
PIN: 482051
```

アクセスするとPIN入力画面が表示され、認証後にMakuakeのフィードバックデータが表示されます。

---

### ファイル構成

| ファイル | 用途 |
|---|---|
| `staff.html` | スタッフ向け音声入力フォーム（Phase 1では変更なし） |
| `dashboard.html` | クライアント向けダッシュボード（token+PIN認証） |
| `login.html` | a9tion管理者向けログイン（既存） |
| `apps-script.gs` | Google Apps Script（doGet / doPost / generateToken） |

### Google Sheets 構造

| シート名 | 用途 |
|---|---|
| `clients` | クライアント認証情報（client_id, token, pin, display_name, active） |
| `feedback_makuake` | Makuakeのフィードバックデータ |
| `feedback_{client_id}` | 追加クライアント分（Phase 2以降） |

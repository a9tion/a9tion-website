# フィードバック収集システム — 運用手順

## ファイル構成

| ファイル | 用途 |
|---|---|
| `staff.html` | スタッフ向け音声入力フォーム |
| `dashboard.html` | クライアント向けダッシュボード（token+PIN認証） |
| `login.html` | a9tion管理者向けログイン |
| `apps-script.gs` | Google Apps Script（doGet / doPost / generateToken） |

## Google Sheets 構造

| シート名 | 用途 |
|---|---|
| `clients` | クライアント認証情報（client_id, token, pin, display_name, active） |
| `feedback_{client_id}` | クライアント別フィードバックデータ |

---

## クライアント別ダッシュボードURL一覧

### Makuake Blueprint Lab

```
URL: https://a9tion.com/feedback/dashboard.html?token=kT9mP3xR7qN2vH5wL8jC4bF6yD1aZeQs
PIN: 739205
```

---

## 新しいクライアントを追加する手順

### 1. トークンを生成する

Apps Script エディタで `generateToken()` を実行：

1. Google Sheets → 拡張機能 → Apps Script
2. 関数ドロップダウンで `generateToken` を選択 → 「実行」
3. 「実行ログ」に表示された32文字のトークンをコピー

### 2. `clients` シートに行を追加

| client_id | token | pin | display_name | active |
|---|---|---|---|---|
| 任意のID（英数字） | 生成した32文字トークン | 6桁数字 | 画面に表示するクライアント名 | TRUE |

例：
```
client_id: acme
token:     (generateToken()の出力)
pin:       123456
display_name: ACME Japan
active:    TRUE
```

### 3. `feedback_{client_id}` シートを作成

1. Google Sheets で「＋」から新しいシートを追加
2. シート名を `feedback_acme`（client_idに合わせる）に変更
3. 1行目にヘッダーを入力：

```
id | 日付 | 時刻 | 店舗 | ブランド | スタッフ | フィードバック | createdAt
```

4. 1行目を固定（表示 → 行を固定 → 1行）

### 4. URLとPINをクライアントに発行

```
URL: https://a9tion.com/feedback/dashboard.html?token=<生成したtoken>
PIN: <設定した6桁PIN>
```

> **PINを変更したいときは**: `clients` シートの `pin` 列を直接書き換えるだけでOK。

---

## Apps Script のデプロイ更新手順

コードを変更した場合、デプロイURLを保ちつつ更新する：

1. Apps Script エディタを開く
2. `apps-script.gs` の内容を全選択して貼り付け → 保存（Ctrl+S）
3. デプロイ → **デプロイの管理**
4. 既存デプロイの鉛筆アイコン（編集）をクリック
5. バージョンを「新しいバージョン」に変更 → デプロイ

> デプロイURLは変わらないため `ENDPOINT_URL` の変更は不要。

# フィードバック収集システム — 運用手順

## ファイル構成

| ファイル | 用途 |
|---|---|
| `staff.html` | スタッフ向け音声入力フォーム |
| `dashboard.html` | クライアント向けダッシュボード（token+PIN認証） |
| `login.html` | a9tion管理者向けログイン |
| `apps-script.gs` | Google Apps Script（全エンドポイント） |

## Google Sheets 構造

| シート名 | 用途 |
|---|---|
| `clients` | クライアント認証情報 |
| `metric_definitions` | クライアント別の日次オペレーション項目定義 |
| `feedback_{client_id}` | クライアント別フィードバックデータ |
| `daily_ops_{client_id}` | クライアント別日次オペレーションデータ |

---

## クライアント別ダッシュボードURL一覧

### さわれるMakuake

```
URL: https://a9tion.com/feedback/dashboard.html?token=kT9mP3xR7qN2vH5wL8jC4bF6yD1aZeQs
PIN: 739205
```

---

## 本番運用への切り替え（手動作業・Sheets側）

コード変更（`さわれるMakuake`表記・スタッフ入力欄削除・スタッフPIN変更）に加えて、以下はGoogle Sheets側で手動対応が必要。

### 1. `clients` シートの display_name を変更

1. Google Sheets を開き、`clients` シートを選択
2. `client_id` が `makuake` の行を探す
3. `display_name` 列の値を `Makuake Blueprint Lab` → `さわれるMakuake` に書き換える
4. Apps Scriptの再デプロイは不要（`display_name` はSheetsから都度読み込まれるため）

### 2. `feedback_makuake` シートのテストデータを削除

1. `feedback_makuake` シートを開く
2. 1行目のヘッダー行（`id | 日付 | 時刻 | 店舗 | ブランド | スタッフ | フィードバック | createdAt`）は残す
3. 2行目以降のテスト投稿データを選択し、行ごと削除（右クリック → 行を削除）
4. ヘッダー行だけが残っている状態にして保存

> 本番投入前にダッシュボード（`dashboard.html`）を開き、件数が0件になっていることを確認する。

---

## 新しいクライアントを追加する手順

### 1. トークン生成

Apps Script エディタで `generateToken()` を実行：

1. Google Sheets → 拡張機能 → Apps Script
2. 関数ドロップダウンで `generateToken` を選択 → 「実行」
3. 「実行ログ」に表示された32文字のトークンをコピー

### 2. `clients` シートに行を追加

| client_id | token | pin | display_name | active |
|---|---|---|---|---|
| acme | (生成したtoken) | 123456 | ACME Japan | TRUE |

> **PIN変更**: `pin` 列を直接書き換えるだけでOK。

### 3. `feedback_{client_id}` シートを作成

1. 「＋」から新しいシートを追加 → 名前を `feedback_acme` に変更
2. 1行目にヘッダーを入力して行を固定（1行）：

```
id | 日付 | 時刻 | 店舗 | ブランド | スタッフ | フィードバック | createdAt
```

### 4. `daily_ops_{client_id}` シートを作成

1. 「＋」から新しいシートを追加 → 名前を `daily_ops_acme` に変更
2. 1行目にヘッダーを入力して行を固定（1行）：

```
date | store | <metric_definitionsで定義したfield_keyの列>
```

例（Makuakeの場合）：
```
date | store | traffic | demos | first_time | existing | memo
```

> シートは空のままでOK。`saveDailyOps` で初めてデータを保存するときに自動的に行が追加される。
> ただし `metric_definitions` 登録後にシートを作ると列順序が正しくなるため、手動でヘッダーを作ることを推奨。

### 5. `metric_definitions` シートに項目を追加

| client_id | field_key | label | type | order | unit |
|---|---|---|---|---|---|
| acme | visits | 来店者数 | number | 1 | 人 |
| acme | sales | 売上件数 | number | 2 | 件 |
| acme | memo | メモ | text | 3 | |

- `type` は `number`（数値入力）または `text`（テキスト入力）
- `order` で表示順を制御（昇順）
- `unit` は省略可能

### 6. URLとPINをクライアントに共有

```
URL: https://a9tion.com/feedback/dashboard.html?token=<生成したtoken>
PIN: <設定した6桁PIN>
```

---

## Makuake の metric_definitions（参考）

| client_id | field_key | label | type | order | unit |
|---|---|---|---|---|---|
| makuake | traffic | 来店者数 | number | 1 | 人 |
| makuake | demos | デモ実施数 | number | 2 | 件 |
| makuake | first_time | 初めて知った人数 | number | 3 | 人 |
| makuake | existing | 既存顧客数 | number | 4 | 人 |
| makuake | memo | メモ | text | 5 | |

---

## Apps Script エンドポイント一覧

| エンドポイント | 説明 |
|---|---|
| `GET ?action=auth&token=&pin=` | 認証チェック。`{success, display_name, client_id}` を返す |
| `GET ?token=&pin=` | フィードバックデータ取得 |
| `GET ?action=getMetricDefinitions&token=&pin=` | 日次オペレーション項目定義を取得 |
| `GET ?action=getDailyOps&token=&pin=&from=&to=` | 日次オペレーションデータを取得 |
| `POST action=saveDailyOps` | 日次オペレーションを保存（date+store で upsert） |
| `POST (default)` | フィードバックを `feedback_makuake` に書き込み |

---

## Apps Script のデプロイ更新手順

コードを変更した場合：

1. Google Sheets → 拡張機能 → Apps Script
2. `apps-script.gs` の内容を全選択して貼り付け → 保存（Ctrl+S）
3. デプロイ → **デプロイの管理**
4. 既存デプロイの鉛筆アイコン → バージョンを「新しいバージョン」に変更 → デプロイ

> デプロイURLは変わらないため `ENDPOINT_URL` の変更は不要。

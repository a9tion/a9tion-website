// ============================================================
// a9tion フィードバック収集 — Google Apps Script
// ============================================================
// セットアップ手順:
// 1. Google Sheetsを新規作成（または既存のものを使用）
// 2. 拡張機能 > Apps Script を開く
// 3. このコードを全選択して貼り付け
// 4. 保存（Ctrl+S）
// 5. デプロイ > デプロイの管理 > 既存デプロイを選択して「新しいバージョンに更新」
//    （初回は「新しいデプロイ」で種類: ウェブアプリ、アクセス: 全員）
// 6. デプロイURLをstaff.html / dashboard.htmlのENDPOINT_URLに設定済み
// ============================================================
//
// Sheets構造:
//   clients シート: client_id | token | pin | display_name | active
//   feedback_{client_id} シート: id | 日付 | 時刻 | 店舗 | ブランド | スタッフ | フィードバック | createdAt
// ============================================================

// clientsシートから token で行を検索し、activeなら情報を返す
function getClientByToken_(ss, token) {
  const sheet = ss.getSheetByName('clients');
  if (!sheet || sheet.getLastRow() <= 1) return null;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const [clientId, tok, pin, displayName, active] = rows[i];
    if (String(tok) === String(token) && active === true) {
      return { clientId: String(clientId), pin: String(pin), displayName: String(displayName) };
    }
  }
  return null;
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// フィードバック書き込み（Phase 1: feedback_makuake に固定。Phase 2でper-client化）
function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = 'feedback_makuake';
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(['id', '日付', '時刻', '店舗', 'ブランド', 'スタッフ', 'フィードバック', 'createdAt']);
      sheet.setFrozenRows(1);
    }

    const data = JSON.parse(e.postData.contents);
    sheet.appendRow([
      data.id,
      data.date,
      data.time,
      data.store,
      data.brand,
      data.staff,
      data.feedback,
      data.createdAt,
    ]);

    return jsonOut_({ success: true });

  } catch (err) {
    return jsonOut_({ success: false, error: err.toString() });
  }
}

// GET リクエスト処理
// ?action=auth&token=TOKEN&pin=PIN  → 認証チェック
// ?token=TOKEN&pin=PIN              → フィードバックデータ取得
function doGet(e) {
  const params  = e.parameter;
  const action  = params.action || '';
  const token   = params.token  || '';
  const pin     = params.pin    || '';
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- 認証チェックのみ ---
  if (action === 'auth') {
    if (!token || !pin) return jsonOut_({ success: false });
    const client = getClientByToken_(ss, token);
    if (!client || client.pin !== pin) return jsonOut_({ success: false });
    return jsonOut_({ success: true, display_name: client.displayName, client_id: client.clientId });
  }

  // --- フィードバックデータ取得 ---
  if (!token || !pin) return jsonOut_({ success: false, error: '認証失敗' });
  const client = getClientByToken_(ss, token);
  if (!client || client.pin !== pin) return jsonOut_({ success: false, error: '認証失敗' });

  const sheetName = 'feedback_' + client.clientId;
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const rows = sheet.getDataRange().getValues();
  const data = rows.slice(1).map(row => ({
    id:        String(row[0]),
    date:      String(row[1]),
    time:      String(row[2]),
    store:     String(row[3]),
    brand:     String(row[4]),
    staff:     String(row[5]),
    feedback:  String(row[6]),
    createdAt: Number(row[7]),
  }));

  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// ユーティリティ: 新クライアント追加時にApps Scriptエディタで実行
// ============================================================

// ランダム32文字トークンを生成してLogsに出力
function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  Logger.log('Generated token: ' + token);
  return token;
}

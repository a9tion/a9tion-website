// ============================================================
// a9tion フィードバック収集 — Google Apps Script
// ============================================================
// セットアップ手順:
// 1. Google Sheetsを新規作成（案件ごとに1シート）
// 2. 拡張機能 > Apps Script を開く
// 3. このコードを全選択して貼り付け
// 4. 保存（Ctrl+S）
// 5. デプロイ > 新しいデプロイ
//    - 種類: ウェブアプリ
//    - 次のユーザーとして実行: 自分
//    - アクセスできるユーザー: 全員
// 6. デプロイURLをコピーして staff.html / dashboard.html の
//    ENDPOINT_URL に貼り付ける
// ============================================================

const SHEET_NAME = 'feedback';

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
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

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);

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

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

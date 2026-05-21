// ============================================================
// a9tion フィードバック収集 — Google Apps Script
// ============================================================
// デプロイ更新手順:
//   デプロイ > デプロイの管理 > 鉛筆アイコン > 新しいバージョン > デプロイ
//   （URLは変わらないためENDPOINT_URLの変更不要）
// ============================================================
//
// Sheets構造:
//   clients            : client_id | token | pin | display_name | active
//   metric_definitions : client_id | field_key | label | type | order | unit
//   feedback_{id}      : id | 日付 | 時刻 | 店舗 | ブランド | スタッフ | フィードバック | createdAt
//   daily_ops_{id}     : date | store | <field_key列...>
// ============================================================

function formatDate_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val);
}

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

// ============================================================
// doPost: フィードバック書き込み / 日次オペレーション保存
// ============================================================
function doPost(e) {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const data = JSON.parse(e.postData.contents);
    const postAction = data.action || '';

    // --- 日次オペレーション保存 ---
    if (postAction === 'saveDailyOps') {
      const token = String(data.token || '');
      const pin   = String(data.pin   || '');
      if (!token || !pin) return jsonOut_({ success: false, error: '認証失敗' });
      const client = getClientByToken_(ss, token);
      if (!client || client.pin !== pin) return jsonOut_({ success: false, error: '認証失敗' });

      const targetDate  = String(data.date  || '');
      const targetStore = String(data.store || '');
      const metrics     = data.metrics || {};
      const sheetName   = 'daily_ops_' + client.clientId;
      let sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        // metric_definitionsの順序でヘッダーを作成
        const defSheet = ss.getSheetByName('metric_definitions');
        let fieldKeys = Object.keys(metrics);
        if (defSheet && defSheet.getLastRow() > 1) {
          const defRows = defSheet.getDataRange().getValues();
          fieldKeys = defRows.slice(1)
            .filter(r => String(r[0]) === client.clientId)
            .sort((a, b) => Number(a[4]) - Number(b[4]))
            .map(r => String(r[1]));
        }
        sheet = ss.insertSheet(sheetName);
        sheet.appendRow(['date', 'store', ...fieldKeys]);
        sheet.setFrozenRows(1);
      }

      const rows    = sheet.getDataRange().getValues();
      const headers = rows[0].map(h => String(h));

      // date+store で既存行を検索
      let existingRowIdx = -1;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === targetDate && String(rows[i][1]) === targetStore) {
          existingRowIdx = i;
          break;
        }
      }

      const rowValues = headers.map(h => {
        if (h === 'date')  return targetDate;
        if (h === 'store') return targetStore;
        const v = metrics[h];
        return v !== undefined ? v : '';
      });

      if (existingRowIdx >= 0) {
        sheet.getRange(existingRowIdx + 1, 1, 1, rowValues.length).setValues([rowValues]);
        return jsonOut_({ success: true, action: 'updated' });
      } else {
        sheet.appendRow(rowValues);
        return jsonOut_({ success: true, action: 'inserted' });
      }
    }

    // --- フィードバック書き込み（Phase 1から継続、Phase 2でper-client化予定）---
    const sheetName = 'feedback_makuake';
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(['id', '日付', '時刻', '店舗', 'ブランド', 'スタッフ', 'フィードバック', 'createdAt']);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([data.id, data.date, data.time, data.store, data.brand, data.staff, data.feedback, data.createdAt]);
    return jsonOut_({ success: true });

  } catch (err) {
    return jsonOut_({ success: false, error: err.toString() });
  }
}

// ============================================================
// doGet: 認証 / フィードバック取得 / 定義取得 / 日次オペレーション取得
// ============================================================
function doGet(e) {
  const params = e.parameter;
  const action = params.action || '';
  const token  = params.token  || '';
  const pin    = params.pin    || '';
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- 認証チェック ---
  if (action === 'auth') {
    if (!token || !pin) return jsonOut_({ success: false });
    const client = getClientByToken_(ss, token);
    if (!client || client.pin !== pin) return jsonOut_({ success: false });
    return jsonOut_({ success: true, display_name: client.displayName, client_id: client.clientId });
  }

  // --- メトリクス定義取得 ---
  if (action === 'getMetricDefinitions') {
    if (!token || !pin) return jsonOut_({ success: false, error: '認証失敗' });
    const client = getClientByToken_(ss, token);
    if (!client || client.pin !== pin) return jsonOut_({ success: false, error: '認証失敗' });

    const sheet = ss.getSheetByName('metric_definitions');
    if (!sheet || sheet.getLastRow() <= 1) return jsonOut_([]);

    const rows = sheet.getDataRange().getValues();
    const defs = rows.slice(1)
      .filter(r => String(r[0]) === client.clientId)
      .map(r => ({
        field_key: String(r[1]),
        label:     String(r[2]),
        type:      String(r[3]),
        order:     Number(r[4]),
        unit:      String(r[5] || ''),
      }))
      .sort((a, b) => a.order - b.order);

    return ContentService
      .createTextOutput(JSON.stringify(defs))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // --- 日次オペレーション取得 ---
  if (action === 'getDailyOps') {
    if (!token || !pin) return jsonOut_({ success: false, error: '認証失敗' });
    const client = getClientByToken_(ss, token);
    if (!client || client.pin !== pin) return jsonOut_({ success: false, error: '認証失敗' });

    const from = params.from || '';
    const to   = params.to   || '';

    const sheetName = 'daily_ops_' + client.clientId;
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() <= 1) {
      return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    }

    const rows    = sheet.getDataRange().getValues();
    const headers = rows[0].map(h => String(h));
    const data = rows.slice(1)
      .map(r => {
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = (h === 'date') ? formatDate_(r[i]) : (r[i] !== undefined ? r[i] : '');
        });
        return obj;
      })
      .filter(r => {
        const date = r.date;
        if (from && date < from) return false;
        if (to   && date > to)   return false;
        return true;
      });

    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // --- フィードバックデータ取得（token+PIN必須）---
  if (!token || !pin) return jsonOut_({ success: false, error: '認証失敗' });
  const client = getClientByToken_(ss, token);
  if (!client || client.pin !== pin) return jsonOut_({ success: false, error: '認証失敗' });

  const sheetName = 'feedback_' + client.clientId;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }

  const rows = sheet.getDataRange().getValues();
  const data = rows.slice(1).map(row => ({
    id:        String(row[0]),
    date:      formatDate_(row[1]),
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
// ユーティリティ: Apps Scriptエディタで直接実行
// ============================================================
function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  Logger.log('Generated token: ' + token);
  return token;
}

// ============================================================
// a9tion フィードバック収集 — Google Apps Script（マルチテナント）
// ============================================================
// デプロイ更新手順:
//   デプロイ > デプロイの管理 > 鉛筆アイコン > 新しいバージョン > デプロイ
//   （URLは変わらないためENDPOINT_URLの変更不要）
//   次のユーザーとして実行: 自分（Adminと全クライアントSheetsにアクセスできること）
// ============================================================
//
// Admin Sheets（共有NG）:
//   clients            : client_id | token | pin | display_name | active | spreadsheet_id
//
// クライアント専用 Sheets（clients.spreadsheet_id で指定）:
//   metric_definitions : client_id | field_key | label | type | order | unit
//   feedback_{id}      : id | 日付 | 時刻 | 店舗 | ブランド | スタッフ | フィードバック | createdAt
//   daily_ops_{id}     : date | store | <field_key列...>
// ============================================================

const ADMIN_SPREADSHEET_ID = '1e8ij8m3TrYd0EoFU8wrZoXGJlzI6NU0tqgd19RdwX0U';

function getAdminSpreadsheetId_() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_SPREADSHEET_ID') || ADMIN_SPREADSHEET_ID;
}

function formatDate_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val);
}

function formatTime_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm');
  }
  return String(val);
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function trimmed_(val) {
  return String(val === undefined || val === null ? '' : val).trim();
}

// ============================================================
// Admin Sheets: 認証・ルーティング
// ============================================================

// active=TRUE かつ spreadsheet_id が設定されたクライアントのみ返す。
// 列は位置で読む（列順は冒頭の clients の定義どおり）。
function readActiveClients_() {
  const sheet = SpreadsheetApp.openById(getAdminSpreadsheetId_()).getSheetByName('clients');
  if (!sheet || sheet.getLastRow() <= 1) return [];

  return sheet.getDataRange().getValues().slice(1)
    .map(([clientId, token, pin, displayName, active, spreadsheetId]) => ({
      client_id:      trimmed_(clientId),
      token:          trimmed_(token),
      pin:            trimmed_(pin),
      display_name:   trimmed_(displayName),
      active:         trimmed_(active).toUpperCase() === 'TRUE',
      spreadsheet_id: trimmed_(spreadsheetId),
    }))
    .filter(c => c.active && c.client_id && c.spreadsheet_id);
}

function toPublicClient_(c) {
  return { client_id: c.client_id, display_name: c.display_name, spreadsheet_id: c.spreadsheet_id };
}

// token+pin が一致する有効なクライアントを返す。不一致なら null。
function authenticate(token, pin) {
  const t = trimmed_(token);
  const p = trimmed_(pin);
  if (!t || !p) return null;

  const client = readActiveClients_().find(c => c.token === t && c.pin === p);
  return client ? toPublicClient_(client) : null;
}

// スタッフ投稿用: client_id が有効なクライアントを返す（token/PINは不要）。
// URLの ?client= は手入力されうるため大文字小文字を区別しない。
function findActiveClient_(clientId) {
  const id = trimmed_(clientId).toLowerCase();
  if (!id) return null;

  const client = readActiveClients_().find(c => c.client_id.toLowerCase() === id);
  return client ? toPublicClient_(client) : null;
}

// ============================================================
// doPost: 日次オペレーション保存 / フィードバック書き込み
// ============================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'saveDailyOps') {
      const client = authenticate(data.token, data.pin);
      if (!client) return jsonOut_({ success: false });
      return saveDailyOps_(SpreadsheetApp.openById(client.spreadsheet_id), client, data);
    }

    // スタッフからのフィードバック送信
    const client = findActiveClient_(data.client_id);
    if (!client) return jsonOut_({ success: false });
    return saveFeedback_(SpreadsheetApp.openById(client.spreadsheet_id), client, data);

  } catch (err) {
    console.error(err);
    return jsonOut_({ success: false });
  }
}

function saveFeedback_(ss, client, data) {
  const sheetName = 'feedback_' + client.client_id;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['id', '日付', '時刻', '店舗', 'ブランド', 'スタッフ', 'フィードバック', 'createdAt']);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([data.id, data.date, data.time, data.store, data.brand, data.staff, data.feedback, data.createdAt]);
  return jsonOut_({ success: true });
}

function saveDailyOps_(ss, client, data) {
  const targetDate  = String(data.date  || '');
  const targetStore = String(data.store || '');
  const metrics     = data.metrics || {};
  const sheetName   = 'daily_ops_' + client.client_id;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    // metric_definitionsの順序でヘッダーを作成
    const defSheet = ss.getSheetByName('metric_definitions');
    let fieldKeys = Object.keys(metrics);
    if (defSheet && defSheet.getLastRow() > 1) {
      const defRows = defSheet.getDataRange().getValues();
      fieldKeys = defRows.slice(1)
        .filter(r => String(r[0]) === client.client_id)
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
  }
  sheet.appendRow(rowValues);
  return jsonOut_({ success: true, action: 'inserted' });
}

// ============================================================
// doGet: 認証 / フィードバック取得 / 定義取得 / 日次オペレーション取得
// ============================================================
function doGet(e) {
  try {
    const params = e.parameter;
    const client = authenticate(params.token, params.pin);
    if (!client) return jsonOut_({ success: false });

    // action なしは dashboard.html のフィードバック取得（従来の呼び出し）
    const action = params.action || 'getFeedback';

    if (action === 'auth') {
      return jsonOut_({ success: true, display_name: client.display_name, client_id: client.client_id });
    }

    const ss = SpreadsheetApp.openById(client.spreadsheet_id);
    if (action === 'getFeedback')          return getFeedback_(ss, client);
    if (action === 'getMetricDefinitions') return getMetricDefinitions_(ss, client);
    if (action === 'getDailyOps')          return getDailyOps_(ss, client, params);
    return jsonOut_({ success: false });

  } catch (err) {
    console.error(err);
    return jsonOut_({ success: false });
  }
}

function getFeedback_(ss, client) {
  const sheet = ss.getSheetByName('feedback_' + client.client_id);
  if (!sheet || sheet.getLastRow() <= 1) return jsonOut_([]);

  const rows = sheet.getDataRange().getValues();
  return jsonOut_(rows.slice(1).map(row => ({
    id:        String(row[0]),
    date:      formatDate_(row[1]),
    time:      formatTime_(row[2]),
    store:     String(row[3]),
    brand:     String(row[4]),
    staff:     String(row[5]),
    feedback:  String(row[6]),
    createdAt: Number(row[7]),
  })));
}

function getMetricDefinitions_(ss, client) {
  const sheet = ss.getSheetByName('metric_definitions');
  if (!sheet || sheet.getLastRow() <= 1) return jsonOut_([]);

  const rows = sheet.getDataRange().getValues();
  return jsonOut_(rows.slice(1)
    .filter(r => String(r[0]) === client.client_id)
    .map(r => ({
      field_key: String(r[1]),
      label:     String(r[2]),
      type:      String(r[3]),
      order:     Number(r[4]),
      unit:      String(r[5] || ''),
    }))
    .sort((a, b) => a.order - b.order));
}

function getDailyOps_(ss, client, params) {
  const from = params.from || '';
  const to   = params.to   || '';

  const sheet = ss.getSheetByName('daily_ops_' + client.client_id);
  if (!sheet || sheet.getLastRow() <= 1) return jsonOut_([]);

  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0].map(h => String(h));
  return jsonOut_(rows.slice(1)
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (h === 'date') ? formatDate_(r[i]) : (r[i] !== undefined ? r[i] : '');
      });
      return obj;
    })
    .filter(r => {
      if (from && r.date < from) return false;
      if (to   && r.date > to)   return false;
      return true;
    }));
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

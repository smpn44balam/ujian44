/**
 * NEXORA EXAM — Google Apps Script monitoring endpoint
 *
 * 1. Buat Google Spreadsheet.
 * 2. Extensions > Apps Script.
 * 3. Tempel file ini.
 * 4. Deploy > New deployment > Web app.
 * 5. Execute as: Me
 * 6. Who has access: Anyone
 * 7. Salin URL /exec ke NEXORA_CONFIG.monitoringEndpoint.
 *
 * Catatan: endpoint publik bukan sistem autentikasi kuat. Jangan simpan
 * password/secret penting di frontend GitHub Pages.
 */

const SHEETS = {
  sessions: "NEXORA_SESSIONS",
  events: "NEXORA_EVENTS"
};

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEETS.sessions, [
    "UpdatedAt","SessionId","Nama","Kelas","Tingkat","Mapel",
    "StartedAt","LastSeenAt","EndedAt","Violations","Status","LastEvent"
  ]);
  ensureSheet_(ss, SHEETS.events, [
    "Timestamp","SessionId","Nama","Kelas","Tingkat","Mapel",
    "Action","Event","Detail","Violations","RemainingMs"
  ]);
}

function doGet() {
  return json_({ok:true, service:"NEXORA EXAM monitoring", time:new Date().toISOString()});
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const s = body.session || {};
    const d = body.data || {};
    const action = body.action || "unknown";
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const eventSheet = ensureSheet_(ss, SHEETS.events, [
      "Timestamp","SessionId","Nama","Kelas","Tingkat","Mapel",
      "Action","Event","Detail","Violations","RemainingMs"
    ]);

    eventSheet.appendRow([
      new Date(), s.sessionId || "", s.name || "", s.className || "",
      s.level || "", s.subjectName || "", action,
      d.event || d.type || "", d.detail || d.reason || "",
      d.violations ?? s.violations ?? 0, d.remainingMs ?? ""
    ]);

    upsertSession_(ss, s, action, d);
    return json_({ok:true});
  } catch (err) {
    return json_({ok:false,error:String(err)});
  }
}

function upsertSession_(ss, s, action, d) {
  const sh = ensureSheet_(ss, SHEETS.sessions, [
    "UpdatedAt","SessionId","Nama","Kelas","Tingkat","Mapel",
    "StartedAt","LastSeenAt","EndedAt","Violations","Status","LastEvent"
  ]);

  const values = sh.getDataRange().getValues();
  let row = -1;
  for (let i=1;i<values.length;i++) {
    if (String(values[i][1]) === String(s.sessionId)) { row=i+1; break; }
  }

  const now = new Date();
  const status = action === "finish" ? "SELESAI" :
                 (Number(d.violations ?? s.violations ?? 0) >= 3 ? "PERLU DIPERIKSA" : "AKTIF");

  const data = [
    now, s.sessionId || "", s.name || "", s.className || "", s.level || "",
    s.subjectName || "", s.startedAt ? new Date(s.startedAt) : "",
    now, s.endedAt ? new Date(s.endedAt) : "",
    Number(d.violations ?? s.violations ?? 0), status,
    d.event || d.type || action
  ];

  if (row === -1) sh.appendRow(data);
  else sh.getRange(row,1,1,data.length).setValues([data]);
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

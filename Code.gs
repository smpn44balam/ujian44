/*******************************************************
 * NEXORA EXAM - MONITORING SERVER
 * SMPN 44 BANDAR LAMPUNG
 *******************************************************/

const SHEET_LOG = "LOG_UJIAN";
const SHEET_VIOLATION = "PELANGGARAN";
const SHEET_DASHBOARD = "DASHBOARD";

function doGet(e) {
  return jsonResponse({
    success: true,
    status: "OK",
    message: "Monitoring server aktif"
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, message: "Data POST kosong" });
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (error) {
      return jsonResponse({ success: false, message: "Payload bukan JSON" });
    }

    const type = payload.type || "";
    const data = payload.payload || {};
    const sessionId = payload.sessionId || "";
    const name = payload.name || "";
    const className = payload.className || "";
    const subjectName = payload.subjectName || "";
    const violations = Number(payload.violations || 0);
    const timestamp = new Date(payload.timestamp || Date.now());

    // MENGUNCI 100% KE SPREADSHEET ANDA
    const ss = SpreadsheetApp.openById("1faX_8kSHtlUfc_AeSWRV7h3TS5U9Q4RpW5BTzXIBSo8");
    ensureSheets_(ss); 

    // 1. REKAP LOG UJIAN
    upsertLogUjian_(ss, { sessionId, name, className, subjectName, type, violations, timestamp, data });

    // 2. REKAP PELANGGARAN
    if (type === "violation" || type === "relogin_required") {
      const eventName = data.event || type;
      const detail = data.detail || data.reason || "";
      savePelanggaran_(ss, { timestamp, name, className, subjectName, eventName, detail, violations });
    }

    return jsonResponse({ success: true, action: type, sessionId: sessionId });

  } catch (error) {
    console.error(error);
    return jsonResponse({ success: false, message: error.message });
  }
}

function upsertLogUjian_(ss, info) {
  const sheet = ss.getSheetByName(SHEET_LOG);
  if (!sheet || !info.sessionId) return;

  const values = sheet.getDataRange().getValues();
  let rowNumber = -1;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1]) === String(info.sessionId)) {
      rowNumber = i + 1;
      break;
    }
  }

  let status = "UJIAN";
  if (info.type === "finish") status = "SELESAI";
  if (info.type === "relogin_required") status = "DIBLOKIR SEMENTARA";

  if (rowNumber !== -1 && String(values[rowNumber - 1][5]) === "SELESAI") {
    status = "SELESAI";
  }

  const row = [info.timestamp, info.sessionId, info.name, info.className, info.subjectName, status, info.violations];

  if (rowNumber === -1) {
    sheet.appendRow(row); 
  } else {
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]); 
  }
}

function savePelanggaran_(ss, info) {
  const sheet = ss.getSheetByName(SHEET_VIOLATION);
  if (!sheet) return;

  sheet.appendRow([info.timestamp, info.name, info.className, info.subjectName, info.eventName, info.detail, info.violations]);
}

function ensureSheets_(ss) {
  let sheetLog = ss.getSheetByName(SHEET_LOG);
  if (!sheetLog) {
    sheetLog = ss.insertSheet(SHEET_LOG);
    sheetLog.appendRow(["Waktu Terakhir", "Session ID", "Nama Siswa", "Kelas", "Mata Pelajaran", "Status", "Total Pelanggaran"]);
    formatHeader_(sheetLog);
    sheetLog.setFrozenRows(1);
    sheetLog.setColumnWidth(2, 200); 
  }

  let sheetViol = ss.getSheetByName(SHEET_VIOLATION);
  if (!sheetViol) {
    sheetViol = ss.insertSheet(SHEET_VIOLATION);
    sheetViol.appendRow(["Waktu Kejadian", "Nama Siswa", "Kelas", "Mata Pelajaran", "Jenis Event", "Detail Catatan", "Pelanggaran Ke-"]);
    formatHeader_(sheetViol);
    sheetViol.setFrozenRows(1);
    sheetViol.setColumnWidth(5, 180); 
    sheetViol.setColumnWidth(6, 250); 
  }

  let dashboard = ss.getSheetByName(SHEET_DASHBOARD);
  if (!dashboard) {
    dashboard = ss.insertSheet(SHEET_DASHBOARD);
    dashboard.getRange("A1").setValue("NEXORA EXAM - DASHBOARD");
    dashboard.getRange("A2").setValue("SMPN 44 BANDAR LAMPUNG");
    
    dashboard.getRange("A4").setValue("TOTAL SESI TERCATAT");
    dashboard.getRange("B4").setFormula(`=COUNTA(${SHEET_LOG}!B2:B)`);
    
    dashboard.getRange("A5").setValue("TOTAL KASUS PELANGGARAN");
    dashboard.getRange("B5").setFormula(`=COUNTA(${SHEET_VIOLATION}!B2:B)`);
    
    dashboard.getRange("A1").setFontWeight("bold").setFontSize(16);
    dashboard.setColumnWidth(1, 300);
  }
}

function formatHeader_(sheet) {
  const range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  range.setFontWeight("bold").setBackground("#c9daf8"); 
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * NEXORA EXAM
 * Monitoring Backend
 * SMPN 44 BANDAR LAMPUNG
 */

const SHEET_SESSIONS = "NEXORA_SESSIONS";
const SHEET_EVENTS = "NEXORA_EVENTS";
const SHEET_DASHBOARD = "DASHBOARD";


/* =========================================================
   GET
   ========================================================= */

function doGet(e) {
  return jsonResponse({
    success: true,
    service: "NEXORA EXAM MONITORING",
    school: "SMPN 44 BANDAR LAMPUNG",
    status: "online",
    timestamp: new Date().toISOString()
  });
}


/* =========================================================
   POST
   ========================================================= */

function doPost(e) {

  try {

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({
        success: false,
        error: "POST body kosong."
      });
    }

    const payload = JSON.parse(e.postData.contents);

    const action = payload.action || "";
    const session = payload.session || {};
    const data = payload.data || {};
    const sentAt = payload.sentAt || Date.now();

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const sessionsSheet = getOrCreateSheet_(
      ss,
      SHEET_SESSIONS,
      [
        "Timestamp",
        "Session ID",
        "Nama Siswa",
        "Kelas",
        "Mata Pelajaran",
        "Level",
        "Status",
        "Started At",
        "Last Heartbeat",
        "Finished At",
        "Violation Count",
        "User Agent",
        "IP/Network",
        "Last Event"
      ]
    );

    const eventsSheet = getOrCreateSheet_(
      ss,
      SHEET_EVENTS,
      [
        "Timestamp",
        "Session ID",
        "Nama Siswa",
        "Kelas",
        "Mata Pelajaran",
        "Event",
        "Violation Count",
        "Detail",
        "Page",
        "User Agent"
      ]
    );


    /* -------------------------------------------------------
       IDENTITAS SESSION
       ------------------------------------------------------- */

    const sessionId = session.sessionId || "";

    const name = session.name || "";

    const className =
      session.className ||
      session.class ||
      "";

    const subjectName =
      session.subjectName ||
      session.subject ||
      "";

    const level =
      session.level ||
      getLevelFromClass_(className);

    const userAgent =
      session.userAgent ||
      data.userAgent ||
      "";

    const page =
      session.page ||
      data.page ||
      "";

    const violationCount =
      Number(
        data.violations ??
        session.violations ??
        0
      );


    /* -------------------------------------------------------
       EVENT
       ------------------------------------------------------- */

    const eventName =
      data.event ||
      data.type ||
      session.lastSecurityEvent?.type ||
      action ||
      "";

    const detail =
      data.detail ||
      session.lastSecurityEvent?.detail ||
      "";

    const timestamp = new Date();

    const eventTimestamp =
      session.lastSecurityEvent?.at ||
      sentAt ||
      Date.now();


    /* -------------------------------------------------------
       SIMPAN EVENT
       ------------------------------------------------------- */

    if (eventName) {

      eventsSheet.appendRow([
        new Date(eventTimestamp),
        sessionId,
        name,
        className,
        subjectName,
        eventName,
        violationCount,
        detail,
        page,
        userAgent
      ]);

    }


    /* -------------------------------------------------------
       UPDATE SESSION
       ------------------------------------------------------- */

    upsertSession_(
      sessionsSheet,
      {
        sessionId: sessionId,
        name: name,
        className: className,
        subjectName: subjectName,
        level: level,
        status: getStatusFromAction_(action),
        startedAt: session.startedAt || "",
        lastHeartbeat: session.lastHeartbeat || sentAt,
        finishedAt: session.finishedAt || "",
        violationCount: violationCount,
        userAgent: userAgent,
        ipNetwork: "",
        lastEvent: eventName
      }
    );


    /* -------------------------------------------------------
       RESPONSE
       ------------------------------------------------------- */

    return jsonResponse({
      success: true,
      action: action,
      sessionId: sessionId,
      event: eventName,
      violationCount: violationCount,
      timestamp: new Date().toISOString()
    });

  }

  catch (error) {

    console.error(error);

    return jsonResponse({
      success: false,
      error: String(error)
    });

  }
}


/* =========================================================
   SESSION UPSERT
   ========================================================= */

function upsertSession_(sheet, session) {

  const values = sheet.getDataRange().getValues();

  let rowNumber = -1;

  for (let i = 1; i < values.length; i++) {

    const existingSessionId = String(values[i][1] || "");

    if (
      session.sessionId &&
      existingSessionId === String(session.sessionId)
    ) {
      rowNumber = i + 1;
      break;
    }

  }


  const row = [
    new Date(),
    session.sessionId,
    session.name,
    session.className,
    session.subjectName,
    session.level,
    session.status,
    session.startedAt,
    session.lastHeartbeat,
    session.finishedAt,
    session.violationCount,
    session.userAgent,
    session.ipNetwork,
    session.lastEvent
  ];


  if (rowNumber === -1) {

    sheet.appendRow(row);

  } else {

    sheet
      .getRange(rowNumber, 1, 1, row.length)
      .setValues([row]);

  }

}


/* =========================================================
   STATUS
   ========================================================= */

function getStatusFromAction_(action) {

  switch (String(action).toLowerCase()) {

    case "start":
      return "SEDANG UJIAN";

    case "heartbeat":
      return "SEDANG UJIAN";

    case "violation":
      return "SEDANG UJIAN";

    case "finish":
      return "SELESAI";

    case "submit":
      return "SELESAI";

    case "unload":
      return "TERPUTUS / KELUAR";

    default:
      return "AKTIF";

  }

}


/* =========================================================
   LEVEL
   ========================================================= */

function getLevelFromClass_(className) {

  const value = String(className || "")
    .trim()
    .toUpperCase();

  if (value.startsWith("VII")) {
    return "VII";
  }

  if (value.startsWith("VIII")) {
    return "VIII";
  }

  if (value.startsWith("IX")) {
    return "IX";
  }

  return "";

}


/* =========================================================
   CREATE SHEET IF NEEDED
   ========================================================= */

function getOrCreateSheet_(ss, sheetName, headers) {

  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {

    sheet = ss.insertSheet(sheetName);

  }


  if (sheet.getLastRow() === 0) {

    sheet
      .getRange(1, 1, 1, headers.length)
      .setValues([headers]);

  }

  return sheet;

}


/* =========================================================
   JSON RESPONSE
   ========================================================= */

function jsonResponse(data) {

  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );

}

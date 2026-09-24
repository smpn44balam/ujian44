/* =========================================================
   NEXORA EXAM SMPN 44 — KONFIGURASI
   Anda cukup mengisi 36 link Google Form di bagian GOOGLE_FORMS.
   ========================================================= */

const NEXORA_CONFIG = {
  schoolName: "SMP NEGERI 44",
  examName: "NEXORA EXAM",
  durationMinutes: 90,
  maxViolations: 3,
  warningCooldownMs: 2500,

  // URL Web App Google Apps Script Anda yang terbaru (hasil Deploy > Web app > /exec)
  // PENTING: nama key ini HARUS "scriptUrl" karena security.js & exam.js membaca
  // window.NEXORA_CONFIG.scriptUrl. Sebelumnya key ini bernama "monitoringUrl"
  // sehingga tidak pernah terbaca dan semua log pelanggaran/heartbeat GAGAL TERKIRIM
  // secara diam-diam (silent fail). Jangan ganti nama key ini lagi.
  //
  // Fase 12: diganti ke deployment project "Nexora V2" (project Apps Script
  // baru, dengan Code.gs yang sudah berisi saklar DEBUG_ENABLED). URL LAMA
  // (AKfycbw8s20m...) SENGAJA tidak dipakai lagi -- kalau Anda deploy ulang
  // Code.gs di masa depan, pastikan pakai "Manage deployments > New version"
  // di project "Nexora V2" ini, supaya URL di bawah ini TETAP BERLAKU dan
  // tidak perlu diganti lagi di sini.
  scriptUrl: "https://script.google.com/macros/s/AKfycbwoVPF21EB2jBmtoWW-WBQ4bPcxXcyoMN4AROdDCvgr6tlRzldDvTMD_2bzdOZdVR4jAg/exec",
  // Alias lama, dipertahankan agar kode lama yang mungkin masih memanggil
  // monitoringUrl tidak langsung pecah.
  get monitoringUrl() { return this.scriptUrl; },

  classes: {
    VII: ["VII-A","VII-B","VII-C","VII-D","VII-E","VII-F"],
    VIII: ["VIII-A","VIII-B","VIII-C","VIII-D","VIII-E","VIII-F","VIII-G","VIII-H"],
    IX: ["IX-A","IX-B","IX-C","IX-D","IX-E","IX-F","IX-G"]
  },

  subjects: [
    {id:"bahasaIndonesia", name:"Bahasa Indonesia"},
    {id:"pai", name:"Pendidikan Agama Islam"},
    {id:"matematika", name:"Matematika"},
    {id:"pkn", name:"PKN"},
    {id:"bahasaInggris", name:"Bahasa Inggris"},
    {id:"pjok", name:"PJOK"},
    {id:"ipa", name:"IPA"},
    {id:"bahasaLampung", name:"Bahasa Lampung"},
    {id:"ips", name:"IPS"},
    {id:"informatika", name:"Informatika"},
    {id:"seniBudaya", name:"Seni Budaya"},
    {id:"pak", name:"Pendidikan Anti Korupsi"}
  ]
};

// =========================================================
// 36 LINK GOOGLE FORM — 12 UNTUK VII, 12 VIII, 12 IX
// Tempel LINK RESPONDER/VIEW FORM dari Google Forms.
// Jika ingin embed, gunakan URL /viewform.
// =========================================================
// Catatan: 12 link ini HANYA untuk kelas IX (kelas 9). Kelas VII dan VIII
// belum diisi (Administrator perlu mengisi link tersebut nanti jika ada).
const BAHASA_INDONESIA = "https://docs.google.com/forms/d/e/1FAIpQLSeOVk2hgw3Ms_jAseDF3du5VSBFXqGIT30-hQtJ-qIEuvtEJQ/viewform";
const PAI = "https://docs.google.com/forms/d/e/1FAIpQLSeknhVvzAv5rTz97X8QXsBER0xs4SpYOI02zv9m27lcrx8umw/viewform";
const MATEMATIKA = "https://docs.google.com/forms/d/e/1FAIpQLScr99KSySPOqijhf3XkQWt1U5U9VXhr1Was85hfmaa_hqAuvA/viewform";
const PKN = "https://docs.google.com/forms/d/e/1FAIpQLSeJ6Xn8WceupDTGT-1t6yc3kVCO_PJ3EIjj9hiNHqy_3rQgnA/viewform";
const BAHASA_INGGRIS = "https://docs.google.com/forms/d/e/1FAIpQLSdulMU0AgmvNz2HYvmTHZ_YkwOXJESr8byw-xDxysLlB3JsMg/viewform";
const PJOK = "https://docs.google.com/forms/d/e/1FAIpQLSdbRmyWWJfS7zslyTV55piUW3Bqvvd42570bFXhWClFIIohNg/viewform";
const IPA = "https://docs.google.com/forms/d/e/1FAIpQLSdI3xHfg4qFdq0BfzHUDs4LnDNaTlAq60FRjmeYBymNaVCmQw/viewform";
const BAHASA_LAMPUNG = "https://docs.google.com/forms/d/e/1FAIpQLSe36-P4O6rnw282GchdrmjMjJYvyBMvWZm4ZkmFCYt5R2F9uA/viewform";
const IPS = "https://docs.google.com/forms/d/e/1FAIpQLSfYGS8n0CqCNDDD233_2NHFLAQb0y87boTFdtywa1N4c73MIA/viewform";
const INFORMATIKA = "https://docs.google.com/forms/d/e/1FAIpQLSdXmQb2TUtx6F1eslOB8Paji0xWxnLUc8WYeaG130AG8n5D0Q/viewform";
const SENI_BUDAYA = "https://docs.google.com/forms/d/e/1FAIpQLSehe2B6TLm0sjEnRuAcm67BDGSFwqHQ3xJdH6SgXeUkDXFWiA/viewform";
const PAK = "https://docs.google.com/forms/d/e/1FAIpQLSejznrprIbLMhTekDf941pOcL7kKPzgFr80sA3ulvAkrX0pQA/viewform";

const GOOGLE_FORMS = {
  VII: {
    bahasaIndonesia: "",
    pai: "",
    matematika: "",
    pkn: "",
    bahasaInggris: "",
    pjok: "",
    ipa: "",
    bahasaLampung: "",
    ips: "",
    informatika: "",
    seniBudaya: "",
    pak: ""
  },
  VIII: {
    bahasaIndonesia: "",
    pai: "",
    matematika: "",
    pkn: "",
    bahasaInggris: "",
    pjok: "",
    ipa: "",
    bahasaLampung: "",
    ips: "",
    informatika: "",
    seniBudaya: "",
    pak: ""
  },
  IX: {
    bahasaIndonesia: BAHASA_INDONESIA,
    pai: PAI,
    matematika: MATEMATIKA,
    pkn: PKN,
    bahasaInggris: BAHASA_INGGRIS,
    pjok: PJOK,
    ipa: IPA,
    bahasaLampung: BAHASA_LAMPUNG,
    ips: IPS,
    informatika: INFORMATIKA,
    seniBudaya: SENI_BUDAYA,
    pak: PAK
  }
};

function getLevelFromClass(className) {
  if (className.startsWith("VII-")) return "VII";
  if (className.startsWith("VIII-")) return "VIII";
  if (className.startsWith("IX-")) return "IX";
  return "";
}

function getFormUrl(level, subjectId) {
  return (GOOGLE_FORMS[level] && GOOGLE_FORMS[level][subjectId]) || "";
}

// =========================================================
// PENTING — JANGAN DIHAPUS
// "const NEXORA_CONFIG = {...}" di atas hanya membuat variabel ini bisa
// diakses langsung sebagai identifier (mis. "NEXORA_CONFIG.subjects") oleh
// script lain di halaman yang sama (app.js memakainya begini, dan itu
// aman). TAPI beberapa file lain (exam.js, security.js, pengawas.js)
// membacanya sebagai "window.NEXORA_CONFIG.xxx" — dan browser TIDAK PERNAH
// menaruh variabel "const"/"let" tingkat atas ke objek window (beda dengan
// "var"). Akibatnya window.NEXORA_CONFIG selalu undefined, sehingga:
//  - scriptUrl tidak pernah kebaca -> heartbeat & log pelanggaran cuma
//    tersimpan lokal, ViolationLog di Spreadsheet tetap kosong walau
//    siswa sudah banyak melakukan pelanggaran.
//  - dashboard pengawas.html (lintas-device) tidak bisa membaca scriptUrl.
// Baris di bawah ini menaruh salinannya secara eksplisit ke window supaya
// semua file bisa membacanya dengan cara apa pun.
window.NEXORA_CONFIG = NEXORA_CONFIG;
window.GOOGLE_FORMS = GOOGLE_FORMS;

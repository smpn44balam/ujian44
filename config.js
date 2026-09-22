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
const GOOGLE_FORMS = {
  VII: {
    bahasaIndonesia: "https://forms.gle/3TZ8XvKLsS3sKzvo9",
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

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
  scriptUrl: "https://script.google.com/macros/s/AKfycbx9JYuBxjMj_iieOsTtiw1DEto8tyWg0EcdGH6SyCW99lxpRVA8rpVchJnkyYdjyZC8QQ/exec",
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

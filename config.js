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

  // URL Web App Google Apps Script Anda yang terbaru
  monitoringUrl: "https://script.google.com/macros/s/AKfycbz1IFL6-D0DKl42pUV-dJU_mDLMWGk2SNHZczYTorw-uCfTxeH_EAAgnR78rPxPHl6Hxg/exec",

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

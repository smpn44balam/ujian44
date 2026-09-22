(() => {
  const levelSelect = document.getElementById("levelSelect");
  const classSelect = document.getElementById("classSelect");
  const subjectSelect = document.getElementById("subjectSelect");
  const form = document.getElementById("loginForm");
  const error = document.getElementById("loginError");
  const info = document.getElementById("formInfo");
  const nameInput = document.getElementById("studentName"); 

  // ---------------------------------------------------------
  // Kelas dipilih bertingkat: Tingkat (VII/VIII/IX) dulu, baru
  // Kelas (A/B/C/...). Sebelumnya satu dropdown berisi 26 kelas
  // sekaligus (dikelompokkan pakai <optgroup>) yang membuat daftar
  // panjang dan harus di-scroll. "className" yang disimpan ke sesi
  // TETAP memakai format gabungan "VII-A" seperti sebelumnya, supaya
  // seluruh bagian lain sistem (getFormUrl, exam.js, pengawas.js,
  // Code.gs) tidak perlu diubah sama sekali.
  // ---------------------------------------------------------
  const LEVEL_LABELS = { VII: "Kelas 7 (VII)", VIII: "Kelas 8 (VIII)", IX: "Kelas 9 (IX)" };

  Object.keys(NEXORA_CONFIG.classes).forEach(level => {
    const opt = document.createElement("option");
    opt.value = level;
    opt.textContent = LEVEL_LABELS[level] || level;
    levelSelect.appendChild(opt);
  });

  function populateClassOptions(level, selectedValue) {
    classSelect.innerHTML = "";
    const list = NEXORA_CONFIG.classes[level] || [];

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = list.length ? "Pilih kelas..." : "Pilih tingkat kelas dahulu...";
    classSelect.appendChild(placeholder);

    list.forEach(fullName => {
      // fullName berformat "VII-A" -> tampilkan hanya huruf kelasnya ("A")
      const letter = fullName.includes("-") ? fullName.split("-").slice(1).join("-") : fullName;
      const opt = document.createElement("option");
      opt.value = fullName;
      opt.textContent = letter;
      classSelect.appendChild(opt);
    });

    classSelect.disabled = list.length === 0;
    if (selectedValue) classSelect.value = selectedValue;
  }

  populateClassOptions(""); // state awal: kosong & terkunci

  levelSelect.addEventListener("change", () => {
    populateClassOptions(levelSelect.value);
    updateInfo();
  });

  // Load opsi mata pelajaran dari config
  NEXORA_CONFIG.subjects.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    subjectSelect.appendChild(opt);
  });

  // Update info ketersediaan form
  function updateInfo() {
    const level = getLevelFromClass(classSelect.value);
    const sid = subjectSelect.value;
    const url = getFormUrl(level, sid);
    if (level && sid) {
      info.classList.remove("hidden");
      info.innerHTML = url
        ? `<strong>Form tersedia.</strong><br>Kelas ${level} akan menggunakan paket soal ${NEXORA_CONFIG.subjects.find(x=>x.id===sid).name} tingkat ${level}.`
        : `<strong>Form belum dikonfigurasi.</strong><br>Administrator perlu mengisi link Google Form untuk kelas ${level}.`;
    } else {
      info.classList.add("hidden");
    }
  }
  classSelect.addEventListener("change", updateInfo);
  subjectSelect.addEventListener("change", updateInfo);


  // =======================================================
  // SISTEM RELOGIN LOCK & PENALTI
  // -------------------------------------------------------
  // CATATAN PERBAIKAN: versi lama membaca key "NEXORA_EXAM_STATE" yang
  // TIDAK PERNAH ditulis oleh file manapun (app.js/exam.js/security.js
  // hanya menulis ke "nexora_session"), jadi blok ini sebelumnya adalah
  // dead code dan relogin-lock tidak pernah aktif. Sekarang dibaca dari
  // "nexora_session" — satu-satunya key sesi yang dipakai di seluruh app.
  // =======================================================
  let originalCreatedAt = null;
  const existingSessionStr = localStorage.getItem("nexora_session") || sessionStorage.getItem("nexora_session");

  if (existingSessionStr) {
    try {
      const candidate = JSON.parse(existingSessionStr);

      if (candidate.createdAt) {
        originalCreatedAt = candidate.createdAt;
      }

      const isFrozen = candidate.status === "RELOGIN_REQUIRED";
      const hasViolations = (candidate.violations || 0) > 0;

      if (hasViolations || isFrozen) {
        const resumeClassName = candidate.className || candidate.kelas || "";
        const resumeLevel = getLevelFromClass(resumeClassName);

        nameInput.value = candidate.name || candidate.nama || "";
        nameInput.readOnly = true;
        levelSelect.value = resumeLevel;
        populateClassOptions(resumeLevel, resumeClassName);
        subjectSelect.value = candidate.subjectId || "";

        levelSelect.style.pointerEvents = "none";
        classSelect.style.pointerEvents = "none";
        subjectSelect.style.pointerEvents = "none";
        levelSelect.style.backgroundColor = "#eef4fb";
        classSelect.style.backgroundColor = "#eef4fb";
        subjectSelect.style.backgroundColor = "#eef4fb";

        updateInfo();

        if (isFrozen) {
          showError("Sesi Anda ditangguhkan karena pelanggaran. Silakan klik Lanjutkan untuk login ulang.");
        } else {
          showError(`Melanjutkan sesi ujian... (Anda tercatat memiliki ${candidate.violations} pelanggaran).`);
        }
      }
    } catch (e) {
      console.error("Gagal memuat status sesi sebelumnya:", e);
    }
  }
  // =======================================================


  // =======================================================
  // PROSES SUBMIT LOGIN (YANG SUDAH DIPERBAIKI)
  // =======================================================
  form.addEventListener("submit", e => {
    e.preventDefault();
    error.classList.add("hidden");

    const name = nameInput.value.trim().replace(/\s+/g, " ");
    const className = classSelect.value;
    const subjectId = subjectSelect.value;
    const level = getLevelFromClass(className);
    const subject = NEXORA_CONFIG.subjects.find(s => s.id === subjectId);
    const formUrl = getFormUrl(level, subjectId);

    if (name.length < 3) return showError("Nama lengkap harus diisi.");
    if (!className || !level) return showError("Pilih kelas.");
    if (!subject) return showError("Pilih mata pelajaran.");
    if (!formUrl) return showError(`Google Form untuk ${level} — ${subject.name} belum diatur oleh administrator.`);

    // Jika ini relogin (sesi lama masih ada & identitas cocok), pertahankan
    // riwayat pelanggaran, sessionId, dan waktu mulai — supaya siswa tidak
    // bisa "reset" hukuman hanya dengan login ulang. Kalau ini login baru
    // (bukan lanjutan), mulai sesi bersih.
    let previous = null;
    try {
      const prevStr = localStorage.getItem("nexora_session") || sessionStorage.getItem("nexora_session");
      if (prevStr) previous = JSON.parse(prevStr);
    } catch (e) { previous = null; }

    const isResume = previous && (previous.name === name) && (previous.className === className) &&
      ((previous.violations || 0) > 0 || previous.status === "RELOGIN_REQUIRED");

    const candidateData = {
      name: name,
      className: className,
      level: level,
      subjectId: subjectId,
      subjectName: subject.name,
      formUrl: formUrl,
      createdAt: originalCreatedAt ? originalCreatedAt : Date.now(),

      // Format kompatibilitas untuk dibaca oleh exam.js / security.js
      nama: name,
      kelas: className,
      mapel: subject.name,

      sessionId: (isResume && previous.sessionId) ? previous.sessionId
        : ("NX-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8).toUpperCase()),
      status: "ONGOING",
      reloginRequired: false,
      violations: isResume ? (previous.violations || 0) : 0,
      startedAt: isResume ? (previous.startedAt || null) : null,
      // BUG SEBELUMNYA: "durationMs" tidak ikut dibawa saat relogin, padahal
      // "startedAt" dibawa. Akibatnya exam.js (yang hanya mengisi ulang
      // durationMs saat startedAt masih kosong) membiarkan durationMs
      // undefined pada sesi hasil relogin -> semua perhitungan sisa waktu
      // jadi NaN (timer tampil "NaN:NaN:NaN"). Sekarang durationMs juga
      // dibawa bersama startedAt.
      durationMs: isResume ? (previous.durationMs || null) : null,
      isStarted: isResume ? !!previous.isStarted : false,
      penaltyUntil: null,
      penaltyIsReset: false
    };

    const jsonString = JSON.stringify(candidateData);

    // Satu key konsisten di kedua storage: "nexora_session".
    // (Key lama "nexoraCandidate" / "nexoraSession" / "NEXORA_SESSION" /
    // "NEXORA_EXAM_STATE" dihapus dari alur karena saling tidak sinkron
    // dan menyebabkan bug #9 di laporan.)
    sessionStorage.setItem("nexora_session", jsonString);
    localStorage.setItem("nexora_session", jsonString);

    // Lanjut ke halaman berikutnya
    location.href = "siswa.html";
  });

  function showError(msg) {
    error.textContent = msg;
    error.classList.remove("hidden");
  }
})();

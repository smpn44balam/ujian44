(() => {
  const classSelect = document.getElementById("classSelect");
  const subjectSelect = document.getElementById("subjectSelect");
  const form = document.getElementById("loginForm");
  const error = document.getElementById("loginError");
  const info = document.getElementById("formInfo");
  const nameInput = document.getElementById("studentName"); 

  // Load opsi kelas dari config
  Object.entries(NEXORA_CONFIG.classes).forEach(([level, classes]) => {
    const group = document.createElement("optgroup");
    group.label = `Kelas ${level}`;
    classes.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      group.appendChild(opt);
    });
    classSelect.appendChild(group);
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
  // =======================================================
  let originalCreatedAt = null;
  const existingStateStr = sessionStorage.getItem("NEXORA_EXAM_STATE");
  const existingCandidateStr = sessionStorage.getItem("nexoraCandidate");

  if (existingStateStr && existingCandidateStr) {
    try {
      const state = JSON.parse(existingStateStr);
      const candidate = JSON.parse(existingCandidateStr);

      if (candidate.createdAt) {
        originalCreatedAt = candidate.createdAt;
      }

      if (state.violations > 0 || state.isFrozen) {
        nameInput.value = candidate.name;
        nameInput.readOnly = true; 
        classSelect.value = candidate.className;
        subjectSelect.value = candidate.subjectId;
        
        classSelect.style.pointerEvents = "none";
        subjectSelect.style.pointerEvents = "none";
        classSelect.style.backgroundColor = "#eef4fb";
        subjectSelect.style.backgroundColor = "#eef4fb";

        updateInfo();

        if (state.isFrozen) {
          showError("Sesi Anda ditangguhkan karena pelanggaran. Silakan klik Masuk untuk melanjutkan masa penalti Anda.");
        } else {
          showError(`Melanjutkan sesi ujian... (Anda tercatat memiliki ${state.violations} pelanggaran).`);
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

    // Menggabungkan format data agar bisa dibaca oleh app.js maupun exam.js
    const candidateData = {
      // Format bawaan app.js
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
      status: "ONGOING",
      violations: 0
    };
    
    const jsonString = JSON.stringify(candidateData);

    // Simpan ke semua Storage dan dengan semua nama Key 
    // agar exam.js tidak gagal membacanya!
    sessionStorage.setItem("nexoraCandidate", jsonString);
    sessionStorage.setItem("nexora_session", jsonString);
    localStorage.setItem("nexoraCandidate", jsonString);
    localStorage.setItem("nexora_session", jsonString);

    // Lanjut ke halaman berikutnya
    location.href = "siswa.html";
  });

  function showError(msg) {
    error.textContent = msg;
    error.classList.remove("hidden");
  }
})();

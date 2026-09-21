(() => {
  const classSelect = document.getElementById("classSelect");
  const subjectSelect = document.getElementById("subjectSelect");
  const form = document.getElementById("loginForm");
  const error = document.getElementById("loginError");
  const info = document.getElementById("formInfo");
  const nameInput = document.getElementById("studentName"); 

  // 1. Load opsi kelas dari config
  if (classSelect && window.NEXORA_CONFIG && NEXORA_CONFIG.classes) {
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
  }

  // 2. Load opsi mata pelajaran dari config
  if (subjectSelect && window.NEXORA_CONFIG && NEXORA_CONFIG.subjects) {
    NEXORA_CONFIG.subjects.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      subjectSelect.appendChild(opt);
    });
  }

  // 3. Update info ketersediaan form
  function updateInfo() {
    if (!classSelect || !subjectSelect || !info) return;
    const level = typeof getLevelFromClass === "function" ? getLevelFromClass(classSelect.value) : "";
    const sid = subjectSelect.value;
    const url = typeof getFormUrl === "function" ? getFormUrl(level, sid) : "";
    
    if (level && sid) {
      info.classList.remove("hidden");
      const currentSubject = NEXORA_CONFIG.subjects.find(x => x.id === sid);
      const subjectName = currentSubject ? currentSubject.name : sid;

      info.innerHTML = url
        ? `<strong>Form tersedia.</strong><br>Kelas ${level} akan menggunakan paket soal ${subjectName} tingkat ${level}.`
        : `<strong>Form belum dikonfigurasi.</strong><br>Administrator perlu mengisi link Google Form untuk kelas ${level}.`;
    } else {
      info.classList.add("hidden");
    }
  }

  if (classSelect) classSelect.addEventListener("change", updateInfo);
  if (subjectSelect) subjectSelect.addEventListener("change", updateInfo);


  // =======================================================
  // 4. SISTEM RELOGIN LOCK & PENALTI
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
        if (nameInput) {
          nameInput.value = candidate.name || candidate.nama || "";
          nameInput.readOnly = true; 
        }
        if (classSelect) {
          classSelect.value = candidate.className || candidate.kelas || "";
          classSelect.style.pointerEvents = "none";
          classSelect.style.backgroundColor = "#eef4fb";
        }
        if (subjectSelect) {
          subjectSelect.value = candidate.subjectId || "";
          subjectSelect.style.pointerEvents = "none";
          subjectSelect.style.backgroundColor = "#eef4fb";
        }

        updateInfo();

        if (state.isFrozen) {
          showError("Sesi Anda ditangguhkan karena pelanggaran. Silakan klik Lanjutkan untuk menjalani masa penalti.");
        } else {
          showError(`Melanjutkan sesi ujian... (Anda tercatat memiliki ${state.violations} pelanggaran).`);
        }
      }
    } catch (e) {
      console.error("Gagal memuat status sesi sebelumnya:", e);
    }
  }


  // =======================================================
  // 5. PROSES SUBMIT LOGIN
  // =======================================================
  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (error) error.classList.add("hidden");

      const name = nameInput ? nameInput.value.trim().replace(/\s+/g, " ") : "";
      const className = classSelect ? classSelect.value : "";
      const subjectId = subjectSelect ? subjectSelect.value : "";
      
      const level = typeof getLevelFromClass === "function" ? getLevelFromClass(className) : "";
      const subject = NEXORA_CONFIG.subjects.find(s => s.id === subjectId);
      const formUrl = typeof getFormUrl === "function" ? getFormUrl(level, subjectId) : "";

      // Validasi Input
      if (name.length < 3) return showError("Nama lengkap harus diisi (minimal 3 karakter).");
      if (!className || !level) return showError("Pilih kelas Anda.");
      if (!subject) return showError("Pilih mata pelajaran.");
      if (!formUrl) return showError(`Google Form untuk ${level} — ${subject.name} belum diatur oleh administrator.`);

      // Format data ganda untuk menjamin kompatibilitas app.js, exam.js, dan security.js
      const candidateData = {
        name: name, 
        className: className, 
        level: level, 
        subjectId: subjectId, 
        subjectName: subject.name,
        formUrl: formUrl, 
        createdAt: originalCreatedAt ? originalCreatedAt : Date.now(),
        durationMinutes: NEXORA_CONFIG.durationMinutes || 90,
        
        nisn: name.toLowerCase().replace(/\s+/g, "_"),
        nama: name,
        kelas: className,
        mapel: subject.name,
        status: "ONGOING",
        violations: 0
      };
      
      const jsonString = JSON.stringify(candidateData);

      // Simpan Sesi ke Seluruh Storage Key
      sessionStorage.setItem("nexoraCandidate", jsonString);
      sessionStorage.setItem("nexora_session", jsonString);
      localStorage.setItem("nexoraCandidate", jsonString);
      localStorage.setItem("nexora_session", jsonString);

      // Kirim Log Aktivitas Login ke Google Apps Script (Server)
      const scriptEndpoint = NEXORA_CONFIG.scriptUrl || NEXORA_CONFIG.monitoringUrl;
      if (scriptEndpoint) {
        fetch(scriptEndpoint, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'loginLog',
            nisn: candidateData.nisn,
            nama: candidateData.nama,
            kelas: candidateData.kelas,
            mapel: candidateData.mapel,
            timestamp: new Date().toISOString()
          })
        }).catch(err => console.log("Gagal mengirim log login:", err));
      }

      // Mengarahkan ke halaman ujian utama
      location.href = "ujian.html";
    });
  }

  function showError(msg) {
    if (error) {
      error.textContent = msg;
      error.classList.remove("hidden");
    }
  }
})();

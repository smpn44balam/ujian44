(() => {
  const classSelect = document.getElementById("classSelect");
  const subjectSelect = document.getElementById("subjectSelect");
  const form = document.getElementById("loginForm");
  const error = document.getElementById("loginError");
  const info = document.getElementById("formInfo");

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

  NEXORA_CONFIG.subjects.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    subjectSelect.appendChild(opt);
  });

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

  form.addEventListener("submit", e => {
    e.preventDefault();
    error.classList.add("hidden");

    const name = document.getElementById("studentName").value.trim().replace(/\s+/g, " ");
    const className = classSelect.value;
    const subjectId = subjectSelect.value;
    const level = getLevelFromClass(className);
    const subject = NEXORA_CONFIG.subjects.find(s => s.id === subjectId);
    const formUrl = getFormUrl(level, subjectId);

    if (name.length < 3) return showError("Nama lengkap harus diisi.");
    if (!className || !level) return showError("Pilih kelas.");
    if (!subject) return showError("Pilih mata pelajaran.");
    if (!formUrl) return showError(`Google Form untuk ${level} — ${subject.name} belum diatur oleh administrator.`);

    const candidate = {
      name, className, level, subjectId, subjectName: subject.name,
      formUrl, createdAt: Date.now()
    };
    sessionStorage.setItem("nexoraCandidate", JSON.stringify(candidate));
    location.href = "siswa.html";
  });

  function showError(msg) {
    error.textContent = msg;
    error.classList.remove("hidden");
  }
})();

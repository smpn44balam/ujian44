(() => {
  const session = JSON.parse(sessionStorage.getItem("nexoraSession") || "null");
  if (!session) { location.href = "index.html"; return; }

  const timerEl = document.getElementById("timer");
  const badge = document.getElementById("violationBadge");
  const frame = document.getElementById("formFrame");
  const loading = document.getElementById("loading");
  const startOverlay = document.getElementById("startOverlay");
  const finished = document.getElementById("finished");
  const finishReason = document.getElementById("finishReason");
  const violationModal = document.getElementById("violationModal");
  const violationText = document.getElementById("violationText");

  document.getElementById("examIdentity").textContent =
    `${session.name} • ${session.className} • ${session.subjectName}`;

  frame.src = session.formUrl;
  frame.addEventListener("load", () => loading.classList.add("hidden"));

  let endAt = session.startedAt + session.durationMs;
  let heartbeat = null;
  let finishedOnce = false;

  function save() {
    session.violations = NexoraSecurity.getCount();
    sessionStorage.setItem("nexoraSession", JSON.stringify(session));
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.ceil(ms/1000));
    const h = Math.floor(total/3600);
    const m = Math.floor((total%3600)/60);
    const s = total%60;
    return h > 0
      ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
      : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  function tick() {
    const remaining = endAt - Date.now();
    timerEl.textContent = formatTime(remaining);
    timerEl.classList.toggle("timer-danger", remaining <= 5*60*1000);
    if (remaining <= 0) finish("Waktu ujian telah selesai.");
  }

  function showViolation(v) {
    badge.textContent = `⚠ ${v.count}`;
    badge.classList.toggle("danger", v.count >= NEXORA_CONFIG.maxViolations);
    violationText.textContent =
      `Indikator keamanan #${v.count}: ${v.type.replaceAll("_"," ")}. Pastikan Anda tetap berada pada halaman ujian.`;
    violationModal.classList.remove("hidden");

    if (v.count >= NEXORA_CONFIG.maxViolations) {
      finish("Batas indikator keamanan tercapai. Sesi NEXORA dihentikan.");
    }
  }

  document.getElementById("closeViolation").addEventListener("click", () => {
    violationModal.classList.add("hidden");
  });

  document.getElementById("fullscreenBtn").addEventListener("click", () => NexoraSecurity.enterFullscreen());

  document.getElementById("beginExamBtn").addEventListener("click", async () => {
    startOverlay.classList.add("hidden");
    await NexoraSecurity.enterFullscreen();
    NexoraSecurity.arm();
    NexoraSecurity.sendMonitoring("start", {formUrl:session.formUrl});
    heartbeat = setInterval(() => NexoraSecurity.sendMonitoring("heartbeat", {
      remainingMs: Math.max(0, endAt-Date.now()),
      violations: NexoraSecurity.getCount()
    }), 20000);
    tick();
  });

  NexoraSecurity.setCallback(showViolation);

  function finish(reason) {
    if (finishedOnce) return;
    finishedOnce = true;
    clearInterval(heartbeat);
    clearInterval(timerInterval);
    session.endedAt = Date.now();
    session.status = "FINISHED";
    session.endReason = reason;
    save();
    NexoraSecurity.sendMonitoring("finish", {reason, violations:NexoraSecurity.getCount()});
    document.exitFullscreen?.().catch?.(()=>{});
    frame.classList.add("hidden");
    finished.classList.remove("hidden");
    finishReason.textContent = reason;
  }

  const timerInterval = setInterval(tick, 500);
  tick();
})();

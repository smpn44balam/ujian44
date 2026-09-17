(() => {
  const candidate = JSON.parse(sessionStorage.getItem("nexoraCandidate") || "null");
  const name = document.getElementById("name");
  if (!candidate) {
    location.href = "index.html";
    return;
  }

  document.getElementById("name").textContent = candidate.name;
  document.getElementById("className").textContent = candidate.className;
  document.getElementById("level").textContent = candidate.level;
  document.getElementById("subject").textContent = candidate.subjectName;

  document.getElementById("backBtn").addEventListener("click", () => {
    location.href = "index.html";
  });

  document.getElementById("startBtn").addEventListener("click", async () => {
    const session = {
      ...candidate,
      sessionId: "NX-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      startedAt: Date.now(),
      durationMs: NEXORA_CONFIG.durationMinutes * 60 * 1000
    };
    sessionStorage.setItem("nexoraSession", JSON.stringify(session));
    location.href = "ujian.html";
  });
})();

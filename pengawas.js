(() => {
  const rows = document.getElementById("rows");
  function load() {
    const data = JSON.parse(localStorage.getItem("nexoraMonitoring") || "[]");
    const sessions = {};
    data.forEach(x => {
      const id = x.sessionId;
      sessions[id] = {...sessions[id], ...x, violations:Math.max(sessions[id]?.violations||0, x.violations||0)};
    });
    const arr = Object.values(sessions).sort((a,b)=>(b.at||0)-(a.at||0));
    document.getElementById("total").textContent = arr.length;
    document.getElementById("flagged").textContent = arr.filter(x=>(x.violations||0)>0).length;
    document.getElementById("stopped").textContent = arr.filter(x=>(x.violations||0)>=NEXORA_CONFIG.maxViolations).length;
    rows.innerHTML = arr.length ? arr.map(x => `
      <tr>
        <td>${new Date(x.at).toLocaleString("id-ID")}</td>
        <td>${esc(x.name)}</td><td>${esc(x.className)}</td><td>${esc(x.subjectName)}</td>
        <td><span class="pill ${x.violations ? "warn":""}">${x.violations||0}</span></td>
        <td>${x.violations >= NEXORA_CONFIG.maxViolations ? "DIHENTIKAN" : x.violations ? "PERLU DIPERIKSA" : "NORMAL"}</td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty">Belum ada data.</td></tr>`;
  }
  function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
  document.getElementById("refreshBtn").onclick = load;
  document.getElementById("clearBtn").onclick = () => {
    if (confirm("Hapus seluruh data monitoring lokal pada browser ini?")) {
      localStorage.removeItem("nexoraMonitoring"); load();
    }
  };
  load();
})();

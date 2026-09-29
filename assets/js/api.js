// Camada de comunicação com o backend (Google Apps Script).
// Sem apiUrl configurada, usa o localStorage para permitir testar o site.
window.Api = (() => {
  const cfg = window.WEDDING_CONFIG;
  const isDemo = !cfg.apiUrl;
  const DEMO_KEY = "af_demo_rsvps";
  const DEMO_PASSWORD = "demo";

  async function call(payload) {
    if (isDemo) return demo(payload);

    // text/plain evita o preflight de CORS, que o Apps Script não suporta.
    const res = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    if (!res.ok) throw new Error("Falha de conexão (" + res.status + ").");
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Erro desconhecido.");
    return data;
  }

  function digits(s) {
    return String(s || "").replace(/\D/g, "");
  }

  function demo(payload) {
    const list = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
    if (payload.action === "rsvp") {
      const r = payload.data;
      const entry = {
        ...r,
        timestamp: new Date().toISOString(),
        totalPessoas: r.presenca === "sim" ? 1 + Number(r.acompanhantes || 0) : 0,
      };
      const i = list.findIndex((x) => digits(x.telefone) === digits(r.telefone));
      if (i >= 0) list[i] = entry;
      else list.push(entry);
      localStorage.setItem(DEMO_KEY, JSON.stringify(list));
      return Promise.resolve({ ok: true, updated: i >= 0 });
    }
    if (payload.action === "list") {
      if (payload.password !== DEMO_PASSWORD) {
        return Promise.reject(new Error("Senha incorreta."));
      }
      return Promise.resolve({ ok: true, rsvps: list });
    }
    return Promise.reject(new Error("Ação inválida."));
  }

  return {
    isDemo,
    sendRsvp: (data) => call({ action: "rsvp", data }),
    listRsvps: (password) => call({ action: "list", password }),
  };
})();

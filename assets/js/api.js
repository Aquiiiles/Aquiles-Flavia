// Comunicação com o backend (Google Apps Script).
window.Api = (() => {
  const cfg = window.WEDDING_CONFIG;
  const isConfigured = Boolean(cfg.apiUrl);

  async function call(payload) {
    if (!isConfigured) {
      throw new Error("O sistema de confirmação ainda não foi configurado.");
    }
    // text/plain evita o preflight de CORS, que o Apps Script não suporta.
    const res = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    if (!res.ok) throw new Error("Falha de conexão (" + res.status + ").");
    const data = await res.json();
    if (!data.ok) {
      const err = new Error(data.error || "Erro desconhecido.");
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    isConfigured,
    sendRsvp: (data) => call({ action: "rsvp", data }),
    lookup: (docTipo, documento) => call({ action: "lookup", data: { docTipo, documento } }),
    cancel: (docTipo, documento, ids) => call({ action: "cancel", data: { docTipo, documento, ids } }),
    listAll: (password) => call({ action: "list", password }),
    adminAdd: (password, data) => call({ action: "adminAdd", password, data }),
    adminDelete: (password, ids) => call({ action: "adminDelete", password, ids }),
  };
})();

(() => {
  const $ = (sel) => document.querySelector(sel);
  const SESSION_KEY = "af_admin_pw";

  const loginView = $("#login-view");
  const dashView = $("#dash-view");
  const loginForm = $("#login-form");
  const loginStatus = $("#login-status");
  const tbody = $("#rsvp-rows");

  let rsvps = [];
  let filter = "todos";
  let search = "";

  if (window.Api.isDemo) $("#demo-banner").hidden = false;

  async function load(password) {
    const res = await window.Api.listRsvps(password);
    rsvps = (res.rsvps || []).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    sessionStorage.setItem(SESSION_KEY, password);
    loginView.hidden = true;
    dashView.hidden = false;
    $("#last-update").textContent = "Atualizado às " + new Date().toLocaleTimeString("pt-BR");
    render();
  }

  loginForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = loginForm.querySelector("button");
    btn.disabled = true;
    loginStatus.textContent = "Verificando...";
    loginStatus.className = "form-status";
    try {
      await load(loginForm.password.value);
      loginForm.reset();
      loginStatus.textContent = "";
    } catch (err) {
      loginStatus.textContent = err.message;
      loginStatus.className = "form-status error";
    } finally {
      btn.disabled = false;
    }
  });

  $("#refresh-btn").addEventListener("click", async () => {
    const pw = sessionStorage.getItem(SESSION_KEY);
    try {
      await load(pw);
    } catch (err) {
      alert("Erro ao atualizar: " + err.message);
    }
  });

  $("#logout-btn").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    rsvps = [];
    tbody.replaceChildren();
    dashView.hidden = true;
    loginView.hidden = false;
  });

  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("active", b === btn));
      render();
    });
  });

  $("#search").addEventListener("input", (ev) => {
    search = ev.target.value.trim().toLowerCase();
    render();
  });

  function formatDate(ts) {
    const d = new Date(ts);
    return isNaN(d) ? String(ts || "") : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function cell(text, className) {
    const td = document.createElement("td");
    td.textContent = text == null ? "" : String(text);
    if (className) td.className = className;
    return td;
  }

  function render() {
    const yes = rsvps.filter((r) => r.presenca === "sim");
    const no = rsvps.filter((r) => r.presenca === "nao");
    $("#stat-people").textContent = yes.reduce((sum, r) => sum + Number(r.totalPessoas || 0), 0);
    $("#stat-yes").textContent = yes.length;
    $("#stat-no").textContent = no.length;
    $("#stat-total").textContent = rsvps.length;

    const visible = rsvps.filter((r) => {
      if (filter === "sim" && r.presenca !== "sim") return false;
      if (filter === "nao" && r.presenca !== "nao") return false;
      if (!search) return true;
      return [r.nome, r.nomesAcompanhantes, r.telefone, r.email]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    // textContent em todas as células: nada vindo dos convidados vira HTML.
    tbody.replaceChildren(
      ...visible.map((r) => {
        const tr = document.createElement("tr");
        const badge = document.createElement("span");
        badge.className = "badge " + (r.presenca === "sim" ? "badge-yes" : "badge-no");
        badge.textContent = r.presenca === "sim" ? "Vai" : "Não vai";
        const tdBadge = document.createElement("td");
        tdBadge.appendChild(badge);

        tr.append(
          cell(r.nome, "strong"),
          tdBadge,
          cell(r.presenca === "sim" ? r.totalPessoas : "–", "num"),
          cell(r.nomesAcompanhantes),
          cell(r.telefone),
          cell(r.email),
          cell(r.restricoes),
          cell(r.mensagem, "msg"),
          cell(formatDate(r.timestamp), "muted")
        );
        return tr;
      })
    );
    $("#empty-state").hidden = visible.length > 0;
  }

  $("#export-btn").addEventListener("click", () => {
    const cols = [
      ["Nome", "nome"],
      ["Presença", "presenca"],
      ["Total de pessoas", "totalPessoas"],
      ["Acompanhantes", "nomesAcompanhantes"],
      ["Telefone", "telefone"],
      ["E-mail", "email"],
      ["Restrições alimentares", "restricoes"],
      ["Mensagem", "mensagem"],
      ["Data da resposta", "timestamp"],
    ];
    const esc = (v) => {
      let s = String(v == null ? "" : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // evita fórmulas ao abrir no Excel
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const lines = [cols.map((c) => esc(c[0])).join(";")];
    rsvps.forEach((r) => lines.push(cols.map((c) => esc(r[c[1]])).join(";")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "confirmacoes-aquiles-flavia.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Reabre a sessão se a aba ainda estiver aberta.
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) load(saved).catch(() => sessionStorage.removeItem(SESSION_KEY));
})();

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const SESSION_KEY = "af_admin_pw";

  const loginView = $("#login-view");
  const dashView = $("#dash-view");
  const loginForm = $("#login-form");
  const loginStatus = $("#login-status");
  const tbody = $("#rsvp-rows");

  let pessoas = [];
  let filter = "Confirmado";
  let search = "";

  async function load(password) {
    const res = await window.Api.listAll(password);
    // Famílias mais recentes primeiro; dentro da família, o representante na frente.
    const familyTime = {};
    res.pessoas.forEach((p) => {
      if (!familyTime[p.familia] || p.timestamp > familyTime[p.familia]) familyTime[p.familia] = p.timestamp;
    });
    pessoas = res.pessoas.sort(
      (a, b) =>
        String(familyTime[b.familia]).localeCompare(String(familyTime[a.familia])) ||
        String(a.familia).localeCompare(String(b.familia)) ||
        (a.papel === "Representante" ? -1 : b.papel === "Representante" ? 1 : 0)
    );
    sessionStorage.setItem(SESSION_KEY, password);
    loginView.hidden = true;
    dashView.hidden = false;
    $("#last-update").textContent = "Atualizado às " + new Date().toLocaleTimeString("pt-BR");
    render();
    if (!addForm.hidden) fillFamilies();
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
    try {
      await load(sessionStorage.getItem(SESSION_KEY));
    } catch (err) {
      alert("Erro ao atualizar: " + err.message);
    }
  });

  $("#logout-btn").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    pessoas = [];
    tbody.replaceChildren();
    dashView.hidden = true;
    loginView.hidden = false;
  });

  $$("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      $$("[data-filter]").forEach((b) => b.classList.toggle("active", b === btn));
      render();
    });
  });

  $("#search").addEventListener("input", (ev) => {
    search = ev.target.value.trim().toLowerCase();
    render();
  });

  function docLabel(tipo) {
    return tipo === "PASSAPORTE" ? "Passaporte" : tipo;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return ts && !isNaN(d) ? d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
  }

  function cell(text, className) {
    const td = document.createElement("td");
    td.textContent = text == null ? "" : String(text);
    if (className) td.className = className;
    return td;
  }

  function badge(text, kind) {
    const td = document.createElement("td");
    const span = document.createElement("span");
    span.className = "badge badge-" + kind;
    span.textContent = text;
    td.appendChild(span);
    return td;
  }

  function render() {
    const active = pessoas.filter((p) => p.status === "Confirmado");
    const kids = active.filter((p) => p.crianca === "Sim").length;
    $("#stat-people").textContent = active.length;
    $("#stat-adults").textContent = active.length - kids;
    $("#stat-kids").textContent = kids;
    $("#stat-families").textContent = new Set(active.map((p) => p.familia)).size;
    $("#stat-cancelled").textContent = pessoas.filter((p) => p.status === "Cancelado").length;

    const visible = pessoas.filter((p) => {
      if (filter !== "todos" && p.status !== filter) return false;
      if (!search) return true;
      return [p.nome, p.documento, p.representante, p.telefone, p.email, p.familia]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    // textContent em todas as células: nada vindo dos convidados vira HTML.
    let lastFamily = null;
    tbody.replaceChildren(
      ...visible.map((p) => {
        const tr = document.createElement("tr");
        if (p.familia !== lastFamily) tr.className = "family-start";
        lastFamily = p.familia;

        const confirmed = p.status === "Confirmado";
        const tipo = p.papel === "Representante" ? "Representante" : p.crianca === "Sim" ? "Criança" : "Acompanhante";
        tr.append(
          deleteCell(p),
          cell(p.nome, "strong"),
          badge(confirmed ? "Confirmado" : "Cancelado", confirmed ? "yes" : "no"),
          cell(tipo),
          cell(p.idade === "" || p.idade == null ? "–" : p.idade, "num"),
          cell(p.documento ? docLabel(p.docTipo) + " " + p.documento : "–", "nowrap"),
          cell(p.papel === "Representante" ? "–" : p.representante),
          cell(p.telefone, "nowrap"),
          cell(p.email),
          cell(p.restricoes),
          cell(p.mensagem, "msg"),
          cell(p.familia, "muted"),
          cell(confirmed ? formatDate(p.timestamp) : "Cancelado em " + formatDate(p.canceladoEm), "muted")
        );
        return tr;
      })
    );
    $("#empty-state").hidden = visible.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Apagar
  // ---------------------------------------------------------------------------

  const password = () => sessionStorage.getItem(SESSION_KEY);

  function deleteCell(p) {
    const td = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-delete";
    btn.textContent = "×";
    btn.title = "Apagar " + p.nome;
    btn.setAttribute("aria-label", "Apagar " + p.nome);
    btn.addEventListener("click", () => removePerson(p, btn));
    td.appendChild(btn);
    return td;
  }

  async function removePerson(p, btn) {
    let msg = "Apagar " + p.nome + " da lista?\n\nA linha sai da planilha e não dá para desfazer.";
    const others = pessoas.filter((o) => o.familia === p.familia && o.id !== p.id && o.status === "Confirmado");
    if (p.papel === "Representante" && others.length) {
      msg +=
        "\n\nAtenção: " + p.nome + " é o(a) representante. As outras " + others.length +
        " pessoa(s) da família continuam na lista, mas não poderão mais ser canceladas pelo documento dele(a).";
    }
    if (!window.confirm(msg)) return;
    btn.disabled = true;
    try {
      await window.Api.adminDelete(password(), [p.id]);
      await load(password());
    } catch (err) {
      btn.disabled = false;
      alert("Não foi possível apagar: " + err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Adicionar
  // ---------------------------------------------------------------------------

  const addForm = $("#add-form");
  const addStatus = $("#add-status");
  const familySelect = $("#add-familia");

  function fillFamilies() {
    const reps = {};
    pessoas
      .filter((p) => p.status === "Confirmado")
      .forEach((p) => {
        const f = (reps[p.familia] = reps[p.familia] || { count: 0, nome: p.representante });
        f.count++;
        if (p.papel === "Representante") f.nome = p.nome;
      });
    const current = familySelect.value;
    const opt = (value, text) => {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = text;
      return o;
    };
    familySelect.replaceChildren(
      opt("", "Nova família (a pessoa será a representante)"),
      ...Object.keys(reps)
        .sort((a, b) => String(reps[a].nome).localeCompare(String(reps[b].nome)))
        .map((code) => opt(code, "Família de " + reps[code].nome + " · " + reps[code].count + " pessoa(s) · " + code))
    );
    if (current && reps[current]) familySelect.value = current;
    updateFamilyFields();
  }

  function updateFamilyFields() {
    $$(".new-family-only").forEach((el) => (el.hidden = Boolean(familySelect.value)));
  }

  familySelect.addEventListener("change", updateFamilyFields);

  $("#add-toggle").addEventListener("click", () => {
    addForm.hidden = !addForm.hidden;
    if (!addForm.hidden) {
      fillFamilies();
      $("#add-nome").focus();
    }
  });

  $("#add-cancel").addEventListener("click", () => {
    addForm.hidden = true;
  });

  addForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const nome = $("#add-nome").value.trim();
    if (nome.split(/\s+/).filter(Boolean).length < 2) {
      addStatus.textContent = "Informe nome e sobrenome.";
      addStatus.className = "form-status error";
      return;
    }
    const btn = $("#add-submit");
    btn.disabled = true;
    addStatus.textContent = "Adicionando...";
    addStatus.className = "form-status";
    try {
      const newFamily = !familySelect.value;
      await window.Api.adminAdd(password(), {
        nome,
        familia: familySelect.value,
        idade: $("#add-idade").value.trim(),
        crianca: $("#add-crianca").checked,
        docTipo: $("#add-doc-tipo").value,
        documento: $("#add-doc").value.trim(),
        restricoes: $("#add-restricoes").value.trim(),
        telefone: newFamily ? $("#add-telefone").value.trim() : "",
        email: newFamily ? $("#add-email").value.trim() : "",
      });
      const keepFamily = familySelect.value;
      addForm.reset();
      await load(password());
      familySelect.value = keepFamily; // facilita adicionar várias pessoas da mesma família
      updateFamilyFields();
      addStatus.textContent = nome + " adicionado(a).";
      addStatus.className = "form-status ok";
      $("#add-nome").focus();
    } catch (err) {
      addStatus.textContent = err.message;
      addStatus.className = "form-status error";
    } finally {
      btn.disabled = false;
    }
  });

  $("#export-btn").addEventListener("click", () => {
    const cols = [
      ["Nome", (p) => p.nome],
      ["Status", (p) => p.status],
      ["Tipo", (p) => p.papel],
      ["Idade", (p) => p.idade],
      ["Criança", (p) => p.crianca],
      ["Tipo de documento", (p) => p.docTipo],
      ["Documento", (p) => p.documento],
      ["Representante", (p) => p.representante],
      ["Telefone", (p) => p.telefone],
      ["E-mail", (p) => p.email],
      ["Restrições alimentares", (p) => p.restricoes],
      ["Mensagem", (p) => p.mensagem],
      ["Família", (p) => p.familia],
      ["Confirmado em", (p) => formatDate(p.timestamp)],
      ["Cancelado em", (p) => formatDate(p.canceladoEm)],
    ];
    const esc = (v) => {
      let s = String(v == null ? "" : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // evita fórmulas ao abrir no Excel
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const lines = [cols.map((c) => esc(c[0])).join(";")];
    pessoas.forEach((p) => lines.push(cols.map((c) => esc(c[1](p))).join(";")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "convidados-aquiles-flavia.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Reabre a sessão se a aba ainda estiver aberta.
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) load(saved).catch(() => sessionStorage.removeItem(SESSION_KEY));
})();

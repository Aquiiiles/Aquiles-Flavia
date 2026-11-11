(() => {
  const cfg = window.WEDDING_CONFIG;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------------------------------------------------------------------------
  // Textos da configuração e contagem regressiva
  // ---------------------------------------------------------------------------

  $$("[data-cfg]").forEach((el) => (el.textContent = cfg[el.dataset.cfg] || ""));
  const mapsLink = $("#maps-link");
  if (cfg.mapsUrl) mapsLink.href = cfg.mapsUrl;
  else mapsLink.hidden = true;

  const target = new Date(cfg.date).getTime();
  function tick() {
    const diff = Math.max(0, target - Date.now());
    $("#cd-days").textContent = Math.floor(diff / 86400000);
    $("#cd-hours").textContent = String(Math.floor((diff % 86400000) / 3600000)).padStart(2, "0");
    $("#cd-min").textContent = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
    $("#cd-sec").textContent = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
  }
  if (!isNaN(target)) {
    tick();
    setInterval(tick, 1000);
  }

  if (!window.Api.isConfigured) {
    $("#not-configured").hidden = false;
    $$("#submit-btn, #lookup-btn").forEach((b) => (b.disabled = true));
  }

  // ---------------------------------------------------------------------------
  // Abas
  // ---------------------------------------------------------------------------

  $$("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$("[data-tab]").forEach((t) => {
        const active = t === tab;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", String(active));
        $("#" + t.dataset.tab).hidden = !active;
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Documentos e telefone
  // ---------------------------------------------------------------------------

  const onlyDigits = (s) => String(s || "").replace(/\D/g, "");

  function isValidCpf(d) {
    if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
    for (let len = 9; len <= 10; len++) {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
      if (((sum * 10) % 11) % 10 !== Number(d[len])) return false;
    }
    return true;
  }

  function validateDoc(tipo, value) {
    if (tipo === "CPF") return isValidCpf(onlyDigits(value)) ? "" : "CPF inválido.";
    const rg = value.toUpperCase().replace(/[^0-9A-Z]/g, "");
    return rg.length >= 5 && rg.length <= 14 && /\d/.test(rg) ? "" : "RG inválido.";
  }

  /** Liga um <select> CPF/RG ao campo do número, com máscara de CPF. */
  function bindDocInput(select, input) {
    const apply = () => {
      if (select.value === "CPF") {
        const d = onlyDigits(input.value).slice(0, 11);
        const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(".");
        input.value = d.length > 9 ? parts + "-" + d.slice(9) : parts;
      } else {
        input.value = input.value.toUpperCase().replace(/[^0-9A-Z.\-\s]/g, "").slice(0, 20);
      }
    };
    select.addEventListener("change", () => {
      input.placeholder = select.value === "CPF" ? "000.000.000-00" : "Número do RG";
      input.inputMode = select.value === "CPF" ? "numeric" : "text";
      apply();
    });
    input.addEventListener("input", apply);
  }

  const phone = $("#rep-telefone");
  phone.addEventListener("input", () => {
    const d = onlyDigits(phone.value).slice(0, 11);
    let out = d;
    if (d.length > 2) out = "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length > 7) out = "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    phone.value = out;
  });

  bindDocInput($("#rep-doc-tipo"), $("#rep-doc"));
  bindDocInput($("#lookup-doc-tipo"), $("#lookup-doc"));

  // ---------------------------------------------------------------------------
  // Acompanhantes
  // ---------------------------------------------------------------------------

  const members = $("#members");
  const addBtn = $("#add-member");
  const template = $("#member-template");

  function refreshMembers() {
    const cards = $$(".person", members);
    cards.forEach((card, i) => ($(".member-n", card).textContent = i + 1));
    addBtn.hidden = cards.length >= cfg.maxCompanions;
    $("#members-hint").textContent = cards.length
      ? cards.length + 1 + " pessoas nesta confirmação (incluindo você)."
      : "Vai sozinho(a)? Então é só confirmar. Se vier mais alguém, adicione aqui.";
  }

  function addMember() {
    const card = template.content.firstElementChild.cloneNode(true);
    const uid = "m" + Date.now() + Math.random().toString(36).slice(2, 6);
    const [nomeLabel, docLabel] = $$(".field > label", card);
    $(".m-nome", card).id = nomeLabel.htmlFor = uid + "-nome";
    $(".m-doc", card).id = docLabel.htmlFor = uid + "-doc";
    bindDocInput($(".m-doc-tipo", card), $(".m-doc", card));
    $(".m-crianca", card).addEventListener("change", (ev) => {
      $(".m-doc-req", card).hidden = ev.target.checked;
    });
    $(".remove-member", card).addEventListener("click", () => {
      card.remove();
      refreshMembers();
    });
    members.appendChild(card);
    refreshMembers();
    $(".m-nome", card).focus();
  }

  addBtn.addEventListener("click", addMember);
  refreshMembers();

  // ---------------------------------------------------------------------------
  // Envio da confirmação
  // ---------------------------------------------------------------------------

  const form = $("#rsvp-form");
  const status = $("#form-status");
  const submitBtn = $("#submit-btn");

  function setStatus(el, msg, type) {
    el.textContent = msg;
    el.className = "form-status " + (type || "");
  }

  function personCards() {
    return [$(".person-rep", form)].concat($$(".person", members));
  }

  function setPersonError(card, msg) {
    const el = $(".person-error", card);
    el.textContent = msg || "";
    el.hidden = !msg;
    card.classList.toggle("has-error", Boolean(msg));
  }

  function validateName(nome) {
    return nome.split(/\s+/).filter(Boolean).length >= 2 ? "" : "Informe nome e sobrenome.";
  }

  function collect() {
    const errors = [];
    const rep = {
      nome: $("#rep-nome").value.trim(),
      docTipo: $("#rep-doc-tipo").value,
      documento: $("#rep-doc").value.trim(),
      telefone: phone.value.trim(),
      email: $("#rep-email").value.trim(),
    };
    errors.push(
      validateName(rep.nome) ||
        validateDoc(rep.docTipo, rep.documento) ||
        (onlyDigits(rep.telefone).length < 10 ? "Informe um telefone com DDD." : "")
    );

    const membros = $$(".person", members).map((card) => {
      const m = {
        nome: $(".m-nome", card).value.trim(),
        crianca: $(".m-crianca", card).checked,
        docTipo: $(".m-doc-tipo", card).value,
        documento: $(".m-doc", card).value.trim(),
      };
      const docError = m.crianca && !m.documento ? "" : validateDoc(m.docTipo, m.documento);
      errors.push(validateName(m.nome) || docError);
      return m;
    });

    return {
      errors,
      data: {
        representante: rep,
        membros,
        restricoes: $("#restricoes").value.trim(),
        mensagem: $("#mensagem").value.trim(),
      },
    };
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if ($("#website").value) return; // honeypot anti-spam

    const cards = personCards();
    const { errors, data } = collect();
    cards.forEach((card, i) => setPersonError(card, errors[i]));
    const firstError = cards.find((_, i) => errors[i]);
    if (firstError) {
      setStatus(status, "Confira os dados destacados.", "error");
      firstError.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    submitBtn.disabled = true;
    setStatus(status, "Enviando...", "");
    try {
      const res = await window.Api.sendRsvp(data);
      showDone(res, data);
    } catch (err) {
      const dups = (err.data && err.data.duplicates) || [];
      dups.forEach((d) => {
        const by = d.confirmadoPor ? " (na família de " + d.confirmadoPor + ")" : "";
        setPersonError(cards[d.index], d.nome + " já está confirmado(a)" + by + ".");
      });
      setStatus(
        status,
        dups.length
          ? "Algumas pessoas já estavam confirmadas. Remova-as e envie de novo. Se for um engano, fale com os noivos."
          : "Não foi possível enviar: " + err.message,
        "error"
      );
    } finally {
      submitBtn.disabled = false;
    }
  });

  function showDone(res, data) {
    form.hidden = true;
    $("#rsvp-done").hidden = false;
    $("#done-text").textContent =
      "Obrigado, " + data.representante.nome.split(" ")[0] + "! Mal podemos esperar para celebrar com vocês.";
    $("#done-list").replaceChildren(
      ...res.pessoas.map((nome) => {
        const li = document.createElement("li");
        li.textContent = nome;
        return li;
      })
    );
    $("#done-code").textContent = res.familia;
    setStatus(status, "", "");
    $("#rsvp-done").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  $("#rsvp-again").addEventListener("click", () => {
    form.reset();
    members.replaceChildren();
    refreshMembers();
    personCards().forEach((c) => setPersonError(c, ""));
    form.hidden = false;
    $("#rsvp-done").hidden = true;
  });

  // ---------------------------------------------------------------------------
  // Consulta e cancelamento
  // ---------------------------------------------------------------------------

  const lookupForm = $("#lookup-form");
  const lookupStatus = $("#lookup-status");
  const result = $("#lookup-result");
  const cancelStatus = $("#cancel-status");
  let current = null; // { docTipo, documento }

  async function runLookup() {
    const res = await window.Api.lookup(current.docTipo, current.documento);
    if (!res.found) {
      result.hidden = true;
      lookupForm.hidden = false;
      setStatus(lookupStatus, "Não encontramos nenhuma confirmação com esse documento.", "error");
      return;
    }

    const list = $("#lookup-people");
    if (!res.pessoas.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "Não há nenhuma presença ativa ligada a este documento.";
      list.replaceChildren(p);
      $("#cancel-btn").hidden = true;
    } else {
      list.replaceChildren(
        ...res.pessoas.map((p) => {
          const label = document.createElement("label");
          label.className = "check check-row";
          const box = document.createElement("input");
          box.type = "checkbox";
          box.value = p.id;
          const text = document.createElement("span");
          text.textContent = p.nome + (p.voce ? " (você)" : "");
          const role = document.createElement("small");
          role.textContent = p.papel;
          label.append(box, text, role);
          return label;
        })
      );
      $("#cancel-btn").hidden = false;
    }
    lookupForm.hidden = true;
    result.hidden = false;
  }

  lookupForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const docTipo = $("#lookup-doc-tipo").value;
    const documento = $("#lookup-doc").value.trim();
    const error = validateDoc(docTipo, documento);
    if (error) {
      setStatus(lookupStatus, error, "error");
      return;
    }
    current = { docTipo, documento };
    $("#lookup-btn").disabled = true;
    setStatus(lookupStatus, "Consultando...", "");
    setStatus(cancelStatus, "", "");
    try {
      await runLookup();
      if (!result.hidden) setStatus(lookupStatus, "", "");
    } catch (err) {
      setStatus(lookupStatus, err.message, "error");
    } finally {
      $("#lookup-btn").disabled = false;
    }
  });

  $("#cancel-btn").addEventListener("click", async () => {
    const boxes = $$("#lookup-people input:checked");
    if (!boxes.length) {
      setStatus(cancelStatus, "Marque quem não poderá ir.", "error");
      return;
    }
    const names = boxes.map((b) => b.nextElementSibling.textContent).join(", ");
    if (!window.confirm("Cancelar a presença de: " + names + "?")) return;

    const btn = $("#cancel-btn");
    btn.disabled = true;
    setStatus(cancelStatus, "Cancelando...", "");
    try {
      const res = await window.Api.cancel(current.docTipo, current.documento, boxes.map((b) => b.value));
      await runLookup();
      setStatus(
        cancelStatus,
        res.cancelados === 1 ? "Presença cancelada." : res.cancelados + " presenças canceladas.",
        "ok"
      );
    } catch (err) {
      setStatus(cancelStatus, err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  $("#lookup-back").addEventListener("click", () => {
    lookupForm.reset();
    $("#lookup-doc-tipo").dispatchEvent(new Event("change"));
    result.hidden = true;
    lookupForm.hidden = false;
    setStatus(lookupStatus, "", "");
    setStatus(cancelStatus, "", "");
  });
})();

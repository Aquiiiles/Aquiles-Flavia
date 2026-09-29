(() => {
  const cfg = window.WEDDING_CONFIG;
  const $ = (sel) => document.querySelector(sel);

  // Preenche os textos vindos da configuração.
  document.querySelectorAll("[data-cfg]").forEach((el) => {
    el.textContent = cfg[el.dataset.cfg] || "";
  });
  const mapsLink = $("#maps-link");
  if (cfg.mapsUrl) mapsLink.href = cfg.mapsUrl;
  else mapsLink.hidden = true;

  if (window.Api.isDemo) $("#demo-banner").hidden = false;

  // Contagem regressiva
  const target = new Date(cfg.date).getTime();
  function tick() {
    const diff = Math.max(0, target - Date.now());
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    $("#cd-days").textContent = d;
    $("#cd-hours").textContent = String(h).padStart(2, "0");
    $("#cd-min").textContent = String(m).padStart(2, "0");
    $("#cd-sec").textContent = String(s).padStart(2, "0");
  }
  if (!isNaN(target)) {
    tick();
    setInterval(tick, 1000);
  }

  // Formulário
  const form = $("#rsvp-form");
  const companions = $("#acompanhantes");
  const companionNamesField = $("#field-nomes-acompanhantes");
  const attendingFields = $("#attending-fields");
  const status = $("#form-status");
  const submitBtn = $("#submit-btn");

  for (let i = 0; i <= cfg.maxCompanions; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i === 0 ? "Só eu" : i === 1 ? "1 acompanhante" : i + " acompanhantes";
    companions.appendChild(opt);
  }

  function updateVisibility() {
    const attending = form.presenca.value === "sim";
    attendingFields.hidden = !attending;
    companionNamesField.hidden = !attending || Number(companions.value) === 0;
    $("#nomes-acompanhantes").required = !companionNamesField.hidden;
  }
  form.addEventListener("change", updateVisibility);
  updateVisibility();

  // Máscara simples de telefone brasileiro
  const phone = $("#telefone");
  phone.addEventListener("input", () => {
    const d = phone.value.replace(/\D/g, "").slice(0, 11);
    let out = d;
    if (d.length > 2) out = "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length > 7) out = "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    phone.value = out;
  });

  function setStatus(msg, type) {
    status.textContent = msg;
    status.className = "form-status " + (type || "");
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    if (!form.presenca.value) {
      setStatus("Por favor, diga se vai comparecer.", "error");
      return;
    }
    if (form.website.value) return; // honeypot anti-spam

    const attending = form.presenca.value === "sim";
    const data = {
      nome: form.nome.value.trim(),
      telefone: form.telefone.value.trim(),
      email: form.email.value.trim(),
      presenca: form.presenca.value,
      acompanhantes: attending ? Number(companions.value) : 0,
      nomesAcompanhantes: attending && Number(companions.value) > 0 ? form.nomesAcompanhantes.value.trim() : "",
      restricoes: attending ? form.restricoes.value.trim() : "",
      mensagem: form.mensagem.value.trim(),
    };

    if (data.telefone.replace(/\D/g, "").length < 10) {
      setStatus("Informe um telefone com DDD.", "error");
      phone.focus();
      return;
    }

    submitBtn.disabled = true;
    setStatus("Enviando...", "");
    try {
      const res = await window.Api.sendRsvp(data);
      form.hidden = true;
      const done = $("#rsvp-done");
      done.hidden = false;
      $("#done-title").textContent = attending ? "Presença confirmada!" : "Resposta recebida";
      $("#done-text").textContent = attending
        ? "Obrigado, " + data.nome.split(" ")[0] + "! Mal podemos esperar para celebrar com você."
        : "Obrigado por avisar, " + data.nome.split(" ")[0] + ". Vamos sentir sua falta!";
      if (res.updated) {
        $("#done-text").textContent += " (Sua resposta anterior foi atualizada.)";
      }
      setStatus("", "");
    } catch (err) {
      setStatus("Não foi possível enviar: " + err.message + " Tente novamente.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  $("#rsvp-again").addEventListener("click", () => {
    form.reset();
    updateVisibility();
    form.hidden = false;
    $("#rsvp-done").hidden = true;
  });
})();

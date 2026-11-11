// Gera o "Pix Copia e Cola" (BR Code estático do Banco Central) e o QR Code.
// O código é montado no navegador: nenhum dado do convidado sai do site.
(function (root) {
  /** Campo EMV: id (2 dígitos) + tamanho (2 dígitos) + valor. */
  function field(id, value) {
    return id + String(value.length).padStart(2, "0") + value;
  }

  /** Remove acentos e caracteres fora do padrão, em maiúsculas. */
  function clean(text, max) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9 ]/g, "")
      .toUpperCase()
      .trim()
      .slice(0, max);
  }

  /** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido pelo BR Code. */
  function crc16(payload) {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let b = 0; b < 8; b++) {
        crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
        crc &= 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  /**
   * @param {object} o
   * @param {string} o.key       chave Pix
   * @param {string} o.name      nome do recebedor (até 25 caracteres)
   * @param {string} o.city      cidade do recebedor (até 15 caracteres)
   * @param {number} [o.amount]  valor em reais; sem valor, quem paga escolhe
   * @param {string} [o.description] mensagem exibida por alguns bancos
   */
  function buildPixPayload(o) {
    const account =
      field("00", "br.gov.bcb.pix") +
      field("01", o.key) +
      (o.description ? field("02", clean(o.description, 40)) : "");

    let payload =
      field("00", "01") +
      field("26", account) +
      field("52", "0000") +
      field("53", "986") +
      (o.amount > 0 ? field("54", Number(o.amount).toFixed(2)) : "") +
      field("58", "BR") +
      field("59", clean(o.name, 25)) +
      field("60", clean(o.city, 15)) +
      field("62", field("05", "***")) +
      "6304";
    return payload + crc16(payload);
  }

  const api = { buildPixPayload, crc16 };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Pix = api;
})(this);

// ---------------------------------------------------------------------------
// Seção "Presente" do site
// ---------------------------------------------------------------------------

(() => {
  if (typeof document === "undefined") return;
  const cfg = window.WEDDING_CONFIG.pix;
  const section = document.querySelector("#presente");
  if (!cfg || !cfg.key) {
    section.hidden = true;
    document.querySelector('a[href="#presente"]').hidden = true;
    return;
  }

  const $ = (sel) => section.querySelector(sel);
  const qrBox = $("#pix-qr");
  const codeEl = $("#pix-code");
  const amountLabel = $("#pix-amount-label");
  const custom = $("#pix-custom");
  let amount = 0;

  $("#pix-key").textContent = cfg.key;

  const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function render() {
    const payload = window.Pix.buildPixPayload({
      key: cfg.key,
      name: cfg.name,
      city: cfg.city,
      amount,
      description: cfg.description,
    });
    const qr = window.qrcode(0, "M");
    qr.addData(payload);
    qr.make();
    qrBox.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    qrBox.querySelector("svg").setAttribute("aria-label", "QR Code do Pix");
    codeEl.value = payload;
    amountLabel.textContent = amount > 0 ? "Valor: " + brl(amount) : "Valor livre: você escolhe no app do banco";
  }

  // Botões de valor sugerido
  const chips = Array.from(section.querySelectorAll("[data-amount]"));
  (cfg.suggestedAmounts || []).forEach((v) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab";
    btn.dataset.amount = v;
    btn.textContent = brl(v);
    $("#pix-amounts").insertBefore(btn, custom.parentElement);
    chips.push(btn);
  });

  function select(btn) {
    chips.forEach((c) => c.classList.toggle("active", c === btn));
  }

  chips.forEach((btn) =>
    btn.addEventListener("click", () => {
      amount = Number(btn.dataset.amount);
      custom.value = "";
      select(btn);
      render();
    })
  );

  custom.addEventListener("input", () => {
    const v = Number(custom.value.replace(/\./g, "").replace(",", "."));
    amount = v > 0 && v < 1000000 ? Math.round(v * 100) / 100 : 0;
    select(null);
    render();
  });

  async function copy(text, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // Navegadores antigos ou sem permissão: seleciona para copiar à mão.
      codeEl.select();
      document.execCommand("copy");
    }
    const original = button.textContent;
    button.textContent = "Copiado!";
    setTimeout(() => (button.textContent = original), 2000);
  }

  $("#pix-copy").addEventListener("click", (ev) => copy(codeEl.value, ev.currentTarget));
  $("#pix-copy-key").addEventListener("click", (ev) => copy(cfg.key, ev.currentTarget));

  render();
})();

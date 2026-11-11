// Testes do backend (apps-script/Code.gs). Rode com: node --test dev/
const test = require("node:test");
const assert = require("node:assert");
const { createBackend } = require("./gas-mock");

// Gera um CPF válido a partir de 9 dígitos.
function cpf(base) {
  const d = String(base).padStart(9, "0").split("").map(Number);
  for (let len = 9; len <= 10; len++) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i] * (len + 1 - i);
    d.push(((sum * 10) % 11) % 10);
  }
  const s = d.join("");
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}

function family(overrides = {}) {
  return {
    representante: {
      nome: "Maria Silva",
      docTipo: "CPF",
      documento: cpf(123456789),
      telefone: "(21) 98765-4321",
      email: "maria@example.com",
    },
    membros: [
      { nome: "João Silva", docTipo: "RG", documento: "12.345.678-9" },
      { nome: "Pedrinho Silva", crianca: true },
    ],
    restricoes: "Vegetariana",
    mensagem: "Parabéns!",
    ...overrides,
  };
}

test("confirma uma família com representante, adulto e criança", () => {
  const b = createBackend();
  const res = b.post({ action: "rsvp", data: family() });
  assert.equal(res.ok, true, res.error);
  assert.match(res.familia, /^AF-[A-Z0-9]{5}$/);
  assert.deepEqual(res.pessoas, ["Maria Silva", "João Silva", "Pedrinho Silva"]);

  const list = b.post({ action: "list", password: "senha-teste" });
  assert.equal(list.pessoas.length, 3);
  const [rep, joao, kid] = list.pessoas;
  assert.equal(rep.papel, "Representante");
  assert.equal(rep.telefone, "(21) 98765-4321");
  assert.equal(joao.telefone, "", "telefone só fica no representante");
  assert.equal(joao.representante, "Maria Silva");
  assert.equal(joao.documento, "123456789");
  assert.equal(kid.crianca, "Sim");
  assert.equal(kid.documento, "");
  assert.ok(list.pessoas.every((p) => p.familia === res.familia && p.status === "Confirmado"));
});

test("bloqueia documento já confirmado, mesmo com outra pontuação", () => {
  const b = createBackend();
  b.post({ action: "rsvp", data: family() });
  const res = b.post({
    action: "rsvp",
    data: family({
      representante: {
        nome: "Outra Pessoa",
        docTipo: "CPF",
        documento: cpf(987654321),
        telefone: "21999998888",
      },
      membros: [{ nome: "Joao Nome Diferente", docTipo: "RG", documento: "123456789" }],
    }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.duplicates.length, 1);
  assert.equal(res.duplicates[0].index, 1);
  assert.equal(res.duplicates[0].motivo, "documento");
  assert.equal(res.duplicates[0].confirmadoPor, "Maria S.");
  assert.equal(b.post({ action: "list", password: "senha-teste" }).pessoas.length, 3, "nada foi gravado");
});

test("bloqueia nome já confirmado, ignorando acentos e maiúsculas", () => {
  const b = createBackend();
  b.post({ action: "rsvp", data: family() });
  const res = b.post({
    action: "rsvp",
    data: {
      representante: { nome: "  joão   SILVA ", docTipo: "CPF", documento: cpf(111222333), telefone: "21999998888" },
      membros: [],
    },
  });
  assert.equal(res.ok, false);
  assert.equal(res.duplicates[0].motivo, "nome");
});

test("valida CPF, nome completo, telefone e repetição no mesmo envio", () => {
  const b = createBackend();
  const bad = (data) => b.post({ action: "rsvp", data });

  let res = bad(family({ representante: { ...family().representante, documento: "111.111.111-11" } }));
  assert.match(res.error, /CPF inválido/);

  res = bad(family({ representante: { ...family().representante, nome: "Maria" } }));
  assert.match(res.error, /nome e sobrenome/);

  res = bad(family({ representante: { ...family().representante, telefone: "1234" } }));
  assert.match(res.error, /telefone/);

  res = bad(family({ membros: [{ nome: "Adulto Sem Doc" }] }));
  assert.match(res.error, /informe o CPF/);

  res = bad(family({ membros: [{ nome: "Maria Silva", docTipo: "RG", documento: "998877665" }] }));
  assert.match(res.error, /mais de uma vez/);

  res = bad(family({ membros: Array.from({ length: 11 }, (_, i) => ({ nome: "Kid " + i + " X", crianca: true })) }));
  assert.match(res.error, /Máximo/);
});

test("representante consulta e cancela pessoas da família", () => {
  const b = createBackend();
  b.post({ action: "rsvp", data: family() });

  const look = b.post({ action: "lookup", data: { docTipo: "CPF", documento: cpf(123456789).replace(/\D/g, "") } });
  assert.equal(look.found, true);
  assert.deepEqual(look.pessoas.map((p) => p.nome), ["Maria S.", "João S.", "Pedrinho S."]);
  assert.equal(look.pessoas[0].voce, true);

  const kid = look.pessoas[2];
  const res = b.post({ action: "cancel", data: { docTipo: "CPF", documento: cpf(123456789), ids: [kid.id] } });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.cancelados, 1);

  const list = b.post({ action: "list", password: "senha-teste" }).pessoas;
  const cancelled = list.find((p) => p.id === kid.id);
  assert.equal(cancelled.status, "Cancelado");
  assert.ok(cancelled.canceladoEm);

  // Depois de cancelado, o nome pode ser confirmado de novo.
  const again = b.post({
    action: "rsvp",
    data: {
      representante: { nome: "Pedrinho Silva", docTipo: "CPF", documento: cpf(555666777), telefone: "21911112222" },
      membros: [],
    },
  });
  assert.equal(again.ok, true, again.error);
});

test("acompanhante só cancela a si mesmo", () => {
  const b = createBackend();
  b.post({ action: "rsvp", data: family() });

  const look = b.post({ action: "lookup", data: { docTipo: "RG", documento: "123456789" } });
  assert.equal(look.pessoas.length, 1);
  assert.equal(look.pessoas[0].nome, "João S.");

  const all = b.post({ action: "lookup", data: { docTipo: "CPF", documento: cpf(123456789) } }).pessoas;
  const maria = all.find((p) => p.papel === "Representante");
  const res = b.post({ action: "cancel", data: { docTipo: "RG", documento: "123456789", ids: [maria.id] } });
  assert.equal(res.ok, false);
});

test("representante que se cancelou continua podendo cancelar a família", () => {
  const b = createBackend();
  b.post({ action: "rsvp", data: family() });
  const doc = { docTipo: "CPF", documento: cpf(123456789) };
  const [maria] = b.post({ action: "lookup", data: doc }).pessoas;
  b.post({ action: "cancel", data: { ...doc, ids: [maria.id] } });

  const look = b.post({ action: "lookup", data: doc });
  assert.equal(look.found, true);
  assert.deepEqual(look.pessoas.map((p) => p.nome), ["João S.", "Pedrinho S."]);
});

test("documento não cadastrado não revela nada", () => {
  const b = createBackend();
  b.post({ action: "rsvp", data: family() });
  const look = b.post({ action: "lookup", data: { docTipo: "CPF", documento: cpf(999888777) } });
  assert.deepEqual(look, { ok: true, found: false });
});

test("lista exige a senha e bloqueia após muitas tentativas", () => {
  const b = createBackend();
  assert.equal(b.post({ action: "list", password: "errada" }).error, "Senha incorreta.");
  for (let i = 0; i < 10; i++) b.post({ action: "list", password: "errada" });
  assert.match(b.post({ action: "list", password: "senha-teste" }).error, /Muitas tentativas/);
});

test("texto do convidado não vira fórmula e documento fica como texto", () => {
  const b = createBackend();
  b.post({ action: "rsvp", data: family({ mensagem: '=IMPORTXML("http://x")' }) });
  const raw = b.sheet().raw[1];
  assert.ok(raw.includes(`'=IMPORTXML("http://x")`));
  assert.ok(raw.includes(`'${cpf(123456789)}`));
  assert.ok(raw.includes("'(21) 98765-4321"));
});

test("status editado à mão na planilha é respeitado", () => {
  const b = createBackend();
  b.post({ action: "rsvp", data: family() });
  b.sheet().data[2][3] = "cancelado"; // João, coluna Status
  const res = b.post({
    action: "rsvp",
    data: {
      representante: { nome: "João Silva", docTipo: "RG", documento: "123456789", telefone: "21911112222" },
      membros: [],
    },
  });
  assert.equal(res.ok, true, res.error);
});

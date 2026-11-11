// Testes do gerador de Pix Copia e Cola (assets/js/pix.js).
const test = require("node:test");
const assert = require("node:assert");
const { buildPixPayload, crc16 } = require("../assets/js/pix.js");

const KEY = "22946f21-cb3c-4ba5-b720-43b1fce62bdb";

/** Lê o BR Code em pares id -> valor, como um app de banco faria. */
function parse(payload) {
  const out = {};
  for (let i = 0; i < payload.length; ) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    out[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

test("CRC16-CCITT bate com o valor de referência", () => {
  assert.equal(crc16("123456789"), "29B1");
});

test("começa igual ao código gerado pelo banco dos noivos", () => {
  const payload = buildPixPayload({ key: KEY, name: "Aquiles e Flavia", city: "Rio de Janeiro" });
  assert.ok(payload.startsWith("00020126580014br.gov.bcb.pix0136" + KEY));
});

test("monta os campos do BR Code com valor e descrição", () => {
  const payload = buildPixPayload({
    key: KEY,
    name: "Aquiles e Flávia de Souza Ribeiro",
    city: "Rio de Janeiro",
    amount: 150,
    description: "Presente casamento",
  });
  const f = parse(payload);
  assert.equal(f["00"], "01");
  assert.deepEqual(parse(f["26"]), { "00": "br.gov.bcb.pix", "01": KEY, "02": "PRESENTE CASAMENTO" });
  assert.equal(f["53"], "986");
  assert.equal(f["54"], "150.00");
  assert.equal(f["58"], "BR");
  assert.equal(f["59"], "AQUILES E FLAVIA DE SOUZA", "sem acento e no máximo 25 letras");
  assert.equal(f["60"], "RIO DE JANEIRO");
  assert.equal(f["62"], "0503***");
  assert.equal(f["63"], crc16(payload.slice(0, -4)));
});

test("sem valor, o campo 54 não aparece", () => {
  const f = parse(buildPixPayload({ key: KEY, name: "A", city: "B", amount: 0 }));
  assert.equal(f["54"], undefined);
});

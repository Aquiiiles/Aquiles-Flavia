/**
 * Backend das confirmações do casamento de Aquiles & Flavia.
 *
 * Roda como Web App do Google Apps Script e grava na aba "Confirmacoes"
 * da planilha dos noivos. Cada linha da planilha é UMA pessoa; as pessoas
 * confirmadas juntas formam uma "família", identificada por um código e
 * por um representante (o único que informa telefone e e-mail).
 *
 * Configuração obrigatória (Configurações do projeto > Propriedades do script):
 *   ADMIN_PASSWORD = senha da área dos noivos
 */

const SPREADSHEET_ID = '1fVYoJ4d4Fl34pNqHc_ZIXi7rUrBBOohtZAfe1-Uy65U';
const SHEET_NAME = 'Confirmacoes';

// Máximo de acompanhantes por família (mantenha igual ao config.js do site).
const MAX_COMPANIONS = 10;

const STATUS_CONFIRMED = 'Confirmado';
const STATUS_CANCELLED = 'Cancelado';
const ROLE_REP = 'Representante';
const ROLE_MEMBER = 'Acompanhante';
const DOC_TYPES = ['CPF', 'RG', 'PASSAPORTE'];

// Ordem das colunas na planilha: [chave interna, cabeçalho].
const COLUMNS = [
  ['id', 'ID'],
  ['familia', 'Código da família'],
  ['timestamp', 'Data/Hora'],
  ['status', 'Status'],
  ['nome', 'Nome'],
  ['papel', 'Tipo'],
  ['crianca', 'Criança'],
  ['docTipo', 'Tipo de documento'],
  ['documento', 'Documento'],
  ['representante', 'Representante'],
  ['telefone', 'Telefone'],
  ['email', 'E-mail'],
  ['restricoes', 'Restrições alimentares'],
  ['mensagem', 'Mensagem'],
  ['canceladoEm', 'Cancelado em'],
  // Colunas novas entram sempre no final, para não desalinhar linhas antigas.
  ['idade', 'Idade'],
];

// Até essa idade a pessoa conta como criança (e não precisa de documento).
const CHILD_MAX_AGE = 12;

// Proteção contra força bruta na senha e varredura de documentos.
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_SECONDS = 15 * 60;
const MAX_LOOKUPS = 200;
const LOOKUP_WINDOW_SECONDS = 10 * 60;

function doGet() {
  return json({ ok: true, service: 'rsvp-aquiles-flavia' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'rsvp':
        return json(saveRsvp(body.data || {}));
      case 'lookup':
        return json(lookup(body.data || {}));
      case 'cancel':
        return json(cancel(body.data || {}));
      case 'list':
        return json(listAll(body.password));
      case 'adminAdd':
        return json(adminAdd(body.password, body.data || {}));
      case 'adminDelete':
        return json(adminDelete(body.password, body.ids));
      default:
        return json({ ok: false, error: 'Ação inválida.' });
    }
  } catch (err) {
    if (!err.userMessage) console.error(err);
    return json({ ok: false, error: err.userMessage || 'Erro no servidor. Tente novamente.' });
  }
}

// ---------------------------------------------------------------------------
// Confirmação de presença
// ---------------------------------------------------------------------------

function saveRsvp(input) {
  const rsvp = validateRsvp(input);
  const people = [rsvp.representante].concat(rsvp.membros);

  return withLock(() => {
    const sheet = getSheet();
    const active = readRows(sheet).filter((r) => r.status === STATUS_CONFIRMED);
    const duplicates = findDuplicates(people, active);
    if (duplicates.length) {
      return {
        ok: false,
        error: duplicates.length === 1
          ? duplicates[0].nome + ' já está com presença confirmada.'
          : 'Algumas pessoas já estão com presença confirmada.',
        duplicates: duplicates,
      };
    }

    const familia = newFamilyCode(sheet);
    const now = new Date();
    const rows = people.map((p, index) => {
      const isRep = index === 0;
      return {
        id: Utilities.getUuid(),
        familia: familia,
        timestamp: now,
        status: STATUS_CONFIRMED,
        nome: p.nome,
        papel: isRep ? ROLE_REP : ROLE_MEMBER,
        crianca: p.crianca ? 'Sim' : 'Não',
        idade: p.idade,
        docTipo: p.docTipo,
        documento: p.documento,
        representante: rsvp.representante.nome,
        telefone: isRep ? rsvp.representante.telefone : '',
        email: isRep ? rsvp.representante.email : '',
        restricoes: isRep ? rsvp.restricoes : '',
        mensagem: isRep ? rsvp.mensagem : '',
        canceladoEm: '',
      };
    });

    appendRows(sheet, rows);
    return { ok: true, familia: familia, pessoas: people.map((p) => p.nome) };
  });
}

/** Pessoas do envio que já estão confirmadas (pelo documento ou pelo nome). */
function findDuplicates(people, activeRows) {
  const byDoc = {};
  const byName = {};
  activeRows.forEach((r) => {
    const key = docKey(r.docTipo, r.documento);
    if (key) byDoc[key] = r;
    byName[nameKey(r.nome)] = r;
  });

  const duplicates = [];
  people.forEach((p, index) => {
    const found = (p.docKey && byDoc[p.docKey]) || byName[p.nameKey];
    if (found) {
      duplicates.push({
        index: index,
        nome: p.nome,
        motivo: p.docKey && byDoc[p.docKey] ? 'documento' : 'nome',
        confirmadoPor: maskName(found.representante),
      });
    }
  });
  return duplicates;
}

function appendRows(sheet, rows) {
  const values = rows.map((r) => COLUMNS.map(([key]) => toCell(key, r[key])));
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, COLUMNS.length).setValues(values);
}

function validateRsvp(input) {
  const rep = input.representante || {};
  const membros = Array.isArray(input.membros) ? input.membros : [];
  if (membros.length > MAX_COMPANIONS) {
    throw userError('Máximo de ' + MAX_COMPANIONS + ' acompanhantes por confirmação.');
  }

  const representante = validatePerson(rep, 'Representante', false);
  representante.telefone = validatePhone(rep.telefone);
  representante.email = validateEmail(rep.email);

  const people = [representante].concat(
    membros.map((m, i) => validatePerson(m, 'Acompanhante ' + (i + 1), true))
  );

  // A mesma pessoa não pode aparecer duas vezes no mesmo envio.
  const seenDocs = {};
  const seenNames = {};
  people.forEach((p) => {
    if (p.docKey && seenDocs[p.docKey]) {
      throw userError('O documento de ' + p.nome + ' foi informado mais de uma vez.');
    }
    if (seenNames[p.nameKey]) {
      throw userError(p.nome + ' foi informado(a) mais de uma vez.');
    }
    if (p.docKey) seenDocs[p.docKey] = true;
    seenNames[p.nameKey] = true;
  });

  return {
    representante: representante,
    membros: people.slice(1),
    restricoes: str(input.restricoes, 300),
    mensagem: str(input.mensagem, 1000),
  };
}

/** Idade em anos inteiros (0 a 120); '' quando não informada. */
function parseAge(value, label) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  const idade = Number(raw);
  if (!/^\d{1,3}$/.test(raw) || idade > 120) throw userError(label + ': idade inválida.');
  return idade;
}

function validatePhone(value) {
  const telefone = str(value, 30);
  const phoneDigits = digits(telefone);
  // Telefone de fora começa com "+" e o código do país (formato internacional).
  const international = telefone.charAt(0) === '+';
  const [minDigits, maxDigits] = international ? [8, 15] : [10, 13];
  if (phoneDigits.length < minDigits || phoneDigits.length > maxDigits) {
    throw userError('Informe um telefone válido com DDD (ou com + e o código do país).');
  }
  return telefone;
}

function validateEmail(value) {
  const email = str(value, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw userError('E-mail inválido.');
  }
  return email;
}

/**
 * Valida uma pessoa. `allowChild`: pode ser criança (até CHILD_MAX_AGE anos,
 * e aí vir sem documento). `docOptional`: documento e idade opcionais (usado
 * quando os noivos adicionam alguém pela área deles).
 */
function validatePerson(p, label, allowChild, docOptional) {
  const nome = str(p.nome, 100).replace(/\s+/g, ' ');
  if (nameKey(nome).split(' ').filter(Boolean).length < 2) {
    throw userError(label + ': informe nome e sobrenome.');
  }

  const idade = parseAge(p.idade, label);
  if (idade === '' && !docOptional) throw userError(label + ': informe a idade.');
  if (!allowChild && idade !== '' && idade <= CHILD_MAX_AGE) {
    throw userError(label + ': precisa ter mais de ' + CHILD_MAX_AGE + ' anos.');
  }
  // Com idade, "criança" sai dela; sem idade (noivos), vale a caixa marcada.
  const crianca = allowChild && (idade !== '' ? idade <= CHILD_MAX_AGE : p.crianca === true);
  const docTipo = parseDocType(p.docTipo);
  const rawDoc = str(p.documento, 30);

  // Sem documento, a checagem de duplicidade é só pelo nome.
  if (!rawDoc && (crianca || docOptional)) {
    return { nome: nome, idade: idade, crianca: crianca, docTipo: '', documento: '', docKey: '', nameKey: nameKey(nome) };
  }
  if (!rawDoc) throw userError(label + ': informe o documento.');

  const documento = formatDocument(docTipo, rawDoc);
  if (!documento) throw userError(label + ': ' + docLabel(docTipo) + ' inválido.');

  return {
    nome: nome,
    idade: idade,
    crianca: crianca,
    docTipo: docTipo,
    documento: documento,
    docKey: docKey(docTipo, documento),
    nameKey: nameKey(nome),
  };
}

// ---------------------------------------------------------------------------
// Consulta e cancelamento
// ---------------------------------------------------------------------------

/**
 * Encontra o que o dono do documento pode cancelar:
 * - representante: todas as pessoas ativas da(s) família(s) dele;
 * - acompanhante: só ele mesmo.
 */
function findManageable(rows, docTipo, documento) {
  const key = docKey(docTipo, documento);
  if (!key) throw userError('Documento inválido.');

  const own = rows.filter((r) => docKey(r.docTipo, r.documento) === key);
  const families = {};
  const ids = {};
  own.forEach((r) => {
    if (r.papel === ROLE_REP) families[r.familia] = true;
    if (r.status === STATUS_CONFIRMED) ids[r.id] = true;
  });
  const manageable = rows.filter(
    (r) => r.status === STATUS_CONFIRMED && (ids[r.id] || families[r.familia])
  );
  return { own: own, manageable: manageable, ownIds: ids };
}

function lookup(input) {
  throttleLookups();
  const docTipo = parseDocType(input.docTipo);
  const rows = readRows(getSheet());
  const result = findManageable(rows, docTipo, str(input.documento, 30));

  if (!result.own.length) return { ok: true, found: false };

  return {
    ok: true,
    found: true,
    pessoas: result.manageable.map((r) => ({
      id: r.id,
      nome: maskName(r.nome),
      papel: r.papel,
      voce: !!result.ownIds[r.id],
      familia: r.familia,
    })),
  };
}

function cancel(input) {
  throttleLookups();
  const docTipo = parseDocType(input.docTipo);
  const ids = Array.isArray(input.ids) ? input.ids.map(String) : [];
  if (!ids.length) throw userError('Selecione quem não poderá ir.');

  return withLock(() => {
    const sheet = getSheet();
    const rows = readRows(sheet);
    const result = findManageable(rows, docTipo, str(input.documento, 30));
    const allowed = {};
    result.manageable.forEach((r) => (allowed[r.id] = r));

    if (ids.some((id) => !allowed[id])) {
      throw userError('Não foi possível cancelar. Faça a consulta novamente.');
    }

    const statusCol = columnIndex('status') + 1;
    const cancelledCol = columnIndex('canceladoEm') + 1;
    const now = new Date();
    ids.forEach((id) => {
      const row = allowed[id]._row;
      sheet.getRange(row, statusCol).setValue(STATUS_CANCELLED);
      sheet.getRange(row, cancelledCol).setValue(now);
    });
    return { ok: true, cancelados: ids.length };
  });
}

// ---------------------------------------------------------------------------
// Área dos noivos
// ---------------------------------------------------------------------------

function listAll(password) {
  checkPassword(password);
  const rows = readRows(getSheet()).map((r) => {
    const out = {};
    COLUMNS.forEach(([key]) => {
      const v = r[key];
      out[key] = v instanceof Date ? v.toISOString() : v;
    });
    return out;
  });
  return { ok: true, pessoas: rows };
}

/**
 * Os noivos adicionam uma pessoa: numa família existente (`familia` com o
 * código) ou como representante de uma família nova. Documento é opcional.
 */
function adminAdd(password, input) {
  checkPassword(password);
  const person = validatePerson(input, 'Pessoa', true, true);
  const familyCode = str(input.familia, 20).toUpperCase();

  return withLock(() => {
    const sheet = getSheet();
    const rows = readRows(sheet);
    const active = rows.filter((r) => r.status === STATUS_CONFIRMED);
    const dup = findDuplicates([person], active)[0];
    if (dup) {
      throw userError(person.nome + ' já está confirmado(a)' +
        (dup.motivo === 'documento' ? ' com esse documento.' : '.'));
    }

    const row = {
      id: Utilities.getUuid(),
      timestamp: new Date(),
      status: STATUS_CONFIRMED,
      nome: person.nome,
      crianca: person.crianca ? 'Sim' : 'Não',
      idade: person.idade,
      docTipo: person.docTipo,
      documento: person.documento,
      telefone: '',
      email: '',
      restricoes: str(input.restricoes, 300),
      mensagem: '(adicionado pelos noivos)',
      canceladoEm: '',
    };

    if (familyCode) {
      const members = rows.filter((r) => String(r.familia).toUpperCase() === familyCode);
      if (!members.length) throw userError('Família ' + familyCode + ' não encontrada.');
      const rep = members.filter((r) => r.papel === ROLE_REP)[0] || members[0];
      row.familia = rep.familia;
      row.papel = ROLE_MEMBER;
      row.representante = rep.nome;
    } else {
      row.familia = newFamilyCode(sheet);
      row.papel = ROLE_REP;
      row.representante = person.nome;
      row.telefone = str(input.telefone, 30) ? validatePhone(input.telefone) : '';
      row.email = validateEmail(input.email);
    }

    appendRows(sheet, [row]);
    return { ok: true, familia: row.familia, id: row.id };
  });
}

/** Os noivos apagam pessoas da planilha (a linha some de vez). */
function adminDelete(password, ids) {
  checkPassword(password);
  const wanted = Array.isArray(ids) ? ids.map(String) : [];
  if (!wanted.length) throw userError('Nenhuma pessoa selecionada.');

  return withLock(() => {
    const sheet = getSheet();
    const byId = {};
    readRows(sheet).forEach((r) => (byId[r.id] = r));
    if (wanted.some((id) => !byId[id])) {
      throw userError('Alguém já foi alterado na planilha. Clique em Atualizar e tente de novo.');
    }
    // Apaga de baixo para cima para os números das linhas não mudarem.
    wanted
      .map((id) => byId[id]._row)
      .sort((a, b) => b - a)
      .forEach((row) => sheet.deleteRow(row));
    return { ok: true, apagados: wanted.length };
  });
}

function checkPassword(password) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!expected) throw userError('Senha não configurada no servidor.');

  const cache = CacheService.getScriptCache();
  const failures = Number(cache.get('failed_logins') || 0);
  if (failures >= MAX_FAILED_LOGINS) {
    throw userError('Muitas tentativas. Aguarde 15 minutos.');
  }

  if (!safeEquals(String(password || ''), expected)) {
    cache.put('failed_logins', String(failures + 1), LOCKOUT_SECONDS);
    Utilities.sleep(800);
    throw userError('Senha incorreta.');
  }
}

function throttleLookups() {
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get('lookups') || 0);
  if (count >= MAX_LOOKUPS) {
    throw userError('Muitas consultas no momento. Tente novamente em alguns minutos.');
  }
  cache.put('lookups', String(count + 1), LOOKUP_WINDOW_SECONDS);
}

// ---------------------------------------------------------------------------
// Planilha
// ---------------------------------------------------------------------------

function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, COLUMNS.length)
      .setValues([COLUMNS.map(([, header]) => header)])
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    ensureHeaders(sheet);
  }
  return sheet;
}

/** Escreve cabeçalhos de colunas novas em planilhas criadas antes delas. */
function ensureHeaders(sheet) {
  const range = sheet.getRange(1, 1, 1, COLUMNS.length);
  const current = range.getValues()[0];
  if (current.every((v, i) => v !== '' || !COLUMNS[i])) return;
  range.setValues([COLUMNS.map(([, header], i) => current[i] || header)]).setFontWeight('bold');
}

/** Lê todas as linhas como objetos; `_row` guarda o número da linha. */
function readRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet
    .getRange(2, 1, lastRow - 1, COLUMNS.length)
    .getValues()
    .map((values, i) => {
      const r = { _row: i + 2 };
      COLUMNS.forEach(([key], c) => (r[key] = values[c]));
      r.id = String(r.id);
      r.status = normalizeStatus(r.status);
      r.docTipo = String(r.docTipo).trim().toUpperCase();
      r.documento = String(r.documento);
      return r;
    })
    .filter((r) => r.nome !== '');
}

/** Aceita o status digitado à mão na planilha ("cancelado", "CANCELADO"...). */
function normalizeStatus(v) {
  const s = nameKey(v);
  if (s.indexOf('cancel') === 0) return STATUS_CANCELLED;
  if (s.indexOf('confirm') === 0) return STATUS_CONFIRMED;
  return String(v).trim();
}

function newFamilyCode(sheet) {
  const used = {};
  readRows(sheet).forEach((r) => (used[r.familia] = true));
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = 'AF-';
    for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (used[code]);
  return code;
}

function columnIndex(key) {
  return COLUMNS.findIndex(([k]) => k === key);
}

function toCell(key, value) {
  if (value instanceof Date) return value;
  let s = String(value == null ? '' : value);
  // Documento e telefone ficam como texto (sem virar número) e nada que o
  // convidado digitar é interpretado como fórmula.
  if (key === 'documento' || key === 'telefone' || /^[=+\-@\t\r]/.test(s)) {
    if (s) s = "'" + s;
  }
  return s;
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Documentos e nomes
// ---------------------------------------------------------------------------

function parseDocType(v) {
  const tipo = String(v || '').toUpperCase();
  return DOC_TYPES.indexOf(tipo) >= 0 ? tipo : 'CPF';
}

function docLabel(docTipo) {
  return docTipo === 'PASSAPORTE' ? 'Passaporte' : docTipo;
}

/** Formata o documento para gravar; devolve '' se for inválido. */
function formatDocument(docTipo, raw) {
  if (docTipo === 'CPF') {
    const d = digits(raw);
    if (!isValidCpf(d)) return '';
    return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
  }
  // RG e passaporte variam muito (por estado/país): letras e números.
  const doc = String(raw).toUpperCase().replace(/[^0-9A-Z]/g, '');
  const max = docTipo === 'PASSAPORTE' ? 20 : 14;
  if (doc.length < 5 || doc.length > max || !/\d/.test(doc)) return '';
  return doc;
}

/** Chave usada para comparar documentos (ignora pontuação). */
function docKey(docTipo, documento) {
  const tipo = String(docTipo || '').toUpperCase();
  const clean = String(documento || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!clean || DOC_TYPES.indexOf(tipo) < 0) return '';
  return tipo + ':' + clean;
}

/**
 * Chave usada para comparar nomes: sem acento, minúsculo, espaços únicos.
 * Aceita letras de qualquer alfabeto (convidados estrangeiros).
 */
function nameKey(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidCpf(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (let len = 9; len <= 10; len++) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(d[len])) return false;
  }
  return true;
}

/** "Maria Silva Souza" -> "Maria S." (para não expor nomes completos). */
function maskName(nome) {
  const parts = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[parts.length - 1][0].toUpperCase() + '.';
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function str(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function digits(s) {
  return String(s == null ? '' : s).replace(/\D/g, '');
}

function safeEquals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function userError(message) {
  const err = new Error(message);
  err.userMessage = message;
  return err;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Rode uma vez pelo editor para criar a aba e autorizar o script. */
function setup() {
  getSheet();
}

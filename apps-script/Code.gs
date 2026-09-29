/**
 * Backend das confirmações do casamento de Aquiles & Flavia.
 *
 * Roda como Web App do Google Apps Script vinculado a uma Google Planilha.
 * As respostas ficam na aba "Confirmacoes" da planilha, que só os noivos acessam.
 *
 * Configuração obrigatória (Configurações do projeto > Propriedades do script):
 *   ADMIN_PASSWORD = senha da área dos noivos
 */

const SHEET_NAME = 'Confirmacoes';
const MAX_COMPANIONS = 5;

// Ordem das colunas na planilha.
const COLUMNS = [
  ['timestamp', 'Data/Hora'],
  ['nome', 'Nome'],
  ['telefone', 'Telefone'],
  ['email', 'E-mail'],
  ['presenca', 'Presença'],
  ['acompanhantes', 'Acompanhantes'],
  ['totalPessoas', 'Total de pessoas'],
  ['nomesAcompanhantes', 'Nomes dos acompanhantes'],
  ['restricoes', 'Restrições alimentares'],
  ['mensagem', 'Mensagem'],
];

// Proteção contra tentativa de senha por força bruta.
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_SECONDS = 15 * 60;

function doGet() {
  return json({ ok: true, service: 'rsvp-aquiles-flavia' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'rsvp':
        return json(saveRsvp(body.data || {}));
      case 'list':
        return json(listRsvps(body.password));
      default:
        return json({ ok: false, error: 'Ação inválida.' });
    }
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: err.userMessage || 'Erro no servidor.' });
  }
}

// ---------------------------------------------------------------------------
// Confirmação
// ---------------------------------------------------------------------------

function saveRsvp(input) {
  const rsvp = validate(input);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet();
    const phoneCol = columnIndex('telefone');
    const lastRow = sheet.getLastRow();

    // Mesmo telefone = mesma pessoa: atualiza em vez de duplicar.
    let targetRow = -1;
    if (lastRow > 1) {
      const phones = sheet.getRange(2, phoneCol + 1, lastRow - 1, 1).getValues();
      const needle = digits(rsvp.telefone);
      for (let i = 0; i < phones.length; i++) {
        if (digits(phones[i][0]) === needle) {
          targetRow = i + 2;
          break;
        }
      }
    }

    const row = COLUMNS.map(([key]) => toCell(key, rsvp[key]));
    if (targetRow > 0) {
      sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
    return { ok: true, updated: targetRow > 0 };
  } finally {
    lock.releaseLock();
  }
}

function validate(input) {
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

  const nome = str(input.nome, 100);
  if (nome.length < 2) throw userError('Informe seu nome.');

  const telefone = str(input.telefone, 30);
  const phoneDigits = digits(telefone);
  if (phoneDigits.length < 10 || phoneDigits.length > 13) {
    throw userError('Informe um telefone válido com DDD.');
  }

  const presenca = input.presenca === 'sim' ? 'sim' : input.presenca === 'nao' ? 'nao' : '';
  if (!presenca) throw userError('Informe se vai comparecer.');

  let acompanhantes = 0;
  if (presenca === 'sim') {
    acompanhantes = Math.floor(Number(input.acompanhantes) || 0);
    acompanhantes = Math.max(0, Math.min(MAX_COMPANIONS, acompanhantes));
  }

  const email = str(input.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw userError('E-mail inválido.');
  }

  return {
    timestamp: new Date(),
    nome: nome,
    telefone: telefone,
    email: email,
    presenca: presenca,
    acompanhantes: acompanhantes,
    totalPessoas: presenca === 'sim' ? 1 + acompanhantes : 0,
    nomesAcompanhantes: acompanhantes > 0 ? str(input.nomesAcompanhantes, 500) : '',
    restricoes: presenca === 'sim' ? str(input.restricoes, 300) : '',
    mensagem: str(input.mensagem, 1000),
  };
}

// ---------------------------------------------------------------------------
// Área dos noivos
// ---------------------------------------------------------------------------

function listRsvps(password) {
  checkPassword(password);

  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, rsvps: [] };

  const values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  const rsvps = values
    .filter((row) => row.some((v) => v !== ''))
    .map((row) => {
      const obj = {};
      COLUMNS.forEach(([key], i) => {
        let v = row[i];
        if (v instanceof Date) v = v.toISOString();
        if (key === 'presenca') v = String(v).toLowerCase().startsWith('s') ? 'sim' : 'nao';
        obj[key] = v;
      });
      return obj;
    });

  return { ok: true, rsvps: rsvps };
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

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS.map(([, header]) => header));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
  }
  return sheet;
}

function columnIndex(key) {
  return COLUMNS.findIndex(([k]) => k === key);
}

function toCell(key, value) {
  if (value instanceof Date || typeof value === 'number') return value;
  let s = String(value == null ? '' : value);
  if (key === 'presenca') return s === 'sim' ? 'Sim' : 'Não';
  // Impede que texto digitado pelo convidado seja interpretado como fórmula
  // e mantém o telefone como texto (sem virar número).
  if (/^[=+\-@\t\r]/.test(s) || key === 'telefone') s = "'" + s;
  return s;
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

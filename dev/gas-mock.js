// Simula os serviços do Google Apps Script usados pelo apps-script/Code.gs,
// para rodar o backend localmente (testes e servidor de desenvolvimento).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = this.sheet.data[this.row - 1 + r] || [];
      const vals = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = line[this.col - 1 + c];
        vals.push(v === undefined ? "" : v);
      }
      out.push(vals);
    }
    return out;
  }
  setValues(values) {
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.set(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) {
    this.sheet.set(this.row, this.col, v);
    return this;
  }
  setFontWeight() {
    return this;
  }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.data = [];
    this.raw = []; // valores exatamente como o script mandou gravar
  }
  set(row, col, v) {
    while (this.data.length < row) this.data.push([]);
    while (this.raw.length < row) this.raw.push([]);
    this.raw[row - 1][col - 1] = v;
    // Como no Google Planilhas, o apóstrofo inicial só força texto e some.
    if (typeof v === "string" && v.startsWith("'")) v = v.slice(1);
    this.data[row - 1][col - 1] = v;
  }
  getLastRow() {
    return this.data.length;
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    return new FakeRange(this, row, col, numRows, numCols);
  }
  appendRow(values) {
    this.getRange(this.data.length + 1, 1, 1, values.length).setValues([values]);
  }
  setFrozenRows() {}
}

function createBackend({ password = "senha-teste" } = {}) {
  const sheets = {};
  const cache = {};
  const spreadsheet = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = new FakeSheet(n)),
  };

  const context = {
    console,
    SpreadsheetApp: { openById: () => spreadsheet, getActiveSpreadsheet: () => spreadsheet },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => (k === "ADMIN_PASSWORD" ? password : null) }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cache ? cache[k] : null),
        put: (k, v) => (cache[k] = v),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { sleep() {}, getUuid: () => crypto.randomUUID() },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (text) => ({ setMimeType: () => ({ getContent: () => text }) }),
    },
  };
  vm.createContext(context);
  const code = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
  vm.runInContext(code, context, { filename: "Code.gs" });

  return {
    /** Faz um POST como o site faria e devolve o JSON da resposta. */
    post(payload) {
      const out = context.doPost({ postData: { contents: JSON.stringify(payload) } });
      return JSON.parse(out.getContent());
    },
    sheet: () => sheets.Confirmacoes,
    clearCache: () => Object.keys(cache).forEach((k) => delete cache[k]),
  };
}

module.exports = { createBackend };

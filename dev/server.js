// Servidor de desenvolvimento: serve o site e simula o backend do Google.
// Uso: node dev/server.js   (abre em http://localhost:8000, senha dos noivos: "teste")
const http = require("http");
const fs = require("fs");
const path = require("path");
const { createBackend } = require("./gas-mock");

const PORT = Number(process.env.PORT || 8000);
const ROOT = path.join(__dirname, "..");
const backend = createBackend({ password: process.env.ADMIN_PASSWORD || "teste" });

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "POST" && url.pathname === "/api") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let out;
        try {
          out = backend.post(JSON.parse(body || "{}"));
        } catch (e) {
          out = { ok: false, error: "JSON inválido." };
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out));
      });
      return;
    }

    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("Não encontrado");
      return;
    }
    let content = fs.readFileSync(file);
    // Aponta o site para o backend simulado.
    if (rel === "assets/js/config.js") {
      content = content.toString().replace(/apiUrl:\s*"[^"]*"/, 'apiUrl: "/api"');
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(content);
  })
  .listen(PORT, () => console.log(`Site em http://localhost:${PORT} (senha dos noivos: "teste")`));

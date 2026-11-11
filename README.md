# Aquiles & Flavia: confirmação de presença

Site do casamento com confirmação de presença por família, consulta e
cancelamento, e uma **área dos noivos** protegida por senha.

## Como funciona

```
Convidado ──► Site (GitHub Pages) ──► Google Apps Script ──► Google Planilha
                                            ▲
Noivos ──► admin.html + senha ──────────────┘ (senha verificada no servidor)
```

- **Site** (`index.html`, `admin.html`, `assets/`): HTML/CSS/JS puro, sem build.
- **Backend** (`apps-script/Code.gs`): Web App gratuito do Google que grava na
  aba `Confirmacoes` da planilha dos noivos.
- **Área dos noivos** (`admin.html`): só mostra a lista se o servidor validar a
  senha. A senha fica no Apps Script, nunca no código do site.

### Regras da confirmação

- **Representante da família**: uma pessoa confirma por todos. Só ela informa
  telefone e e-mail.
- **Documento (CPF ou RG) de cada pessoa**: é o que impede confirmar a mesma
  pessoa duas vezes. O CPF é validado pelos dígitos verificadores.
- **Crianças (até 12 anos)** podem ir sem documento.
- **Duplicidade**: uma pessoa é recusada se o documento **ou** o nome (ignorando
  acentos e maiúsculas) já estiver confirmado. O site mostra qual pessoa foi
  recusada e em qual família ela já está.
- **Consultar ou cancelar**: com o documento do representante, dá para ver e
  cancelar qualquer pessoa da família; com o de um acompanhante, só a própria
  presença. Os nomes aparecem abreviados ("Maria S.") para não expor ninguém.
- **Cancelar não apaga**: a linha fica com status `Cancelado` e a data. A pessoa
  pode confirmar de novo depois.

### Presente (Pix)

A seção "Presenteie os noivos" gera o **Pix Copia e Cola** e o **QR Code** no
próprio navegador (padrão BR Code do Banco Central), com valor livre, valores
sugeridos ou um valor digitado pelo convidado. A chave, o nome, a cidade e os
valores sugeridos ficam em `pix` no [`assets/js/config.js`](assets/js/config.js).
Deixar `key` vazio esconde a seção.

O gerador de QR Code (`assets/vendor/qrcode-generator-1.4.4.js`, licença MIT)
fica dentro do site, sem depender de CDN.

### A planilha

Cada linha é **uma pessoa**. Colunas: ID, Código da família, Data/Hora, Status,
Nome, Tipo (Representante/Acompanhante), Criança, Tipo de documento, Documento,
Representante, Telefone, E-mail, Restrições alimentares, Mensagem, Cancelado em.

Vocês podem editar à mão: trocar o Status para `Cancelado` libera aquela pessoa
para confirmar de novo. Não mudem a ordem das colunas nem o ID.

> ⚠️ **A planilha vai guardar CPF/RG e telefone dos convidados.** Ela precisa ser
> **privada**: em *Compartilhar*, deixe "Acesso geral: **Restrito**" e adicione só
> vocês dois. O script não precisa que a planilha seja pública.

## Configuração do backend (uns 10 minutos)

O ID da planilha de vocês já está no `apps-script/Code.gs`.

1. Abra a planilha e vá em **Extensões > Apps Script**.
2. Apague o conteúdo de `Code.gs` e cole o conteúdo de [`apps-script/Code.gs`](apps-script/Code.gs).
3. Clique na engrenagem **Configurações do projeto > Propriedades do script >
   Adicionar propriedade**:
   - Propriedade: `ADMIN_PASSWORD`
   - Valor: a senha que vocês dois vão usar (use uma senha forte).
4. No editor, selecione a função `setup` e clique em **Executar**. Autorize o acesso
   quando o Google pedir. Isso cria a aba `Confirmacoes`.
5. **Implantar > Nova implantação > Tipo: App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
6. Copie a URL gerada (termina em `/exec`) e coloque em `apiUrl` no
   [`assets/js/config.js`](assets/js/config.js).

> Se alterar o `Code.gs` depois, use **Implantar > Gerenciar implantações > Editar >
> Nova versão** para manter a mesma URL.

Enquanto `apiUrl` estiver vazio, o formulário aparece desativado com o aviso
"As confirmações abrem em breve".

## Publicação

Cada push na `main` publica o site no GitHub Pages pelo workflow
`.github/workflows/pages.yml` (só `index.html`, `admin.html` e `assets/` vão
para o ar). Endereço: `https://aquiiiles.github.io/Aquiles-Flavia/`.

## Desenvolvimento local

Precisa só de Node.js (18+). O backend roda localmente com uma simulação dos
serviços do Google (`dev/gas-mock.js`), usando o mesmo `Code.gs`.

```bash
npm test          # testes do backend e do gerador de Pix
npm run dev       # site + backend simulado em http://localhost:8000
                  # senha da área dos noivos: "teste"
```

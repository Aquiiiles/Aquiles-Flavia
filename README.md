# Aquiles & Flavia: confirmação de presença

Site do casamento, com formulário de confirmação (RSVP) e uma **área dos noivos**
protegida por senha, onde só Aquiles e Flavia veem quem confirmou.

## Como funciona

```
Convidado ──► Site (GitHub Pages) ──► Google Apps Script ──► Google Planilha
                                            ▲
Noivos ──► admin.html + senha ──────────────┘ (senha verificada no servidor)
```

- **Site** (`index.html`, `admin.html`, `assets/`): HTML/CSS/JS puro, sem build.
- **Backend** (`apps-script/Code.gs`): Web App gratuito do Google que grava as
  respostas numa planilha **privada** de vocês.
- **Área dos noivos** (`admin.html`): pede a senha e só recebe a lista se o
  servidor validar. A senha fica guardada no Apps Script, nunca no código do site.
  Após 10 senhas erradas, o login é bloqueado por 15 minutos.
- Se o convidado responder de novo com o **mesmo telefone**, a resposta anterior
  é atualizada (não duplica).

A área dos noivos mostra: total de pessoas confirmadas, quantos vão e quantos não
vão, filtro, busca, e botão para exportar CSV (abre no Excel).

## Configuração (uns 10 minutos)

### 1. Planilha + backend

1. Crie uma planilha nova em <https://sheets.new> (ex.: "Casamento - Confirmações").
   Compartilhe **só** com a Flavia.
2. Na planilha: **Extensões > Apps Script**.
3. Apague o conteúdo de `Code.gs` e cole o conteúdo de [`apps-script/Code.gs`](apps-script/Code.gs).
4. Clique na engrenagem **Configurações do projeto > Propriedades do script >
   Adicionar propriedade**:
   - Propriedade: `ADMIN_PASSWORD`
   - Valor: a senha que vocês dois vão usar (escolha uma forte).
5. No editor, selecione a função `setup` e clique em **Executar**. Autorize o acesso
   quando o Google pedir (isso cria a aba `Confirmacoes`).
6. **Implantar > Nova implantação > Tipo: App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
7. Copie a URL gerada (termina em `/exec`).

> Se alterar o `Code.gs` depois, use **Implantar > Gerenciar implantações > Editar >
> Nova versão** para manter a mesma URL.

### 2. Site

Edite [`assets/js/config.js`](assets/js/config.js):

- `apiUrl`: cole a URL do passo 7;
- data, horário, local, link do mapa, traje e prazo de confirmação.

### 3. Publicar no GitHub Pages

1. No GitHub: **Settings > Pages > Source: GitHub Actions**.
2. Faça merge na branch `main`. O workflow `.github/workflows/pages.yml` publica o site.
3. O endereço fica em `https://<usuario>.github.io/<repositorio>/`.
   A área dos noivos fica em `.../admin.html` (tem um link discreto no rodapé).

## Testando localmente

Sem `apiUrl` configurada, o site roda em **modo demonstração**: as respostas ficam
só no seu navegador e a senha da área dos noivos é `demo`.

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Segurança

- A senha **não** está no código do site; é comparada no Apps Script.
- A planilha só é acessível pelas contas Google que vocês escolherem.
- Textos dos convidados são exibidos com `textContent` (sem risco de injetar HTML)
  e gravados na planilha de forma que não virem fórmulas.
- O formulário tem um campo invisível (honeypot) para barrar robôs.
- Qualquer pessoa com a URL do Apps Script consegue **enviar** uma confirmação
  (é o que o formulário faz), mas **ler** a lista exige a senha.

# Visão geral do projeto

Este documento resume o que fizemos e por quê, pra servir de guia na hora de explicar o trabalho — não repete os detalhes técnicos dos arquivos `01` a `08`, só amarra tudo numa narrativa.

## 1. O que o projeto faz

Um site estático (dashboard) hospedado no Cloudflare Pages, com login via **Google** e **GitHub** usando OAuth 2.0. Depois de logado, o usuário vê nome/e-mail/provedor na tela e pode sair. Toda a parte de autenticação roda em **Cloudflare Pages Functions** (JavaScript rodando na borda, sem servidor próprio) e guarda sessões num banco **D1** (SQLite gerenciado pela Cloudflare).

## 2. Por que essa arquitetura

- **Cloudflare Pages** serve os arquivos estáticos (`public/`) e publica automaticamente a cada `git push` — não precisamos rodar nada localmente (Node, npm, Wrangler) nem manter servidor.
- **Pages Functions** (`functions/`) são o único jeito de rodar código no servidor nesse modelo: cada arquivo em `functions/` vira uma rota. É lá que ficam `client_secret`, chamadas pros provedores OAuth e acesso ao banco — nada disso pode ficar no código que roda no navegador.
- **D1** guarda as sessões e as transações de login temporárias. Escolhemos D1 (e não `localStorage`/cookies com os dados) porque o cliente nunca deve saber ou guardar informação sensível — só um identificador opaco.

## 3. Por que os arquivos estáticos continuam públicos

Essa é uma pergunta que o critério de aceitação pede pra gente conseguir responder. A resposta curta: **arquivo estático público não é o problema — dado sensível acessível é.**

O HTML/CSS/JS em `public/` (o `index.html`, o `app.js`) não têm nenhum segredo dentro — só a lógica de interface, que chama `/api/me` pra saber se tem sessão ou não. Esconder esses arquivos atrás de login não aumentaria a segurança nem um pouco: eles são só a "casca" da aplicação, iguais pra qualquer visitante, logado ou não. Quem decide o que cada pessoa pode ver é sempre o **servidor** (as Functions), consultando o banco a cada pedido — nunca o navegador. Se alguém abrir o `app.js` no DevTools, não acha nada que ajude a se autenticar como outra pessoa; ele só vai ver a mesma chamada `fetch('/api/me')` que qualquer um veria.

Em resumo: autenticação protege **dados e ações** (a sessão, o perfil, o logout), não **código de interface**. Misturar as duas coisas (esconder arquivo estático) é uma falsa sensação de segurança e, nesse modelo (Cloudflare Pages), nem seria possível sem tirar a Function do caminho.

## 4. O fluxo de login, passo a passo

1. Usuário clica em "Entrar com Google" ou "Entrar com GitHub" → `GET /oauth/login/:provider`.
2. A Function gera um `state` (contra CSRF) e, no caso do Google, também um `code_verifier`/`code_challenge` (PKCE `S256`) e um `nonce` (pro `id_token`). Salva tudo isso numa transação temporária no D1 e manda só um **id opaco** pro navegador, num cookie `__Host-oauth-tx` (`HttpOnly`, `Secure`, `SameSite=Lax`, expira em 10 min).
3. Redireciona pro provedor (`accounts.google.com` ou `github.com`) com `response_type=code` — nunca `client_secret` na URL.
4. O usuário autoriza lá, e o provedor redireciona de volta pra `/oauth/callback/:provider?code=...&state=...`.
5. A Function busca a transação pelo cookie, confere `state`, apaga a transação (uso único — ver Caso 3 do `07`), troca o `code` pelos tokens (aí sim usando o `client_secret`, só nessa chamada servidor-a-servidor) e:
   - **Google:** valida o `id_token` (assinatura RS256 via JWKS, `iss`, `aud`, `exp`, `nonce` — ver `functions/_shared/oidc.js`);
   - **GitHub:** usa o `access_token` só pra consultar `/user` e revoga na hora, antes de criar a sessão (não guarda token nenhum).
6. Cria uma sessão no D1 (guardando o **hash** de um id aleatório, não o valor bruto) e manda esse id pro navegador num cookie `__Host-session` (`HttpOnly`, `Secure`, `SameSite=Strict`, sem `Domain`).
7. `app.js` chama `/api/me`, que confere o cookie contra o D1 e devolve só `{ authenticated, issuer, email, displayName }` — nunca token nenhum.
8. No logout (`POST /oauth/logout`), a Function confere o `Origin`, apaga a sessão do D1 e expira o cookie.

## 5. Por que cada peça de segurança está aí

- **PKCE (`S256`) + `state` + `nonce`:** protegem contra interceptação do `code` e contra CSRF/replay no login — sem eles, alguém poderia forjar um retorno de login.
- **Transação de uso único no D1:** o `code`/`state` só servem uma vez (apagamos a transação assim que o callback chega) — mesmo que alguém capture a URL de retorno, não consegue reusar.
- **`client_secret` só no servidor:** nunca aparece em URL, HTML ou resposta pro navegador — só nas chamadas Function → Google/GitHub.
- **Cookies `__Host-`:** o prefixo `__Host-` força `Secure`, `Path=/` e proíbe `Domain`, o que evita que um subdomínio comprometido finja ser o cookie da aplicação.
- **Sessão como hash no D1:** mesmo que alguém veja o banco, não recupera o cookie original (hash é uma via só) — só o servidor, que tem o cookie de verdade, consegue provar a sessão.
- **GitHub: token revogado antes da sessão existir** (correção que fizemos durante os testes): o token do GitHub só serve pra uma consulta (`/user`); guardá-lo seria um risco desnecessário, então revogamos a autorização assim que terminamos de usá-lo.
- **`Origin` conferido no logout** (outra correção que fizemos, ver Caso 5 do `07`): sem isso, um site malicioso poderia disparar um logout por CSRF — pouco grave nesse caso, mas ainda assim uma falha real que corrigimos.

## 6. O que os testes de falha (`07`) provam

Não bastava mostrar o login funcionando — cada teste prova que uma tentativa de burlar o fluxo é **recusada**:

| Caso | O que tenta quebrar | Por que falha |
|---|---|---|
| 1 | Callback sem ter passado pelo login | Sem cookie de transação, a Function não sabe a quem o `code` pertence |
| 2 | `state` trocado na URL | Não bate com o hash salvo na transação |
| 3 | Reusar o mesmo `code`/`state` duas vezes | Transação é apagada do D1 assim que o callback chega |
| 4 | Sessão com `expires_at` vencido | `/api/me` compara com o horário atual e recusa |
| 5 | Logout disparado de outra origem (CSRF) | Function confere o header `Origin` e recusa se for diferente |
| 6 | Reusar o cookie de sessão depois do logout | A sessão foi apagada do D1 — não existe mais o que validar |

## 7. Perguntas que o professor pode fazer (e respostas curtas)

- **"Por que os arquivos estáticos continuam acessíveis sem login?"** → Seção 3 acima: eles não têm segredo nenhum; quem protege dado é a Function, não o hospedeiro de arquivo.
- **"Onde fica o `client_secret`?"** → Só em variáveis de ambiente das Functions, usado unicamente nas chamadas de troca de token e (no caso do GitHub) de revogação — nunca enviado ao navegador.
- **"O que o D1 guarda sobre o usuário?"** → Um hash do identificador de sessão, o provedor, o `subject` (id do usuário no provedor), e-mail/nome pra exibir, e os horários de criação/expiração. Nunca o cookie em texto puro nem tokens de acesso.
- **"O que acontece se eu roubar o cookie de sessão de alguém?"** → Enquanto a sessão não expira/não é revogada, funcionaria — por isso o cookie é `HttpOnly` (JS não lê), `Secure` (só HTTPS) e `SameSite=Strict` (não é enviado em pedidos de outro site), o que dificulta bastante o roubo em primeiro lugar.
- **"Por que Google usa PKCE e GitHub não?"** → O fluxo clássico de OAuth do GitHub (`scope=read:user`) não oferece PKCE; a proteção contra CSRF ali fica por conta do `state`. Documentamos isso no `06`.
- **"Como vocês descobriram e corrigiram falhas?"** → Testando ativamente contra a aplicação em produção (`07`) — por exemplo, achamos que o logout não conferia `Origin` e que o token do GitHub ficava guardado além da hora, e corrigimos os dois.

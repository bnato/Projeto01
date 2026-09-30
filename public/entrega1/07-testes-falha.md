# Testes de falha

Testei os 6 cenários pedidos direto na aplicação em produção (`https://projeto01-j0i.pages.dev`), a maioria via `curl` no terminal (pra conseguir controlar exatamente o que estava sendo enviado) e os últimos dois direto no navegador. Os valores de `state`, `code_challenge` e cookies foram substituídos por `[REMOVIDO]`.

## Caso 1 — retorno sem o cookie temporário

**Preparação:** sem passar antes por `/oauth/login/google`, ou seja, sem o cookie `__Host-oauth-tx` no navegador/cliente.

**Pedido enviado:**
```
GET /oauth/callback/google?code=fake&state=fake
```
(sem enviar o cookie `__Host-oauth-tx`)

**Resultado esperado:** a aplicação não deve aceitar o callback sem saber a qual transação de login ele pertence.

**Resultado observado:**
```
HTTP/2 400
Sessao de login expirada ou ausente
```
Sem o cookie de transação, a função nem tenta validar `code`/`state` — corta o fluxo na hora.

## Caso 2 — state alterado

**Preparação:** iniciei um login real (`/oauth/login/google`) até ter um cookie de transação válido salvo no D1.

**Pedido enviado:**
```
GET /oauth/callback/google?code=...&state=valor_diferente_do_salvo
```

**Resultado esperado:** o `state` da URL precisa bater com o que foi salvo quando a transação começou; se não bater, deve ser rejeitado.

**Resultado observado:**
```
HTTP/2 400
Parametro state invalido
```

## Caso 3 — reutilização da transação

**Preparação:** mesmo cookie de transação e `state` válidos, usados duas vezes seguidas.

**Pedido enviado:**
1ª chamada com `code` inválido (não veio de um login real):
```
GET /oauth/callback/google?code=fake&state=<state_valido>
```
Depois, repeti a mesma URL/cookie exatamente igual.

**Resultado esperado:** depois da primeira tentativa (mesmo que ela falhe), a transação não deve poder ser usada de novo.

**Resultado observado:**
- 1ª chamada: `HTTP/2 502` (o `code` era falso, então a troca por token falhou lá na frente — mas a transação já tinha sido apagada do D1 nesse momento, antes mesmo de saber se o code era bom).
- 2ª chamada (replay): `HTTP/2 400` — `Transacao OAuth invalida ou expirada`.

A transação é apagada do banco assim que o callback é recebido, então não dá pra reaproveitar um `code`/`state` capturado.

## Caso 4 — sessão expirada

**Preparação:** sessão real, autenticada via GitHub, e depois forcei a expiração direto no banco D1 (`UPDATE sessions SET expires_at = 0 WHERE ...`, rodado no console do D1).

**Pedido enviado:** recarregar a página / chamar `GET /api/me` com o cookie de sessão ainda no navegador.

**Resultado esperado:** com `expires_at` no passado, a sessão deve ser tratada como inválida.

**Resultado observado:**
```sql
SELECT id_hash, issuer, expires_at FROM sessions ORDER BY created_at DESC LIMIT 1;
→ [REMOVIDO] | https://github.com | [REMOVIDO]

UPDATE sessions SET expires_at = 0 WHERE id_hash = (SELECT id_hash FROM sessions ORDER BY created_at DESC LIMIT 1);
→ query executada com sucesso
```
Recarreguei a página logo em seguida (mesmo cookie de sessão ainda no navegador) e ela voltou para a tela de login (`Entrar com Google` / `Entrar com GitHub`) em vez de mostrar o usuário autenticado — ou seja, `/api/me` passou a responder `401 {"authenticated": false}` assim que `expires_at` ficou no passado, exatamente como o código de `functions/api/me.js` prevê.

## Caso 5 — origem inválida na saída (logout)

**Preparação:** sessão real autenticada, aberta em uma aba. Em outra aba, `https://example.com` (origem diferente).

**Pedido enviado:** no console do navegador, a partir de `https://example.com`:
```js
fetch('https://projeto01-j0i.pages.dev/oauth/logout', { method: 'POST', credentials: 'include' })
```

**Resultado esperado:** a rota deve recusar a operação quando a origem for diferente da do próprio site.

**Resultado observado:** a chamada pelo navegador falhou (`TypeError: Failed to fetch`), efeito combinado de CORS e do `SameSite=Strict` do cookie de sessão, que o Chrome nem chega a anexar numa requisição de outra origem. Voltando na aba com a sessão real e recarregando a página, continuei autenticado normalmente — a tentativa cross-site não teve efeito nenhum na sessão.

Só que, na primeira versão, testando via `curl` com um `Origin: https://example.com` forjado direto na API (sem passar pelas regras do navegador), a rota respondia 302 normalmente — ou seja, o servidor não estava de fato checando o `Origin`, só existia a proteção do lado do navegador (`SameSite=Strict`). Corrigi `functions/oauth/logout.js` conforme o enunciado: agora a rota **exige** o cabeçalho `Origin` e só aceita um valor exatamente igual a `PUBLIC_BASE_URL`; sem `Origin` ou com outra origem, responde 403 antes de tocar no D1. A resposta também usa `Cache-Control: no-store`.

Depois do deploy, repeti o teste no terminal (PowerShell, 30/09/2026). Nenhuma das chamadas envia cookie de sessão, então nenhuma sessão real foi afetada:

```powershell
$u="https://projeto01-j0i.pages.dev/oauth/logout"
"Origin example.com: " + (curl.exe -s -o NUL -w "%{http_code}" -X POST -H "Origin: https://example.com" $u)
"Sem Origin:         " + (curl.exe -s -o NUL -w "%{http_code}" -X POST $u)
"Origin do site:     " + (curl.exe -s -o NUL -w "%{http_code}" -X POST -H "Origin: https://projeto01-j0i.pages.dev" $u)
```

```
Origin example.com: 403
Sem Origin:         403
Origin do site:     302
```

Confirmado: a rota recusa uma origem diferente e também a ausência de `Origin`, e só executa o logout quando o pedido vem da própria origem do site.

## Caso 6 — reutilização do cookie de sessão revogado

**Preparação:** em uma janela anônima, fiz login no site e copiei temporariamente o valor do cookie `__Host-session` pelas DevTools (Application → Cookies). No terminal, guardei o valor numa variável com `Read-Host`, para ele não ficar no histórico do PowerShell nem nesta evidência.

**Pedido enviado:** `GET /api/me` com esse mesmo cookie, antes e depois de clicar em "Sair" no navegador:

```powershell
$c = Read-Host "cookie"   # valor colado manualmente, não registrado
"Antes do logout: " + (curl.exe -s -o NUL -w "%{http_code}" -H "Cookie: __Host-session=$c" https://projeto01-j0i.pages.dev/api/me)
# clique em "Sair" no navegador
"Depois do logout: " + (curl.exe -s -o NUL -w "%{http_code}" -H "Cookie: __Host-session=$c" https://projeto01-j0i.pages.dev/api/me)
Remove-Variable c
```

**Resultado esperado:** mesmo com o valor "certo" do cookie, como a sessão foi removida do D1 no logout, a aplicação deve recusar com 401.

**Resultado observado (30/09/2026):**
```
Antes do logout: 200
Depois do logout: 401
```

O mesmo valor de cookie que abria a sessão passou a ser recusado depois do logout. Isso acontece porque `functions/oauth/logout.js` apaga a linha da sessão no D1 (`DELETE FROM sessions WHERE id_hash = ?`) e `functions/api/me.js` responde 401 quando não encontra uma sessão válida para o resumo do cookie. A cópia do valor foi apagada logo após o teste.

Revisando o código nessa etapa encontrei um problema à parte: o `access_token` do GitHub estava sendo salvo na sessão (coluna `github_access_token`) e só era revogado no logout — isso não batia com o critério de aceitação de que o token só pode ser usado para consultar `/user` e precisa ser revogado antes da sessão ser criada. Corrigi em `functions/oauth/callback/[provider].js`: agora o token é revogado logo depois de consultar `/user`, antes do `INSERT` na tabela `sessions`, e nunca chega a ser gravado no banco. O `logout.js` ficou mais simples, só apagando a sessão e expirando o cookie.

---

Resumo:

| # | Cenário | Resultado esperado | Confirmado |
|---|---------|---------------------|------------|
| 1 | Retorno sem cookie temporário | 400 | Sim |
| 2 | State alterado | 400 | Sim |
| 3 | Reutilização da transação | 400 na 2ª tentativa | Sim |
| 4 | Sessão expirada | Sessão tratada como inválida | Sim |
| 5 | Origem inválida no logout | 403 para Origin diferente ou ausente; sessão original continua válida | Sim (403 / 403 / 302 no teste após a correção) |
| 6 | Reuso de cookie revogado | 401 com o cookie copiado antes do logout | Sim (200 antes do logout, 401 depois) |

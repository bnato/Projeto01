# Testes de falha

Aqui eu testei os principais cenarios de erro do fluxo de OAuth, direto na aplicacao em producao (`https://projeto01-j0i.pages.dev`), usando `curl` pelo terminal. A ideia e provar que o sistema rejeita corretamente tentativas invalidas, e nao so que o "caminho feliz" funciona.

Todos os testes abaixo sao reais, rodei um por um e colei o resultado (status HTTP + corpo da resposta) que o `curl` devolveu.

## 1. Provedor invalido no login

Tentei logar com um provedor que nao existe, tipo `/oauth/login/facebook`.

```
GET /oauth/login/facebook
HTTP/2 400
Provedor OAuth invalido
```

Era pra isso acontecer, porque `getProvider()` so reconhece `google` e `github`. Qualquer outra coisa cai no `if (!provider)` e retorna 400 antes de tentar redirecionar pra lugar nenhum.

## 2. Consultar sessao sem estar logado

Chamei `/api/me` sem nenhum cookie de sessao.

```
GET /api/me
HTTP/2 401
{"authenticated":false}
```

Sem o cookie `__Host-session`, a funcao nem consulta o D1, ja retorna 401 com `authenticated: false`. E esse retorno que o `app.js` usa pra decidir se mostra a tela de login ou a tela de usuario logado.

## 3. Callback sem cookie de transacao

Chamei o callback (`/oauth/callback/google`) direto, sem ter passado antes pelo `/oauth/login/google` — ou seja, sem o cookie `__Host-oauth-tx` no navegador.

```
GET /oauth/callback/google?code=fake&state=fake
HTTP/2 400
Sessao de login expirada ou ausente
```

Sem esse cookie nao tem como saber qual foi a transacao de login que o usuario comecou, entao a funcao corta o fluxo na hora.

## 4. Callback com state incorreto

Aqui eu fiz o login de verdade ate pegar o cookie de transacao, mas troquei o `state` da URL por um valor qualquer (diferente do que foi salvo no D1).

```
GET /oauth/callback/google?code=...&state=valor_errado
HTTP/2 400
Parametro state invalido
```

O `state` que vem na URL e comparado (via hash) com o que foi salvo quando o login comecou. Se nao bate, e sinal de possivel CSRF/replay, e a funcao bloqueia.

## 5. Provedor da URL diferente do provedor da transacao

Comecei um login pelo Google (cookie de transacao criado com `provider: google`), mas usei esse mesmo cookie pra chamar `/oauth/callback/github`.

```
GET /oauth/callback/github?code=...&state=<state_real_do_google>
HTTP/2 400
Provedor da transacao nao confere
```

Mesmo com o `state` certo, a transacao salva diz que era pra ser Google, nao GitHub. Entao a funcao pega essa inconsistencia e recusa.

## 6. Reuso da transacao (replay)

Esse aqui prova que o `code`/`state` so podem ser usados uma vez. Usei o mesmo cookie + state validos duas vezes seguidas:

- 1a chamada: o `code` era falso (nao veio de um login real), entao a troca por token falhou la na frente — mas a transacao ja tinha sido apagada do D1 nesse momento.
  ```
  HTTP/2 502
  ```
- 2a chamada: repeti exatamente a mesma URL (mesmo cookie, mesmo state).
  ```
  HTTP/2 400
  Transacao OAuth invalida ou expirada
  ```

Isso mostra que a transacao e apagada do banco assim que o callback e recebido (antes mesmo de validar se deu certo), entao nao da pra "reaproveitar" um `code` ou `state` capturado, nem por erro nem por ataque.

---

Resumo rapido de todos os testes:

| # | Cenario | Resultado esperado | Confirmado |
|---|---------|---------------------|------------|
| 1 | Provedor invalido no login | 400 | Sim |
| 2 | `/api/me` sem sessao | 401 | Sim |
| 3 | Callback sem cookie de transacao | 400 | Sim |
| 4 | Callback com `state` errado | 400 | Sim |
| 5 | Provedor da URL diferente da transacao | 400 | Sim |
| 6 | Reuso de transacao ja consumida | 400 (na 2a tentativa) | Sim |

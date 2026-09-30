# Projeto01 — Login OAuth em site estático no Cloudflare Pages

Laboratório de autenticação com Google (OIDC) e GitHub (OAuth App) em um único projeto do Cloudflare Pages, publicado em https://projeto01-j0i.pages.dev.

## Estrutura

- `public/` — arquivos estáticos (página de login `index.html`, `app.js`, dashboard de modelo e a pasta `entrega1` com as evidências). Tudo aqui é público.
- `functions/` — Pages Functions executadas na Cloudflare:
  - `oauth/login/[provider].js` — cria a transação (state, PKCE S256 e, no Google, nonce) e redireciona ao provedor;
  - `oauth/callback/[provider].js` — valida a transação, troca o código, confirma a identidade e cria a sessão opaca;
  - `oauth/logout.js` — revoga a sessão local (somente POST com `Origin` igual a `PUBLIC_BASE_URL`);
  - `api/me.js` — devolve o perfil mínimo da sessão;
  - `api/health.js` — verificação da implantação;
  - `_shared/` — funções auxiliares (Web Crypto, cookies, provedores, validação OIDC, respostas HTTP).

Os Client IDs ficam como variáveis e os Client Secrets como segredos criptografados no painel do Pages. Nenhum segredo é versionado. O banco D1 é ligado ao projeto como `DB`.

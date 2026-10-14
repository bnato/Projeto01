# Avaliação: GitHub Actions com IA

Aluno: Gabriel Benato Batistel Correa — Repositório: bnato/Projeto01

## Tarefa 1 — ci.yml

- Execução vermelha (htmlhint reprovou o template HTML): https://github.com/bnato/Projeto01/actions/runs/38470699553
- Execução vermelha (migração com SQL errado, PR #2): https://github.com/bnato/Projeto01/actions/runs/38476852906 — linha do erro no passo "Aplica as migrações D1 em um SQLite local": Parse error near line 1: near "TABL": syntax error
- Execução verde (PR #1, após o conserto): https://github.com/bnato/Projeto01/pull/1
- Por que testar as migrações em SQLite antes do D1: o D1 é SQLite, então um SQL inválido falha em segundos e de graça no CI, em vez de quebrar o banco remoto durante o deploy.

## Tarefa 2 — Proteção da main

- Ruleset exige PR e o status check "verificar"; a API confirma em https://api.github.com/repos/bnato/Projeto01/rules/branches/main
- PR bloqueado (check vermelho) e depois liberado após corrigir o SQL: https://github.com/bnato/Projeto01/pull/2
- Push direto recusado (git push origin main, a partir de um clone local): 
  remote: error: GH013: Repository rule violations found for refs/heads/main.
  remote: - Changes must be made through a pull request.
  remote: - Required status check "verificar" is expected.
  ! [remote rejected] main -> main (push declined due to repository rule violations)

## Tarefa 3 — revisao-ia.yml

O workflow foi criado conforme o enunciado (actions/ai-inference + gh pr comment, com permissions: contents: read e pull-requests: write). No começo a revisão falhou, e a causa não era permissão: (1) com actions/ai-inference@v1 o erro era "Cannot use 'in' operator to search for 'choices' in OK" (a tag @v1 é o caminho antigo da action); (2) com @main o erro virou "Copilot CLI exited with code 1", causado por um COPILOT_PAT inválido (401), então o token foi regenerado e salvo de novo; (3) depois disso o modelo padrão gpt-4.1 não estava disponível para a conta, e a correção foi passar model: '' para o Copilot CLI escolher o próprio modelo. A versão que funciona foi mergeada pelo PR #9 (actions/ai-inference@main, sem models: read, que não era necessário).

- Comentário 1 (código vulnerável, env.DB.prepare(`SELECT * FROM notas WHERE aluno = '${nome}'`)): PR #10, https://github.com/bnato/Projeto01/pull/10, run https://github.com/bnato/Projeto01/actions/runs/38615389412. A IA apontou SQL Injection em functions/api/notas.js:3 e sugeriu usar binding.
- Comentário 2 (correção com prepare("... WHERE aluno = ?").bind(nome)): mesmo PR #10, após o commit 8882c76, run https://github.com/bnato/Projeto01/actions/runs/38615651968. A IA reconheceu que o SQL agora está parametrizado corretamente e levantou outros pontos (falta de autenticação, validação de entrada, SELECT *).
- Erro de permissão: removi pull-requests: write no PR #11, https://github.com/bnato/Projeto01/pull/11, run https://github.com/bnato/Projeto01/actions/runs/38616146077. O passo da IA funcionou, mas o passo "Comenta no PR" falhou com: GraphQL: Resource not accessible by integration (addComment), seguido de Error: Process completed with exit code 1. Sem a permissão o job gera a revisão, mas não consegue publicá-la.

## Tarefa 4 — migrar.yml

- Merge do PR #2 disparou o workflow: https://github.com/bnato/Projeto01/actions/runs/38477604472
- Log: 0001_cria_notas.sql e 0002_adiciona_coluna.sql aplicadas no D1 remoto (ambas com sucesso).
- Saída do PRAGMA table_info(notas), rodada no console do D1 (Cloudflare, banco equipegabrielesophia): colunas id, aluno, disciplina, nota, criado_em e observacao (cid 5, TEXT, aceita nulo). Isso prova que a migração 0002 foi aplicada no banco remoto.
- Merge sem alterar migrations/: os merges dos PRs #3 (c8152ab) e #5 (0dd2362) só mexeram em AVALIACAO.md e rodaram apenas ci e deploy do Pages; a lista de execuções do migrar continua com só 2 (#1 falhou sem segredos, #2 do merge do PR #2): https://github.com/bnato/Projeto01/actions/workflows/migrar.yml

## Perguntas

1. O ci.yml roda duas vezes porque tem os gatilhos push (na branch do PR) e pull_request (no merge simulado com a main). Ambos aparecem como Required no PR #1; o status check da main usa o nome ci / verificar, e as duas execuções precisam passar.
2. Em PR de fork os secrets não são entregues ao workflow. Se fossem, quem abrisse o PR poderia alterar o workflow para imprimir ou enviar secrets.COPILOT_PAT para um servidor próprio e roubar o token.
3. Declarar permissions aplica o menor privilégio: o GITHUB_TOKEN padrão pode ter escrita em vários recursos, e uma action comprometida ou um prompt malicioso poderia usá-lo. Com contents: read e pull-requests: write, o estrago possível é limitado.
4. Não. A IA é probabilística, pode errar ou alucinar, não é determinística e pode falhar (como falhou aqui); o status check é uma regra objetiva que bloqueia o merge. A IA complementa a revisão humana, mas não substitui o gate. Observação da Tarefa 3: no PR #10 o job revisao-ia terminou verde mesmo com o comentário de SQL Injection na primeira versão do código, ou seja, a IA apontou o problema mas não bloqueou nada; quem bloqueia o merge é o status check verificar. Além disso, a lista de pontos muda a cada execução (a segunda trouxe itens novos, como autenticação e SELECT *), e o job também falha por motivos alheios ao código (token, modelo indisponível, permissão).

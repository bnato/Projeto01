# Avaliação: GitHub Actions com IA

Aluno: Gabriel Benato Batistel Correa — Repositório: bnato/Projeto01

## Tarefa 1 — ci.yml

- Execução vermelha (htmlhint reprovou o template HTML): https://github.com/bnato/Projeto01/actions/runs/38470699553
- Execução vermelha (migração com SQL errado, PR #2): https://github.com/bnato/Projeto01/pull/2 (ci / verificar falhou no passo de migrações)
- Execução verde (PR #1, após o conserto): https://github.com/bnato/Projeto01/pull/1
- Por que testar as migrações em SQLite antes do D1: o D1 é SQLite, então um SQL inválido falha em segundos e de graça no CI, em vez de quebrar o banco remoto durante o deploy.

## Tarefa 2 — Proteção da main

- Ruleset exige PR e o status check "verificar"; a API confirma em https://api.github.com/repos/bnato/Projeto01/rules/branches/main
- PR bloqueado (check vermelho) e depois liberado após corrigir o SQL: https://github.com/bnato/Projeto01/pull/2
- Push direto recusado: ver saída do terminal anexada pelo aluno (pendente).

## Tarefa 3 — revisao-ia.yml

O workflow foi criado conforme o enunciado, mas o passo actions/ai-inference falhou nas 3 tentativas com o erro "Cannot use 'in' operator to search for 'choices' in OK". Token com permissão Copilot Requests e plano Copilot ativos, YAML igual ao README da action; a causa não foi identificada. Por isso não há comentários da IA nem o teste de remoção de pull-requests: write. O último passo (gh pr comment) nunca chega a rodar.

Crítica: sem comentários gerados não há afirmação da IA para criticar; este ponto fica em aberto.

## Tarefa 4 — migrar.yml

- Merge do PR #2 disparou o workflow: https://github.com/bnato/Projeto01/actions/runs/38477604472
- Log: 0001_cria_notas.sql e 0002_adiciona_coluna.sql aplicadas no D1 remoto (ambas com sucesso).
- Saída do PRAGMA table_info(notas): pendente, a ser colada pelo aluno.
- Merge sem alterar migrations/: o merge deste PR (só AVALIACAO.md) não deve disparar o migrar, por causa do filtro paths.

## Perguntas

1. O ci.yml roda duas vezes porque tem os gatilhos push (na branch do PR) e pull_request (no merge simulado com a main). Ambos aparecem como Required no PR #1; o status check da main usa o nome ci / verificar, e as duas execuções precisam passar.
2. Em PR de fork os secrets não são entregues ao workflow. Se fossem, quem abrisse o PR poderia alterar o workflow para imprimir ou enviar secrets.COPILOT_PAT para um servidor próprio e roubar o token.
3. Declarar permissions aplica o menor privilégio: o GITHUB_TOKEN padrão pode ter escrita em vários recursos, e uma action comprometida ou um prompt malicioso poderia usá-lo. Com contents: read e pull-requests: write, o estrago possível é limitado.
4. Não. A IA é probabilística, pode errar ou alucinar, não é determinística e pode falhar (como falhou aqui); o status check é uma regra objetiva que bloqueia o merge. A IA complementa a revisão humana, mas não substitui o gate. A observação concreta do item 4 da Tarefa 3 não pôde ser feita porque a revisão por IA falhou.

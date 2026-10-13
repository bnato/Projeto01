CREATE TABLE IF NOT EXISTS notas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno TEXT NOT NULL,
  disciplina TEXT NOT NULL,
  nota REAL NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

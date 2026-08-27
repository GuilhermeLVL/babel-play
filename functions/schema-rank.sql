-- Ranking global (Cloudflare D1). Uma linha por apelido+jogo (a melhor pontuação).
CREATE TABLE IF NOT EXISTS rank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jogo TEXT NOT NULL,
  apelido TEXT NOT NULL,
  pontos INTEGER NOT NULL,
  combo INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL,
  ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_rank_jogo_pontos ON rank (jogo, pontos DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rank_jogo_apelido ON rank (jogo, apelido);
CREATE INDEX IF NOT EXISTS idx_rank_ip ON rank (ip, criado_em DESC);

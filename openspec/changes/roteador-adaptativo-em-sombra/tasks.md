Legenda: [D] decisão do dono (ato humano, não do agente); [R] revisão/verificação independente.

## 1. Critério e linha de base

- [x] 1.1 Escrever o critério do E-005 em `docs/auditoria/` (precisão ≥ 80%, ≤ 2 trocas/min, ≤ US$ 0,058/h, zero rede para convidado/menor) com data, ANTES de qualquer rodada
- [ ] 1.2 [R] Conferir que o critério foi commitado antes dos dados

## 2. Puro (`src/core/rota/`)

- [x] 2.1 `PedidoDeRota.sessao?` (RTF, fila, msDeMt, confiança); teste de equivalência: sem `sessao`, decisão idêntica
- [x] 2.2 `decidirAdaptativo` com histerese por falas e limiares como parâmetros; testes (sobe, desce, não oscila, guarda primeiro)
- [x] 2.3 Teste em grade plano × consentimento × idade × cota: convidado e menor sem consentimento nunca têm destino de rede (A-012)
- [x] 2.4 Microbench: p99 ≤ 0,05 ms em 10 000 decisões
- [x] 2.5 `sombraDoRoteador.ts`: agregação em baldes e lista fechada, sem texto/id

## 3. Ligação em sombra

- [x] 3.1 Flag `roteador_adaptativo_sombra` DESLIGADA: PG 0025 e SQLite 0067 (PROVISÓRIOS, conferir o número no PR), snapshots, journals, `PainelFlags`, `docs/flags.md`, baseline
- [x] 3.2 `conferenciaDaRota.ts` alimenta a sombra com os sinais da sessão; rota efetiva intocada; teste "flag ligada = mesma rota"
- [x] 3.3 Ler `medicoesDeStt` (depende da tarefa 2.2 de `stt-ingles-volume-e-rota`); teste "nuvem não vence, sem sugerir por confiança"
- [x] 3.4 Campo `roteador` no lote `v: 2`, atrás de `rum_latencia` e da flag; perfil protegido não envia; teste de forma do lote
- [x] 3.5 Teste dos ids de motor: `gateway/index.ts` vs `registroDeMotores.ts`; divergência vira pendência, não correção
- [x] 3.6 `import()` tardio: nada carregado com a flag desligada

## 4. Medir (E-005)

- [ ] 4.1 Rodar a bancada em perfil fraco e 4G simulado, por rota, reexecutando as mesmas falas (só com a bancada livre)
- [ ] 4.2 Calcular precisão, trocas/min e custo/h; relatório em `docs/auditoria/` com a decisão "seguir" ou "não sair da sombra"
- [ ] 4.3 [R] Revisão independente do relatório e do teste de privacidade

## 5. Fechamento

- [ ] 5.1 `npm run typecheck`, `npm run lint`, `npm test` (arquivos de rota e telemetria) e `npx knip` verdes; um PR só
- [ ] 5.2 [D] Ligar a flag no staging; [D] parecer de privacidade do dono para o campo em produção (`rum_latencia`); [D] decidir se segue para a mudança "sair da sombra"

## Notas da implementação (2026-11-21)

- Decisão: `decidirAdaptativo` em `src/core/rota/politicaDeRota.ts` (reaproveita a guarda de `decidirRota`); agregação em
  `src/core/rota/sombraDoRoteador.ts`; carregada por `import()` só com a flag ligada. A rota real nunca muda (testado).
- CPU: p99 0,0005–0,0007 ms por decisão (guarda pré-calculada; a guarda em si p99 0,004 ms) — meta 0,05 ms.
- Telemetria v2 estendida com `roteador` (lista fechada, até 24 linhas), só com `rum_latencia` também ligada e perfil não protegido.
- Migrações renumeradas para PG 0025 / SQLite 0067 na main (a fila, 0025/0067 no laboratório, não foi para a main).
- E-005 não cumprido (sem dado de campo): critério em `docs/auditoria/2026-11-21-criterio-do-roteador-adaptativo.md`,
  cálculo em `scripts/perf/latencia-legenda/avaliar-roteador.mjs`. 4.1 bloqueada (rodadas por rota), 4.2 parcial.
- Observação: o teto de US$ 0,058/h é igual a 1 h de nuvem; o relatório também mostra o acréscimo sobre a rota efetiva.

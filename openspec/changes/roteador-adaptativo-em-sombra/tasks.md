Legenda: [D] decisão do dono (ato humano, não do agente); [R] revisão/verificação independente.

## 1. Critério e linha de base

- [ ] 1.1 Escrever o critério do E-005 em `docs/auditoria/` (precisão ≥ 80%, ≤ 2 trocas/min, ≤ US$ 0,058/h, zero rede para convidado/menor) com data, ANTES de qualquer rodada
- [ ] 1.2 [R] Conferir que o critério foi commitado antes dos dados

## 2. Puro (`src/core/rota/`)

- [ ] 2.1 `PedidoDeRota.sessao?` (RTF, fila, msDeMt, confiança); teste de equivalência: sem `sessao`, decisão idêntica
- [ ] 2.2 `decidirAdaptativo` com histerese por falas e limiares como parâmetros; testes (sobe, desce, não oscila, guarda primeiro)
- [ ] 2.3 Teste em grade plano × consentimento × idade × cota: convidado e menor sem consentimento nunca têm destino de rede (A-012)
- [ ] 2.4 Microbench: p99 ≤ 0,05 ms em 10 000 decisões
- [ ] 2.5 `sombraDoRoteador.ts`: agregação em baldes e lista fechada, sem texto/id

## 3. Ligação em sombra

- [ ] 3.1 Flag `roteador_adaptativo_sombra` DESLIGADA: PG 0027 e SQLite 0069 (PROVISÓRIOS, conferir o número no PR), snapshots, journals, `PainelFlags`, `docs/flags.md`, baseline
- [ ] 3.2 `conferenciaDaRota.ts` alimenta a sombra com os sinais da sessão; rota efetiva intocada; teste "flag ligada = mesma rota"
- [ ] 3.3 Ler `medicoesDeStt` (depende da tarefa 2.2 de `stt-ingles-volume-e-rota`); teste "nuvem não vence, sem sugerir por confiança"
- [ ] 3.4 Campo `roteador` no lote `v: 2`, atrás de `rum_latencia` e da flag; perfil protegido não envia; teste de forma do lote
- [ ] 3.5 Teste dos ids de motor: `gateway/index.ts` vs `registroDeMotores.ts`; divergência vira pendência, não correção
- [ ] 3.6 `import()` tardio: nada carregado com a flag desligada

## 4. Medir (E-005)

- [ ] 4.1 Rodar a bancada em perfil fraco e 4G simulado, por rota, reexecutando as mesmas falas (só com a bancada livre)
- [ ] 4.2 Calcular precisão, trocas/min e custo/h; relatório em `docs/auditoria/` com a decisão "seguir" ou "não sair da sombra"
- [ ] 4.3 [R] Revisão independente do relatório e do teste de privacidade

## 5. Fechamento

- [ ] 5.1 `npm run typecheck`, `npm run lint`, `npm test` (arquivos de rota e telemetria) e `npx knip` verdes; um PR só
- [ ] 5.2 [D] Ligar a flag no staging; [D] parecer de privacidade do dono para o campo em produção (`rum_latencia`); [D] decidir se segue para a mudança "sair da sombra"

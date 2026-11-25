## Why

Hoje a rota aparelho↔nuvem ignora o que a sessão está vivendo. A `politicaDeRota` (`src/core/rota/politicaDeRota.ts`) roda em modo
sombra desde `planos-v3-e-rota-inteligente` (`politicaLigada` desligado, linhas 9-15) e só vê a classe do aparelho e o
`fatorDeTempoReal`; ela não recebe fila nem tempo de tradução, e o ramo `politicaLigada: true` nunca rodou no app. Quem reage ao
atraso são o regulador do aparelho e o áudio difícil (`stt_aparelho_primeiro`), cada um com limiares "A CALIBRAR". A pesquisa
(SOL-001, REQ-011/012, ST-03, ADR-004) conclui que um roteador por RTF, fila e confiança do STT é a única solução que mexe na
taxa de escalonamento, mas **não há dado para saber se ele acerta, oscila ou encarece**. Ligá-lo às cegas viola "sem custo novo" e "sem
nuvem para quem não consentiu".

## What Changes

- A `politicaDeRota` evolui (sem criar outra): `PedidoDeRota` ganha `sessao?` (RTF, fila, ms de MT, confiança do STT, medição de
  STT por idioma) e a função pura `decidirAdaptativo` decide por trecho, com histerese. Nada disso é lido com `sessao` ausente.
- Com a flag `roteador_adaptativo_sombra` ligada, a decisão é calculada ao lado da rota real e REGISTRADA (contagens agregadas);
  **a rota real não muda em nenhum caso**.
- O roteador CONSOME `medicoesDeStt` (change `stt-ingles-volume-e-rota`) para o inglês; não mede nem decide isso por conta própria.
- Critério do E-005 escrito aqui, antes da coleta; avaliação a posteriori na bancada; meta de CPU por decisão.
- Flag `roteador_adaptativo_sombra` nasce DESLIGADA (migrações PROVISÓRIAS PG 0025 e SQLite 0067; o número final é conferido no PR).

## Capabilities

### New Capabilities

- `roteador-adaptativo`: decisão adaptativa por RTF, fila e confiança, em sombra, com registro agregado e critério de saída.

### Modified Capabilities

Nenhuma. `politica-de-rota` ainda vive em `openspec/changes/planos-v3-e-rota-inteligente/` (não está em `openspec/specs/`); o requisito
"Entrada em modo sombra e atrás de flag" dela não muda de texto: esta mudança só acrescenta um modo sombra mais rico. Se `planos-v3`
for arquivada antes, esta passa a ser delta sobre `politica-de-rota` e o PR confere.

## Impact

- `src/core/rota/politicaDeRota.ts` (campo opcional e função nova), `src/core/rota/sombraDoRoteador.ts` (agregação pura),
  `src/lib/captura/conferenciaDaRota.ts` (alimenta a sombra), `src/gateway/capture/telemetriaDeCaptura.ts` (campo `roteador` no `v: 2`),
  servidor de métricas (só incrementa), flag + migrações, `docs/flags.md`, `docs/auditoria/`.
- Sem dependência nova. Sem mudança em planos, cotas, `routeStt`/`routeMt` efetivos nem UI.
- Depende de `lab-medicao-legenda-traduzida` (marcas `frasy:*`, telemetria v2) e de `stt-ingles-volume-e-rota` (`medicoesDeStt`).

## Revisão de 25/11/2026

- **Estado**: código pronto e em sombra (seções 2 e 3 feitas; flag `roteador_adaptativo_sombra` desligada, migrações finais PG 0025 e SQLite 0067). Falta medir e decidir (4.1 a 4.3, 5.1, 5.2) e não há um único dado de campo. O que ficou VELHO: (a) o critério do E-005 é de 21/11 e não conhece a rota Parakeet/`stt_aparelho_primeiro` nem o corte de custo de 02/10, e a meta de custo (US$ 0,058/h, igual a 1 h de nuvem) não reprova nada; (b) o texto cita "migrações provisórias" (já são finais); (c) o `planos-v3-e-rota-inteligente` (que vive em `openspec/changes/`, não em `openspec/specs/`) está para ser reconciliado com os planos v4, então o delta `politica-de-rota` ainda não tem base arquivada. Nova tarefa 1.3 trata de (a) antes de qualquer coleta. PRs #201, #202, #205 e #206 não tocam `src/core/rota/`.
- **Esforço**: M (1.3 é P; coletar e avaliar 4.1 e 4.2 é M e exige a bancada livre e aparelho fraco).
- **Valor para quem usa**: baixo a médio e indireto. Só importa se a rota inteligente de `planos-v3` sair; com o Parakeet primeiro no aparelho, a nuvem é reserva e o ganho do roteador encolheu. Não muda nada visível enquanto estiver em sombra.
- **Dependências**: `planos-v3-e-rota-inteligente` (esta change o destrava, e ele depende dela), `stt-ingles-volume-e-rota` (arquivada; `medicoesDeStt`) e `lab-medicao-legenda-traduzida` (arquivada; telemetria v2). Conflito de arquivo: `politicaDeRota.ts` e `conferenciaDaRota.ts`, que `planos-v3` também altera; fazer esta antes ou só depois dele, nunca em paralelo.
- **Decisões do dono**:
  1. Seguir ou parar: (A) ligar a flag só no staging por 2 semanas para colher trocas/min e a distribuição, sem a precisão (custo zero, depende do parecer de `rum_latencia`); (B) fazer a coleta completa da bancada por rota (M, tempo de máquina); (C) arquivar a change e a flag até `planos-v3` ser retomado. **Recomendo A + 1.3**: é barato, não muda rota nem custo, e dá o sinal de que o roteador oscila ou não antes de gastar bancada.
  2. Parecer de privacidade do campo `roteador` em produção (perfil protegido já não envia): (A) aprovar só para adultos com `rum_latencia`; (B) manter em staging; (C) negar. **Recomendo B** até a 4.2 sair.
  3. Teto de custo da métrica 3: o dono escolhe o acréscimo em US$/h aceito (sugestão: US$ 0,01/h sobre a rota efetiva).

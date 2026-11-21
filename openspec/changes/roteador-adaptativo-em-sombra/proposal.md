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
- Flag `roteador_adaptativo_sombra` nasce DESLIGADA (migrações PROVISÓRIAS PG 0027 e SQLite 0069; o número final é conferido no PR).

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

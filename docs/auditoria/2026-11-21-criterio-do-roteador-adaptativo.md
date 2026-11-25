# [SUBSTITUÍDO por `2026-11-25-criterio-do-roteador-adaptativo.md`] Critério de saída do roteador adaptativo em sombra (E-005)

Data: 2026-11-21. Openspec: `openspec/changes/roteador-adaptativo-em-sombra/` (tarefa 1.1). **Este critério é escrito ANTES de
qualquer rodada de coleta e não muda depois de ver o número**: se precisar mudar, vale a data do novo commit e as rodadas
anteriores deixam de contar. O `[R]` da tarefa 1.2 confere que este arquivo foi commitado antes dos dados.

## O que se decide

Se o roteador adaptativo (`decidirAdaptativo`, `src/core/rota/politicaDeRota.ts`), hoje só em sombra (flag
`roteador_adaptativo_sombra`), pode SAIR da sombra numa mudança própria. Esta mudança não liga nada: a rota real não muda.

## O critério: seguir só se TODOS valerem

| #   | Métrica                                                     | Meta                     |
| --- | ----------------------------------------------------------- | ------------------------ |
| 1   | Precisão contra a melhor rota a posteriori                  | **≥ 80%**                |
| 2   | Trocas de decisão sustentadas por minuto                    | **≤ 2**                  |
| 3   | Custo simulado da nuvem                                     | **≤ US$ 0,058 por hora** |
| 4   | Decisões de rede para convidado, menor ou sem consentimento | **zero**                 |

Qualquer um falhar = **não sair da sombra** (recalibrar os limiares ou arquivar). Com menos de 200 falas julgadas ou 5 sessões,
o resultado é **dados insuficientes**, nunca "seguir" (falhar já vale, mesmo com poucos dados).

## Definições

- **Melhor rota a posteriori:** dentre as rotas que a guarda de `decidirRota` permitiria, a que deu o menor
  `fimDaFalaAteLegendaMs` na bancada (`scripts/perf/latencia-legenda/`), reexecutando as MESMAS falas por rota.
- **Precisão:** fração das falas em que a decisão da sombra coincide com essa rota, ou tem latência dentro de **10%** dela. Decisão sem
  medição na bancada conta como erro.
- **Troca sustentada:** mudança do degrau decidido entre falas consecutivas (a histerese já exige `falasParaSubir`/`falasParaDescer`
  falas seguidas, então o ruído de uma fala não conta). Trocas/min = total de trocas ÷ minutos de sessão.
- **Custo simulado:** segundos de fala em que a sombra decidiria `nuvem` ÷ horas de sessão × preço de 1 h de legenda na nuvem
  (`custo-de-ia`, `docs/alternativas-de-custo-e-eficiencia.md`: transcrição + tradução, US$ 0,028 a 0,058/h). O relatório traz AO LADO o
  custo da rota efetiva e o acréscimo da sombra. Observação para o dono: com o preço de 1 h inteira de nuvem igual a US$ 0,058, a meta de
  custo só reprova se o preço informado for maior; o acréscimo é o número que informa de verdade, e a decisão de olhá-lo é do dono.
- **Rede indevida:** qualquer decisão `nuvem` em sessão de perfil convidado, menor ou adulto sem consentimento. Deve ser zero (a guarda
  de `decidirRota` roda antes e o teste em grade da A-012 já cobre; aqui é a prova nos dados).

## Como coletar e rodar (a coleta NÃO foi feita; depende da bancada livre)

1. Build com a flag no mesmo bundle; por rota, rodar a bancada em perfil fraco e 4G simulado (design §5):
   `node scripts/perf/latencia-legenda/bancada-captura.mjs --perfis desktop,fraco --rodadas 10 --flag roteador_adaptativo_sombra`
   (só com a bancada livre; protocolo em `docs/auditoria/protocolo-do-laboratorio-de-latencia.md`).
2. Por sessão, ler a decisão da sombra fala a fala com `window.__roteadorSombra()` (só lista fechada e baldes, em memória) e,
   das rodadas por rota, o `fimDaFalaAteLegendaMs` da mesma fala (índice no roteiro).
3. Montar o JSON de entrada (formato no cabeçalho de `avaliar-roteador.mjs`) e rodar:
   `node scripts/perf/latencia-legenda/avaliar-roteador.mjs --entrada dados.json --md docs/auditoria/AAAA-MM-DD-roteador-adaptativo-avaliacao.md --json resultado.json`
   (código de saída 0 só com "seguir").
4. Registrar o relatório em `docs/auditoria/` com a decisão "seguir" ou "não sair da sombra" (tarefas 4.2 e 4.3 [R]).

O campo `roteador` da telemetria de campo (flag `rum_latencia`, só perfil não protegido) dá contagens agregadas por decisão, motivo
e balde de sinal e o número de trocas por lote de ~1 minuto: serve para acompanhar trocas/min e a distribuição das decisões no campo,
mas NÃO tem a "melhor rota a posteriori", então a precisão (métrica 1) só sai da bancada.

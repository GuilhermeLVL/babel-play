# Pré-tradução de legendas: medição rápida no Node (24/11/2026)

Change: `openspec/changes/pre-traducao-de-legendas`. Flag `pre_traducao_de_legendas` (desligada).

## Método

- Núcleo `preTraduzirLegenda` + adaptador `tradutorLocalDaPreTraducao` rodando em Node (tsx) sobre o Bergamot WASM da bancada
  (`scripts/eval-fala/bancada/bergamot.mjs`, par pt→en, modelo já em cache local: nenhum download na medição).
- 500 falas em português de 25 a 90 caracteres (média 57), tiradas de frases dos `docs/*.md`: o tamanho de uma fala de legenda.
  Não é uma legenda real; serve para ordem de grandeza.
- `fetch` instrumentado para contar chamadas de rede durante a pré-tradução.

## Números

| Medida                                  | Valor             |
| --------------------------------------- | ----------------- |
| Falas / traduzidas / repetidas / falhas | 500 / 498 / 2 / 0 |
| Lotes (20 falas)                        | 25                |
| Tempo total                             | 9,85 s            |
| Tempo por fala traduzida                | 19,8 ms           |
| Carga do modelo pt→en (já em cache)     | 265 ms            |
| Maior trecho sem ceder a vez (1 lote)   | 591 ms            |
| Chamadas de rede durante a pré-tradução | 0                 |

## Leitura

- Uma legenda de ~500 falas leva cerca de 10 s no Bergamot em Node. O opus-mt (en→pt, Transformers.js em WASM) é mais lento; não
  rodou no Node aqui e fica como pendência.
- No Node o Bergamot é síncrono na thread principal, então o "maior trecho sem ceder" (591 ms por lote de 20) é o pior caso. No
  navegador o motor roda num Worker, e a thread da tela só espera a resposta de cada fala; a medição real fica para o aparelho.
- A estimativa de tempo restante da tela deve usar a média por fala medida em execução (já é assim no núcleo), não esta constante.

## Pendências

- Medir no celular real (Worker WASM): ms por fala, e se a tela segue respondendo durante um lote.
- Medir en→pt-BR com opus-mt (a direção mais comum de quem estuda inglês) e o pivô X→en→pt.
- Legenda real (.srt de série) em vez de frases de documentação.

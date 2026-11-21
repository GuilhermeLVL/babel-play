# Tradução local por direção: parte não bloqueada (2026-11-21)

Openspec `openspec/changes/traducao-local-por-direcao/`. Branch `lab/core-stt-mt`, sem commit. Origem de todo número de
laboratório: **emulado** (Chromium headless e Node no macOS, desktop). Ordena opções; **não declara ganho de celular, Quest ou
iPhone** (portão 4, `[R]`). Nada foi instalado, publicado ou ligado.

## O que foi feito

| Tarefa | Estado                     | O que / por quê                                                                                                                                                                                                                                                                                                                                                              |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1    | parcial                    | Critério e protocolo escritos em `2026-11-21-criterio-da-traducao-local-por-direcao.md`, **não commitados** (nenhum A/B de decisão rodou; ver "Honestidade do laboratório").                                                                                                                                                                                                 |
| 1.2    | bloqueada                  | `[D]` licença: decisão do dono.                                                                                                                                                                                                                                                                                                                                              |
| 1.3    | feito                      | `licencaPesos`, `licencaDados` ("não informada") e `aprovadoPeloDono: false` nos 16 pares; `publicar-bergamot-no-r2.ts` recusa (saída 3, nada enviado, inclusive em `--seco`); `gerar-pares-do-bergamot.mjs` preserva a aprovação só se a execução não mudou. Observação: o workflow `publicar-modelos.yml` passa a recusar tudo até o dono aprovar.                         |
| 2.1    | feito                      | Flag `traducao_local_por_direcao` desligada: PG `0027`, SQLite `0069` (`prevId` = `id` do snapshot anterior, journal `when` 1794800000007), `FLAG_TRADUCAO_LOCAL_POR_DIRECAO`, `PainelFlags`, `docs/flags.md`, baseline (33 flags). Provisória: reconferir contra a `main` no PR.                                                                                            |
| 2.2    | feito                      | `bergamotCdnNoBuild()` exige a flag além de `__BERGAMOT_CDN__`; teste em grade flag × URL × par (só flag + URL abre `paresDoCdn`; pt→en embutido independe da flag). O runtime só existe 0.4.9.                                                                                                                                                                              |
| 3.1    | feito                      | `src/core/traducao/rotaPorDirecao.ts` + `vereditoPorDirecao.json` (en-pt: `nao-avaliado`); `routeMt` e `bergamotVenceNoPar` consomem a tabela. X→en Bergamot, en→pt-BR opus-mt, pivô por perna, nenhum Bergamot saindo do inglês sem `aprovado`. Desligada, a escada é a de hoje.                                                                                            |
| 3.2    | feito                      | `tests/mtWorker-alvo-ptbr.test.ts`: en→pt manda o id 51 do `>>pt_br<<` (falha se o ID mudar; verificado por mutação).                                                                                                                                                                                                                                                        |
| 3.3    | feito                      | `bergamot-local` antes de `opus-mt-local` nos 3 perfis; binding próprio (`BergamotNoPerfil`) sobre o MESMO composto e o MESMO opus-mt (um só); `adapterId` próprio no registro; perfil salvo só com `opus-mt-local` segue válido; falha (inclusive sha256) cai no opus-mt sem erro; "pronto" avisa uma vez.                                                                  |
| 4.1    | parcial                    | chrF++ com IC 95% pareado (abaixo). COMET **pendente**: exige `unbabel-comet` + torch + modelo de ~2,3 GB (instalação de pacote Python e download grande).                                                                                                                                                                                                                   |
| 4.2    | parcial                    | `montar-fleurs-x-en.mjs` + `mt.mjs` aceitam `fleurs:<X>-en` (pt-en n=100, es-en n=51, do FLEURS já baixado). fr, de, ja… exigem `baixar-bancada.py` (download do FLEURS por idioma).                                                                                                                                                                                         |
| 4.3    | feito (ferramenta) / `[D]` | `scripts/eval-fala/teste-cego-ptbr/` (`gerar`, `apurar`, `nucleo`): pares cegos, planilha CSV e formulário HTML offline, gabarito à parte, kappa, pt-PT < 10%, veredito. 25 testes com respostas sintéticas; nenhuma pessoa avaliou. Material de exemplo gerado com saídas reais (100 frases, 2 sistemas, 120 itens por avaliador, lote `aa0ff2b0dbc9`) fora do repositório. |
| 4.4    | bloqueada                  | depende do veredito humano (4.3).                                                                                                                                                                                                                                                                                                                                            |
| 5.1    | bloqueada                  | dependência nova: build do WASM do `inference/` da Mozilla / troca do `@browsermt/bergamot-translator`, precisa de aprovação.                                                                                                                                                                                                                                                |
| 5.2    | bloqueada                  | exige o runtime novo (5.1). Medida a linha de base do 0.4.9 (abaixo).                                                                                                                                                                                                                                                                                                        |
| 5.3    | parcial                    | A/B de `fimDaFalaAteLegendaMs` por par X→en não rodou (o CDN com es-en não está publicado, e nenhum `criterio.md` foi commitado). Há latência por frase pt→en (abaixo).                                                                                                                                                                                                      |
| 5.4    | parcial                    | pt→en medido (abaixo); os demais pares dependem do R2.                                                                                                                                                                                                                                                                                                                       |
| 5.5    | bloqueada                  | `[R]` aparelho real.                                                                                                                                                                                                                                                                                                                                                         |
| 6.x    | bloqueada                  | `[D]` publicar no R2 e ligar a flag.                                                                                                                                                                                                                                                                                                                                         |

## Medidas (emulado, desktop)

**Memória e latência pt→en, Bergamot 0.4.9 × opus-mt** (`scripts/perf/memoria-do-mt.mjs`; 11 rodadas ABAB, a 1ª descartada = 10 válidas por lado;
Chromium novo por rodada, gateway de verdade, 8 frases × 3 passadas; RSS da árvore de processos do Chromium; resultado bruto em
`scripts/perf/latencia-legenda/resultados/2026-11-21/traducao-por-direcao/memoria-e-latencia-pt-en.json`). Diferença pareada opus − Bergamot, IC 95%:

| Métrica                            | opus-mt | Bergamot | Diferença [IC 95%] |
| ---------------------------------- | ------- | -------- | ------------------ |
| RSS de pico (MB)                   | 1587    | 974      | 613 [603, 625]     |
| RSS de pico sobre a base (MB)      | 1053    | 441      | 613 [603, 625]     |
| Latência p50 por frase (ms)        | 87      | 13       | 74 [74, 74]        |
| Latência p75 por frase (ms)        | 101     | 14,5     | 86 [86, 87]        |
| Preparo com o modelo em cache (ms) | 2011    | 1794     | 218 [210, 227]     |

Zero erro de tradução nos dois lados; cada lado respondeu só com o seu motor. Os ICs são estreitos porque o laboratório é muito
estável (mesma máquina, sem concorrência): não são estimativa para aparelho de campo. RSS do macOS conta páginas compartilhadas;
vale o delta entre as opções, não o absoluto. O heap JS da janela (11 MB) não vê o WASM do worker.

**Download pt→en** (`bergamot-no-navegador.mjs`, `download-frio-e-quente-pt-en.json`): 1ª carga 30,9 MB na rede (`mbDoDownload('pt-en')` = 31, confere);
2ª carga (Cache Storage) 0 MB de modelo; sobram 5,3 MB do motor WASM, que o servidor estático de teste serve sem cache HTTP (em produção
dependem do cache HTTP/brotli, não verificado aqui).

**Qualidade, chrF++ com IC 95%** (bancada `mt.mjs`; Δ = Bergamot − opus-mt, pareado por frase; brutos em `docs/auditoria/eval/bancada-2026-09/`):

| Corpus (n)           | opus-mt          | Bergamot         | Δ [IC 95%]          | Leitura                      |
| -------------------- | ---------------- | ---------------- | ------------------- | ---------------------------- |
| `fleurs:pt-en` (100) | 63,5 [60,8–66,3] | 67,7 [65,3–70,2] | +4,14 [2,39, 5,83]  | Bergamot melhor, IC exclui 0 |
| `fleurs:es-en` (51)  | 55,3 [52,4–58,2] | 55,6 [52,5–58,6] | +0,30 [-1,60, 2,36] | empate (n pequeno)           |
| `fleurs:en-pt` (100) | 63,8 [61,4–66,4] | 69,2 [66,4–72,0] | +5,38 [3,58, 7,10]  | só chrF++; não mede variante |
| `gold:en-pt` (60)    | 53,9 [47,0–61,3] | 53,0 [46,5–59,4] | -0,83 [-4,48, 3,17] | empate                       |

O en→pt do Mozilla não perde no chrF++ (ganha no FLEURS), mas chrF++ e COMET medem pouco a variante: é por isso que o teste cego
existe. O veredito segue `nao-avaliado`; en→pt continua opus-mt.
Latência por frase no Node (bancada): Bergamot p50 34 ms × opus-mt p50 205 ms em `fleurs:pt-en`.

## Honestidade do laboratório

- As medições acima usam `memoria-do-mt.mjs` e a bancada de MT, não `bancada-captura.mjs --alvos`; por isso não houve `criterio.md`
  commitado antes e **nenhuma é prova de decisão** (apenas ordenação e linha de base). O critério está no arquivo irmão.
- Nenhum COMET, nenhuma pessoa, nenhum aparelho real, nenhum es-en/fr-en etc. em navegador (o CDN não existe).
- Pendências de COMET: instalar `unbabel-comet` e baixar `wmt22-comet-da` (autorização), depois `pontuar.py` sobre os mesmos brutos.

## Para o dono

1. Aprovar (ou não) a licença por par e, por par, marcar `aprovadoPeloDono` (1.2); depois publicar no R2 (6.1).
2. Recrutar ≥ 2 avaliadores brasileiros e rodar o teste cego com o material gerado (4.3).
3. Autorizar a troca/construção do runtime (5.1) e o COMET.
4. Aparelhos reais (5.5) antes de qualquer afirmação de celular.

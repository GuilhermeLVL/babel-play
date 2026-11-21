# Linha de base da legenda e erro do marcador (rodada de 21/11/2026)

Tarefas 3.4 e 4.2 da change `lab-medicao-legenda-traduzida`. O aceite do dono (4.3) continua aberto: a base só vale quando quem a
aprova a commita. Aparelho: Mac Apple M5 Pro, 15 núcleos, 24 GB, Darwin 27, Chromium do Playwright 159 (headless). Build: commit
`efd0c702` (`npm run build:estatica` num worktree limpo, para a base não herdar alterações não commitadas). Fixture `fleurs-en-8`.

## Linha de base `local-darwin` (4.2)

Comando: `bancada-captura.mjs --perfis desktop,fraco --rodadas 12 --alvos atual=http://127.0.0.1:4183 --gravar-linha-de-base`.
12 rodadas válidas por perfil, 0 inválidas. Reescreveu `slo-captura.json` (`ambientes.local-darwin`), com `origens` por perfil.

| Perfil    | Origem    | Aparelho                                                                        | p50      | p75      | p95      | Taxa de falha |
| --------- | --------- | ------------------------------------------------------------------------------- | -------- | -------- | -------- | ------------- |
| `desktop` | `medido`  | Apple M5 Pro, 15 núcleos, 24 GB                                                 | 931,5 ms | 967 ms   | 1 613 ms | 0 de 96       |
| `fraco`   | `emulado` | o mesmo Mac, emulando notebook de entrada (CPU 4×, 2 núcleos, 2 GB, sem WebGPU) | 1 140 ms | 1 373 ms | 1 956 ms | 0 de 96       |

Outras métricas do `desktop`: frames longos 0, CPU no silêncio 13%, renders/s 22,9 (silêncio) e 93,1 (fala), RTF p50 0,035, 1ª legenda
completa 5 449 ms, 1º texto na tela 3 186 ms. A memória de pico não existe no Chromium headless (`measureUserAgentSpecificMemory`
indisponível): fica sem base, como já estava.

**A base reprova a tradução atrasada de propósito.** Injetado só na bancada (os registros do DOM com tradução deslocados em +1,5 s nas
12 rodadas; nada do app muda): p50/p75/p95 do `desktop` vão a 2 432 / 2 467 / 3 113 ms e `comparar.mjs` sai com código 1 (3 métricas
`piorou`). Com +0,4 s a bancada passa (p75 1 367 ms, limite 1 609 ms): a resolução da base é de uns 650 ms no p75.
Teste: `tests/bancadaLegendaAB.test.ts` ("a base do local-darwin reprova a tradução atrasada").

## Erro do marcador (3.4)

3 rodadas válidas do `desktop` (24 falas), `analisar.mjs`: erro = `t_fim` da marca `frasy:fala:fim` (último quadro de voz do VAD) menos o
fim da voz no arquivo (convertido pelo bipe).

| Mediana do erro (com sinal) | Mediana do valor absoluto | p95 do valor absoluto | Falas | Critério (E-001)      |
| --------------------------- | ------------------------- | --------------------- | ----- | --------------------- |
| −18 ms                      | **19 ms**                 | **330 ms**            | 24    | mediana e p95 ≤ 50 ms |

**Resultado: a mediana passa; o p95 não. O campo fica declarado "VAD → tela", não "fim da fala → tela".** Duas falas do fixture (3 e 4) têm
o VAD fechando ~320–335 ms antes do último trecho de voz do arquivo (o fim da frase tem energia baixa que o Silero não conta); nas
outras seis o erro vai de −38 a +15 ms. A métrica de campo (marca de fim → marca de legenda) acompanha a da bancada: p50 873 × 874 ms, p75 1 004 × 1 020 ms.

### Achado que mudou a bancada (feito nesta tarefa)

Na 1ª rodada o erro deu mediana 293 ms e p95 820 ms. Causa: o `fimS` do roteiro, vindo do fixture (`vozFim`, limiar pico − 35 dB),
incluía uma cauda de ruído de até 0,8 s nas falas 1 e 6 (RMS 0,005–0,012 contra 0,1 da voz); o VAD fechava a fala 0,8 s antes do "fim da
voz" do arquivo e a métrica da bancada saía NEGATIVA (−35 ms numa fala). `montar-audio.mjs` agora calcula o fim da voz como o último
quadro de 20 ms com RMS ≥ 0,03 (−30 dBFS) e guarda o valor antigo em `fimDoFixtureS`. Também `analisar.mjs` passou a achar a marca de fim
pelo trecho que o VAD fechou (não por proximidade do fim do arquivo, que escondia justamente os maiores erros) e a medir pelo balão a fala
cujo texto final já estava na tela antes do decode pareado (virava "falha" falsa).

## Dados

`scripts/perf/latencia-legenda/resultados/2026-11-21/`: `linha-de-base-local-darwin/` (`resultado.json` e a saída da bancada),
`erro-do-marcador/` (`analise.txt`, `resumo.json`). Rodadas brutas fora do git.

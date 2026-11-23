# A/B do parcial do Parakeet, V2 `parciais_parakeet` (change `parciais-incrementais`, tarefa 3.3)

Medido em 21/11/2026 no `dist/` do commit `263759b8` (V1b incluída, modo padrão `cauda-token`). Critério (escrito e commitado ANTES de qualquer rodada,
mais a Emenda 2 só operacional, commit `5a258f8c`; métrica e guardas não mudaram):
`scripts/perf/latencia-legenda/resultados/2026-11-21/parciais-v2-parakeet/criterio.md`. Dados e tabelas: `.../parciais-v2-parakeet/desktop/` (`ab-parciais.mjs --variante v1`).
Relatório anterior (V2 "NÃO MEDIDO"): `2026-11-21-ab-dos-parciais.md`; V1b: `2026-11-21-ab-dos-parciais-v1b.md` (todos os modos reprovados, então `v1` e `v1v2` usam o padrão).

## Veredito: **REPROVADO** (V2 `v1v2` contra `v1`, desktop)

A primária ganha muito, mas três guardas reprovam. Nada deve ser ligado.

| item                                                      | `v1` (A)         | `v1v2` (B)       | B − A         | IC 95%           | situação                                                             |
| --------------------------------------------------------- | ---------------- | ---------------- | ------------- | ---------------- | -------------------------------------------------------------------- |
| **primária**: atraso por palavra do original, p50 (ms)    | 2.686            | 775              | −1.911 (−71%) | [−2.230, −1.549] | ganha (IC abaixo de 0, efeito >= 20%)                                |
| atraso p90 (ms), informativo                              | 4.435            | 4.052            | −383          | [−1.154, +10]    | cruza 0                                                              |
| 1º texto na tela, mediana das rodadas (ms)                | 6.342            | 1.765            | −4.577        | sem IC           |                                                                      |
| guarda 2: erasure do original (limite superior <= +0,05)  | 0,000            | 0,740            | +0,740        | [+0,541, +0,964] | **reprovou**                                                         |
| guarda 3: texto final igual ao de A                       | WER 3,1%         | WER 3,2%         |               |                  | **reprovou** pela regra (2 de 144 textos de B fora do conjunto de A) |
| guarda 4: `rendersPorS.fala` (limite 81)                  | 56,9             | 134,2            |               |                  | **reprovou**                                                         |
| guarda 4: framesLongos, cpuSilencio, rendersPorS.silencio | 0 / 12,1% / 22,9 | 0 / 11,3% / 22,9 |               |                  | ok                                                                   |
| guarda 1: `fimDaFalaAteLegendaMs` p75                     |                  |                  |               |                  | **sem medida** (ver limites)                                         |

Contra `atual` (informativo, sem veredito): `v1v2` atraso p50 2.575 → 799 ms (−1.776, IC [−2.023, −1.326]); erasure 0,000 → 0,723 (IC [+0,508, +0,971]);
renders de fala 56,8 → 134,2. `v1` contra `atual`: atraso p50 2.575 → 2.686 (+112, IC [+2, +251]), erasure 0 e 1º texto igual (6.342 contra 6.438): com o Parakeet,
`parciais_vivos` sozinha não produz parcial algum (o Parakeet não emite token a token); só `parciais_parakeet` (re-decode da janela) cria parcial.

Leitura: o re-decode do Parakeet entrega o que a hipótese prometia (texto ~4,6 s mais cedo e atraso por palavra −71%), mas a cauda provisória pisca (erasure 0,74, mesma ordem de
V1 em inglês) e dobra os renders na fala. O "texto final" difere em 2 de 144 (WER 3,1% contra 3,2%, praticamente igual; em 8 falas até o `v1` varia entre rodadas, o decode do
Parakeet não é bit-a-bit estável); a guarda foi aplicada como está no critério, sem relaxar depois do número.

## Como foi medido

- Áudio: `tests/fixtures/bancada-captura/fleurs-pt-12.json` (FLEURS pt_br, teste, CC BY 4.0; 12 falas de 3 a 5,8 s, 98,9 s com silêncio; 10 falas com >= 90% casadas, 2 fora do cálculo:
  `fleurs_pt_1736` e `fleurs_pt_1870`). Alinhamento `whisper-small_timestamped` (medium testado: fronteiras 200 ms contra 150 ms, sem ganho). Desvio do tempo por palavra contra a energia: mediana 160 ms (início) e 90 ms (fim).
- Cenário: `--fixture fleurs-pt-12.json --eles pt-BR --eu pt-BR --qualidade accurate` (novo: `cenario-da-bancada.mjs`, `tests/cenarioDaBancada.test.ts`). **Confirmado:** `capSummary.porMotor`
  do braço `atual` é `parakeet-local` (12 falas, RTF 0,022), sem parciais; o aquecimento baixa o Parakeet (622 MB passam direto pela rede, ver abaixo).
- Braços intercalados num servidor e `dist/` só: `atual` (sem flags), `v1` (`parciais_vivos`), `v1v2` (`parciais_vivos,parciais_parakeet`). **12 rodadas válidas por braço, nenhuma inválida**
  (aquecimento descartado). Bootstrap pareado por fala, 10.000 reamostragens, semente 20261121, IC 95%. Apple M5 Pro, Chromium headless.
- Código novo: opções da bancada acima; `medir.mjs` deixa de servir pelo cache em disco corpos acima de 400 MB (o Playwright estoura ao serializar o Parakeet de 622 MB).

## Limites (leia antes de usar o número)

1. **Guarda 1 sem medida**: `fimDaFalaAteLegendaMs` é o tempo até a TRADUÇÃO e o cenário é pt para pt (todas as fontes têm de ser pt/es para o Parakeet servir; com legenda em inglês a rota cai no Whisper).
   Não dá para medi-la aqui. Não é aprovação nem reprovação; o veredito não depende dela, pois já reprova por outras guardas. Se um dia V2 passar nas demais, esta guarda precisa de métrica própria (final do original).
2. **`fraco` emulado NÃO medido**: nesse perfil a rota escolhe `whisper-base` (o Parakeet não cabe no aparelho emulado), então V2 não existe ali (1ª tentativa: a aba caiu no aquecimento; 2ª, rodada isolada: `whisper-base`, 1º texto em 4,97 s).
   Nada aqui vale para celular.
3. Falas: 10 no cálculo por palavra; 1 só tipo de voz declarado (o split pt_br do FLEURS vem todo rotulado `MALE`, sem id de falante); IC largos e sem correção de multiplicidade.
4. Erasure do `atual` é 0 porque ele não tem parcial; a guarda "não piorar contra A" compara contra a ausência de parcial.

## Próximos passos (exigem critério novo)

- Estabilizar a cauda do re-decode do Parakeet (não trocar palavra já mostrada, só acrescentar; ou mostrar só o prefixo concordado entre dois decodes) e medir a erasure de novo; o ganho de 1,9 s no atraso é o que vale a pena preservar.
- Métrica própria de "final do original" para a guarda 1 e uma amostra pt maior (o FLEURS pt_br do split de teste só tem 17 frases únicas entre 3 e 6,8 s; treino/validação teriam mais).

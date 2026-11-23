# Critério do A/B — V2 `parciais_parakeet` (change `parciais-incrementais`, tarefa 3.3)

Escrito ANTES de qualquer rodada deste A/B (e antes de qualquer rodada do Lote A).

## Hipótese

Re-decode da janela que cresce no Parakeet (RTF ~0,089 no desktop), com a cadência e o LocalAgreement de V1, dá parcial onde hoje não há e reduz o atraso por palavra.

## Variantes

- A = mesmo commit com a flag `parciais_parakeet` DESLIGADA; B = flag `parciais_parakeet` LIGADA, com `parciais_vivos` LIGADA nos dois lados.
- Mesmo aparelho (este Mac, Chromium headless do Playwright; perfis `desktop` medido e `fraco` EMULADO), mesmo áudio
  (`fleurs-en-8.json` com tempo por palavra), modelos em cache. >= 10 rodadas válidas por lado, intercaladas (A, B, A, B...);
  aquecimento descartado; rodada inválida refeita (`bancada-captura.mjs --alvos --flag-do-alvo`, `ab.mjs`).

## Métrica primária

`atrasoDePalavraMs` p50 (original), por perfil: diferença pareada por fala, bootstrap 10 000, IC 95%, semente fixa.

## Efeito mínimo

-20% sobre o p50 de A (PROVISÓRIO, a confirmar pelo dono; tarefa 1.2 [D]). B só é "melhor" se o IC 95% inteiro ficar abaixo de 0 e o
efeito for >= 20% em módulo. Se o IC cruza 0: "sem diferença provada".

Aplica-se só ao perfil/motor em que o Parakeet já é usado (config da bancada `--qualidade accurate`, pt-BR); sem download de modelo novo.

## Guardas (qualquer uma que falhe reprova B)

1. `fimDaFalaAteLegendaMs` p75: limite superior do IC 95% da diferença B - A <= 0 (a fila que esperava prefixo estável foi reprovada
   no ciclo 1 por atrasar o final).
2. `erasureOriginal` <= 0,2 (média das rodadas de B; NE de Arivazhagan et al.).
3. WER do final não piora (o final é intocado; qualquer diferença de texto final reprova).
4. framesLongos.n50/n100/somaMs, cpuSilencio.processoPct, rendersPorS.\* e taxa de falha dentro das tolerâncias de `slo-captura.json`
   (regra "B > A x (1 + tol) + folga piora"); memória de pico quando o perfil a expõe (o headless não expõe: fica sem base).

## Decisão

Aprovação exige métrica primária e TODAS as guardas. Resultado no perfil `fraco` emulado NUNCA aprova celular: o relatório diz que o
ganho em aparelho real depende da rodada [R]. Ligar a flag é decisão [D] do dono, só com este A/B aprovado. O critério não muda depois
de ver o número.

## Emenda 1 (21/11/2026, antes de qualquer rodada de variante)

A linha de base (`docs/auditoria/2026-11-21-linha-de-base-dos-parciais.md`) mediu erasure de 0,62 (original) e 0,47 (tradução)
no desktop, e 0,51 / 0,42 no fraco emulado. Por isso o teto absoluto de 0,2 reprovaria qualquer variante pelo que já existe
hoje. A guarda de erasure passa a ser **não piorar contra A**: o IC 95% pareado da diferença B − A de cada erasure precisa ter
limite superior ≤ +0,05. O teto de 0,2 continua como META, e o relatório informa se foi atingida.
Essa emenda é PROVISÓRIA: o dono pode decidir que a meta absoluta vale como guarda (tarefa 1.2 [D]).
Nenhuma rodada de V1, V2 ou V3 foi feita antes desta emenda.

## Emenda 2 (21/11/2026, antes de qualquer rodada válida): detalhes OPERACIONAIS

Só diz com que áudio e com que braços se mede. Métrica, efeito mínimo, guardas e decisão NÃO mudam.

- **Áudio**: o `fleurs-en-8` não exercita o Parakeet (a rota só o escolhe com todas as fontes em pt ou es). A amostra é o fixture
  `tests/fixtures/bancada-captura/fleurs-pt-12.json` (FLEURS pt_br, split de teste, CC BY 4.0): 12 falas de 3 a 5,8 s de voz (o VAD parte
  falas acima de 6 s), 10 com >= 90% das palavras casadas no alinhamento (`whisper-small_timestamped`; o medium não foi melhor), as 2 restantes
  `foraDoCalculo` e contadas à parte. Variedade: frases e arquivos diferentes; o dataset não traz id de falante e todas as 919 linhas do split
  vêm rotuladas `MALE`, então a variedade de vozes NÃO é verificável (limite declarado).
- **Cenário**: `--fixture fleurs-pt-12.json --eles pt-BR --eu pt-BR --qualidade accurate` (sem tradução, pt para pt; a métrica é a do original).
  Fumaça: o braço `atual` roda `parakeet-local` nas 12 falas (`capSummary.porMotor`), sem parciais. `babel.stt.parakeet` já vem ligada de fábrica; nenhuma chave é gravada.
- **Braços** (um servidor, um `dist/`): `atual` (nenhuma flag; Parakeet), `v1` (`parciais_vivos`), `v1v2` (`parciais_vivos,parciais_parakeet`).
  V1b reprovou todos os modos de exibição (`docs/auditoria/2026-11-21-ab-dos-parciais-v1b.md`): `v1` e `v1v2` usam o modo padrão (`cauda-token`, sem chave de armazenamento).
- **Comparações**: V2 é `v1v2` contra `v1`, pelo critério acima; `v1v2` contra `atual` é a comparação auxiliar (informativa).
- **Rodadas**: 12 por braço e perfil, intercaladas, aquecimento descartado (baixa o Parakeet, 672 MB, no perfil de cada braço), perfis `desktop` e `fraco` (EMULADO;
  se a rota não escolher o Parakeet no `fraco`, o relatório diz e não conta como V2).

# Critério do A/B — V1c `parciais_vivos` só acrescentando, com máscara (change `parciais-incrementais`, tarefa 2.6, variante nova)

Escrito ANTES de qualquer rodada de V1c (a fumaça de 1 rodada por modo, que não conta, vem depois deste commit). É uma variante NOVA:
não reabre os critérios de V1 (`../parciais-v1-vivos/criterio.md`) nem de V1b (`../parciais-v1b-estavel/criterio.md`), ambos REPROVADOS e que continuam assim.
Mesmas guardas e mesma métrica primária de V1b; só mudam os braços e a hipótese.

## Hipótese

V1 (`cauda-token`: 1.265 → 255 ms, −80%) e V1b `cauda-decode` (1.164 → 263 ms, −77%) cortam o atraso mas reprovam pela erasure do original (3,60 e 2,25
contra 0,59 a 0,66 de `atual`); `sem-cauda` zera o pisca mas fica mais lento que hoje (1.164 → 1.846 ms). A erasure vem de a cauda TROCAR palavras já mostradas.
V1c: a tela do parcial vivo **nunca troca nem apaga** uma palavra já mostrada, só acrescenta. A cada hipótese nova mostra o maior prefixo dela que estende o que já está na
tela, menos as últimas k palavras (máscara, k = 2 provisório; o confirmado da LocalAgreement-2 nunca é mascarado). Se a hipótese diverge do que está na tela, nada novo
aparece até ela voltar a concordar (ou até o final, que substitui tudo, como hoje). Esperado: erasure do original próxima de 0 (só o final substitui), com parte do
ganho de atraso de `cauda-token`/`cauda-decode`, porque a máscara de 2 palavras mostra antes que a LocalAgreement-2 confirmar. Pode falhar: a divergência trava a tela
até o final em falas curtas, e então o atraso volta ao de `sem-cauda`.

## Braços (mesmo `dist/`, um servidor; o braço muda só `babel.flags` e a chave de laboratório do navegador)

| braço                   | flags            | `babel.lab.parciaisModo` | o que a tela mostra                                                                                                                   |
| ----------------------- | ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `atual`                 | nenhuma          | (ausente)                | o de hoje                                                                                                                             |
| `v1c-acrescenta-decode` | `parciais_vivos` | `acrescenta-decode`      | só acrescenta, a cada decode COMPLETO: prefixo da hipótese que estende a tela, menos as 2 últimas palavras; diverge = não mostra nada |
| `v1c-acrescenta-token`  | `parciais_vivos` | `acrescenta-token`       | a mesma regra, também a cada token do `onUpdate` (os dois sub-modos medem se a cadência do token compensa o custo de renders)         |

Comparação: cada braço `v1c-*` contra `atual`, por perfil (`desktop` medido, `fraco` EMULADO). Números de V1 e V1b entram só como linha de referência no relatório.

## Medição

`bancada-captura.mjs` + `ab-parciais.mjs --variante v1c`, áudio `fleurs-en-8`, >= 10 rodadas válidas por braço e perfil, intercaladas,
aquecimento descartado, rodada inválida refeita. Bootstrap pareado por fala, 10 000 reamostragens, semente 20261121, IC 95% POR
COMPARAÇÃO, sem correção de multiplicidade (declarado: 2 braços × 2 perfis; por isso a aprovação exige a primária E todas as guardas).

## Métrica primária

`atrasoDePalavraMs` p50 do ORIGINAL, por perfil: diferença pareada por fala (palavras somadas), IC 95%.

## Efeito mínimo

-20% sobre o p50 de `atual` (PROVISÓRIO, a confirmar pelo dono; tarefa 1.2 [D]). B só é "melhor" se o IC 95% inteiro ficar abaixo de 0
e o efeito for >= 20% em módulo. IC que cruza 0, ou efeito < 20%: "sem diferença provada".

## Guardas (qualquer uma que falhe reprova B)

1. `fimDaFalaAteLegendaMs` p75: limite superior do IC 95% da diferença B − A **<= +30 ms**. Declarado: a resolução da bancada é de
   ~100 ms (amostragem e quadros), então a guarda `<= 0` de V1 era mais rígida do que a régua enxerga (V1 reprovou por +4 ms de limite
   superior). +30 ms fica abaixo da resolução: é "sem piora perceptível", não uma licença para atrasar o final.
2. `erasureOriginal`: limite superior do IC 95% da diferença B − A **<= +0,05** (a mesma regra da Emenda 1 de V1: não piorar contra
   `atual`). A meta absoluta de 0,2 (NE de Arivazhagan et al.) é só informada.
3. Texto final: o final é intocado, mas 5 de 8 falas já variam entre as rodadas do próprio `atual` (a janela do VAD muda o decode), então
   "texto fora do conjunto de A" é régua ruidosa e não decide. A guarda é o **WER pareado do final contra a referência do FLEURS**:
   diferença B − A (por fala, bootstrap pareado), limite superior do IC 95% **<= +2 pontos percentuais** (+0,02). Os números de
   "fora do conjunto de A" saem no relatório, só como informação.
4. `framesLongos.n50/n100/somaMs`, `cpuSilencio.processoPct`, `rendersPorS.*` (silêncio e fala) e taxa de falha, todos do
   `slo-captura.json`: regra "B > A x (1 + tolerância) + folga piora", sobre a mediana das rodadas. Memória de pico: o headless não
   expõe (sem base).

## Leitura do perfil `fraco`

O perfil leve liga o modo desempenho automático: 1 parcial por fala por desenho, e a cadência não atua (V1 foi inerte ali). O
relatório reporta o que sair, sem mudar o desenho. Fraco EMULADO não aprova celular; ele só ordena e acha regressão.

## Decisão

APROVADO = primária (IC inteiro abaixo de 0, efeito >= 20%) E todas as guardas. REPROVADO = alguma guarda falha, ou primária pior (IC
inteiro acima de 0). SEM DIFERENÇA PROVADA = IC da primária cruza 0 ou efeito < 20%, sem guarda reprovada. Se os dois braços
aprovarem, recomenda-se o de maior efeito na primária (empate: o de `acrescenta-decode`, o mais simples). Ligar a flag é decisão [D] do dono,
e mesmo aprovado no desktop o ganho em celular exige a rodada [R] em aparelho real. O critério não muda depois de ver o número.

## Emenda 1 (21/11/2026, antes de qualquer rodada do braço pt): A/B pt com o Parakeet (OPERACIONAL)

Escrita depois do A/B em inglês (dados commitados) e ANTES de qualquer rodada pt. Só diz com que áudio e com que braços se mede; métrica, efeito mínimo, guardas e decisão NÃO mudam.

- **Resultado em inglês que decide o modo**: `acrescenta-decode` desktop = SEM DIFERENÇA PROVADA; `acrescenta-token` desktop = REPROVADO (primária pior, erasure, renders de fala). No fraco os dois reprovam. Nenhum modo se destacou como melhor; o escolhido para o pt é o mais simples e menos ruim, `acrescenta-decode`.
- **Áudio e cenário**: o mesmo da Emenda 2 de V2 (`../parciais-v2-parakeet/criterio.md`): `tests/fixtures/bancada-captura/fleurs-pt-12.json`, `--fixture fleurs-pt-12.json --eles pt-BR --eu pt-BR --qualidade accurate` (pt para pt; o Parakeet só serve com todas as fontes em pt/es). Só o perfil `desktop` (no `fraco` emulado a rota escolhe `whisper-base`; o Parakeet não existe ali).
- **Braços** (um servidor, um `dist/`): `atual` (nenhuma flag; Parakeet, sem parciais) e `v1v2-acrescenta` (`parciais_vivos,parciais_parakeet`, com `babel.lab.parciaisModo=acrescenta-decode`). O contraste pedido é `v1v2-acrescenta` contra `atual`, pelas mesmas métricas e guardas de V1c (`ab-parciais.mjs --variante v1c`). Os números de `v1v2` (cauda-token) da V2 entram só como referência no relatório.
- **`fimDaFalaAteLegendaMs` NÃO é medível** neste cenário (como no relatório de V2): ele é o tempo até a TRADUÇÃO e o cenário é pt para pt. A guarda 1 fica "sem medida"; não é aprovação nem reprovação e o veredito é lido sem ela, dito assim no relatório. Se o resto aprovar, a aprovação fica CONDICIONADA a uma métrica própria de "final do original".
- **Rodadas**: >= 10 válidas por braço, intercaladas, aquecimento descartado (baixa o Parakeet).

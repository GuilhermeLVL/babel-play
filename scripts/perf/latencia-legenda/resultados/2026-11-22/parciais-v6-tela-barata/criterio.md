# Critério do A/B: V6 `parciais_vivos` com a ATUALIZAÇÃO BARATA do parcial (change `parciais-incrementais`, tarefa 2.6, variante nova)

Escrito e commitado ANTES de qualquer rodada válida de V6. A fumaça de 1 rodada por braço e o diagnóstico de renders (abaixo) não contam e vêm antes/depois deste commit.
É uma variante NOVA, só para rodadas novas: não reabre nada medido (V1 a V5 mantêm os vereditos que têm). Mesma métrica primária, mesmo orçamento de erasure, mesmo limitador de
125 ms e **as mesmas guardas e limites da V5** (`../parciais-v5-final-livre/criterio.md`), inclusive o teto de +30 ms do final e o SLO de renders. NADA foi afrouxado.

## O que `rendersPorS` conta (diagnóstico, antes das rodadas)

`rendersPorS.*` (`sonda.js` + `metricas-captura.mjs`) NÃO conta mutações do DOM nem commits: conta, por commit do React (gancho `onCommitFiberRoot`), os COMPONENTES que renderizaram de fato
(fibra montada agora ou com `PerformedWork`; tags Function, Class, ForwardRef, SimpleMemo), somados na janela e divididos pelos segundos. Um re-render de componente pai com filhos não memorizados soma
um por filho. `commitsPorS` é a contagem de commits à parte. Janela `fala` = do início da 1ª voz a 1 s depois do fim da última (~99 s no `fleurs-pt-12`).

Medida com a sonda em build sem minificar (nomes dos componentes; `SONDA_NOMES_DO_RENDER=1`), 1 rodada por braço, pt/Parakeet desktop, `fleurs-pt-16` (fumaça, não conta):

| braço                          | commits na janela | componentes | por commit | renders/s |
| ------------------------------ | ----------------- | ----------- | ---------- | --------- |
| `atual`                        | 229               | 5.793       | 25,3       | 58,4      |
| `v5-pt` (V5, `parciais_vivos`) | 372               | 11.643      | 31,3       | 117,5     |

Os commits têm três tamanhos, e é isso que explica os 109/s da V5: (a) **~23 componentes**: a tela de captura (`LiveCapture`: barra de controles, ~14 ícones e botões) re-renderiza a cada mudança do estado das
falas e a cada tique do relógio de 1 s (101 no `atual`; 160 na V5: +60 são atualizações do parcial); (b) **~57 componentes**: o App inteiro (menu lateral, ícones de navegação), re-renderizado por
`useTextoDaConversa` → `onTranscriptChange` → `setLiveTranscription` a cada texto novo, no máximo a cada 500 ms (34 commits no `atual`, 82 na V5); (c) 1 a 3 componentes: a linha da fala. Cada atualização do
parcial paga (a) e, quando o intervalo de 500 ms vence, (b), para trocar o texto de uma linha. O limitador de 125 ms cortava a FREQUÊNCIA, não o custo.

## Hipótese

Se o texto do parcial vivo deixa de passar pelo estado que re-renderiza a tela de captura e o App (o 1º texto de cada fala e o final entram no estado; o texto intermediário mora num armazém lido só pela linha
que o mostra, e o texto da conversa que sobe ao App ignora o parcial), cada atualização custa 1 a 3 componentes em vez de ~23 a ~80, e `rendersPorS.fala` do pt cai de ~109 (V5) para perto do `atual` (~57),
dentro do limite do SLO (`atual` x 1,25 + 10 = ~82), SEM mudar o que a V5 já provou no atraso por palavra e no final (o código do parcial, do final e da cadência é o da V5; muda só onde o texto é escrito e lido).
Com o IC do p75 do final mais estreito (mais falas e rodadas), a guarda do final decide com menos ruído. Flag desligada = comportamento de hoje.

## Fixture (declarado)

`tests/fixtures/bancada-captura/fleurs-pt-16.json` (commit `2b904887`): FLEURS pt_br, split de teste, CC BY 4.0, 16 falas de 3 a 5,9 s (as 12 do `fleurs-pt-12` mais `fleurs_pt_1879`, `1889`, `1906` e `1957`), feitas do FLEURS
baixado em `~/dev/sandbox/fleurs-pt-bancada` pelo mesmo processo (`montar-audio.mjs --gerar-fixture`, alinhamento `whisper-small_timestamped` fp32, mínimo de 90% casadas). **14 de 16 falas no cálculo por palavra**
(`fleurs_pt_1736` e `fleurs_pt_1870` ficam fora, como na V4/V5); a V5 teve 10 de 12. É a única mudança de áudio: `atual` e `v6-pt` rodam nele, nesta sessão.

## Braços (mesmo `dist/`, um servidor; o braço muda só `babel.flags` e as chaves de laboratório do navegador)

| braço   | perfis  | cenário                                                                               | flags                              | `babel.lab.parciaisModo` | `babel.lab.parciaisMascara` | limitador |
| ------- | ------- | ------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------ | --------------------------- | --------- |
| `atual` | desktop | `fleurs-pt-16`, `--eles pt-BR --eu pt-BR --qualidade accurate` (Parakeet, pt para pt) | nenhuma                            | (ausente)                | (ausente)                   | não       |
| `v6-pt` | desktop | o mesmo                                                                               | `parciais_vivos,parciais_parakeet` | `acrescenta-decode`      | (ausente = 2, o padrão)     | sim       |

Braço único de interesse: pt/Parakeet no desktop, `atual` x `v6-pt`. Inglês (`fleurs-en-8`, `v6-en`, desktop e fraco emulado) é OPCIONAL e só informativo: não decide e não é requisito. O fraco emulado
não exerce o Parakeet (rota `whisper-base`) e, se rodado, "fraco emulado não aprova celular".

## Medição

`bancada-captura.mjs` + `ab-parciais.mjs --variante v4 --criterio <este arquivo>` (a mesma lógica de veredito da V4/V5), **>= 14 rodadas válidas por braço**, intercaladas, aquecimento descartado, rodada inválida
refeita. Bootstrap pareado por fala, 10.000 reamostragens, semente 20261121, IC 95% POR COMPARAÇÃO, sem correção de multiplicidade (a aprovação exige a primária E todas as guardas).
Só informativo (não é guarda): `sttEspera`, `commitsPorS`.

## Métrica primária

`atrasoDePalavraMs` p50 do ORIGINAL: diferença pareada por fala (palavras somadas), IC 95%.

## Efeito mínimo

-20% sobre o p50 de `atual` (provisório). B só é "melhor" se o IC 95% inteiro ficar abaixo de 0 e o efeito for >= 20% em módulo. IC que cruza 0, ou efeito < 20%: "sem diferença provada".

## Guardas (qualquer uma que falhe reprova B), IGUAIS às da V5

1. Final: **`fimDaFalaAteOriginalMs` p75** (pt para pt, não há tradução): limite superior do IC 95% da diferença B - A **<= +30 ms**.
2. **`erasureOriginal` de B, orçamento absoluto:** média <= 0,5 E limite superior do IC 95% de B <= 0,6. A erasure de A e B - A só informadas.
3. Texto final: **WER pareado** do final contra a referência do FLEURS, diferença B - A, limite superior do IC 95% **<= +2 pp** (+0,02).
4. `framesLongos.n50/n100/somaMs`, `cpuSilencio.processoPct`, `rendersPorS.*` (silêncio e fala) e taxa de falha do `slo-captura.json`: regra "B > A x (1 + tolerância) + folga piora", sobre a mediana das
   rodadas. Para `rendersPorS.fala` (tolerância 25%, folga 10): o limite é `mediana(atual)` x 1,25 + 10, como na V5.

## Decisão

APROVADO = primária (IC inteiro abaixo de 0, efeito >= 20%) E todas as guardas. REPROVADO = alguma guarda falha, ou primária pior (IC inteiro acima de 0). SEM DIFERENÇA PROVADA = IC da primária cruza 0 ou
efeito < 20%, sem guarda reprovada. Ligar a flag é decisão [D] do dono, e mesmo aprovado no desktop o ganho em celular exige a rodada [R] em aparelho real. O critério não muda depois de ver o número.
A fumaça (1 rodada por braço) não decide nada; se `rendersPorS.fala` do `v6-pt` não cair perto do `atual` nela, a implementação é investigada ANTES do A/B completo.

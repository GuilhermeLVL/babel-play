# Primeiro texto na tela: a bimodalidade do desktop (2026-11-23)

Branch `fix/primeiro-texto-na-tela`. Critério (commitado antes das rodadas): `scripts/perf/latencia-legenda/resultados/2026-11-23/primeiro-texto/criterio.md`.
Dados: a mesma pasta (`metricas/`, `resultado-*.json`, `primeiro-*.json`, `guarda-*.json`, `antes-depois.md`).

## Veredito pelo critério

**REPROVADO pela guarda 1 no desktop** (o critério vale como foi escrito), com a primária muito a favor e o risco concentrado numa guarda sem poder estatístico. A decisão é do dono (ver "O que fica para o dono").

| item                                                                 | resultado                                                                                         | critério            | situação  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------- | --------- |
| Primária, desktop: `primeiroTextoNaTelaMs` mediana (12 × 12 rodadas) | 3.207 → 1.635 ms; dif. −1.572 ms, IC 95% [−1.777, −1.536]; rodadas lentas (>= 2,5 s) 11/12 → 0/12 | IC < 0 e >= −20%    | melhor    |
| Não-regressão, fraco emulado: mesma métrica                          | 1.905 → 1.917 ms; dif. +12,5 ms, IC [−6, +15,5]                                                   | limite sup. <= +100 | passa     |
| Guarda 1, desktop: `fimDaFalaAteLegendaMs` p75 pareado (8 falas)     | 1.022 → 968 ms; dif. −54 ms, IC [−165, **+125**]                                                  | limite sup. <= +30  | **falha** |
| Guarda 1, fraco emulado: idem                                        | 1.230 → 1.224 ms; dif. −6 ms, IC [−67, +22]                                                       | limite sup. <= +30  | passa     |
| Guarda 2: SLO (`comparar.mjs`, `local-darwin`) sobre `depois`        | todas "ok"; 1º texto desktop "melhorou" (−49%)                                                    | sem reprovação      | passa     |
| Guarda 3: taxa de falha da legenda                                   | 0/96 nos dois braços e perfis                                                                     | <= antes            | passa     |

Rodadas: 12 válidas por braço e perfil (intercaladas, aquecimento descartado), nenhuma inválida. Fraco é EMULADO e não aprova celular.

## Diagnóstico (rodadas curtas fora do critério)

Seis rodadas de diagnóstico no desktop, com as marcas e os eventos brutos de cada uma (`rodadas/*.json` da bancada; `primeiroTextoNaTelaMs` é "início da voz → 1º balão com letra").
Os dois modos têm a MESMA carga: modelo pronto aos ~0,9 s (`sttProntoMs`), VAD aberto aos ~0,2 s. A voz começa aos ~6,35 s e o 1º parcial sai aos ~7,2 s (0,6 s de fala mais o tique de 200 ms) nos dois modos. A diferença está no que ele devolve:

- **Modo rápido (~1,0 s):** o 1º parcial (10 752 amostras) volta com texto (`"all the more all"`, `"the more"`: lixo, mas texto) e o balão acende aos ~1,0 s.
- **Modo lento (~3,2 a 3,4 s):** o 1º parcial (10 752 a 12 288 amostras) volta VAZIO (`descartado: true`, o filtro de alucinação do worker cortou um texto repetitivo) e o próximo só sai aos ~9,4 s, com 47 616 amostras: **~2,2 s depois**, o espaçamento de 2 s dos parciais.

Já existia o remédio para "1º parcial sem texto" (`devolverCota` em `systemAudio.ts`, `carga-rapida-no-celular` 5.2: devolve a cota e libera o próximo parcial sem esperar 2 s). Ele não rodava no caminho da aba/sistema (o da bancada):
o adaptador `fontesDeAudio.ts` (`onPartialAudio` de `startSystemAudioCapture`) chamava `sysHandlers.onPartialAudio(...)` e **descartava o retorno**; o `false` do pipeline (`if (!limpo) return false`) nunca chegava à captura. O microfone repassa `micHandlers.onPartialAudio` direto e já funcionava. Descartados: carga do modelo, aquecimento e VAD (iguais nos dois modos); o primeiro decode é rápido (~80 a 100 ms nos dois).

A bimodalidade vem, portanto, do acaso do 1º decode de ~0,8 s de fala (texto ou vazio), e a correção troca "2,2 s de espera" por "mais 0,6 s de fala".

## O conserto

Uma linha em `src/lib/captura/fontesDeAudio.ts` (`return sysHandlers.onPartialAudio(...)`) e o tipo `HandlersDaFonte.onPartialAudio` alargado para `void | boolean | Promise<void | boolean>` (`src/lib/captura/tiposDaFala.ts`). Teste: `tests/fontesDeAudioWebSpeechDoSistema.test.ts` (falhava antes, passa agora).
Efeito medido: o 1º texto fica estável em ~1,63 s (min 1.621, max 1.647), em vez de ~3,2 s em 11 de 12 rodadas; o modo "sortudo" de ~1,0 s (texto alucinado) deixa de existir no `depois`: a mediana de `antes` ~3,2 s cai para ~1,6 s, não para ~1,0 s.

## Por que a guarda 1 reprova, e o que ela vale

O caminho do FINAL não foi tocado (a mudança só decide quando o PARCIAL seguinte sai). A estimativa pontual do p75 do final no desktop é −54 ms (melhor), mas o IC é largo: `fimDaFalaAteLegendaMs` é pareado por fala e a fixture tem 8 falas; o p75 sobre 8 falas tem resolução de ~100 ms (a mesma razão pela qual o critério da V7 de `parciais-incrementais` subiu o teto para +100 ms). Um teto de +30 ms abaixo dessa resolução não separa efeito de ruído; nesta variante ele reprova por ruído. No fraco, com menos ruído, o limite superior é +22 ms.
O critério não foi mudado depois do número; o veredito acima é o dele.

## Riscos

- Um parcial a mais por fala quando o 1º volta vazio (já era o desenho de `devolverCota`); o `rendersPorS.fala` do desktop subiu de 88 para 103/s, dentro do limite do SLO (120).
- O 1º texto passa a depender do 2º parcial (~0,6 s de fala a mais); o ganho de "texto alucinado em 1,0 s" não é reproduzido (e não era um ganho real: era lixo na tela).
- Rodada só neste Mac (`desktop` = Chromium headless medido; `fraco` emulado). Não vale para celular real.

## O que fica para o dono

1. Decidir sobre a guarda 1: aceitar o teto de +100 ms (o mesmo da V7) para esta mudança, dado que o caminho do final não muda e o IC é limitado pela resolução de 8 falas, ou exigir nova rodada com a fixture de 16 falas (`fleurs-pt-16`, rota Parakeet) para estreitar o IC.
2. Aprovada a guarda, a mudança já está pronta (1 arquivo de produção, sem flag: é correção de um retorno descartado); falta PR, CI e o `slo-captura.json` (base `local-darwin` do `primeiroTextoNaTelaMs` pode baixar de ~3,2 s para ~1,6 s; tolerância atual 25% + 500 ms).
3. A rodada [R] em aparelho real continua valendo para o celular.

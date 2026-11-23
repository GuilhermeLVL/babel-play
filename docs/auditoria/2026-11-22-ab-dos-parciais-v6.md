# A/B de V6: atualização barata do parcial (renders ao SLO) e amostra maior

Data: 22/11/2026. Branch `lab/streaming-parciais`, código `4a2d0c4b` (`npm run build:estatica` refeito antes das rodadas). Critério escrito e commitado antes de qualquer rodada válida
(`scripts/perf/latencia-legenda/resultados/2026-11-22/parciais-v6-tela-barata/criterio.md`, commit `4e3a6861`), com as mesmas guardas e limites da V5 (nada afrouxado).
Decisão de `ab-parciais.mjs --variante v4 --criterio <v6>`. **15 rodadas válidas por braço** (nenhuma inválida; aquecimento descartado), `atual` × `v6-pt` intercalados no desktop, pt/Parakeet.
Dados: `.../parciais-v6-tela-barata/desktop-pt/{metricas,v6-pt.json,v6-pt.md}`.

## Veredito: REPROVADO (guarda 1, final do original p75)

O problema da V5 que esta variante atacava (renders) **foi resolvido**; a guarda do final **continua reprovada**, agora pelo lado oposto do IC.

| braço              | perfil  | atraso por palavra p50 (ms)                      | erasure de B                | final do original p75 (B − A)           | renders/s na fala             | veredito                                             |
| ------------------ | ------- | ------------------------------------------------ | --------------------------- | --------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| `v6-pt` (Parakeet) | desktop | 2.637 → 1.102 ms (**−58%**, IC [−1.700, −1.283]) | 0,37 (IC de B [0,26, 0,48]) | 925 → 973 ms, **+48 ms**, IC [+1, +116] | 58,2 → **63,0** (limite 82,8) | **REPROVADO** (guarda 1: limite superior +116 > +30) |

Demais guardas, todas ok: erasure de B dentro do orçamento (média 0,37 <= 0,5; limite superior 0,48 <= 0,6); WER do final +0,0 pp (IC [−0,5, +0,5]; `atual` e `v6-pt` 2,4%); frames longos 0; CPU no silêncio 15,8 → 15,5% (limite 27,2);
renders no silêncio iguais. Fala: 14 de 16 falas no cálculo por palavra (fixture `fleurs-pt-16`; a V5 teve 10 de 12). Intervalos: 15 rodadas × 16 falas por braço, bootstrap pareado por fala, 10.000 reamostragens, semente 20261121.

## O que `rendersPorS` conta e o que custava

`rendersPorS` **não** conta mutações do DOM nem commits: conta, por commit do React (gancho `onCommitFiberRoot` da sonda), os **componentes que renderizaram de fato** (função, classe, forwardRef, memo simples),
somados na janela de fala e divididos pelos segundos. Um pai que re-renderiza arrasta cada filho não memorizado (cada ícone conta 1). Diagnóstico com os nomes dos componentes (opt-in `SONDA_NOMES_DO_RENDER=1`, bundle sem minificar):

| braço         | commits na janela | por commit | renders/s | composição dos commits                                                                                         |
| ------------- | ----------------- | ---------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `atual`       | 229               | 25,3       | 58,4      | 101 de ~23 comp. (tela de captura: relógio de 1 s), 34 de ~57 (App inteiro), o resto linhas                    |
| V5 (`v5-pt`)  | 372               | 31,3       | 117,5     | +60 de ~23 (a tela de captura a cada parcial no estado) e +48 de ~57 (o App, via `useTextoDaConversa`, <= 2/s) |
| V6 (fumaça 2) | n/d               | n/d        | 63,7      | parcial: 8 a 21 componentes por atualização (só a linha), sem tela de captura nem App                          |

Duas causas, não uma: (1) cada texto de parcial ia ao estado das falas de `LiveCapture` e re-renderizava a tela de captura (barra e ~14 ícones); (2) o texto da conversa que sobe ao App a cada 500 ms
(`useTextoDaConversa` → `setLiveTranscription`) re-renderizava o App inteiro (menu lateral, ícones). Havia ainda (3) o ramo "mesmo idioma" de `translateSegment`, que a cada parcial pt para pt escrevia
no estado um objeto novo mesmo com a tradução já vazia (achado na 1ª fumaça: 73 renders/s).

## O que mudou (atrás de `parciais_vivos`; flag desligada = hoje)

- `src/lib/captura/parcialVivo.ts` (novo): armazém do texto vivo por fala. O pipeline escreve nele o texto de cada atualização (limitador de 125 ms intacto); o 1º texto de cada fala e o final continuam no estado das falas.
  Só a linha que mostra o parcial assina (`useParcialVivo`: `HistoricoDoPrototipo`/`Linha`, `FalaDaConversa` do `ChatTranscript`) e as janelas de legenda (`useFalasComParcialVivo` em `LegendasFlutuantes`, `LegendaEmVideo` e
  `LegendaFlutuanteDoPrototipo`). A cauda provisória (`aria-live="off"`) e a região viva só do confirmado/fechado seguem como estavam. A legenda segura é aplicada na escrita do armazém (política de agora, confirmado só como prefixo).
  Final, erro e ruído limpam o armazém em silêncio (a linha não pisca o texto velho).
- `useTextoDaConversa(…, semParcial)`: com a flag, o texto que sobe ao App ignora o parcial em curso.
- `traducaoDaFala.ts`: no mesmo idioma, não escreve no estado quando a tradução do balão já está vazia (a mesma lista volta). É a única mudança fora da flag, sem efeito no conteúdo do estado, só em quantas vezes ele é trocado.
- Testes: `tests/parcialVivo.test.tsx` (o pai não re-renderiza a cada atualização; a linha e a janela acompanham o armazém; legenda segura), `tests/traducaoMesmoIdiomaSemEscrita.test.ts`, `tests/conversaEstavel.test.tsx`
  (semParcial), e `tests/pipelineDeFala-parciaisVivos.test.ts` adaptado ao novo canal (o limitador junta as hipóteses no armazém; o estado recebe o 1º texto e o final). Os de `legendaProvisoria` passam sem mudança.

## Fumaça (1 rodada por braço, não conta)

1ª: `atual` 57,9 → `v6-pt` 73,2 renders/s (V5: 109). Investigado (commits de 31 a 47 componentes restantes) e achada a escrita do ramo "mesmo idioma". 2ª, depois do conserto: 57,7 → 63,7. Nenhuma terceira tentativa foi necessária.

## Comparação com V4 e V5 (pt/Parakeet, desktop)

| variante | falas no cálculo | atraso p50 (efeito) | final do original p75 (B − A) | renders/s (limite) | parcial em voo no final              | veredito  |
| -------- | ---------------- | ------------------- | ----------------------------- | ------------------ | ------------------------------------ | --------- |
| V4       | 10               | −39%                | +198 ms, IC [+54, +445]       | 57 (ok)            | 5 de 24 falas, esperas 30–638 ms     | REPROVADO |
| V5       | 10               | −55%                | −48 ms, IC [−114, +62]        | 109 (82)           | n/d                                  | REPROVADO |
| V6       | 14               | **−58%**            | **+48 ms**, IC [+1, +116]     | **63 (83)**        | **5 de 240 falas, esperas 12–50 ms** | REPROVADO |

## Leitura

- **Renders resolvidos:** 109 → 63 renders/s (+8% sobre o `atual`, limite +42%), sem perder o ganho de atraso (−58%, o melhor até aqui) nem o orçamento de erasure.
- **O mecanismo do final da V5 se mantém:** só 5 de 240 finais encontraram um parcial em voo, e esperaram no máximo 50 ms (na V4, 30 a 638 ms). Não é fila no worker que explica o +48 ms.
- **A guarda do final não é provada nem pelo ponto nem pelo IC:** com mais falas e rodadas o IC ficou mais estreito (largura 115 ms, antes 176) e se deslocou para cima (+1 a +116). Entre V5 (−48) e V6 (+48) o código do
  final e do parcial é o mesmo; o que mudou foi o fixture (as 4 falas novas) e o armazém. Duas leituras possíveis, que esta bancada não separa: custo real de ~50 ms na fase final quando o parcial dividiu a CPU até o fim da fala
  (o decode final do Parakeet leva ~450 ms; basta uma fatia do parcial cedida), ou ruído de 100 ms de resolução num p75 de 16 falas. O critério pede limite superior <= +30 ms e não foi atingido.
- **Limites da flag, ainda não cobertos:** as telas do Intérprete e da Conversa virtual leem o estado das falas e mostram, durante o parcial, o 1º texto (não o vivo). A legenda da tela de captura, o `ChatTranscript` e as janelas
  flutuante, em vídeo e painel mostram o vivo. O iChat deixa de ver o texto em curso (só o fechado). Inglês e `fraco` emulado não foram rodados (opcionais).

"Fraco emulado não aprova celular" (não rodado aqui; o fraco não exerce o Parakeet).

## Próximos passos sugeridos (exigem critério novo)

1. Separar custo real de ruído na guarda do final: rodar a V6 com 20+ rodadas ou instrumentar o tempo do final no worker até o fim da voz por fala (a `finalNoWorker` já tem `stt`/`decodeDoFinalMs`) e comparar com `atual` fala a fala.
2. Se for custo de CPU concorrente: pausar a cadência do parcial `fim-provável` mais cedo, ou dar ao final prioridade de fatia no worker do Parakeet.
3. Decisão do dono: o limite de +30 ms do final no pt (o `atual` já tem p75 de ~925 ms) é o que reprova; a V6 atende a primária, o erasure, o WER e o SLO de renders.

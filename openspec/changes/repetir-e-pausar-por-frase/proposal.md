## Why

Quem estuda com uma fala ouve, para, repete em voz alta e volta. Hoje o app faz isso à mão: na tela da sessão, a pessoa
aperta pausa e play a cada frase. Há um começo no código, mas incompleto:

- `src/lib/analise/playerDaSessao.ts` tem `loopMode` (repetir a frase) e `pararNoFimRef` (parar no fim da frase). O
  `loopMode` em `Analysis.tsx:155` é `useState(false)` sem setter: está morto, nenhuma tela o liga. O `pararNoFimRef` só é
  ligado pelo modo guiado da escuta (`escuta.modo !== 'livre'`, `Analysis.tsx:435`), onde a pausa serve a "ouvir sem ver
  o texto", não a "repetir em voz alta".
- A sombra (`SombraDaFala.tsx`) e o ditado (`DitadoDoPrototipo.tsx`, `ditadoDeFrase`) são telas separadas: a pessoa sai do
  fluxo de ouvir para praticar.
- O audiolivro (`src/lib/leitor/audiolivro/reprodutor.ts`) tem os tempos `{i, t0, t1}` de cada frase, mas nenhum modo "uma
  frase por vez".

Pedido do dono (ideia X1): repetir ou pausar por frase automaticamente, para sombra e ditado.

**Limite de plataforma, dito de cara.** O app NÃO consegue pausar nem repetir uma aba ou um aplicativo externo (Netflix,
YouTube em outra aba, TV): o navegador não dá controle de mídia entre origens, e a captura de som do sistema só LÊ o
áudio. Esta change cobre só mídia que o Frasy mesmo toca: (1) o áudio da sessão gravada ou importada (`<audio>` da tela
Análise); (2) o capítulo do audiolivro (`reprodutor.ts`); (3) a narração por voz sintetizada (TTS) das sessões sem áudio
e da escuta guiada. Vídeo importado: hoje a importação só aceita `audio/*` (`Library.tsx:712`); vídeo com player próprio
fica FORA (ver abaixo).

Sobreposição conferida: a change arquivada `escuta-guiada-por-nivel` (spec `escuta-guiada`) já para no fim da frase nos
modos guiados e esconde o texto; ela NÃO repete nem espera para a pessoa falar. Esta change é o delta: repetição, pausa
de repetir e ponte com a prática. Não há change ativa nem arquivada de "repetir/pausar por frase".

## Para quem

Quem estuda com frases curtas de sessões próprias, de áudio importado e de audiolivro, em qualquer aparelho com som
(inclui Firefox e Quest, porque a pausa por frase não precisa de microfone nem de Web Speech). Menores incluídos: nada
novo é coletado.

## What Changes

- **Modo "Frase por frase"** no player da sessão (Análise), atrás da flag `frase_por_frase` (nova, nasce DESLIGADA, sem
  regra de plano). Escolhas, por aparelho (`localStorage` com `try/catch`, como o modo de escuta):
  - **Repetir N vezes** (1, 2 ou 3) a mesma frase antes de seguir;
  - **Pausa de repetir**: ao fim da frase, silêncio de `duração da frase x 1,0` (ajustável de 0,5x a 2x) para a pessoa
    repetir em voz alta, depois segue sozinho;
  - **Parar no fim** (o que `pararNoFimRef` já faz), até a pessoa tocar em "Próxima".
- **Ponte com a prática**: no fim de cada pausa, um toque abre a sombra (`SombraDaFala`) ou o ditado da frase em foco, sem
  trocar de tela; ao fechar, o modo continua da frase seguinte. A prática em si segue como é (nota por Web Speech onde há;
  a change `sombra-sem-web-speech` cobre o resto).
- **Máquina pura** `src/core/learning/frasePorFrase.ts` (sem DOM, no estilo de `escutaGuiada.ts`): dado o modo, o
  índice, a repetição corrente e o evento (`fimDaFrase`, `fimDaPausa`, `proxima`, `anterior`), devolve a próxima ação
  (`repetir`, `esperar(ms)`, `seguir`, `parar`). O hook liga isso ao `seekTo`/`setIsPlaying` do player.
- **Audiolivro**: o mesmo modo no `reprodutor.ts`, usando `t0/t1` das frases, só quando a flag `audiolivros` já estiver
  ligada para a pessoa (não cria acesso novo).
- **Narração TTS**: a rota `falarDe` do player já tem `loopMode`; o modo passa por ela, para sessões sem áudio gravado.
- Com a flag desligada nada muda: o player continua como hoje.

## Fora de escopo

- Pausar/repetir aba, app ou TV externos (impossível pelo navegador; a captura de som do sistema só lê).
- Player de VÍDEO importado e importação de vídeo (hoje só `audio/*`): é change própria, com extração de áudio no
  navegador e legenda por tempos; só abrimos se o dono confirmar que quer vídeo local.
- Mudar a nota de pronúncia, o ditado ou a sombra em si.
- Pontos, XP ou ranking pelo modo (a escuta guiada é "sem tempo, sem prêmio", Decreto 12.880, art. 9o; mantemos).
- Alinhamento forçado de áudio sem tempos por frase (importações sem `startTime` confiável ficam sem o modo).

## Riscos

- **Tempos imprecisos**: o corte da frase usa o `startTime` da próxima fala; legenda importada com tempos ruins corta no
  meio da palavra. Mitigação: o modo só liga quando as falas têm `startTime` crescente e duração entre 0,5 s e 15 s;
  senão a tela diz "esta sessão não tem tempos bons para o modo".
- **Velocidade e Slow-Mo**: a pausa é medida em tempo de parede, não de mídia; teste cobre 0,75x e 1,25x.
- **Aba em segundo plano**: `setTimeout` é estrangulado; a pausa conta pelo relógio do `<audio>` onde der e recalcula ao
  voltar o foco.
- **Menor de idade**: nada sai do aparelho por causa do modo; o microfone só liga na prática, com o aviso de sempre.

## Custo

Zero de IA, zero de servidor, zero de modelo novo. Esforço de dev: M (máquina pura, hook, duas telas e o audiolivro).

## Métrica de sucesso

- Adoção: % das sessões com o modo ligado entre quem abre a Análise com a flag (evento sem texto e sem áudio).
- Efeito: frases ouvidas até o fim por sessão e retorno em 7 dias, comparando quem usa e quem não usa (observacional;
  serve para decidir manter a flag ligada).
- Qualidade: 0 relatos de corte no meio de palavra em 20 frases conferidas à mão em aparelho real (**[R]**); desvio de
  pausa p95 <= 150 ms no Chromium.

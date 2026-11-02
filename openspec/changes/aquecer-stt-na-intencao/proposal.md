## Why

Quem clica em "Iniciar" na tela de captura espera ~1 s até o STT local ficar pronto. Medido na bancada
(`scripts/perf/latencia-legenda`, antes × depois no mesmo Mac, 12 rodadas válidas, `sttProntoMs` = clique até o worker
pronto):

- setembro/2026 (commit `bde13bd`): pronto ANTES do clique (−1,1 a −1,8 s), porque o modelo carregava ao abrir a tela;
- hoje: ~0,9 s (desktop) e ~1,0 s (perfil fraco) DEPOIS do clique, com o cache quente; 2,0 a 2,6 s com o perfil frio.

A mudança foi deliberada: a "correção G do diagnóstico do Safari" (22/10/2026, `LiveCapture.tsx:1420`) tirou o
pré-aquecimento ao abrir a tela, porque ele subia o worker do Whisper e o tradutor (~320 MB no WebKit) em quem só passava
pela Capturar. Voltar a aquecer ao abrir reintroduziria esse custo. O que falta é aquecer **só quando há intenção de
capturar**, sem pagar o preço de quem apenas passa pela tela.

## What Changes

- **Aquecer na intenção**: chamar o `preaquecerModelos()` que já existe (`src/lib/captura/pipelineDeFala.ts`, com as
  guardas atuais: só o que está em cache, nada de download, rota de nuvem não aquece, áudio da aba no reconhecedor do
  navegador não aquece o Whisper, um modelo grande por vez) quando a pessoa:
  1. dá foco ou posa o ponteiro sobre "Iniciar" por pelo menos 200 ms; ou
  2. confirma os idiomas da sessão ("Usar estes idiomas").
- **Decisão pura** (`src/core/harness/`, ao lado do `reguladorDeDesempenho`): `deveAquecerNaIntencao(perfil, gatilho)` diz se aquece, por perfil de aparelho
  (pouca memória, modo leve, Safari/WebKit), testável sem navegador.
- **Atrás de flag, desligada até medir** no Safari e no aparelho de 6 GB do dono. Nada muda para ninguém antes disso.
- **Bancada**: cenário de intenção (`--intencao-ms`) e cenário "só passa pela tela", para provar o ganho e provar que não há
  custo para quem não captura.

## Non-Goals

- Voltar ao pré-aquecimento ao abrir a tela (decisão de 22/10/2026 mantida).
- Baixar modelo por intenção: baixar continua sendo decisão da pessoa, tomada no "Iniciar".
- Mudar a liberação ao sair (imediata em pouca memória; 20 s depois no resto, `liberarAoSairDaCaptura`).
- Fila de áudio enquanto o modelo carrega (opção 2 do diagnóstico): outra mudança, depois de medir se as primeiras
  palavras se perdem hoje.
- Aquecer o tradutor antes do STT em aparelho que carrega um modelo grande de cada vez (`umModeloDeCadaVez`): a ordem
  atual continua.

## Impact

- Código: `src/core/harness/` (decisão pura, arquivo novo), `src/lib/captura/` (gancho de intenção, novo), `src/components/views/
captura/celular/CapturaDoPrototipo.tsx` (foco/ponteiro do botão), `src/components/views/captura/IdiomasDaSessao.tsx` (confirmação), `LiveCapture.tsx`
  (ligação), `scripts/perf/latencia-legenda/` (cenários).
- Sem mudança de API, banco ou cobrança. Sem texto novo de interface.
- Risco principal: memória no Safari e em aparelho de 6 GB se a pessoa passa o mouse e vai embora. Mitigação: atraso de
  200 ms, flag desligada, liberação ao sair já existente e medição antes de ligar.
- Em celular (sem hover) o ganho vem só da confirmação dos idiomas; o toque no botão não antecipa nada que valha.

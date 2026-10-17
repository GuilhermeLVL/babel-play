## Why

Dois atritos aparecem logo no primeiro uso:

1. **Permissões no meio do uso.** O microfone só é pedido no clique de "Iniciar" (`src/gateway/capture/systemAudio.ts`,
   `getUserMedia`), então o aviso do navegador surge justo quando a pessoa quer começar a ouvir. O `Onboarding.tsx` hoje
   tem cinco passos (`welcome`, `idioma`, `perfil`, `laco`, `privacidade`) e nenhum pede permissão; o de privacidade só
   cita o microfone em texto.
2. **A auditoria de desempenho de 10/10/2026** (`docs/auditoria/2026-10-10-desempenho-da-interface.md`) apontou laços por
   quadro, lista de falas sem janela e ícones em 61 arquivos pequenos. Em 17/10/2026 conferi o código e medi o app: a lista
   já é memoizada e limitada a 200–249 linhas (`ChatTranscript.tsx`, `JANELA_DA_CONVERSA`), o laço da aura e o do sensor
   dormem quando chegam (`sentidos.ts`, `quadroDoGiro`), e o Início parado, com CPU 4x mais lenta, fez 0 chamadas de
   `requestAnimationFrame` por segundo e 0 ms de tarefas longas em 8 s. Esses itens já estão resolvidos.

## What Changes

- **Passo "permissões" no onboarding**, entre `laco` e `privacidade`: um botão pede o microfone uma vez e solta a faixa
  logo depois; o passo pode ser pulado; explica que a captura de aba/tela pede o seletor do navegador a cada vez (não dá
  para pré-autorizar). Mensagens de negação reaproveitam `micErrorMessage` (`src/lib/mediaErrors.ts`).

- **Sem mudança de desempenho de interface.** A conferência de 17/10/2026 mostrou que os achados da auditoria de 10/10
  já foram tratados; não há o que mudar na lista de falas nem nos laços por quadro.

## Non-Goals

- Tirar o VAD da thread principal, virtualizar a lista de verdade, quebrar o `LiveCapture.tsx`, juntar os ícones num
  chunk (ganho pequeno em HTTP/2, segundo a própria auditoria) e a rota de nuvem/modelo: ficam para mudanças próprias,
  depois de reproduzir a lentidão real (transcrição local em WASM e download do modelo).
- Pré-autorizar a captura de aba/tela (o navegador não permite).
- Pedir notificações (o app não usa).
- Idiomas (mandarim) e o modo captura com erro: dependem de reproduzir a falha primeiro.

## Impact

- Código: `src/components/Onboarding.tsx`, `tests/onboardingDialogo.test.tsx`, `public/i18n/{en,es}.json`.
- Sem mudança de API, de banco ou de cobrança.
- Risco: o onboarding é a primeira tela de quem chega; um erro nele bloqueia a entrada. Por isso o passo é pulável e
  nunca impede "Continuar".

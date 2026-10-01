## 1. O caminho leve do Quest

- [x] 1.1 `capturaDoSistema` pelo perfil: no Quest, nunca, mesmo com `getDisplayMedia`
      (`perfil.ts`). Teste: `tests/perfilDoDispositivo.test.ts`.
- [x] 1.2 O microfone nasce ligado pelo perfil, e os textos da captura dizem o que vale no Quest
      (`LiveCapture.tsx`). Teste: `tests/e2e-estatica/perfis-de-dispositivo.e2e.ts`, com o Quest emulado COM
      `getDisplayMedia` e a contagem de chamadas a ele (zero).
- [x] 1.3 Uma thread por motor no Quest (`orcamentoDeThreads.ts`, `whisperLocal.ts`, `opusMtLocal.ts`).
      Testes: `tests/orcamentoDeThreads.test.ts`, `tests/whisperLocal-perfil.test.ts`.
- [x] 1.4 A sonda sem o microbenchmark no início da captura do Quest (`sonda.ts`, `pipelineDeFala.ts`).
      Testes: `tests/sondaDoAparelho.test.ts`, `tests/quest-caminho-leve.test.ts`.
- [x] 1.5 Nenhum parcial no Quest (`pipelineDeFala.ts`). Teste: `tests/quest-caminho-leve.test.ts`.
- [x] 1.6 Só microfone: o modelo segue o idioma da fala; Moonshine tiny no Quest (`sttRouter.ts`).
      Testes: `tests/sttRouterPorDispositivo.test.ts`, `tests/quest-caminho-leve.test.ts`.

## 2. A página de diagnóstico

- [x] 2.1 As partes puras e a medida de um modelo num worker (`src/lib/dispositivo/diagnostico.ts`).
      Teste: `tests/diagnosticoDoAparelho.test.ts`.
- [x] 2.2 A tela `/diagnostico` (lazy) e a rota (`Diagnostico.tsx`, `rotas.ts`, `App.tsx`, `types.ts`), com o
      link no aviso da captura do Quest. Teste: `tests/e2e-estatica/diagnostico.e2e.ts`.
- [x] 2.3 A pesquisa e o roteiro (`docs/pesquisa/2026-10-quest-navegador-e-hardware.md`,
      `docs/testar-no-quest.md`).

## 3. No aparelho (o dono)

- [ ] 3.1 Capturar no Quest depois do deploy: o headset parou de travar? A legenda acompanha?
- [ ] 3.2 Rodar `/diagnostico` no Quest e mandar o resultado (JSON ou print).

## 4. Depois das medidas

- [ ] 4.1 Decidir as threads do Whisper no Quest (1 ou 2) pelo fator de tempo real e pelas travadas.
- [ ] 4.2 Decidir o microfone sem cancelamento de eco para legendar o som do alto-falante.
- [ ] 4.3 Decidir o "som do headset" pelo compartilhamento, se o áudio sobreviver sem o vídeo.
- [ ] 4.4 Decidir onde fica o trabalho pesado: headset, nuvem (servidor de repasse) ou celular como motor.
- [ ] 4.5 Tirar o VAD da thread principal, se a medida mostrar que ele pesa.

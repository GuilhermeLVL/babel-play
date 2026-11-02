## 1. Bancada primeiro (medir antes de mexer)

- [x] 1.1 Cenário `--intencao-ms N` em `scripts/perf/latencia-legenda/medir.mjs`: foca "Iniciar", espera N ms, clica
- [x] 1.2 Cenário "visita sem captura" (abre a captura, não toca nada, sai): conta workers criados (`worker:novo`) e o que fica vivo depois (medido 01/11: 1 worker, o das partículas; 0 de STT ou tradução)
- [x] 1.3 Linha de base SEM a flag: `sttProntoMs` com e sem intenção, workers na visita (Mac; intenção medida com 2 rodadas por perfil; intenção de 1,5 s sem a flag: STT pronto +0,93 s no desktop, +1,0 s no fraco, igual a sem intenção)
- [ ] 1.4 Dono: medir memória do aquecimento por intenção no Safari/6 GB com o Web Inspector e registrar em `docs/planejamento/`

## 2. Decisão pura

- [ ] 2.1 `src/core/harness/aquecerNaIntencao.ts`: `deveAquecerNaIntencao({ perfil, modoLeve, motorDoNavegador, gatilho })` → `{ aquecer, motivo }`
- [ ] 2.2 Testes da matriz: pouca memória, modo leve, Safari/WebKit, desktop ≥ 8 GB, cada gatilho (`tests/aquecer-na-intencao.test.ts`)
- [ ] 2.3 `npm run typecheck:core` verde (o core não importa de lib, gateway nem componentes)

## 3. Ligação na tela

- [ ] 3.1 Gancho em `src/lib/captura/` com temporizador de 200 ms, cancelado ao sair do foco/ponteiro antes disso
- [ ] 3.2 "Iniciar" (`CapturaDoPrototipo.tsx`): foco e entrada do ponteiro disparam o gancho; saída cancela o temporizador
- [ ] 3.3 "Usar estes idiomas" (`IdiomasDaSessao`): a confirmação dispara o gancho
- [ ] 3.4 Chamar `preaquecerModelos()` (modo padrão) pelo gancho, atrás da flag; sem a flag, nenhum handler novo age
- [ ] 3.5 Registro local de `aquecimentoNaIntencao` (disparou ou ignorou, motivo) no log de captura
- [ ] 3.6 Testes de componente: 200 ms de permanência dispara; atravessar não dispara; sem flag não dispara; clique com carga em voo não duplica

## 4. Prova com a bancada

- [ ] 4.1 Intenção de 1 500 ms no desktop: `sttProntoMs` ≤ 0; sem intenção: sem piora (antes × depois intercalado)
- [ ] 4.2 Visita sem captura: 0 workers; passou o ponteiro e saiu: workers encerrados no prazo existente
- [ ] 4.3 Perfil fraco e pouca memória: só a confirmação dos idiomas aquece

## 5. Fechamento

- [ ] 5.1 `npm run typecheck`, `typecheck:core`, `lint`, `npm test` e `npx knip` verdes
- [ ] 5.2 Revisão crítica (`revisor-critico`) e commit local, sem push
- [ ] 5.3 Dono decide ligar a flag em cada perfil depois de ver as medições (Safari/6 GB incluídos)

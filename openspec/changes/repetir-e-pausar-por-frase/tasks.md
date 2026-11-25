## Decisões assumidas (25/11)

- decisão assumida: recomendação 35 de `docs/backlog/decisoes-do-dono.md`, 25/11: sem player de vídeo local agora; fundir `ditado` e `ditadoDeFrase`; ligar no staging após 20 frases em aparelho real.
- Números de migração PROVISÓRIOS (PG 0033, SQLite 0073): o integrador pode renumerar.

## 1. O mais arriscado primeiro: o corte confiável

- [x] 1.1 Ensaio puro de tempos: `src/core/learning/temposDaFrase.ts` (`temposUsaveis(falas)`: monotônico, 0,5 a 15 s por frase) e teste sobre as sessões e legendas de exemplo. Verificar: `npx vitest run tests/tempos-da-frase.test.ts` com um caso bom e um ruim por fixture. Feito em `tests/tempos-da-frase.test.ts` (caso bom e ruim por critério; a fixture é sintética, sem sessão real do repositório).
- [ ] 1.2 Triagem do desvio de pausa em Chromium com áudio fake (10 frases), com o critério p95 <= 150 ms escrito antes de rodar. Verificar: relatório com p50/p95 em `docs/auditoria/`.
  - ABERTA: precisa de Chromium e áudio fake (medição); a bancada não foi rodada nesta onda, por instrução. O ensaio puro (1.1) já cobre os critérios de tempo.
- [ ] 1.3 **[R]** Rodada do desvio em Safari/iOS, Chrome Android e Quest (20 frases, uma rodada, com pré-voo). Verificar: matriz preenchida; se o Safari passar de 300 ms, voltar ao design (parar um quadro antes do fim).
  - ABERTA **[R]**: aparelho real (Safari/iOS, Chrome Android, Quest).

## 2. Máquina pura e flag

- [x] 2.1 `src/core/learning/frasePorFrase.ts` com `aoFimDaFrase`, repetições 1 a 3 e fator de pausa 0,5 a 2. Verificar: `npx vitest run tests/frase-por-frase.test.ts` (3 repetições terminam em `seguir`; última frase termina em `parar`; fator fora da faixa é limitado). Feito em `tests/frase-por-frase.test.ts`.
- [x] 2.2 `FLAG_FRASE_POR_FRASE = 'frase_por_frase'` em `src/core/planos.ts` + migração PG e SQLite (desligada, sem regra de plano) + journal/snapshot; subir a contagem do baseline de flags. Verificar: testes de flags e de migração existentes verdes e `npm run typecheck`. Feito com números PROVISÓRIOS: PG 0033 e SQLite 0073 (origin/main: 0032 e 0072); o integrador pode renumerar. Baseline 36 para 37; teste `tests/frase-por-frase-flag.test.ts`.

## 3. Player da Análise

- [x] 3.1 Hook `src/lib/analise/usarFrasePorFrase.ts`: escolha por aparelho em `localStorage` com `try/catch`, liga a máquina a `seekTo`/`setIsPlaying`, usa `pararNoFimRef`; troca o `loopMode` morto de `Analysis.tsx` por valor derivado. Verificar: teste de hook com `<audio>` falso (repete 2x, espera, segue) e teste de que, com a flag desligada, o player é idêntico ao de hoje. Feito em `tests/usar-frase-por-frase.test.tsx` (áudio falso: repete 2x, espera, segue; flag desligada não faz nada). O `loopMode` morto saiu de `Analysis.tsx`, `playerDaSessao.ts` e `PlayerInterativo.tsx` (uma fonte só). O modo não vale com escuta guiada ligada.
- [x] 3.2 Controle na barra do player (`PlayerInterativo.tsx`): "Repetir 1x/2x/3x", "Pausa para repetir" e "Parar no fim", só com a flag; textos com `t()` revisados com a skill `copy-br-etica`. Verificar: teste de componente, `npm run i18n` e os portões de i18n. Feito em `src/components/views/analise/FrasePorFrase.tsx` (slot `frase` do player; `tests/frase-por-frase-controles.test.tsx`); i18n en/es/ar e `npm run i18n` rodados. Revisão de tom com `copy-br-etica`: textos neutros, sem prêmio nem cobrança de tempo; uma passada do dono é bem-vinda.
- [x] 3.3 Narração TTS (sessão sem áudio): o modo passa por `falarDe` com a mesma máquina. Verificar: teste de unidade com `motor.falar` simulado (repete N vezes, espera, segue). Feito: ponte `frasePorFraseRef` em `playerDaSessao.ts`; `tests/frase-por-frase-narracao.test.tsx` (motor falso, também o ramo `speechSynthesis` usa a mesma decisão).
- [x] 3.4 Pausa em segundo plano: contar pelo `currentTime` e recalcular ao voltar o foco. Verificar: teste com relógio falso e `visibilitychange`. Feito: `timeupdate` como reserva da vigia e `visibilitychange` termina a pausa vencida (teste com relógio falso). A pausa é medida em tempo de parede (decisão do design), não pelo `currentTime`, que não anda com o áudio pausado.

## 4. Ponte com a prática

- [x] 4.1 Botão "Repetir em voz alta" que abre `SombraDaFala` sobre a frase em foco (no Firefox e no Quest, a gravação sem nota que já existe); ao fechar, o modo segue. Verificar: teste de componente (abre, fecha, índice avança) e e2e com Web Speech falso. Feito em teste de componente (abre a sombra da frase em foco, fecha e segue da seguinte). **Aberto**: o e2e com Web Speech falso entra junto com a 6.1.
- [ ] 4.2 "Escrever esta frase" abre o `ditadoDeFrase` com a frase em foco. Verificar: teste de componente. Depende de **[D]** (`exercicios-de-frase` 4.2: fundir `ditado` e `ditadoDeFrase`?); se fundir, esta tarefa aponta para o jogo único.
  - decisão assumida: recomendação 35 (sem player de vídeo local agora; fundir `ditado` e `ditadoDeFrase`; ligar no staging após 20 frases em aparelho real), 25/11. Esta tarefa fica ABERTA e sem código: depende de a change `exercicios-de-frase` 4.2 entregar o jogo único; o botão "Escrever esta frase" aponta para ele quando existir.

## 5. Audiolivro

- [x] 5.1 No `reprodutor.ts`, modo "uma frase por vez" com `t0/t1`: `tocarDe(i)` e pausa no `t1`. Verificar: teste do reprodutor com `criarAudio` e `agendar` falsos. Feito: `definirFrasePorFrase` e `aoPararNoFim` em `reprodutor.ts` (`tests/audiolivro-frase-por-frase.test.ts`).
- [ ] 5.2 Controle no leitor de audiolivro, só com `audiolivros` e `frase_por_frase` ligadas. Verificar: teste de componente com as quatro combinações de flag.
  - ABERTA: falta o controle no leitor de audiolivro (precisa ligar `narrador.ts` e a UI do leitor). Fica para a onda do audiolivro por causa do conflito em `src/lib/leitor/` e `docs/flags.md` (plano de execução: uma change por vez ali).

## 6. Fechamento

- [ ] 6.1 E2E `tests/e2e/frase-por-frase.e2e.ts`: flag por `page.route('**/api/flags')`, sessão com áudio fake, repete 2x, pausa, segue. Verificar: `npx playwright test tests/e2e/frase-por-frase.e2e.ts`.
  - ABERTA: o e2e não foi escrito nem rodado nesta onda (sem bancada). A cobertura de unidade e componente está nos testes citados acima.
- [ ] 6.2 **[R]** Conferência manual de 20 frases em aparelho real e **[D]** decisão de ligar a flag (staging primeiro, depois produção). Verificar: registro com data em `docs/pendencias-do-dono.md`.
  - ABERTA **[R][D]**: conferência em 20 frases em aparelho real e a decisão de ligar a flag (staging primeiro) são do dono. Flag `frase_por_frase` nasce DESLIGADA.

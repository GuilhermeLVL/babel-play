## 1. O mais arriscado primeiro: o corte confiável

- [ ] 1.1 Ensaio puro de tempos: `src/core/learning/temposDaFrase.ts` (`temposUsaveis(falas)`: monotônico, 0,5 a 15 s por frase) e teste sobre as sessões e legendas de exemplo. Verificar: `npx vitest run tests/tempos-da-frase.test.ts` com um caso bom e um ruim por fixture.
- [ ] 1.2 Triagem do desvio de pausa em Chromium com áudio fake (10 frases), com o critério p95 <= 150 ms escrito antes de rodar. Verificar: relatório com p50/p95 em `docs/auditoria/`.
- [ ] 1.3 **[R]** Rodada do desvio em Safari/iOS, Chrome Android e Quest (20 frases, uma rodada, com pré-voo). Verificar: matriz preenchida; se o Safari passar de 300 ms, voltar ao design (parar um quadro antes do fim).

## 2. Máquina pura e flag

- [ ] 2.1 `src/core/learning/frasePorFrase.ts` com `aoFimDaFrase`, repetições 1 a 3 e fator de pausa 0,5 a 2. Verificar: `npx vitest run tests/frase-por-frase.test.ts` (3 repetições terminam em `seguir`; última frase termina em `parar`; fator fora da faixa é limitado).
- [ ] 2.2 `FLAG_FRASE_POR_FRASE = 'frase_por_frase'` em `src/core/planos.ts` + migração PG e SQLite (desligada, sem regra de plano) + journal/snapshot; subir a contagem do baseline de flags. Verificar: testes de flags e de migração existentes verdes e `npm run typecheck`.

## 3. Player da Análise

- [ ] 3.1 Hook `src/lib/analise/usarFrasePorFrase.ts`: escolha por aparelho em `localStorage` com `try/catch`, liga a máquina a `seekTo`/`setIsPlaying`, usa `pararNoFimRef`; troca o `loopMode` morto de `Analysis.tsx` por valor derivado. Verificar: teste de hook com `<audio>` falso (repete 2x, espera, segue) e teste de que, com a flag desligada, o player é idêntico ao de hoje.
- [ ] 3.2 Controle na barra do player (`PlayerInterativo.tsx`): "Repetir 1x/2x/3x", "Pausa para repetir" e "Parar no fim", só com a flag; textos com `t()` revisados com a skill `copy-br-etica`. Verificar: teste de componente, `npm run i18n` e os portões de i18n.
- [ ] 3.3 Narração TTS (sessão sem áudio): o modo passa por `falarDe` com a mesma máquina. Verificar: teste de unidade com `motor.falar` simulado (repete N vezes, espera, segue).
- [ ] 3.4 Pausa em segundo plano: contar pelo `currentTime` e recalcular ao voltar o foco. Verificar: teste com relógio falso e `visibilitychange`.

## 4. Ponte com a prática

- [ ] 4.1 Botão "Repetir em voz alta" que abre `SombraDaFala` sobre a frase em foco (no Firefox e no Quest, a gravação sem nota que já existe); ao fechar, o modo segue. Verificar: teste de componente (abre, fecha, índice avança) e e2e com Web Speech falso.
- [ ] 4.2 "Escrever esta frase" abre o `ditadoDeFrase` com a frase em foco. Verificar: teste de componente. Depende de **[D]** (`exercicios-de-frase` 4.2: fundir `ditado` e `ditadoDeFrase`?); se fundir, esta tarefa aponta para o jogo único.

## 5. Audiolivro

- [ ] 5.1 No `reprodutor.ts`, modo "uma frase por vez" com `t0/t1`: `tocarDe(i)` e pausa no `t1`. Verificar: teste do reprodutor com `criarAudio` e `agendar` falsos.
- [ ] 5.2 Controle no leitor de audiolivro, só com `audiolivros` e `frase_por_frase` ligadas. Verificar: teste de componente com as quatro combinações de flag.

## 6. Fechamento

- [ ] 6.1 E2E `tests/e2e/frase-por-frase.e2e.ts`: flag por `page.route('**/api/flags')`, sessão com áudio fake, repete 2x, pausa, segue. Verificar: `npx playwright test tests/e2e/frase-por-frase.e2e.ts`.
- [ ] 6.2 **[R]** Conferência manual de 20 frases em aparelho real e **[D]** decisão de ligar a flag (staging primeiro, depois produção). Verificar: registro com data em `docs/pendencias-do-dono.md`.

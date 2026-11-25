## 1. O mais arriscado primeiro: a nota local é justa?

- [ ] 1.1 Escrever as réguas (WER <= 20% em en, alucinação em silêncio <= 1%, Spearman >= 0,8 com o Web Speech, diferença mediana <= 10 pontos) em `docs/auditoria/` ANTES de medir. Verificar: arquivo commitado antes dos resultados.
- [ ] 1.2 Simulação offline: 100 frases do acervo (`src/data/leitura/textos.json`) por TTS com ruído e ritmo variado, passadas por moonshine-tiny, moonshine-base e whisper-base com `scripts/eval-fala/bancada/stt.mjs` e `tests/harness/`. Verificar: tabela WER/alucinação/nota por modelo; modelos fora da régua saem do desenho.
- [ ] 1.3 Triagem curta em Chromium desktop: 20 gravações reais, nota local contra a do Web Speech. Verificar: relatório com Spearman e diferença mediana; se reprovar, parar e voltar ao design.

## 2. Motor local de enunciado

- [ ] 2.1 `src/core/fala/motorDaSombra.ts` (puro): escolha do motor e do motivo por perfil, idioma, aparelho, economia de dados e flag; perfil protegido nunca escolhe nuvem. Verificar: `npx vitest run tests/motor-da-sombra.test.ts` (matriz Chrome/Firefox/Safari/Quest x adulto/menor x en/pt).
- [ ] 2.2 `src/lib/fala/ouvirFraseNoAparelho.ts`: AudioWorklet em PCM 16 kHz, `semFala` pelo VAD, `transcribePcm` com `languageHint`, buffers soltos ao terminar e ao sair. Verificar: teste com worker falso (texto volta; sem fala não decodifica; `cancelar` solta o buffer; nenhum `fetch`).
- [ ] 2.3 Flag `FLAG_SOMBRA_LOCAL = 'sombra_local'` em `src/core/planos.ts`, migração PG e SQLite (desligada, sem regra de plano), `FLAGS_SENSIVEIS` do painel, baseline de flags. Verificar: testes de flags e de migração verdes e `npm run typecheck`.

## 3. Sombra (primeira superfície)

- [ ] 3.1 `SombraDaFala.tsx`: com `sombra_local` e sem Web Speech utilizável, gravar -> parar -> "Comparando..." -> nota e palavras, rotulada como palpite; sem a flag, o ramo `sombra-sem-reconhecimento` de hoje. Verificar: teste de componente nos dois ramos e com `semFala`.
- [ ] 3.2 Aviso de download com tamanho (tiny 32 MB, base 67 MB, whisper 117 MB) e consentimento antes do primeiro uso; reaproveitar o aviso de preparo existente; texto infantil no perfil protegido (`copy-br-etica`). Verificar: teste de componente (sem aceitar, nenhuma requisição ao Hub) e `npm run i18n`.
- [ ] 3.3 Remover do ramo local o texto "A nota ... não está disponível" quando a nota existe; manter para quem não tem modelo possível. Verificar: teste de componente.
- [ ] 3.4 **[R]** Rodada em Firefox desktop e Quest 3 (20 frases cada, pré-voo): tempo da nota, memória, alucinação. Verificar: matriz em `docs/auditoria/`; se o Quest reprovar a régua, deixar só a gravação comparável ali e registrar a decisão.

## 4. Karaokê e prática "Falar"

- [ ] 4.1 `KaraokeDoPrototipo.tsx`: mesmo motor e mesma regra de escolha. Verificar: teste de componente.
- [ ] 4.2 `Gravador.tsx` ("O que o aparelho entendeu?"): usar o local no perfil protegido e onde não há Web Speech, respeitando `rapidoDoMicPermitido`. Verificar: teste do gravador com e sem a flag.

## 5. Mais idiomas

- [ ] 5.1 pt, es e fr pelo Whisper base (ou Parakeet onde `parakeetCabeNoAparelho`) com guarda de alucinação (VAD e duração mínima). Verificar: repetir 1.2 para os três idiomas; só liga o idioma que passar a régua.

## 6. Fechamento

- [ ] 6.1 E2E `tests/e2e/sombra-local.e2e.ts`: flag por `page.route('**/api/flags')`, navegador sem `SpeechRecognition`, microfone falso, modelo simulado; nota aparece, nenhuma requisição leva áudio. Verificar: `npx playwright test tests/e2e/sombra-local.e2e.ts`.
- [ ] 6.2 **[D]** Privacidade: confirmar que o texto de `public/privacidade.html` cobre "a prática de fala é transcrita no seu aparelho"; **[D]** ligar a flag no staging só para o id do dono e depois decidir. Verificar: registro com data em `docs/pendencias-do-dono.md`.

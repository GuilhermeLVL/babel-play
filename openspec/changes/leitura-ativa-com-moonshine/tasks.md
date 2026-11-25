## 1. O mais arriscado primeiro: o Moonshine acompanha uma leitura?

- [ ] 1.1 Escrever as réguas (sensibilidade >= 90%, falso positivo <= 5%, atraso p95 <= 1,5 s desktop e 2,5 s no fraco, <= 1 aviso "se perdeu" por texto) em `docs/auditoria/` ANTES de medir. Verificar: arquivo commitado antes dos resultados.
- [ ] 1.2 Simulação offline: textos de `src/data/leitura/textos.json` por TTS (inteiros e pulando uma palavra), janelas crescentes no Moonshine tiny e base (cadências 0,5, 0,7 e 1,0 s) alimentando `aplicarParcial` do alinhador real; reaproveitar `tests/harness/` e `scripts/eval-fala/bancada/stt.mjs`. Verificar: tabela de sensibilidade, falso positivo e travadas por modelo e cadência; só o que passa segue.
- [ ] 1.3 Triagem em Chromium e Firefox desktop com 3 pessoas (uma de sotaque forte) em 3 textos. Verificar: relatório contra as réguas; se reprovar, adotar o modo "por pausa" (design 5) e reescrever as réguas de atraso.

## 2. Motor `moonshine-local`

- [ ] 2.1 Reaproveitar o capturador de PCM e o VAD de `sombra-sem-web-speech` 2.2 (se ainda não existir, criar `src/lib/fala/capturaDePcm.ts` lá, não aqui). Verificar: teste do capturador com fonte falsa (entrega blocos de 16 kHz, solta buffers).
- [ ] 2.2 `MotorLocal` `moonshine-local` em `src/lib/leituraAtiva/ouvinteLocal.ts`: sessão contínua, parcial por janela que cresce com `transcribeIfIdle`, `parcialEstavel`, final por pausa, teto de 30 s por trecho. Verificar: `tests/leitura-ativa-ouvinte.test.ts` estendido com worker falso (parciais crescentes, final, erro fatal vira `aoFalhar('parou')`, `descartar` zera buffers e estabilizador, nenhum `fetch`).
- [ ] 2.3 `disponivel()` e escolha tiny/base por `moonshineDoAparelho`; `MOTORES_LOCAIS = [WEB_SPEECH_LOCAL, MOONSHINE_LOCAL]`. Verificar: teste de ordem (Web Speech local preferido; sem ele, Moonshine; sem nenhum, `sem-motor-local`) e de que nenhum motor de nuvem entra.
- [ ] 2.4 Flag `FLAG_LEITURA_VOZ_LOCAL = 'leitura_voz_local'` em `src/core/planos.ts`, migração PG e SQLite (desligada, sem regra de plano), `FLAGS_SENSIVEIS`, baseline de flags. Verificar: testes de flags e migração verdes e `npm run typecheck`.

## 3. A tela

- [ ] 3.1 "Antes de ler" (`SessaoDeLeitura`/`LeituraAtiva`): com a flag e sem Web Speech local, "Ler em voz alta" fica habilitado quando o Moonshine cabe; senão esmaecido com a explicação de hoje. Verificar: teste de componente para Chrome 139+, Firefox, Safari, Quest e flag desligada (esta última idêntica a hoje).
- [ ] 3.2 Aviso de download com tamanho (tiny ~32 MB, base ~67 MB) antes de pedir o microfone, com consentimento, texto infantil no perfil protegido (`copy-br-etica`); sem aceite não há requisição ao Hub. Verificar: teste de componente com `fetch` espiado e `npm run i18n`.
- [ ] 3.3 Falha do motor local no meio da leitura: "O microfone parou" com "Ligar de novo" e "Seguir em silêncio", sem nuvem. Verificar: teste de componente com o motor falso lançando erro.
- [ ] 3.4 Estados do modelo (baixando, pronto, falhou) reaproveitando o aviso de preparo existente; a pré-carga (`modelos-confiaveis-e-offline` 4.1) aquece o Moonshine na intenção de "Ler em voz alta". Verificar: teste do aquecimento por intenção com flag.

## 4. E2E e medição

- [ ] 4.1 E2E `tests/e2e/leitura-ativa-voz-moonshine.e2e.ts`: navegador sem `processLocally`, flag por `page.route('**/api/flags')`, worker do modelo simulado, lê "At the Market" pulando "six"; confere as marcas, "O Frasy não ouviu bem" e nenhuma requisição com áudio. Verificar: `npx playwright test tests/e2e/leitura-ativa-voz-moonshine.e2e.ts`.
- [ ] 4.2 **[D]** Recrutar 10 a 20 brasileiros para ler 3 textos; **[R]** rodada em Safari/iPhone, Android ~4 GB e Quest 3 (uma por aparelho, com pré-voo). Verificar: matriz contra as réguas em `docs/auditoria/`; reprovou no fraco -> manter o modo "por pausa" ali.
- [ ] 4.3 **[R]** Heap e tempo de carga do Moonshine no iPhone e no Quest durante a leitura (com a voz do aparelho narrando em "Ouvir primeiro" antes). Verificar: registro em `docs/planejamento/`.

## 5. Decisão de ligar

- [ ] 5.1 **[D]** Ligar `leitura_voz_local` no staging só para o id do dono, ouvir; depois decidir a rampa (depende de `leitura_ativa` ligada, que é outra pendência). Verificar: decisão com data em `docs/pendencias-do-dono.md`.
- [ ] 5.2 Fechar a nota pendente: marcar 5.3 da change arquivada como resolvida por esta e remover o `[Pendente]` do comentário de `ouvinteLocal.ts`. Verificar: `grep -n "Pendente" src/lib/leituraAtiva/ouvinteLocal.ts` sem resultado.

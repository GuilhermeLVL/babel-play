## 1. Núcleo e listas

- [x] 1.1 Mover `normalizar` (e `base`, `LEET`, `INVISIVEIS`) de `server/ai/moderacao/moderarSaidaDoTutor.ts` para `src/core/moderacao/normalizar.ts`; o servidor passa a importar do núcleo. Verificar: `npx vitest run tests/` dos testes do filtro do tutor verdes, sem mudança de comportamento.
- [x] 1.2 Criar `src/core/moderacao/termosDaLegenda.ts` com as categorias `sexual` e `odio` (e `palavrao` se o dono aprovar), em pt/en/es, e a lista comentada de ambíguos excluídos. Verificar: revisão do dono (Open Questions do design). (Feito com os padrões do dono de 17/11: `palavrao` entra para todo perfil protegido; a revisão de texto da lista pelo dono segue pendente.)
- [x] 1.3 Criar `src/core/moderacao/legendaSegura.ts`: `ocultarTermos(texto, politica) → { texto, ocultadas, categorias }`, com casamento por palavra, por par de palavras e por janela de letras soltas. Verificar: `tests/legendaSegura.test.ts` com os cenários da spec (a fala COMP-02, as variantes e os ambíguos).
- [x] 1.4 Montar o corpus `tests/fixtures/legenda-segura/negativos.json` (pelo menos 300 frases: `computador/falas.json`, `conversa/falas`, as falas de `celular/audios` da auditoria, frases de aula e do glossário) e `positivos.json` (pelo menos 20 por idioma). Verificar: o teste cobra 0 ocultações nos negativos e 100% nos positivos.
- [x] 1.5 Bench `tests/legendaSegura.bench.ts`. Verificar: p95 abaixo de 0,2 ms por fala de 30 palavras (`npx vitest bench`).

## 2. Integração na captura

- [x] 2.1 Em `LiveCapture.tsx`, envolver `setSpeechSegments` com `comLegendaSegura` (memoização por string) e passar só a versão envolvida ao pipeline, à tradução e à Web Speech. Verificar: teste de unidade do envoltório (parcial, final, tradução, `traducaoProvisoria`, `(texto)` da degradação).
- [x] 2.2 Teste de arquitetura: falha se `setSpeechSegments` cru sair de `LiveCapture.tsx`. Verificar: o teste falha quando se injeta o setter cru.
- [x] 2.3 Campo `ocultadas?: number` em `SpeechSegment` (`tiposDaFala.ts`); o componente da fala renderiza `•••` como `<span aria-label>` traduzido. Verificar: teste de componente com Testing Library (o `aria-label` está presente).
- [x] 2.4 Aviso de uma vez por sessão no canal de avisos da captura. Verificar: teste com 3 falas seguidas, 1 aviso.
- [x] 2.5 `vocabularioDaSessao.ts` e "Guardar palavra" ignoram `•••`; a voz do intérprete retira o marcador antes da síntese; `exportarConversa.ts` mantém `•••`. Verificar: testes de unidade dos três.

## 3. Política e Ajustes

- [x] 3.1 Política derivada de `perfilProtegido()` e da faixa; chave do adulto em `src/lib/preferencias.ts` (padrão desligado). Verificar: teste da tabela perfil → política (protegido, `menor-12`, adulto com e sem a opção, self-host). (Decisão do dono de 17/11: a faixa não muda a política; todo perfil protegido tem `sexual`, `odio` e `palavrao`. Self-host = `perfilProtegido()` falso = adulto.)
- [x] 3.2 Opção em Ajustes, travada e explicada para o perfil protegido. Verificar: teste de componente e catálogos `public/i18n/*.json` com os portões de i18n da CI (`node scripts/i18n/pseudo.mjs --check`, `npm run i18n:orfas`, `node scripts/i18n/cobertura.mjs --check`).

## 4. Verificação ponta a ponta

- [x] 4.1 E2E Playwright (`tests/e2e/legenda-segura.spec.ts`) com o microfone falso tocando a fala que gerou o caso (trecho de `reports/auditoria-qualidade/computador/audio/aula.wav`, ou um TTS da frase "reveal the porn quest together" quando o STT não reproduzir o erro) num perfil sem conta. Verificar: 0 ocorrências de termos das listas no DOM da lista e do PiP, e pelo menos 1 `•••`. (Feito em `tests/e2e/legenda-segura.e2e.ts`, a convenção da pasta. A fala entra pela bancada `__simFalas`, que escreve pelo setter envolvido: o STT não reproduz o erro sob demanda. O servidor do e2e é self-host, onde `perfilProtegido()` é falso; a suíte liga a opção do adulto em Ajustes. O perfil protegido fica coberto pelos testes de unidade.)
- [ ] 4.2 Repetir a rodada da auditoria `node computador/medir.mjs aula <perfil> <saída> webkit` contra o staging. Verificar: `analise.json` da rodada sem termos das listas (script de contagem anexado ao PR).
- [ ] 4.3 `npm run typecheck`, `npm run lint` e `npm test` verdes.

## Workflow follow-up

- Arquivar a change depois do deploy e de 7 dias sem relato de falso positivo.
- Estender a mesma política às outras saídas de IA listadas como pendentes em `filtro-tutor-menores` (explicação, assistente ao vivo, parceiro de leitura).

> Revisão de 25/11/2026 (main `897c9d25`): os blocos 1.x, 2.x e 6.x estavam sem marca, mas o código e os testes existem (reconciliados abaixo
> com o arquivo que prova). Última mudança de avatar na `main`: 29/10/2026; nada em #201, #202, #205 ou #206 toca avatar. **[D]** = depende do dono;
> **[R]** = precisa de aparelho ou navegador real. Cada tarefa tem "Verificar:" com um comando ou conferência.

## 0. M0 Especificação e flags

- [x] 0.1 Change OpenSpec e `docs/specs/2026-10-28-avatar-interprete.md`. Verificar: `npx openspec validate avatar-interprete`
- [x] 0.2 Flags `FLAG_AVATAR_3D`, `FLAG_AVATAR_SINAIS`, `FLAG_AVATAR_ELENCO` em `src/core/planos.ts`. Verificar: `npm run typecheck`
- [x] 0.3 Migração PG 0016 com as 3 flags desligadas + journal. Verificar: `npx vitest run tests/integration/schema-pg-baseline.test.ts`
- [x] 0.4 `docs/flags.md` atualizado. Verificar: as 3 linhas existem na tabela (linhas 215 a 217)
- [ ] 0.5 Relatório de referências (`@pixiv/three-vrm`, ChatVRM, TalkingHead, wLipSync, airi): licença e como resolvem boca e expressão. Nota 25/11: não existe em `docs/pesquisa/` (só 6 relatórios de medição). Baixo valor agora: o motor já foi escolhido e entregue; fazer só se for publicar a coleção. Verificar: `docs/pesquisa/` com tabela e licenças conferidas, ou decisão registrada de dispensar. **[D]**

## 1. M1 Núcleo e motor (feito, sem marca desde 28/10)

- [x] 1.1 `core/avatar`: receita, licença, menores, tiers, estados, ritmo. Prova: `tests/avatar-receita.test.ts`, `avatar-licenca.test.ts`, `avatar-tiers-estados-menor.test.ts`. Verificar: `npx vitest run tests/avatar-receita.test.ts tests/avatar-licenca.test.ts tests/avatar-tiers-estados-menor.test.ts`
- [x] 1.2 Renderer lazy, carregador GLB/VRM, fallback 2D, detecção de tier, IndexedDB `frasy-avatar`. Prova: `src/lib/avatar/{renderer,carregador,fallback2d,detectarTier,armazem}.ts`, `tests/avatar-carregador.test.ts`, `avatar-armazem-fallback.test.ts`. Verificar: `npx vitest run tests/avatar-carregador.test.ts tests/avatar-armazem-fallback.test.ts` e o e2e `avatar-meu-avatar` (caso "sem WebGL")
- [x] 1.3 Teste de orçamento de chunk. Prova: `tests/avatar-bundle.test.ts` (fonte sempre; build quando existe `dist`). Verificar: `npm run build && npx vitest run tests/avatar-bundle.test.ts`
- [x] 1.4 `VITE_AVATARES_URL` no `connect-src`. Prova: `tests/seguranca/csp-estreita.test.ts` (caso "avatares (M1)"). Verificar: `npx vitest run tests/seguranca/csp-estreita.test.ts`

## 2. M2 Meu avatar (feito, sem marca desde 28/10)

- [x] 2.1 Ajustes > Avatar: escolher, personalizar, salvar, apagar. Prova: e2e `avatar-meu-avatar` ("leigo: abrir, escolher e salvar em 3 toques"). Verificar: `npx playwright test tests/e2e/avatar-meu-avatar.e2e.ts`
- [x] 2.2 "Traga o seu" com validador Khronos e tetos lidos do cabeçalho. Prova: `tests/avatar-importador.test.ts`, e2e "arquivo hostil é recusado" e "nenhuma requisição leva o arquivo". Verificar: `npx vitest run tests/avatar-importador.test.ts`
- [x] 2.3 Cartão em `MolduraETitulo` com fallback foto/iniciais. Prova: e2e `avatar-meu-avatar` ("sem WebGL"). Verificar: o caso passa
- [x] 2.4 Perfil protegido. Prova: e2e "perfil protegido (menor): só a coleção, sem importar, sem galeria e sem requisição a terceiros". Verificar: o caso passa

## 3. M3 Fala (feito)

- [x] 3.1 `useAvatarFalando` ligado ao `TtsEngine`. Verificar: `npx vitest run tests/avatar-fala.test.ts`
- [x] 3.2 Vida procedural e movimento reduzido. Verificar: `npx vitest run tests/avatar-emocao-vida.test.ts`

## 4. M4 Intérprete e PiP (feito em código; falta prova em aparelho real)

- [x] 4.1 Avatar por lado em `ModoInterprete`. Verificar: `npx playwright test tests/e2e/avatar-interprete.e2e.ts`
- [x] 4.2 PiP (documento, vídeo, painel), tier fraco. Verificar: `tests/avatar-pip.test.ts`. Safari, Firefox e celular reais NÃO provados (ver 4.6)
- [x] 4.3 Soletração sob `avatar_sinais` ligada ao Intérprete, com os dois avisos fixos. Verificar: `npx vitest run tests/avatar-soletracao-interprete.test.tsx`
- [x] 4.4 Descoberta no Intérprete e no Perfil. Verificar: `npx playwright test tests/e2e/avatar-descoberta.e2e.ts`
- [x] 4.5 Lacunas do modo Libras (palco das mãos, "Soletrar tudo", guia do alfabeto, espelho para canhotos). Verificar: `npx playwright test tests/e2e/avatar-libras-lacunas.e2e.ts` em 1280, 768 e 375
- [ ] 4.6 **[R]** Checklist do PiP no Safari real, Firefox e celular real (entregue ao dono na spec, seção M4). Verificar: checklist preenchido com data e aparelho em `docs/pesquisa/`

## 5. M5 Livros e personagens

- [ ] 5.1 Falante e emoção por frase com marcação prévia. Estado: heurística ligada ao Narrador (`src/core/avatar/elenco/narracao.ts`, medida em `docs/pesquisa/2026-10-29-avatar-m5-elenco-no-narrador.md`); `planejarElenco` aceita `previas`. A função de IA `leitura_elenco` NÃO existe e depende do dono (**[D]**, ver "Decisões" no proposal). Regra atual do produto: IA paga só com custo declarado, e o filtro de saída para perfil protegido (`filtro-tutor-menores`) vale para qualquer saída nova de IA. Verificar (opção A, arquivo offline): para o catálogo piloto, `npx vitest run tests/avatar-elenco-ouro.test.ts` com o JSON marcado carregado por `Narrador.planejar(..., previas)`; falante inventado cai na heurística
- [x] 5.2 Mapa personagem para voz e painel do elenco atrás de `avatar_elenco`. Verificar: `npx vitest run tests/avatar-elenco.test.ts tests/avatar-elenco-narracao.test.ts` e e2e `avatar-elenco`. Voz real do aparelho, Safari, Firefox e celular NÃO provados (**[R]**)

## 6. M6 Estúdio e loja (feito, sem marca desde 29/10)

- [x] 6.1 Estúdio (receita JSON, importar/exportar, miniatura 192 px, peças). Prova: `tests/avatar-receita-arquivo.test.ts`, `avatar-pecas.test.ts`, e2e `avatar-estudio`, `avatar-pecas-rosto`. Verificar: `npx vitest run tests/avatar-receita-arquivo.test.ts tests/avatar-pecas.test.ts`
- [x] 6.2 `TipoDaLoja 'avatar'` (`src/core/tiposDaLoja.ts`). Prova: `tests/avatar-loja.test.ts` (só Seeds, sem Créditos, nada se paga com dinheiro, acessibilidade fora do catálogo). Verificar: `npx vitest run tests/avatar-loja.test.ts`

## 7. M7 Qualidade e entrega

- [x] 7.1 Axe e teclado. Prova: e2e `avatar-a11y` (axe WCAG 2.2 AA nos temas) e `docs/pesquisa/2026-10-28-avatar-a11y.md`. Verificar: `npx playwright test tests/e2e/avatar-a11y.e2e.ts`. Nota: o plano de 01/11 cita a linha 168 desse e2e como falha sem causa; reproduzir antes de ligar flag
- [x] 7.2 Performance no Chrome real. Prova: `docs/pesquisa/2026-10-28-avatar-interprete-medicoes.md` e `avatar-fala-medicoes.md` (60 fps em tier médio e fraco). Verificar: os números existem; repetir só se o motor mudar
- [ ] 7.3 i18n. Estado: pt/en completos (79 chaves com "avatar" no nome no `en.json`); `es` e `ar` têm bem menos linhas de avatar (57 e 2, contagem por `grep`) e a cobertura geral é 47% (es) e 38% (ar) contra piso de 90%. Verificar: `npm run i18n:orfas` sem órfãs e `npm run i18n` sem diferença; es/ar acima do piso de `src/data/i18n/cobertura.json` ou decisão do dono de liberar com fallback
- [ ] 7.4 Typechecks, lint, `npm test`, gitleaks e runbook da flag. Estado: não há runbook de avatar em `docs/runbooks/` nem menção no `docs/GUIA-DO-DONO.md`. Verificar: `docs/runbooks/avatar-flags.md` com ordem de ligação (`avatar_3d`, depois `avatar_elenco`, por último `avatar_sinais`), reversão e checagem de CSP/R2; CI verde
- [ ] 7.5 Rodadas do juiz. Estado: falante e emoção feitos (`docs/pesquisa/2026-10-28-avatar-elenco-juiz.md`); faltam microcopy com `copy-br-etica` e jornadas. Verificar: relatório novo em `docs/pesquisa/`; falhas viram tarefas; o juiz nunca decide sozinho (LLM-as-judge só por `claude -p`, sem créditos de API)

## 8. Para ligar em staging (novo em 25/11)

- [ ] 8.1 **[D][R]** Publicar a coleção curada no R2, definir `VITE_AVATARES_URL` no staging, ligar `avatar_3d` só para o id do dono e percorrer: Ajustes > Avatar, Intérprete, PiP, Perfil protegido (menor). Verificar: checklist com data, aparelho e navegador; flags continuam desligadas em produção
- [ ] 8.2 **[D]** Parecer jurídico (Quaternius QAL v1.0, `meta` de terceiros, menores, `espeak-ng`/Piper) e revisão por pessoas surdas antes de `avatar_sinais`. Verificar: parecer e relato anexados em `docs/pesquisa/`; sem eles `avatar_sinais` fica desligada

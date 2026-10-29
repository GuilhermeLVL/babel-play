## 0. M0 Especificação e flags (esta change)

- [x] 0.1 Change OpenSpec e `docs/specs/2026-10-28-avatar-interprete.md`. Aceite: `openspec validate avatar-interprete` passa
- [x] 0.2 Flags `FLAG_AVATAR_3D`, `FLAG_AVATAR_SINAIS`, `FLAG_AVATAR_ELENCO` em `src/core/planos.ts`. Aceite: typecheck verde
- [x] 0.3 Migração PG 0015 com as 3 flags desligadas + journal. Aceite: `tests/integration/schema-pg-baseline.test.ts` conta 20 flags
- [x] 0.4 `docs/flags.md` atualizado. Aceite: as 3 linhas na tabela de flags semeadas
- [ ] 0.5 Relatório de referências (`@pixiv/three-vrm`, ChatVRM, TalkingHead, wLipSync, airi): licença e como resolvem boca/expressão. Aceite: `docs/pesquisa/` com tabela e licenças conferidas

## 1. M1 Núcleo e motor

- [ ] 1.1 `core/avatar`: receita, licença, menores, tiers, estados, ritmo. Aceite: testes unitários cobrem campo desconhecido, VRM 0.x e 1.0, menor e os 3 tiers
- [ ] 1.2 Renderer lazy, carregador GLB/VRM, fallback 2D, detecção de tier, IndexedDB `frasy-avatar`. Aceite: sem WebGL2 mostra o fallback
- [ ] 1.3 Teste de orçamento de chunk. Aceite: `three` fora do chunk de arranque no `npm run build`
- [ ] 1.4 `VITE_AVATARES_URL` no `connect-src`. Aceite: teste de CSP

## 2. M2 Meu avatar

- [ ] 2.1 Ajustes > Avatar: escolher, personalizar, salvar, apagar. Aceite: E2E do fluxo leigo em no máximo 3 toques
- [ ] 2.2 "Traga o seu" com validador Khronos e tetos lidos do cabeçalho. Aceite: arquivo malformado ou acima do teto recusado sem decodificar; nenhuma requisição leva o arquivo
- [ ] 2.3 Cartão em `MolduraETitulo` com fallback foto/iniciais. Aceite: sem WebGL mostra iniciais
- [ ] 2.4 Perfil protegido. Aceite: sem importar e sem galeria de terceiros

## 3. M3 Fala

- [x] 3.1 `useAvatarFalando` ligado ao `TtsEngine`; amplitude da nuvem e cadência estimada. Aceite: teste dos estados com TTS falso
- [x] 3.2 Vida procedural e movimento reduzido. Aceite: com `prefers-reduced-motion` não há animação ociosa

## 4. M4 Intérprete e PiP (depois de M3)

- [x] 4.1 Avatar por lado em `ModoInterprete`. Aceite: legenda de texto sempre presente
- [x] 4.2 PiP (documento, vídeo, painel). Aceite: tier fraco no PiP; checklist do Safari entregue ao dono (spec, seção M4; Safari, Firefox e celular reais NÃO provados)
- [x] 4.3 Soletração sob `avatar_sinais` ligada ao Intérprete (painel, mãos sobre o círculo do intérprete, PiP de documento e aviso no quadro do PiP de vídeo; só nomes próprios, teto por fala, pulada com a fila atrasada). Aceite: os dois avisos fixos sempre visíveis; `suportaSinais` falso desabilita com o motivo. NÃO provado: PiP real, Safari, celular real, revisão por pessoas surdas

- [x] 4.4 Descoberta no Intérprete e no Perfil (atrás de `avatar_3d`/`avatar_sinais`): botão "Avatares" com rótulo à vista e alvo de 44 px, atalho "Soletrar nomes (Libras/ASL)" (aria-pressed, explica e oferece outro avatar quando o modelo não serve), dica da primeira vez dispensável e lembrada, cartão "Crie seu avatar" no Perfil com pular. Aceite: E2E nos três tamanhos; sem flags a tela não muda. PiP: sem controle novo (o PiP não tem controle de soletração)

## 5. M5 Livros e personagens (depende do PR de Livros)

- [ ] 5.1 Falante e emoção por frase (JSON estrito, lotes, cache, retenção zero, cota) com fallback heurístico. Aceite: conjunto de ouro pt/en/es acima do limiar do juiz
- [ ] 5.2 Mapa personagem para voz e painel do elenco. Aceite: `voiceName` chega ao motor

## 6. M6 Estúdio e loja

- [ ] 6.1 Estúdio (receita JSON, importar/exportar, miniatura 192 px). Aceite: ida e volta sem perda
- [ ] 6.2 `TipoDaLoja 'avatar'`. Aceite: posse paga vem do servidor; menor sem compra com dinheiro

## 7. M7 Qualidade e entrega

- [ ] 7.1 E2E dos fluxos, axe, teclado. Aceite: zero violações sérias
- [ ] 7.2 Performance no Chrome real (FPS e custo por frame, tier fraco). Aceite: números registrados em `docs/pesquisa/`
- [ ] 7.3 i18n (pt/en completos, es/ar acima do piso, `i18n:orfas`). Aceite: sem órfãs
- [ ] 7.4 Typechecks, lint, `npm test`, `postgres-real`, gitleaks, runbook da flag, `docs/GUIA-DO-DONO`. Aceite: tudo verde
- [ ] 7.5 Rodadas do juiz (falante/emoção, microcopy com `copy-br-etica`, jornadas). Aceite: falhas viram tarefas; o juiz nunca decide sozinho

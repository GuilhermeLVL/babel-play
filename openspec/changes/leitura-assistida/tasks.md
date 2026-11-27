## 0. Contrato (1 PR pequeno, antes das fatias)

- [ ] 0.1 `src/core/leitura/leituraAssistida.ts` com os tipos e assinaturas do `design.md` (stubs que não fazem nada). Verificar: `npm run typecheck`; teste de que os stubs não lançam.
- [ ] 0.2 Cinco flags NOVAS, desligadas e sem regra de plano: `escuta_player_compacto`, `leitor_selecao_firme`, `leitor_modo_traducao`, `leitor_destaque_vocab`,
      `ia_ajustar_nivel` (constantes `FLAG_*` em `planos.ts`; migrações PG 0044 a 0048 e SQLite 0083 a 0087). Verificar: `npm run migracoes:conferir` e teste de flags.
- [ ] 0.3 Pontos de encaixe em `Leitor.tsx`/`LeitorDoLivro.tsx` (4 componentes stub, lazy, só com a flag). Verificar: teste de componente com todas as flags desligadas (snapshot idêntico ao de hoje).

## 1. Fatia A: player e seleção (dono: ver design)

- [ ] A1 Reproduzir o salto de coluna e a seleção a mais num teste Playwright (fixture EPUB de duas colunas, gestos do 17/18.png); registrar se a hipótese da ordem do texto se confirma. Verificar: teste vermelho antes do conserto.
- [ ] A2 `ajusteDeSelecao.ts` puro: `ajustarAPalavras`, `limitarAoBloco`, descarte de pontos fora do texto. Verificar: testes de unidade (acentos, apóstrofo, hífen, CJK, árabe, ponto na margem, cruzando bloco).
- [ ] A3 Gestos: toque = palavra, duplo/longo = frase, triplo = parágrafo, em `selecao.ts`. Verificar: testes do reconhecedor com relógio falso.
- [ ] A4 Publicar `BarramentoDaSelecao` com `TrechoDoLeitor` (inclui `rect` fora do iframe e `coluna`). Verificar: teste de contrato.
- [ ] A5 Alças que andam por palavra (fora do iframe). Verificar: e2e Chromium e WebKit.
- [ ] A6 Player compacto (`escutaPlayer.css`, ResizeObserver no padding da transcrição). Verificar: e2e 1280x720 e 390x844, 0 px de sobreposição; captura de tela anexada.
- [ ] A7 Se foliate precisar de ajuste: só com `FRASY:` e linha em `foliate/PATCHES.md`. Verificar: `git diff` do foliate mostra só linhas marcadas.
- [ ] A8 Bateria de 100 gestos sintéticos medindo a taxa de refazer (meta <= 5%). Verificar: número no PR.

## 2. Fatia B: tradução e ações de leitura

- [ ] B1 `BalaoDaTraducao` com colisão contra `rect` (acima/abaixo, mesma coluna). Verificar: testes de posição (bordas, coluna dupla, celular), 0 sobreposição.
- [ ] B2 Modo tradução (interruptor no aparelho, debounce 250 ms, cancela se a seleção mudar). Verificar: teste com relógio falso; sem chamada duplicada.
- [ ] B3 Frase sob o dedo e parágrafo (reusam rota e cache atuais; local primeiro). Verificar: teste de que a nuvem só é chamada se o plano e a idade permitem.
- [ ] B4 "Ler em voz alta este trecho" (`lerEmVozAlta`) e copiar. Verificar: teste de componente; cancelar ao limpar a seleção.
- [ ] B5 Atalhos T, V, C, A em `atalhos.ts` (só com foco no leitor, nunca em campo de texto). Verificar: teste de teclado.
- [ ] B6 Exportar grifos com as traduções; ditado de uma frase grifada. Verificar: teste do exportador (golden) e do ditado com TTS falso.
- [ ] B7 Botão "Ajustar nível" no balão (só com `ia_ajustar_nivel`), chamando `abrirAjustarNivel`. Verificar: teste com a flag ligada e desligada.

## 3. Fatia C: destaque por vocabulário

- [ ] C1 `statusDaPalavra(chave, idioma)` sobre o índice de etiquetas e `forcaDoCartao`. Verificar: testes por força 1 a 4, ignorada, conhecida, sem cartão.
- [ ] C2 `intensidadeDoDestaque` pura (nova uma cor com alfa por frequência; aprendendo em gradiente; conhecida sem cor). Verificar: testes de tabela e de monotonicidade (força maior, alfa menor).
- [ ] C3 `destaqueNoDocumento.ts` com `CSS.highlights`, uma passada por seção, orçamento 50 ms. Verificar: teste de desempenho com seção de 5 mil palavras; fallback sem a API não lança.
- [ ] C4 Legenda/chave e régua de densidade (% de novas); % de palavras conhecidas antes do capítulo. Verificar: teste de componente e de cálculo.
- [ ] C5 Cartão da palavra de 1 toque (Não sei, 1 a 4, Já sei, Ignorar, Revisar). Verificar: testes que conferem a escrita pelas APIs existentes e que o destaque atualiza em <= 100 ms.
- [ ] C6 Opção `marcarConhecidasAoPaginar` (desligada, aviso, desfazer, indisponível para perfil protegido). Verificar: testes de que NÃO marca palavras clicadas e de que o padrão é desligado.
- [ ] C7 5 cartões no fim do capítulo (`palavrasParaPraticar`). Verificar: teste de componente.
- [ ] C8 Etiquetas `data-forca` no leitor (fecha a parte pendente 3.2 da change `status-da-palavra-na-legenda`, combinando com o dono dela). Verificar: teste de que o texto acessível não muda.

## 4. Fatia D: IA "Ajustar nível"

- [ ] D1 Simular antes de ligar: script `scripts/leitura/simular-nivel.ts` mede acerto de nível (classificador local) em 50 parágrafos por nível com 2 modelos baratos candidatos, 1 e 2 chamadas. Verificar: tabela em `docs/` e escolha do modelo registrada no `design.md`. Rodar em bancada com juízes sem créditos de API.
- [ ] D2 `src/core/leitura/ajustarNivel.ts` puro: classificador de nível (`cefrWordlist`), checagem de palavras conhecidas preservadas, montagem do pedido. Verificar: testes de unidade.
- [ ] D3 `server/ai/nucleo/ajustarNivel.ts` + rota, com cascata `rapida`, no máximo 2 chamadas, `custo` na resposta, recusa tipada. Verificar: teste de integração com provedor falso, incluindo falha na 2a chamada.
- [ ] D4 `saidaFiltrada` com perfil protegido e corpus adversarial. Verificar: 0 vazamentos; teste de que o servidor não persiste o texto (retenção zero).
- [ ] D5 Cotas `ajustesDeNivelMes` e `ajustesDeCapituloMes` em `planos.ts` (0 no Grátis e convidado) e reflexo em `ferramentasDeIa`. Verificar: testes da matriz de planos e dos motivos (`plano`, `cota`, `idade`).
- [ ] D6 `PainelAjustarNivel` (original ao lado, custo exibido, seletor A1 a C2, Simplificar/Elevar) e `abrirAjustarNivel`. Verificar: teste de componente; e2e em 390x844 (abas).
- [ ] D7 Cache no aparelho (IndexedDB) por hash. Verificar: segundo pedido igual não chama a rede.
- [ ] D8 Escopo capítulo: estimativa e confirmação, blocos por parágrafo, cancelável, cota própria. Verificar: teste de cancelamento e de cota.
- [ ] D9 Ações de 1 toque (gramática, resumo até aqui, exemplo) reusando `explicarFrase`/`resumir`. Verificar: testes de roteamento.

## 5. Fechamento (um PR)

- [ ] 5.1 `npm run i18n`, `npx knip`, lint, typecheck, `npm test`, e2e Chromium e WebKit, `npm run ci:local`. Verificar: tudo verde antes do push (skill `pre-envio`).
- [ ] 5.2 Medir todas as métricas do `design.md`, anexar em `docs/auditoria/` e deixar as flags DESLIGADAS; ligar é ato do dono.
- [ ] 5.3 Atualizar `CLAUDE.md` (mapa do leitor) e `docs/` com as 5 flags e o contrato.

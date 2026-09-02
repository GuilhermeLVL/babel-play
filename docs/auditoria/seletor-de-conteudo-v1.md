# Auditoria — seletor de conteúdo em "Praticar jogando" (G0/G1)

Documento vivo. Registra o diagnóstico do plano "Seletor facetado de Praticar jogando + pente-fino
dos 9 minijogos pós-Anki" já auditado contra o código ATUAL, depois das ondas 1–3 (commits
`b1b23be..1a8432d`, mais `2fb0697` no topo do branch). Onde o plano citava uma linha, ela foi
conferida de novo aqui — números que se moveram estão corrigidos; o que não pôde ser confirmado está
marcado como "não verificado".

## Contexto

Antes desta rodada, a tela "Praticar jogando" tinha três linhas de controle que não se explicavam
entre si: abas exclusivas de fonte, chips de Anki/baralho/idioma, e uma faixa de gravação — todas
lendo e escrevendo estado próprio. Contadores com escopos misturados conviviam na mesma tela ("847
no idioma · 20 com tradução · 827 só com frase" ao lado de "todas passaram na régua" e de "1041
pedindo revisão"), e uma fonte heterogênea multi-idioma alimentava 9 jogos cujos contratos assumiam
fala capturada curta. O trabalho registrado abaixo substituiu essas três linhas por um filtro
facetado único (`FiltroDaPratica`) e consertou os quatro defeitos estruturais do diagnóstico
original.

## Tabela de precedência — estado ATUAL

No código anterior às ondas 1–3, o ternário do `ref` em `Play.tsx` fazia `sessao`/`trilha` engolir o
chip (aceso e inerte) enquanto `completar:false` continuava valendo em qualquer aba, capando a
rodada em silêncio. Isso mudou de natureza no commit `2aedaa0` ("a inversão da verdade no Play — o
filtro vira o estado, e a fonte vira derivado"): `fonte` deixou de ser o estado escrito por doze
pontos do arquivo e passou a ser um memo de `fonteDominante(filtro)` (`src/components/views/Play.tsx:68`
importa os adaptadores; a composição em `Play.tsx:1449-1464` usa `fonte.id`/`fonte.ref` só como
proveniência legada, e quem filtra de fato é o objeto `filtro` em `Play.tsx:1459`).

**Confirmado no código**: o defeito "chip aceso e inerte" está eliminado por construção — não existe
mais um ternário separado decidindo `ref` independente do chip; escrever uma fonte que não é
`'baralho'` derruba o recorte de baralho junto (mensagem do commit `2aedaa0`, verificada contra
`Play.tsx:1454-1458`, onde `ref` deriva de `fonte.id`, e `fonte` por sua vez é derivado do filtro).

**Ressalva que o plano não sustentava mais**: `completar` como flag booleana **não morreu por
completo** — ela sobrevive no caminho da faixa de dificuldade (`Play.tsx:1671-1678`), que o próprio
commit `2aedaa0` declara não ser faceta: "o booleano `completar` que confundia 'não completar' com
'não filtrar' só sobrevive no caminho de faixa de dificuldade, que não é faceta." Ou seja, o defeito
original (chip inerte via `completar:false` em qualquer aba) foi eliminado; a flag em si continua
existindo para um caso fora do escopo do filtro facetado, com blindagem própria via
`recortarPelaComposicao(..., { filtro })` (`Play.tsx:68`, `1678`).

Como a fonte agora é derivada (não há mais 8 combinações independentes de aba×chip×idioma×faixa
gravadas em estados separados), a tabela de precedência do plano — pensada para o modelo antigo —
não se aplica mais literalmente. O modelo atual é: **um único filtro facetado** (`FiltroDaPratica`,
`src/core/minigames/filtro.ts`) decide `passaNoFiltro` por cartão; `fonteDominante(filtro)` traduz
esse filtro para o `FonteId`/`ref` legado (só para proveniência em `exercise_results.origem` e para
os chamadores que ainda esperam `FonteDeItens`). Não existe mais uma segunda fonte de verdade que
o chip possa contradizer.

| Situação (modelo atual) | Resultado |
|---|---|
| Nenhum recorte ligado, fonte = baralho Anki ativo | `filtro.fontes=['baralho']`, `filtro.baralhos=[id]`; `fonteDominante` devolve `{id:'baralho', ref:'anki:<id>'}` |
| Recorte "pedindo revisão" ligado sobre qualquer fonte | `filtro.recorte.pedindoRevisao=true`; o complemento local passa por `passaNoFiltro`, nunca mais por `completar:false` cru |
| Recorte "dificeis" como único recorte ativo | `fonteDominante` preserva `{id:'dificeis'}` — caso especial documentado no plano e no commit `2aedaa0` |
| Troca de aba (sessão → trilha) com recorte de baralho ligado | `passaNoFiltro` derruba `filtro.baralhos` junto — não há mais chip aceso e inerte |
| Filtro de faixa de dificuldade (Termo, letras) | Continua fora da faceta; usa `completar:false` no caminho legado (`Play.tsx:1671-1678`) — declarado, não escondido |

## Tabela dos 14 contadores — origem, escopo e estado atual

O plano listava 14 expressões de contador com 6 incoerentes, na raiz do defeito nº 1
(`quality.ts:470`, na numeração antiga). O ponto central foi confirmado e corrigido:

| Contador (nome no plano) | Expressão atual | Escopo real | Incoerente antes | Estado atual |
|---|---|---|---|---|
| "N com tradução" / "N só com frase" | `pistasDaTriagem` — `src/core/learning/quality.ts:465-478` | Por cartão, via `pistaUtil(c.translation ?? '', c.daAnki ? 'curado' : 'captura')` | Sim — antes chamava `pistaUtil` sem origem (default `'captura'`, régua de fala) | **Corrigido** (`quality.ts:478`, comentário no próprio arquivo linhas 470-477 explica o defeito histórico) |
| `avaliarCartao` (aprovação de cartão) | `quality.ts:225-251` | Por cartão, `origem = opts.origem ?? (card.daAnki ? 'curado' : 'captura')` (`quality.ts:229`) | Não — já usava a origem correta | Perfil de referência; agora `pistasDaTriagem` usa o MESMO critério |
| Chips de idioma da Sala (`idiomasDisponiveis`) | `src/core/minigames/source.ts:142-158` | Por idioma, `pistasDaTriagem(t).comTraducao.length` (linha 154) | Sim — herdava o defeito acima, chegando a bloquear o chip com "nenhuma com tradução" | **Corrigido de graça** (usa `pistasDaTriagem`, já consertado) |
| "1041 pedindo revisão" (banner global) | `server/db/repositories/metrics.ts:122` — `dueToday = inDeck.filter(c => c.dueAt != null && c.dueAt <= now).length` | Global da conta (sem idioma/aba/chip/fonte) | Sim, dupla: (a) cartão nunca agendado contava como vencido; (b) escopo global exibido junto de números recortados | (a) **corrigido** — `c.dueAt != null` substitui `(c.dueAt ?? 0) <= now` (comentário em `metrics.ts:118-121` documenta o bug antigo). (b) **ainda global** — o comentário no próprio arquivo (linha 119) admite que o número "mente por ESCOPO (conta fora do deck selecionado...)"; reescopo no servidor é item do G4, não feito nesta onda |
| Termo — "sem pista" no gate/construtor | `motivoForaDoTermo`, `src/core/minigames/termo.ts:50-76` | Por cartão, régua derivada de `daAnki` (comentário em `termo.ts:64` referencia `avaliarCartao`) | Sim — assinatura não transportava `daAnki` | **Corrigido** (S1, ver DOC 2) |
| "N no recorte · baralho · idioma" (resumo-verdade) | `Play.tsx` (linha da faixa de resumo, introduzida no commit `1a8432d`) | Deriva de `passaNoFiltro` sobre o mesmo conjunto usado pela rodada | Sim, era o "S9" do pente-fino: acervo (faixa/mapa) e gate discordavam | **Corrigido** — commit `1a8432d`: "o acervo exibido passa pelo MESMO predicado da rodada... verificado no navegador com o recorte de baralho ligado: 599 em TODOS os pontos" |
| Pílulas de recorte (Pedindo revisão / Nunca vistas) | `Segmentado` com `multiplo`, contagem por pílula | Cada pílula mede o que ELA renderia dentro do resto do filtro (padrão facetado, mensagem do commit `1a8432d`) | Não é o padrão antigo "sobra depois de si mesma" | Implementado nesta onda; sem defeito conhecido registrado |
| "N no idioma" / total do baralho na Sala | `idiomasDisponiveis` (mesma função acima) | Por idioma | Coberto pela mesma correção | **Corrigido** |
| Demais contadores da tabela original (XP, sessões da faixa "ouvido" — D8, `chaveComparavel` vs `c.word` cru) | não relocalizados individualmente nesta auditoria | — | — | **Não verificado** — o plano cita `D8` (a faixa conta `sessoes` inteiro sem filtro) e o achado extra de `c.word` cru como pendências de juízo/G2; não foram rastreados linha a linha nesta rodada por não terem aparecido nos commits de correção revisados (`b1b23be`..`1a8432d`) |

Nem todos os 14 contadores do levantamento original do plano puderam ser reidentificados
individualmente nesta auditoria (o plano os descrevia em prosa, sem lista numerada estável); os que
aparecem acima são os que têm evidência direta nos commits ou no código atual. Os demais — citados
apenas como "6 incoerentes de 14" sem linha — ficam como **não verificado**.

## Vereditos D1–D10

| # | Enunciado do plano | Estado |
|---|---|---|
| D1 | Anki não é aba (é uma fonte entre outras, hierárquica) | Corrigido no programa — o filtro facetado (`FiltroDaPratica.fontes`) trata baralho como uma faceta multi-seleção, não uma aba exclusiva |
| D2 | Tabela de precedência com 8 combinações; chip aceso e inerte | Corrigido — ver seção acima (`2aedaa0`); o defeito específico "chip aceso e inerte" está eliminado por construção |
| D3 | Régua de fala aplicada a baralho curado, contaminando contadores | Corrigido — `quality.ts:478` (S1) |
| D4 | "847" da aba e "847" da faixa são o mesmo escopo por caminhos diferentes; XP é coincidência | Não verificado nesta rodada — não apareceu isolado em nenhum commit revisado; o resumo-verdade do commit `1a8432d` sugere que os pontos de exibição convergiram para um predicado único, o que teria consertado D4 de fato, mas não há evidência textual direta |
| D5 | Dois envelopes de seletor de idioma (Segmentado+contagem em Praticar vs 2×LangPicker+auto em Gravar), cardinalidades diferentes | **Pendente** — confirmado no código: `Play.tsx` ainda lê `ui.praticaLang` como chave própria (`Play.tsx:1175`, `1379`) com fallback para `langConfigFrom(...).studying` (`Play.tsx:1174,1176`); `src/lib/langConfig.ts` continua sendo o modelo `mine`/`studying` usado por Gravar/Captura. Os dois seletores não foram unificados |
| D6 | Categoria é radio; multi só existe em `Segmentado.multiplo`, usado uma vez | Parcialmente alterado — o filtro facetado agora usa `Segmentado` com `multiplo` para as pílulas de recorte (commit `1a8432d`), então o uso deixou de ser único; não verificado se a fonte (baralho/sessão/trilha) virou multi-seleção de fato na UI |
| D7 | Nenhum motivo de bloqueio cobria "pista longa"/"alfabeto" | Corrigido — `MotivoBloqueio` ganhou `'alfabeto-nao-suportado'` (`src/core/minigames/estadoDosJogos.ts:54,77`); "pista-longa-para-este-jogo" e "sem-traducao-no-recorte" do desenho arquitetural do plano **não foram encontrados** no código atual — não verificado |
| D8 | A faixa conta `sessoes` inteiro sem filtro; chama Anki de "ouvido" | Não verificado — não localizado nos commits revisados nem re-grepado com sucesso nesta rodada |
| D9/D10 | Juízo de design, wireframe no G1 | Fora do escopo desta auditoria de código (são decisões de produto/UX, não asserções verificáveis por grep) |

## Mapa dos dois seletores de idioma (Praticar × Gravar) e decisão Q3

- **Gravar / Captura**: `src/lib/langConfig.ts` — modelo `{ mine, studying }` em BCP-47, com
  `useLangConfig()` como hook único (linha 111), lido de `settings.ui.captureSourceLang` /
  `captureTargetLang` / `settings.targetLanguage` (linhas 57-63). Este módulo já resolveu, segundo o
  próprio comentário do arquivo (linhas 5-14), um bug histórico de inversão `src`/`tgt` entre telas —
  mas é um problema anterior e separado do seletor de Praticar.
- **Praticar (Play.tsx)**: preferência independente `praticaLang`, persistida em `settings.ui`
  (`Play.tsx:1175` lê, `Play.tsx:1379` grava via `patchUiSettings({ praticaLang: lang })`), com
  fallback para `baseLang(cfg.studying)` quando não há preferência salva (`Play.tsx:1176`). Isto é
  literalmente a "quarta chave de idioma órfã" do plano: `praticaLang` não é um espelho de
  `mine`/`studying` — é uma quarta chave que só cai para o valor de `studying` na ausência de
  preferência própria.
- **Decisão Q3 do plano** ("unificar o seletor de idioma num componente com estados distintos por
  contexto — confirmar viabilidade no G0"): **ainda não implementada**. O que a onda 1-3 resolveu foi
  a janela de corrida na inicialização (S13 — ver DOC 2), não a unificação de modelo. `praticaLang`
  continua sendo estado próprio, não um espelho de `filtro.idiomas` como o "Desenho arquitetural
  decidido" do plano propunha.

## Notas de rastreamento

- A tabela de precedência do plano (8 combinações aba×chip×idioma×faixa) descrevia um modelo que a
  onda 2 (commit `0b796eb`/`2aedaa0`) substituiu por um único filtro. Reproduzir a tabela literal do
  plano seria documentar um código que não existe mais; a seção acima documenta o modelo atual e onde
  o defeito original foi eliminado.
- Testes relevantes localizados em `tests/`: `filtro-na-url.test.ts`, `tests/integration/filtro-composicao.test.ts`,
  `filtroDaPratica.test.ts`, `composicaoDeRodada.test.ts`, `idiomaDaRodada.test.ts`,
  `contagemHonesta.test.ts`, `elegibilidade.test.ts` (com snapshot em `tests/__snapshots__/elegibilidade.test.ts.snap`),
  `estadoDosJogos.test.ts`. Não foi lido o conteúdo de cada um linha a linha nesta rodada; a lista serve
  de ponto de partida para o G2.

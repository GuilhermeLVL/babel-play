## Onda 1 (G1) — cirúrgicos

- [x] 1.1 `motivoForaDoTermo`/`contarJogaveisMulti` (Termo) aplicam régua de qualidade por origem
      (não `pistaUtil` sem `origem`) — `MotivoBloqueio` ganhou `alfabeto-nao-suportado`
      (`src/core/minigames/estadoDosJogos.ts:29-54`)
- [x] 1.2 `pistasDaTriagem` (`quality.ts:478`) passa a origem por cartão ao `pistaUtil`
      (`c.daAnki ? 'curado' : 'captura'`) — o defeito central do G0 ("20 com tradução · 827 só
      com frase" sobre um baralho onde todas tinham); `idiomasDisponiveis` herda o conserto
- [x] 1.3 Gate mínimo de alfabeto (Caça-palavras/Termo não-latino) — `alfabeto-nao-suportado` como
      motivo de bloqueio declarativo em `estadoDosJogos.ts` (degradado/indisponível com motivo)
- [x] 1.4 S8 teto de `word` na projeção Anki — `foraDoBulkAdd` (a mesma régua do caminho manual)
      roda em `projetarDoAnki` e grava `motivoDescarte` (`vocab.ts:~831-842`)
- [x] 1.5 S11 idioma do baralho com detecção de escrita — `escritaDominante`/`contagemDeEscritas`
      + `decidirIdiomaOrigem` com regra kana/hangul-presença e piso `max(2, total*0.02)`
      (`server/import/anki.ts`, `server/routes/import.ts`)
- [x] 1.6 S10 entidades (numéricas + nomeadas) e furigana escopada `Han[Kana]→Han` decodificadas
      em `limparCampo` (`server/import/anki.ts:~104+`)
- [x] 1.7 `dueToday` tratado como `dueAt IS NOT NULL` no predicado de filtro — `passaRecorte`
      (`filtro.ts`) usa `dueAtMs == null`/`dueAtMs <= agora`, não parse de rótulo
- [x] 1.8 S13 janela de `lang=''` na inicialização — o efeito de compor espera deck E idioma
      resolverem no mesmo commit (`if (deck == null) return`, `Play.tsx:1435`, comentário S13)
- [x] 1.9 S6 memória curta com o baralho na chave — `chaveDaMemoriaCurta(fonte, baralhoAnki)` é a
      verdade única de leitura e gravação (`Play.tsx:140`)
- [x] 1.10 S4-mínimo: `origemDoMaterial(jogo, fonteId, declarada?)` puro em `revelavel.ts`, usado
      na prévia (`Play.tsx:675`); teste em `tests/antessala.test.ts`

## Onda 2 (G2) — fundação facetada

- [x] 2.1 `FiltroDaPratica` — tipos, `FILTRO_PADRAO`, predicado puro `passaNoFiltro`
      (`src/core/minigames/filtro.ts`)
- [x] 2.2 Semântica união-dentro/interseção-entre implementada e documentada no predicado
      (`passaFontes`, `passaRecorte`, `passaMidia` — `filtro.ts`)
- [x] 2.3 Adaptadores de compatibilidade `fonteDominante`/`filtroDaFonte` (round-trip com `FonteId`)
- [x] 2.4 `filtroAplicavel` — detecta payload antigo sem `baralhosAnki` e evita esvaziar a rodada
      em silêncio (`filtro.ts`)
- [x] 2.5 `FiltroDeComposicao` no fio + overload de `recortarPelaComposicao`
      (`{ filtro, extras }`, sem quebrar `{ completar }`) — `composicao.ts:450-520`
- [x] 2.6 Ramo SQL multi-valor (`IN`) sobre `origin_kind`/`origin_ref`/`srcLangBase` —
      `server/db/repositories/vocab.ts:560,605`
- [x] 2.7 `src_lang_base` (coluna `GENERATED ALWAYS ... VIRTUAL` + índice) — migração
      `server/db/migrations/0019_seletor_facetado.sql`; `down.sql` (`DROP INDEX` manual) neste
      diretório de change
- [x] 2.8 Teste de paridade predicado × SQL — `tests/integration/filtro-composicao.test.ts`
- [ ] 2.9 Elegibilidade por jogo totalmente declarativa (`maxCharsEnunciado?`, `precisa?` na tabela
      `MINIGAMES`) — confirmado `alfabeto?`/`alfabeto-nao-suportado`; os demais campos declarativos
      não verificados nesta auditoria

## Onda 3 (G3) — UI facetada em Play.tsx

- [x] 3.1 Inversão de precedência fonte→filtro (`filtroDaFonte`/`fonteDominante` como fonte da
      verdade) — `Play.tsx:68,279-302`
- [x] 3.2 Persistência versionada com espelho da chave legada por um release —
      `src/lib/filtroDaPratica.ts` (`gravarFiltro`)
- [x] 3.3 Filtro na URL de `/jogar` (`queryDoFiltro`/`filtroDaQuery`) com captura no boot do módulo
      de rotas (`consumirQueryDoBoot`, consumo único) — `src/lib/rotas.ts:200-215`,
      `Play.tsx:1209-1219,1402-1405`
- [x] 3.4 Fileira RECORTE com `Segmentado multiplo` (pílulas com contagem e motivo de bloqueio),
      resumo-verdade «N no recorte · baralho · idioma» e vazio útil — verificado no navegador e
      coberto por `tests/e2e/facetas.e2e.ts`; bottom sheet no estreito segue pendente (onda 4)
- [x] 3.5 Contadores re-escopados: resumo, mapa, cartas e pílula derivam de `acervoDaFonte`
      (599 em todos os pontos onde antes 847×599 discordavam); o banner "pedindo revisão" conta
      `vencidosAgora` (escopo da rodada) em vez de `metrics.dueToday` global

## Onda 4 (G4) — pendências declaradas do roadmap

- [ ] 4.1 Distribuição multi-fonte proporcional (piso 1 por fonte, largest-remainder,
      determinística) — **não implementada**; nenhuma lógica de distribuição proporcional
      encontrada em `composicao.ts`
- [ ] 4.2 Seletor de idioma unificado (`praticaLang` como espelho de `filtro.idiomas`) — não
      verificado nesta auditoria
- [ ] 4.3 `'dificeis'` como pílula de recorte na UI (hoje é campo do filtro,
      `recorte.dificeis`; a superfície visual não foi auditada)
- [ ] 4.4 Unidade notas×cartões explícita na tela Baralhos (`BaralhosAnki.tsx`) — não verificado
- [ ] 4.5 Re-escopo server-side do `dueToday` — **não implementado**; nenhuma ocorrência de
      `dueToday` em `server/db/repositories/vocab.ts`
- [ ] 4.6 Matriz executada dos 9 jogos (G2 do roadmap original, 9×4×4×3 células como suíte vitest)
      — não verificada nesta auditoria
- [x] 4.7 Medição de consulta multi-seleção em acervo 20k+ — `scripts/medicao-filtro/medir.ts` +
      `docs/pesquisa/medicao-filtro-20k.md`; reprovou (SCAN por candidato, 4-46 s), levou ao
      conserto `idx_occ_probe` + `user_id` nas sondas, re-medido: 19-50 ms, nenhum SCAN

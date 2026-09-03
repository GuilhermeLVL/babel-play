Ordem por risco crescente. As fases 0–1 não mudam comportamento nenhum.

## Fase 0 — andaimes (risco nulo, nada consome ainda)

- [x] 0.1 `src/data/trilha/indice.json` + tipo, com escala, versão, total, `porNivel` e pares de glosa
- [x] 0.2 `src/data/trilha/carregar.ts` com `import.meta.glob` e cache em módulo
- [x] 0.3 `src/data/trilha/niveis/en.json` (~40 KB, só palavra→nível)
- [x] 0.4 `scripts/trilha/verificar.mjs` + plugue em `scripts/audit-gate.mjs`

## Fase 1 — bundle (risco baixo)

- [x] 1.1 `cefrWordlist.ts` passa a ler `niveis/en.json`; função continua síncrona. −190 KB
- [x] 1.2 Medir: 233 KB -> 20,4 KB (91% a menos) no que cefrWordlist puxa. Chunk antes/depois — a linha de base é `en-vjtESkJa.js` = 237,2 KB

## Fase 2 — carregamento dinâmico (MAIOR RISCO do plano)

- [x] 2.1 `temTrilha`, `totalDaTrilhaAtual` e as contagens da faixa passam a ler o índice
- [x] 2.2 `trilha` vira `useState` + `useEffect` com guard `let vivo`, no mesmo padrão do efeito
      de composição que já existe em `Play.tsx`
- [x] 2.3 `carregandoTrilha` alimenta o esqueleto da grade — nunca o motivo "sem material"
- [x] 2.4 Prefetch ao trocar de idioma na Sala e ao marcar a fonte trilha
- [x] 2.5 Playwright: entrar em `/jogar`, escolher Trilha, confirmar que a contagem **nunca passa
      por zero** e que nenhum jogo pisca "sem material"

## Fase 3 — schema (risco médio)

- [~] 3.1 O `es` nasceu em v2; o `en` **não foi migrado** — o carregador aceita as duas versões, e
      converter o inglês agora seria risco sem ganho (ver "o que sobrou", abaixo)
- [x] 3.2 Join trilha+glosa no carregador (o seam) — `trilha.ts`, `etapas.ts` e `PainelTrilha.tsx`
      não mudaram de forma. 7 testes em `tests/trilha-carregar.test.ts`
- [x] 3.3 `DadoTrilha` ganha `escala` e `procedencia`

## Fase 4 — F26 e honestidade do nível (risco médio, valor alto)

- [x] 4.1 Promoção usa a glosa do par (o join entrega o cartão já com pista)
- [x] 4.2 Palavra sem glosa joga mas não promove (`filter(c => !!c.translation?.trim())`)
- [x] 4.3 `cefrLevel` só é gravado quando `escala === 'cefr'`; senão `null` com confiança 0
- [x] 4.4 `nivelCefr` ganha `frequencia` e `faixa`; `level` nulo nesse caso
- [x] 4.5 `scripts/trilha/diagnostico.mjs` conta o dano sem reescrever. Neste banco: 0 cartões da
      trilha (só anki 2.922 e sessao 467), logo 0 de dano
- [x] 4.6 Rótulo da etapa derivado de `escala` — Sala, gaveta, painel e nome da etapa

## Fase 5 — pipeline e primeiro idioma novo (risco baixo, por construção)

- [x] 5.1 `scripts/trilha/{fontes,filtrar,faixas,frases,glosas,gerar}.mjs`
- [x] 5.2 Trilha piloto `es`: 5.727 palavras lematizadas, 955 por faixa, 41% com glosa (59% na A1).
      Wikidata (CC0) 732 pares + Wikcionário/Wiktextract (CC BY-SA) 13.740
- [~] 5.3 Amostra de 60 revisada — **por modelo, não por falante nativo humano**, e o `FONTES.md`
      diz isso. Taxa: 70% antes das correções de glosa, **90% depois**. A revisão humana continua
      pendente e é o que fecha esta tarefa
- [x] 5.4 Tabela de cobertura por idioma na tela — `CoberturaDosIdiomas`, recolhida na gaveta do
      seletor e na Sala, com trilha, palavras, voz do navegador e o que é do usuário

## Rollout proposto

Com os defeitos do G1 corrigidos (kanji, RTL, detecção, vazamento), a ordem deixa de ser decidida
pela dificuldade de escrita e passa a ser decidida por **onde há dado bom**:

1. **es, fr, de** — frequência farta e confiável, TTS comum nos SOs, todos os 9 jogos elegíveis.
   Valida o pipeline com o caso fácil.
2. **ja** — agora que o kanji não é mais descartado, é o teste do caso difícil: JLPT tem licença
   aberta (CC-BY via Tanos), o que permite comparar frequência × lista oficial no mesmo idioma.
3. **zh, ru** — HSK 3.0 e cirílico; o gate de alfabeto já os trata com motivo.
4. **ar, he** — por último, e só depois de o RTL do G1 ser exercitado em uso real.

`hi` e `th` só entram depois de a detecção nova do G1 rodar sobre baralho real.

## Fase 6 — frases jogáveis (feita)

- [x] 6.1 `lerFrases` devolve `{ id, frase }`; o índice carrega o id
- [x] 6.2 `traducoesDasFrases` lê o export por par do Tatoeba (`<iso3>-por_links.tsv`)
- [x] 6.3 Ter tradução vira o critério mais pesado da escolha da frase (20% -> 72% em es-pt)
- [x] 6.4 `glosas/<par>.json` passa a trazer `frases`, e o join do carregador já as consumia
- [x] 6.5 `tests/trilha-frases-jogaveis.test.ts` trava o caminho até `buildScrambleRounds`

## Fase 7 — japonês e russo (feita)

- [x] 7.1 `ru`: 5.786 palavras, 95% com frase, 33% glosas, 41% frases traduzidas
- [x] 7.2 `ja`: 5.947 palavras, 87% com frase, 26% glosas, 18% frases traduzidas
- [x] 7.3 `contarPalavras` mede por caractere em escrita sem espaço (ja/zh/th) — a régua reprovava
      o japonês inteiro, na trilha E na captura: 5 frases de 5.947 passavam, agora 5.181
- [x] 7.4 `tokensSemEspaco` acha a palavra na frase por n-grama contra a lista da trilha, sem
      embutir tokenizador
- [x] 7.5 Motivo `escrita-sem-separacao`: "Montar a frase" dizia "precisa de gravação com legenda"
      para uma trilha com 5.181 frases

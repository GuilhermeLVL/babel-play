Ordem por risco crescente. As fases 0–1 não mudam comportamento nenhum.

## Fase 0 — andaimes (risco nulo, nada consome ainda)

- [ ] 0.1 `src/data/trilha/indice.json` + tipo, com escala, versão, total, `porNivel` e pares de glosa
- [ ] 0.2 `src/data/trilha/carregar.ts` com `import.meta.glob` e cache em módulo
- [ ] 0.3 `src/data/trilha/niveis/en.json` (~40 KB, só palavra→nível)
- [ ] 0.4 `scripts/trilha/verificar.mjs` + plugue em `scripts/audit-gate.mjs`

## Fase 1 — bundle (risco baixo)

- [ ] 1.1 `cefrWordlist.ts` passa a ler `niveis/en.json`; função continua síncrona. −190 KB
- [ ] 1.2 Medir o chunk antes/depois — a linha de base é `en-vjtESkJa.js` = 237,2 KB

## Fase 2 — carregamento dinâmico (MAIOR RISCO do plano)

- [ ] 2.1 `temTrilha`, `totalDaTrilhaAtual` e as contagens da faixa passam a ler o índice
- [ ] 2.2 `trilha` vira `useState` + `useEffect` com guard `let vivo`, no mesmo padrão do efeito
      de composição que já existe em `Play.tsx`
- [ ] 2.3 `carregandoTrilha` alimenta o esqueleto da grade — nunca o motivo "sem material"
- [ ] 2.4 Prefetch ao trocar de idioma na Sala e ao marcar a fonte trilha
- [ ] 2.5 Playwright: entrar em `/jogar`, escolher Trilha, confirmar que a contagem **nunca passa
      por zero** e que nenhum jogo pisca "sem material"

## Fase 3 — schema (risco médio)

- [ ] 3.1 Script de migração: `en.json` v2 + `glosas/en-pt.json`, contando colisões
- [ ] 3.2 Join trilha+glosa no carregador (o seam) — `trilha.ts`, `etapas.ts` e `PainelTrilha.tsx`
      não mudam de forma
- [ ] 3.3 `DadoTrilha` ganha `escala` e `procedencia`

## Fase 4 — F26 e honestidade do nível (risco médio, valor alto)

- [ ] 4.1 Promoção usa a glosa do par; par ausente → modo monolíngue com motivo real
- [ ] 4.2 Palavra sem glosa joga mas não promove
- [ ] 4.3 `cefrLevel` só é gravado quando `escala === 'cefr'`
- [ ] 4.4 `nivelCefr` ganha `frequencia` e `faixa`; `level` nulo nesse caso
- [ ] 4.5 Diagnóstico do dano legado (contagem, sem reescrita automática)
- [ ] 4.6 Rótulo da etapa derivado de `escala` na tela

## Fase 5 — pipeline e primeiro idioma novo (risco baixo, por construção)

- [ ] 5.1 `scripts/trilha/{fontes,filtrar,faixas,frases,glosas,gerar}.mjs`
- [ ] 5.2 Gerar a trilha piloto e medir a saída (palavras por nível, % com frase, cobertura)
- [ ] 5.3 Amostra de 30 palavras revisada por falante nativo, com a taxa registrada no `FONTES.md`
- [ ] 5.4 Tabela de cobertura por idioma na tela

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

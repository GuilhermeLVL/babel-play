## Context

A trilha de hoje: `src/data/trilha/en.json` (233 KB), `{ lang, fonte, versao, niveis: { A1..C2:
Array<[palavra, traducao, frase?, fraseTraduzida?]> } }`, 2.784 palavras e 2.552 com frase.
Consumida por `trilha.ts` (`cartoesDaTrilha`, `frasesDaTrilha`, `niveisEmJogo`) e `etapas.ts`.
Os cartões são pseudo-cartões com `id: ''` — é isso que impede a trilha de escrever SRS
(`Play.tsx` só chama `reviewCard` com `cardId`); o FSRS só entra quando a palavra é **promovida**,
e só é promovido o que a pessoa errou.

## Decisão 1 — Trilha monolíngue, glosas por par

`trilha/<lang>.json`:

```
{ "lang": "es", "versao": 2,
  "escala": "cefr" | "frequencia",
  "procedencia": "curado" | "wordlist" | "frequencia",
  "fonte": "<atribuição + licença>",
  "niveis": { "A1": [["silla"], ["ventana", "Abre la ventana."]], ... } }
```

`glosas/<praticado>-<nativo>.json`:

```
{ "par": "en-pt", "praticado": "en", "nativo": "pt", "versao": 1,
  "trilhaVersao": 2, "trilhaHash": "sha256:…",
  "glosas": { "chair": "cadeira" },
  "frases": { "chair": "A cadeira é vermelha." } }
```

**As chaves de nível continuam `A1..C2` mesmo com `escala: "frequencia"`.** São seis posições
ordinais, e mantê-las preserva `NIVEIS_CEFR`, `niveisEmJogo`, `nivelSugerido`, `progressoDaTrilha`,
`escoreDaTrilha` e `etapas.ts` inteiro sem uma linha de mudança. O que muda é o **rótulo** na tela,
derivado de `escala`. O risco de mentir CEFR não está no nome da chave — está no que vai para o
banco, e isso se resolve na Decisão 4.

**Objeto com a palavra exata como chave, não array paralelo.** Array paralelo acopla os dois
arquivos por ORDEM: regenerar a trilha reordenando um nível corromperia todas as glosas em
silêncio. `trilhaHash` torna a divergência detectável, e `verificar.mjs` falha o gate quando não
bate.

**`nativo` no cabeçalho é a defesa estrutural contra o F26**: o carregador confere contra o idioma
nativo do usuário e, se não bater, trata como ausente — nunca como "serve".

## Decisão 2 — Migração do `en.json` sem perda

Script one-shot: `[w, tr, frase, frTr]` → `en.json` v2 recebe `[w]` ou `[w, frase]`;
`glosas/en-pt.json` recebe `glosas[w] = tr` e `frases[w] = frTr`.

Ponto a **medir, não presumir**: palavra repetida entre níveis com traduções diferentes colapsaria
no mapa de glosas. `cefrWordlist.ts` já assume "primeiro nível vence"; o script aplica a mesma
regra, **conta** as colisões e as imprime. Zero é o esperado; o que não for zero é o que se revisa.

## Decisão 3 — Carregamento dinâmico sem piscar (F27)

`src/data/trilha/carregar.ts` com `import.meta.glob` (mapa estático lang→loader, code-splitting
real) e cache em módulo. **O carregador é o seam**: ele faz o join trilha+glosa em memória e
devolve o `DadoTrilha` na forma que `trilha.ts`, `etapas.ts` e `PainelTrilha.tsx` já consomem — só
a origem da tradução muda.

`src/data/trilha/indice.json` (~1 KB, import estático) carrega idioma → escala, versão, total,
`porNivel` e pares de glosa disponíveis. A Sala **nunca precisou das palavras**, só das contagens:
servindo-as do índice, `SalaDeEscolha.tsx` não muda uma linha.

A transição no `Play.tsx` tem quatro peças:

1. `trilha` deixa de ser `useMemo` e vira `useState` + `useEffect` com guard `let vivo = true` —
   o mesmo padrão que o efeito de composição já usa neste arquivo.
2. `temTrilha`, `totalDaTrilhaAtual` e as contagens da faixa passam a ler o **índice**. É isso que
   impede a aba de sumir e reaparecer, e o número de piscar `0 → 2.784`.
3. As cadeias que precisam das palavras (`frasesTrilha`, `etapaDaTrilha`, `jogaveis`,
   `acervoDaFonte`) ficam vazias por um quadro. Sozinho isso produziria "jogos cinza"
   momentâneos — antídoto: `carregandoTrilha` alimenta o esqueleto da grade, nunca o motivo
   "sem material", que seria uma **mensagem falsa**.
4. Prefetch quando a Sala troca de idioma e quando `filtro.fontes` passa a incluir `trilha`.

## Decisão 4 — F26 e a honestidade do nível

Com o join da Decisão 3, `c.translation` já vem do par certo — a correção é estrutural, não um `if`.
Casos de borda, na ordem:

- **Par de glosas ausente**: a Trilha é oferecida em modo monolíngue; os jogos que dependem da
  pista aparecem trancados com o motivo real ("ainda não há glossário inglês→espanhol"). **Não**
  cai para `en-pt` — isso *é* o F26.
- **Palavra sem glosa dentro de um par que existe**: joga (a frase basta para os jogos de frase),
  mas **não promove**. Promover com verso vazio criaria cartão que a própria régua reprova.
- **`cefrLevel` só é escrito quando `escala === 'cefr'`.** Idioma com faixa de frequência promove
  com `cefrLevel: null`. Gravar `A1` derivado de frequência é a mesma mentira do F26 noutro campo.
- **Dano já existente**: cartões da trilha com `tgt_lang != 'pt'` têm verso português. **Não
  reescrever automaticamente** — listar num diagnóstico, com contagem. Reescrita cega apagaria
  edição manual legítima.

`nivelCefr` para `escala: 'frequencia'` devolve `{ level: null, faixa: 'F3', source: 'frequencia',
confidence: 0.5 }`. `level` **nulo** garante que nenhum consumidor grave CEFR falso; `faixa` é campo
novo que a dificuldade pode usar. A separação de campos é o que torna a honestidade impossível de
contornar por acidente — um rótulo de UI não seria.

## Decisão 5 — `cefrWordlist` para de carregar o JSON inteiro

Passa a importar `trilha/niveis/en.json` (~40 KB: só palavra→nível, sem traduções nem as 2.552
frases). **Inglês continua estático** — é o caminho quente e `nivelCefr` é síncrona em dezenas de
chamadas. Trocar 233 KB por 40 KB sem introduzir assincronia é o melhor retorno por risco do plano.
Outros idiomas entram por `prepararNiveis(lang)` chamada na montagem de `/jogar`; até resolver, a
resposta `ausente` já é o comportamento documentado.

## Decisão 6 — `scripts/trilha/`, o pipeline que não existe

`.mjs` puro, como `audit-gate.mjs` e `fetch-models.mjs`.

| módulo | o quê |
|---|---|
| `fontes.mjs` | baixa e cacheia; manifesto com URL + sha256. hermitdave/FrequencyWords (MIT/CC-BY-SA), Leipzig (CC-BY), Tatoeba (CC-BY 2.0 FR), Wiktextract |
| `filtrar.mjs` | as regras de `FONTES.md:136-156` literalmente: 3–14 letras, sem classes funcionais, variantes colapsadas, nível mais baixo vence |
| `faixas.mjs` | 6 buckets por **cobertura cumulativa do corpus**, não por contagem igual — bucket de tamanho igual é arbitrário; cobertura é defensável |
| `frases.mjs` | Tatoeba, 5–12 palavras, contém a palavra, preferindo a com menos palavras fora do bucket |
| `glosas.mjs` | Wikidata SPARQL (P5137, CC0) → Wiktextract como preenchimento; **importa `quality.ts`** para aplicar a régua real do app, em vez de reimplementá-la |
| `gerar.mjs` | orquestra, escreve os artefatos + índice + relatório |
| `verificar.mjs` | contagens batem, toda chave de glosa existe na trilha, `trilhaHash` confere, nenhuma glosa igual à palavra. Plugado em `audit-gate.mjs` |

**Custo por idioma.** Máquina: download de 5–15 MB (frequência) + 20–40 MB (Wiktextract) + dump
Tatoeba compartilhado; ~2–5 min de processamento. O custo real é **humano**: o `FONTES.md` atual
documenta amostra de 30 palavras com 27 corretas — repetir isso por par custa cerca de 1 h de um
falante nativo, e a taxa medida vai para o `FONTES.md`, como a atual foi. Se as glosas vierem de
LLM, a procedência passa a ser `maquina` e **tem de ser rotulada assim** — a mesma disciplina que
separou `curado` de `wordlist`.

## Riscos

1. **A Decisão 3 é a única que pode quebrar a tela**, e o modo de falha é silencioso (rodada que
   não monta). Playwright que entre em `/jogar`, selecione Trilha e confirme que a contagem **nunca
   passa por zero**.
2. **Trilha por frequência não é CEFR.** Se a tela chamar de A1, o produto mente num lugar novo.
3. **A cobertura vai cair.** Mesmo no inglês, com fontes maduras, sobrou 34% da lista original e
   C1/C2 ficaram com 114 e 64 palavras. Um idioma novo provavelmente entrega A1–B1 e para.

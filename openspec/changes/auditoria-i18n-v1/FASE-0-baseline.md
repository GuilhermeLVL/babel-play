# Fase 0 — baseline reproduzível

Medido em 2026-09-03, no worktree `multi-idioma`, HEAD `173fcde`, 191 commits à frente de `main`.
Node v24.18.0, **ICU 78.3 completo** (`Intl.Segmenter`, `PluralRules`, `Collator`, `DisplayNames`
todos presentes — nenhuma medição desta fase ficou sem ferramenta).

Cada linha tem origem (`arquivo:linha`, ver [ALEGACOES.md](./ALEGACOES.md)) e o comando que
produziu o medido (ver [medicoes/COMANDOS.md](./medicoes/COMANDOS.md)).

**Sem veredito nesta fase.** Delta é delta. Julgamento é a Fase 1.

---

## 0. O que foi rodado, e o que aconteceu

| gate | exit | tempo | resultado |
|---|---|---|---|
| `npm run typecheck` | **0** | 15 s | limpo |
| `npm run lint` | **0** | 9 s | 35 avisos, 0 erros |
| `npm test` | **0** | 49 s | **2.775 passando, 1 pulado** (2.776), 273 arquivos |
| `npm run build` | **0** | 14 s | `dist/` 34,23 MiB em 134 arquivos |
| `node scripts/i18n/pseudo.mjs --check` | **0** | 1 s | `xx.json` em dia (693 chaves) |
| `node scripts/i18n/orfas.mjs --progresso` | **0** | 1 s | **0 órfãs** nos 4 catálogos |
| `ast-grep test -c sgconfig.yml` | **0** | <1 s | 6 regras passando |
| `ast-grep scan -c sgconfig.yml src server server.ts` | **0** | 1 s | 3 avisos (2 `resposta-crua`, 1 `rota-fala-com-o-banco`); **0 de `locale-cravado`** |
| `npx playwright test` | **0** | 233 s | **14 passando** |
| `npm run audit:gate` | **1** | 5 s | **FALHA** — `HIGH browserslist <=4.28.6 (fix: true)` |
| `npm ci` em clone isolado | **0** | 62 s | 842 pacotes; repo 46 MB, `node_modules` 1,4 GB |

**O único vermelho é o `audit:gate`, e ele está no CI.** `.github/workflows/ci.yml` roda
`npm run audit:gate` entre o build e o e2e. `docs/i18n-como-testar.md:116-125` apresenta esse
bloco como "o que o CI faz", implicando que passa. Hoje não passa. Não é defeito de i18n — é uma
vulnerabilidade HIGH de dependência (`browserslist`, com correção disponível) — mas significa que
**a branch está com o CI vermelho** e que o gate de i18n nunca chega a rodar no fluxo real,
porque o `audit:gate` aborta antes.

> Nota de método: o `node_modules` do worktree é **symlink** para o do checkout principal. Um
> `npm ci` aqui apagaria as dependências da outra frente de trabalho. Por isso a instalação limpa
> foi medida num clone separado no scratchpad, e os gates rodaram no worktree sem reinstalar nada.

---

## 1. Interface — catálogos e cobertura

| # | alegado | origem | medido | delta |
|---|---|---|---|---|
| A10/B11 | `en.json` **325** chaves | `i18n.md:108`, `i18n-lacunas.md:221` | **693** declaradas · **689** preenchidas · **4 idênticas à chave** | **+368** |
| C10 | "~330 traduzidas de ~2.000" | `i18n-como-testar.md:147` | 689 preenchidas; denominador entre **2.150** (meu método) e **3.145** (método do repo) | chaves ×2,1 |
| A10 | `es.json` **20** chaves | `i18n.md:108` | **20** declaradas · **16 preenchidas** · **4 idênticas à chave** | −4 úteis |
| C4 | árabe **21 chaves** | `i18n-como-testar.md:90` | **21**, todas preenchidas | **0** |
| B15 | "3 idiomas com catálogo" | `i18n-lacunas.md:230` | 3 reais + 1 pseudo. Sobre o universo de 693: **en 99,4% · ar 3,0% · es 2,3%** | número certo, escala omitida |
| — | (sem alegação) | — | `t(` **367** sem comentários / **373** com · `tp(` **20** · `<T` **8** em 4 arquivos | — |
| A12 | "~1.100 em JSX; Analysis 129, LiveCapture 79, Library 51, Reading 49" | `i18n.md:125-126` | por método próprio: Analysis **188**, LiveCapture **193**, Reading **111**, Library **64** | métodos diferentes |
| A2 | "sem biblioteca" | `i18n.md:23` | confirmado: nenhum de i18next, react-i18next, react-intl, @formatjs/intl, @lingui/core, intl-messageformat, globalize | **0** |

**Cobertura da interface, com os dois denominadores:** 11,9% (método do repo) a 17,1% (o meu).
Nenhum é exato e nenhum poderia ser — o do repo conta literais com acento sobre o código
concatenado (pega JSDoc e prompt de LLM; perde "Voltar", "Salvar", "Idioma"); o meu conta nó de
texto JSX e atributo visível com comentários removidos (perde string montada em variável). **A
faixa 12%–17% é a resposta honesta**, e ambos ficam muito abaixo do "~1/3" que o briefing supõe.

### Por tela

| medida | valor |
|---|---|
| telas de topo em `src/components/views/*.tsx` | **23** |
| com ao menos uma chamada de `t()` | **6** (26,1%) — Play 119, Hub 103, Settings 74, BaralhoAnki 1, MapaDoConteudo 1, Planos 1 |
| que importam de `lib/i18n` mas **só formatadores** (`numero`/`data`/`dataHora`) | **8** — Analysis, AnalysisExpandedKpi, BaralhosAnki, Conquistas, Library, LiveCapture, Metrics, MetricsExpandedKpi |
| sem nenhuma chamada de `t()` | **17** (73,9%) |

A linha do meio é a que não estava documentada: **oito telas acertam o formato do número e da
data e continuam inteiramente em português.** Importar `lib/i18n` não é traduzir, e a contagem
de "arquivos que usam i18n" confunde as duas coisas.

---

## 2. Plural — a única alegação linguística verificável sem tradutor

| # | alegado | origem | medido com `Intl.PluralRules` (ICU 78.3) |
|---|---|---|---|
| A7 | 1 forma: ja, zh, ko | `i18n.md:49` | **confere** |
| A7 | 2 formas: pt, en, es, fr, de, it, nl, sv, tr, hi | `i18n.md:50` | en, de, nl, sv, tr, hi **conferem**. pt/es/fr/it declaram **3** (`one/many/other`) |
| A7 | 3 formas: ru, pl, he | `i18n.md:51` | he **confere** (`one/two/other`). ru/pl declaram **4** (`one/few/many/other`) |
| A7 | 6 formas: ar | `i18n.md:52` | **confere** — `zero/one/two/few/many/other`, e todas as seis são alcançáveis (`0:zero 1:one 2:two 3:few 11:many 100:other`) |
| A8 | "seis dos dezesseis não cabem em duas formas" | `i18n.md:54` | sete (es, fr, it, he, ru, pl, ar) pela declaração; **quatro** (he, ru, pl, ar) pelo que é alcançável |

**As duas divergências são de rótulo, não de substância, e a tabela do documento está
praticamente certa:**

- Em pt/es/fr/it o `many` só é selecionado em **múltiplos exatos de 10⁶** (`1000000:many`,
  `1000001:other`). Nenhuma contagem deste app — palavras, sessões, cartões — chega lá. Tratar
  esses idiomas como de duas formas é defensável.
- Em ru/pl o `other` das quatro categorias é **inalcançável com inteiros** (existe para frações).
  Varrendo 0…1000 só aparecem `one/few/many` — exatamente as três que o documento diz.
  Medido: `ru 1:one 2:few 5:many 21:one 101:one`.

Ou seja: onde eu poderia ter acusado erro, a medição confirma o documento. Registro como
confirmado e sigo.

---

## 3. Números, datas e locale

| # | alegado | origem | medido | delta |
|---|---|---|---|---|
| C8 | "44 pontos migrados; a regra `locale-cravado` impede que voltem" | `i18n-como-testar.md:134` | **0** ocorrências de `.toLocaleString/DateString/TimeString('xx')` em `src/` e `server/`. `ast-grep` não acha nada. | **confirmado** |
| B6/B12 | "57 `toLocale*` ainda com `pt-BR` cravado" | `i18n-lacunas.md:127,224` | **0** — foram migrados depois que o documento foi escrito | −57 |
| A5/A16 | "~50 pontos por migrar" | `i18n.md:39,132` | **0** | −50 |
| — | (nenhuma) | — | **1 `new Intl.NumberFormat('pt-BR')`** em `src/components/Honestidade.tsx:80`, **que a regra `locale-cravado` não vê** | **novo** |

### O buraco no gate, com evidência

`src/components/Honestidade.tsx:79-81`:

```ts
export function rotuloDaBase(base: BaseDeCalculo): string {
  const n = new Intl.NumberFormat('pt-BR')
  return `calculado sobre ${n.format(base.considerados)} de ${n.format(base.total)}`
}
```

```
$ grep -n "Intl.NumberFormat" src/components/Honestidade.tsx
src/components/Honestidade.tsx:80:const n = new Intl.NumberFormat('pt-BR')

$ ./node_modules/.bin/ast-grep scan -c sgconfig.yml src/components/Honestidade.tsx
(nenhum achado)
```

A regra casa com `.toLocaleString(...)` e não com `new Intl.NumberFormat(...)`. `rotuloDaBase` é
importada por **8 componentes**, entre eles `views/Hub.tsx`, `views/Metrics.tsx`,
`views/Analysis.tsx` e `views/perfil/AbaProgresso.tsx` — inclusive telas que a migração
considerou concluídas. A frase de retorno também é português cravado e concatenado, fora do
sistema de tradução.

É exatamente o defeito que `docs/i18n-como-testar.md:65-66` diz que a migração eliminou ("os
números com vírgula: `2,733` — não `2.733`"): sobreviveu por um caminho que o gate não cobre.

### Dois censos que ninguém tinha medido

| censo | medido |
|---|---|
| `toLowerCase()` / `toUpperCase()` **sem locale** | **239**, em `src/` e `server/` |
| `toLocaleLowerCase()` / `toLocaleUpperCase()` (a forma que respeita o idioma) | **0** |
| classes direcionais **lógicas** (`ms-`, `me-`, `ps-`, `pe-`, `text-start/end`, `border-s/e`) | **253** |
| classes direcionais **físicas** (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left/right`) | **80** |

O primeiro par importa porque **o turco é um dos 16 idiomas da trilha**: em turco, `'I'.toLowerCase()`
devolve `i` com pingo, que é outra letra. Nenhuma das 239 chamadas usa a variante com locale. Se
alguma delas normaliza chave, monta slug ou compara busca, quebra em turco — em silêncio.
Quantas de fato quebram é medição da Fase 3; aqui fica só o censo.

O segundo par mostra que a migração de RTL cobriu margem, padding e alinhamento e **não cobriu
posicionamento**: as 80 restantes concentram-se em `left-*`/`right-*` (`Analysis.tsx` 11,
`Overlay.tsx` 6, `Reading.tsx` 6, `index.css` 6). O repo usa **zero** `start-*`/`end-*`, que é a
forma lógica que o Tailwind 4 oferece para isso.

---

## 4. Trilha — a recontagem

| # | alegado | origem | medido | delta |
|---|---|---|---|---|
| E6 | **85.668 palavras** em 16 idiomas | `tasks.md:89` | **85.668** em **16** | **0** |
| — | (nenhuma) | — | duplicata literal **0** · duplicata por caixa **0** · colisão NFC **0** · entrada vazia **0** | limpo |
| — | (nenhuma) | — | **13 entradas em NFD** (todas em `hi`) | achado menor |
| D5 | en 2.784 / 92% com frase | `trilha-…-v1.md:71` | **2.784** / **2.552 = 91,7%** | **0** |
| D5 | de 5.758 / 93% / glosa 49% | `:72` | **5.758** / **93,3%** / **48,9%** | **0** |
| D5 | fr 5.752 / 93% / 58% | `:73` | **5.752** / **92,8%** / **58,4%** | **0** |
| D5 | es 5.727 / 90% / 37% | `:74` | **5.727** / **90,2%** / **36,7%** | **0** |
| E4 | ru 5.786 / 95% frase / 33% glosa | `tasks.md:78` | **5.761** / 95,7% / 33,5% | **−25 palavras** |
| E5 | ja 5.947 / 87% / 26% / 18% frases trad. | `tasks.md:79` | **5.947** / 87,1% / 25,6% / 18,1% | **0** |
| D10 | es-pt 3.696 · fr-pt 2.721 · de-pt 2.373 | `:108-110` | **3.696 · 2.721 · 2.373** | **0** |
| D3/E1 | "o rodapé mostra 41% — a cobertura real" | `:28`, `tasks.md:46` | espanhol hoje é **36,7%**; **global dos 15 pares: 26,9%** | −14,1 pp global |

**Minha recontagem bate com `src/data/trilha/indice.json` nos 32 números** (16 totais + 16
`comFrase`). O derivado é fiel à origem.

### O que os documentos não reportaram: os outros doze idiomas

`D:71-74` e `D:128` reportam **quatro** idiomas — os quatro melhores. A tabela completa:

| par | palavras | glosa | frases traduzidas |
|---|---:|---:|---:|
| fr-pt | 5.752 | **58,4%** | 2.721 |
| de-pt | 5.758 | **48,9%** | 2.373 |
| it-pt | 5.780 | 41,6% | 1.640 |
| es-pt | 5.727 | **36,7%** | 3.696 |
| nl-pt | 5.834 | 35,3% | 2.278 |
| ru-pt | 5.761 | 33,5% | 2.277 |
| ja-pt | 5.947 | 25,6% | 939 |
| sv-pt | 5.727 | 22,8% | 324 |
| zh-pt | 5.221 | 19,7% | 382 |
| pl-pt | 5.747 | 17,5% | 505 |
| he-pt | 5.712 | 13,5% | 259 |
| tr-pt | 5.787 | 12,9% | 354 |
| hi-pt | 3.010 | 10,7% | **2** |
| ar-pt | 5.148 | 10,0% | 69 |
| ko-pt | 5.973 | **7,0%** | 52 |
| **total** | **82.884** | **26,9%** | **17.871** |

Zero glosas idênticas à palavra, zero vazias, zero órfãs — a regra "palavra transparente não gera
glosa" (`D:87-89`) **funciona**, e isso está confirmado.

**Todo par é `*-pt`.** Não existe nenhum outro nativo. `hi` tem **2** frases traduzidas em 3.010
palavras; `ko` tem 7,0% de glosa.

### O gate de publicação passa em tudo — inclusive no que não deveria

`E9` (`tasks.md:95-96`) declara: *"recusa trilha com menos de 5% de glosa ou mais de 10% fora da
escrita do idioma"*. Medido contra os dois limiares:

- **glosa < 5%**: nenhum idioma reprova. O mínimo é `ko` com 7,0%.
- **fora da escrita > 10%**: nenhum idioma reprova. O máximo é `tr` com **7,9%**.

Mas o turco tem **455 palavras em escrita árabe** — turco otomano vindo das legendas do
OpenSubtitles — e elas não estão distribuídas por igual:

```
$ node -e "const d=require('./public/trilha/tr.json');for(const n of Object.keys(d.niveis)){...}"
A1 171 de 965      ← 17,7%
A2  81 de 965
B1  57 de 965
B2  52 de 965
C1  54 de 965
C2  40 de 962
```

Amostra: `چوق` `آما` `أوت` `وار` `دگل` `خایر`.

A sujeira está **concentrada na primeira faixa**: o iniciante de turco encontra 17,7% de palavras
que não estão no alfabeto do idioma que ele está aprendendo. Nenhum outro dos 16 idiomas tem
vazamento (0,0% em todos).

Provar que o gate **reprova** com um fixture ruim é tarefa da Fase 1; o que a Fase 0 estabelece é
que, com os dados reais, ele **não reprova nada**.

> **Corrigido na Fase 1.** Escrevi acima que o turco passa por estar abaixo do limiar de 10%.
> Está errado, e a causa real é pior: `tr` não consta em `ESCRITA_DO_IDIOMA`
> (`scripts/trilha/verificar.mjs:30-34`), então a checagem de escrita **não roda** para ele — nem
> para nenhum idioma de escrita latina. Testado com fixture: o turco passa com **50%** de escrita
> árabe. Ver `FASE-1-verificacao.md`, achado N2.

---

## 5. Peso do build

| # | alegado | origem | medido | delta |
|---|---|---|---|---|
| D27/E11 | `dist/assets` 34,0 → **27,7 MB** | `:242`, `tasks.md:102` | **27,66 MiB** em 90 arquivos | **0** |
| D27/E11 | entrada **742 kB** | `:241`, `tasks.md:102` | **746 kB** — lido de `dist/index.html`: `index-D0_aqGeS.js` 382 + `vendor-react` 190 + `index.css` 174 | +4 kB |
| D22 | 29 MB de `dist/`, **22,5 MB** de WASM | `:180-181` | `dist/` **34,23 MiB**; WASM **22,48 MiB** = **65,7%** | WASM confere |
| D22 | workers 1,5 MB | `:181` | **1,51 MiB** em 3 arquivos | **0** |
| D26/D27 | **6,4 MB em 31 arquivos** servidos | `:233,243` | trilha 4,36 MiB (16 arq.) + glosas 1,99 MiB (15) = **6,35 MiB em 31** | **0** |
| D28 | `niveis/*.json` **864 kB** embutidos | `:249` | **828 kB** em 16 arquivos | −36 kB |
| — | (nenhuma) | — | catálogos de i18n servidos: **0,13 MiB** = 0,4% do `dist/` | — |

**Projeção de catálogos de UI** (base: 76 B/chave medidos em `en.json`):

| cenário | peso servido |
|---|---|
| 3 idiomas × 693 chaves (hoje) | 154 kB |
| 16 idiomas × 693 chaves | 823 kB |
| 16 idiomas × 2.000 chaves | 2,4 MB |

Nada disso entra na entrada do app — os catálogos são buscados por `fetch` sob demanda. **O
catálogo de tradução não é o problema de peso deste app**; 65,7% do build é um único arquivo
WASM do ONNX Runtime.

---

## 6. Verificação e CI

| # | alegado | origem | medido | delta |
|---|---|---|---|---|
| C6 | **2.775** testes unitários | `i18n-como-testar.md:121` | **2.775 passando + 1 pulado** = 2.776 em 273 arquivos | **0** |
| D16 | 2.715 passando | `trilha-…-v1.md:144` | 2.775 | +60 (doc anterior) |
| C7 | **20** testes e2e | `i18n-como-testar.md:124` | **14 passando** em 233 s | **−6** |
| D17 | 8 passando | `:145` | 14 | +6 (doc anterior) |
| D15 | `tsc --noEmit` limpo | `:143` | exit 0 | **0** |
| D18 | 44 avisos de ESLint | `:147` | **35 avisos, 0 erros** | −9 |
| C5 | pseudo-localização varre **5 telas** | `:112` | **5** — `/jogar /vocabulario /biblioteca /ajustes /planos` = **21,7% das 23 telas** | número certo, denominador ausente |
| C9 | o bloco do CI passa | `:116-125` | **`npm run audit:gate` sai 1** | **CI vermelho** |

O e2e alegado em 20 é o único número de contagem que não se sustenta em nenhuma direção: os dois
documentos dizem 8 e 20, e a suíte tem 14 (5 de pseudo-localização + 1 de relato + 8 outros).

---

## 7. O que a Fase 0 deixou sem medir

Declarado para não passar por omissão. Tudo isto é Fase 1 ou posterior:

| item | por quê |
|---|---|
| B1 "78 plurais no código", B4 "1.053 template literals", A13 "688 texto rico", A14 "540 template literals" | exigem análise de AST com julgamento do que é tela; contagem por regex daria número sem significado |
| E2 "amostra de 60, 90% de precisão" | recalcular o intervalo de confiança e amostrar de novo é trabalho da Fase 1 |
| E9 "o gate reprova" | exige fixture deliberadamente ruim — Fase 1 |
| D21 "122 ms para carregar a trilha do francês" | exige navegador com rede instrumentada — Fase 5 |
| D20 "gzip por chunk" | o build não emite `.gz`; medir exige recomprimir — Fase 5 |
| E12 "233 KB → 20,4 KB no que `cefrWordlist` puxa" | exige comparar dois builds — Fase 5 |
| C1 `?ui=` sem allowlist | localizado (`src/lib/langConfig.ts:43-46`), mas a análise de risco é Fase 6 |
| qualquer coisa visual | Playwright por idioma é Fase 3 |

---

## 8. Resumo do delta

**Confirmado ao número exato:** 85.668 palavras · 16 idiomas · zero duplicata · as quatro linhas
da tabela de trilha de `D:71-74` · os três pares de frases de `D:108-110` · `dist/assets` 27,7 MB ·
WASM 22,5 MB · 6,4 MB em 31 arquivos · 2.775 testes · árabe 21 chaves · pseudo 5 telas · zero
`toLocale*` cravado · zero chave órfã · nenhuma biblioteca de i18n · a tabela de plural.

**Divergente para mais:** `en.json` tem **693** chaves, não 325 — os documentos ficaram para trás
do código em dois commits.

**Divergente para menos:** e2e tem **14**, não 20. ESLint tem **35** avisos, não 44. `ru` tem
**5.761** palavras, não 5.786.

**Reportado sem denominador:** "5 telas" são **21,7%** de 23. "3 idiomas com catálogo" são um
idioma a 99,4% e dois a ~2,5%. "41% de glosa" é o espanhol de antes da correção; o global dos 15
pares é **26,9%**.

**Novo, sem alegação correspondente:** o `new Intl.NumberFormat('pt-BR')` que o gate não vê,
usado por 8 componentes · 239 `toLowerCase()` sem locale com o turco na trilha · 80 classes de
posicionamento físico que não espelham em RTL · 455 palavras em escrita árabe na trilha turca,
171 delas na faixa A1 · 8 telas que formatam número por locale e não traduzem uma palavra · o
`audit:gate` vermelho no CI.

---

**GATE 0.** Aguardando aceite para prosseguir à Fase 1 (verificação alegação por alegação).

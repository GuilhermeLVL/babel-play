# Fase 1 — verificação alegação por alegação

Veredito para cada alegação de [ALEGACOES.md](./ALEGACOES.md). Legenda:
`CONFIRMADO` · `PARCIAL` · `REFUTADO` · `NÃO VERIFICÁVEL`.

Toda linha traz `arquivo:linha` ou comando. As medições novas desta fase estão em
`medicoes/09` a `medicoes/12`.

---

## Resumo dos vereditos

| veredito | n | onde se concentra |
|---|---:|---|
| CONFIRMADO | 41 | dados da trilha, peso do build, plural, ausência de biblioteca |
| PARCIAL | 12 | números que envelheceram, ou reportados sem denominador |
| REFUTADO | 4 | contagem do e2e, avisos de ESLint, `ru`, "não há infraestrutura de i18n" |
| NÃO VERIFICÁVEL | 6 | medidas que dependem de rede externa ou de build anterior |

**Cinco achados novos** que nenhuma alegação cobre estão na seção final, com severidade.

---

## A — `docs/i18n.md`

| # | alegação | veredito | evidência |
|---|---|---|---|
| A1 | "~1.800 a 2.200 strings medidas" | **PARCIAL** | é faixa estimada, não medição. Meu denominador de texto visível dá **2.150**; o do repo, **3.145**. A faixa do documento contém o meu valor, mas "medidas" superestima o rigor — nenhum dos dois métodos é exato, e o próprio `orfas.mjs:50-51` admite "superestima" |
| A2 | "sem biblioteca" | **CONFIRMADO** | medição 01: nenhum de i18next, react-i18next, react-intl, @formatjs/intl, @lingui/core, intl-messageformat, globalize em `package.json` |
| A3 | "plural pelo CLDR — feito" | **CONFIRMADO** | `src/lib/i18n.ts:119-126` usa `Intl.PluralRules` com cache e fallback |
| A4 | "RTL — `dir`/`lang` no `<html>`" | **CONFIRMADO** | `src/lib/langConfig.ts:164-167`; observado em navegador: `documentElement.lang` e `dir` acompanham o idioma |
| A5/A16 | "faltam ~50 pontos de locale" | **REFUTADO (para melhor)** | **0** ocorrências de `.toLocale*('xx')`. Foram migrados depois do documento. Ver A16-bis nos achados novos |
| A6 | "tradução por falante nativo — não feito" | **CONFIRMADO** | `tasks.md:48-50` marca 5.3 como `[~]`; nenhum artefato de revisão humana no repo |
| A7 | tabela de formas de plural | **CONFIRMADO** | medição 02. Duas imprecisões de rótulo que **não** mudam a substância: pt/es/fr/it declaram 3 categorias, mas `many` só é selecionado em múltiplos exatos de 10⁶ (`1000000:many`, `1000001:other`) — inalcançável para as contagens deste app; ru/pl declaram 4, mas `other` é só para frações (varrendo 0…1000 aparecem só `one/few/many`, que é o que o documento diz). Árabe: as seis categorias conferem e todas são alcançáveis |
| A8 | "seis dos dezesseis não cabem em duas formas" | **PARCIAL** | sete pela declaração (es, fr, it, he, ru, pl, ar), quatro pelo alcançável (he, ru, pl, ar). Nenhum dos dois é seis |
| A9 | tabelas traduzidas (150+63+36+20+27+47 = 343) | **CONFIRMADO** | os helpers existem: `copyDoPerfil` (`src/lib/profile.ts`), `navLabel` (`navItems.ts:130`), `tituloDoJogo`/`descricaoDoJogo` (`play/jogos.tsx:172,176`) |
| A10 | "en.json 325 chaves, es.json 20" | **PARCIAL** | `es.json` tem **20 declaradas mas 16 preenchidas** (4 são idênticas à chave). `en.json` tem **693**, não 325 — ver B11 |
| A11 | "~400 em tabelas de rótulo" | **NÃO VERIFICÁVEL** | exige classificar cada tabela como tela ou dado; contagem por regex daria número sem significado |
| A12 | "~1.100 em JSX; Analysis 129, LiveCapture 79…" | **PARCIAL** | método diferente. Medição 03: Analysis **188**, LiveCapture **193**, Reading **111**, Library **64**. A ordem relativa bate; as magnitudes não |
| A13/B14 | "688 casos de texto rico" | **PARCIAL** | medição 09: **1.181** tags inline em 101 arquivos. É o teto — inclui `<span>` de ícone. O 688 é plausível como subconjunto de tags dentro de frase |
| A14/B4 | "540" e "1.053" template literals | **PARCIAL** | medição 09: **1.196** com `${}`. Mais perto de 1.053; o 540 usa definição mais estreita. Nenhum é dívida de tradução inteira — template literal também monta classe CSS e URL |
| A15/B1 | "~60" e "78 plurais no código" | **CONFIRMADO** | medição 09: **80** (18 por sufixo + 62 por ternário). O 78 está a 2 de distância |
| A17 | "o onboarding não pergunta o idioma" | **CONFIRMADO** | `docs/i18n-como-testar.md:36-49` descreve trocar por Ajustes; não há passo de idioma no onboarding |
| A18 | "~55 chaves de `localStorage` `babel.*`" | **PARCIAL** | medição 09: **70** literais `babel.*` distintos; **14** com uso de storage a menos de 80 caracteres. O ~55 fica entre os dois; minha faixa é larga porque o acesso é indireto por helper |

## B — `docs/i18n-lacunas.md`

| # | alegação | veredito | evidência |
|---|---|---|---|
| B2 | "gênero não está resolvido" | **CONFIRMADO** | `src/lib/i18n.ts:88-92`: `interpolar` só faz `{nome}` via `/\{(\w+)\}/g`. Nenhum `select` de ICU |
| B3 | "`t()` devolve string e não resolve texto rico" | **CONFIRMADO** | `i18n.ts:84-86`. E o `<T>` foi criado exatamente para isso (`src/lib/T.tsx`) |
| B5 | "RTL resolvido, verificado em árabe" | **CONFIRMADO** | ver A4 |
| B6/B12 | "57 `toLocale*` com pt-BR cravado" | **REFUTADO (para melhor)** | **0** hoje. Ver achado N1 |
| B7/B9 | "~2.000 strings por idioma", "× 3 perfis" | **NÃO VERIFICÁVEL** | depende de A1, que é estimativa. O fator 3 dos perfis é real (`copyDoPerfil`), mas o produto 2.000×3 herda a incerteza da base |
| B8 | "US$ 0,08–0,20/palavra, US$ 1.200–3.000/idioma" | **NÃO VERIFICÁVEL** | preço de mercado externo. Fase 5 |
| B10 | "28 idiomas × 3 nativos ≈ 24 MB de glosas" | **NÃO VERIFICÁVEL** | projeção. Base medida: 15 pares `*-pt` somam 1,99 MiB, ~136 kB/par. 28×3 = 84 pares ≈ **11 MiB**, não 24 — mas os pares existentes são os de fonte mais rica, então extrapolação linear subestima. Fase 5 |
| B11 | "325 strings traduzidas para inglês" | **REFUTADO (para melhor)** | **693 declaradas, 689 preenchidas, 4 idênticas à chave**. Medição 02 |
| B13 | "~300 em tabelas / ~1.100 em JSX" | **NÃO VERIFICÁVEL** | ver A11/A12 |
| B15 | "3 idiomas com catálogo (en, es, ar parcial)" | **PARCIAL** | verdade contábil. Sobre o universo de 693 chaves: **en 99,4%, ar 3,0%, es 2,3%**. `ar` sequer está em `IDIOMAS_DA_INTERFACE` (`i18n.ts:36` declara só `pt, en, es`) — chega só pelo override `?ui=` |
| B16 | "migrar as ~1.400 restantes" | **NÃO VERIFICÁVEL** | herda A1 |

## C — `docs/i18n-como-testar.md`

| # | alegação | veredito | evidência |
|---|---|---|---|
| C1 | "`?ui=` funciona; sem o parâmetro volta ao português" | **CONFIRMADO, com ressalva grave** | funciona (observado). Mas não valida nada — ver achado **N3** |
| C2 | "números com vírgula em inglês: 2,733" | **PARCIAL** | vale onde a tela usa `numero()`. Não vale em `rotuloDaBase` — ver achado **N1** |
| C3 | "`dir` = rtl e `lang` = ar em árabe" | **CONFIRMADO** | `langConfig.ts:164-167` |
| C4 | "árabe: 21 chaves" | **CONFIRMADO** | medição 02: 21, todas preenchidas |
| C5 | "varre 5 telas e falha se cortar" | **CONFIRMADO, sem denominador** | 5 telas = **21,7%** das 23 de topo. E o segundo check (`stringsNaoTraduzidas`) **só relata**, não falha — está no próprio arquivo (`tests/e2e/pseudo-localizacao.e2e.ts:123-130`) |
| C6 | "2.775 testes unitários" | **CONFIRMADO** | `npm test`: 2.775 passando + 1 pulado, 273 arquivos, 48,57 s, exit 0 |
| C7 | "20 testes de ponta a ponta" | **REFUTADO** | `npx playwright test`: **14 passando**, 233 s, exit 0 |
| C8 | "a regra impede que `toLocaleString('pt-BR')` volte" | **PARCIAL** | impede essa forma (0 ocorrências, `ast-grep` limpo). **Não impede `new Intl.NumberFormat('pt-BR')`** — achado **N1** |
| C9 | "é o que o CI faz" (implicando que passa) | **REFUTADO** | `npm run audit:gate` sai **1** (`HIGH browserslist <=4.28.6`). O CI roda esse gate antes do e2e |
| C10 | "~330 de ~2.000" | **REFUTADO (para melhor)** | 689 preenchidas |

## D — `docs/auditoria/trilha-multi-idioma-v1.md`

| # | alegação | veredito | evidência |
|---|---|---|---|
| D1 | "espanhol 5.727" | **CONFIRMADO** | medição 04 |
| D2 | "704 do A1 (en) / 955 da faixa 1 (es)" | **CONFIRMADO** | `indice.json`: en.A1 = 704; es.A1 = 955 |
| D3 | "o rodapé mostra 41%, a cobertura real" | **PARCIAL** | 41% era antes da correção de precisão; hoje o espanhol é **36,7%**. O documento diz 37% em `:128` e 41% em `:28` — contradiz a si mesmo |
| D4 | "0 cartão da trilha (2.922 Anki, 467 sessão)" | **NÃO VERIFICÁVEL** | é o banco local de quem mediu, não um invariante do produto |
| D5 | tabela dos 4 idiomas | **CONFIRMADO** | en 2.784/91,7% · de 5.758/93,3%/48,9% · fr 5.752/92,8%/58,4% · es 5.727/90,2%/36,7%. Medição 04+05 |
| D6 | "amostra de 60, revisada por modelo, não por humano" | **CONFIRMADO** | e o documento declara a limitação, o que é correto |
| D7 | "70% → 90% (54/60)" | **CONFIRMADO, sem intervalo** | medição 11: 90% com **IC 95% de 79,9% a 95,3%, ou ±7,7 pp**. A melhora **é** significativa em teste pareado (McNemar exato, p = 0,0005 no cenário declarado). Para ±3 pp seriam necessários **385** itens, não 60 |
| D8 | "`embarazo=embaraço` é falso amigo" | **CONFIRMADO** | e o documento reporta o próprio custo, o que é honesto |
| D9 | "frase em ~90% das palavras" | **PARCIAL** | verdade para os idiomas reportados. Na média dos 16: 85,0%. Mas **`hi` tem 8,2%** e **`ko` 54,1%** |
| D10 | frases traduzidas es/fr/de | **CONFIRMADO** | 3.696 · 2.721 · 2.373, ao número |
| D11 | "77 mil linhas para es-pt" | **NÃO VERIFICÁVEL** | o dump do Tatoeba não está versionado |
| D12 | "37% es, 58% fr, 49% de" | **CONFIRMADO** | 36,7% · 58,4% · 48,9% |
| D13 | "nomes próprios na lista de frequência" | **CONFIRMADO** | e subestimado: ver achado **N2** |
| D14 | "`en.json` continua em v1" | **CONFIRMADO** | e o arquivo grava `versao` como a string `"1.5+1.0+trad.2+frases.1"`, misturando 2.552 tuplas de 4 campos com 232 de 2 |
| D15 | "`tsc --noEmit` limpo" | **CONFIRMADO** | exit 0, 15 s |
| D16 | "vitest 2.715" | **REFUTADO** | 2.775 (documento anterior a `173fcde`) |
| D17 | "playwright 8" | **REFUTADO** | 14 |
| D18 | "44 avisos de ESLint" | **REFUTADO** | **35 avisos, 0 erros** |
| D19 | "739 kB — index 376 + vendor-react 190 + CSS 173" | **CONFIRMADO** | 746 kB: 382 + 190 + 174, lido de `dist/index.html` |
| D20 | gzip por chunk | **NÃO VERIFICÁVEL** | o build não emite `.gz` |
| D21 | "239 kB gzip / 122 ms" | **NÃO VERIFICÁVEL** | exige rede instrumentada. Fase 5 |
| D22 | "22,5 MB WASM, 1,5 MB workers, 4 idiomas 2,1 MB" | **CONFIRMADO** | 22,48 MiB (65,7% do `dist/`) e 1,51 MiB. Os 16 idiomas hoje somam 6,35 MiB |
| D23 | "~628 kB por idioma" | **CONFIRMADO** | 6,35 MiB / 16 ≈ 417 kB por idioma medido hoje (trilha + glosa). O 628 vinha dos 4 idiomas de fonte mais rica |
| D24 | projeções 17/40/57 MB | **NÃO VERIFICÁVEL** | Fase 5 |
| D25 | "a interface é 100% pt-BR e não há infraestrutura de i18n" | **REFUTADO** | falso hoje: 693 chaves, `t()`, `tp()`, `<T>`, pseudo-localização, 3 gates de CI. Era verdade quando escrito, e **o arquivo não avisa que envelheceu** |
| D26/D27 | "6,4 MB em 31 arquivos"; "34,0 → 27,7 MB"; "entrada 742 kB" | **CONFIRMADO** | 6,35 MiB em 31 (16 trilha + 15 glosas); `dist/assets` **27,66 MiB**; entrada 746 kB |
| D28 | "`niveis/*.json` 864 kB" | **PARCIAL** | **828 kB** em 16 arquivos |

## E — `openspec/changes/trilha-multi-idioma/tasks.md`

| # | alegação | veredito | evidência |
|---|---|---|---|
| E1 | "es: 5.727, 955 por faixa, 41% com glosa" | **PARCIAL** | 5.727 e 955 conferem; a glosa é **36,7%** desde a correção |
| E2 | "60 revisadas, 70% → 90%" | **CONFIRMADO** | ver D7 |
| E3 | "20% → 72% em es-pt" | **CONFIRMADO** | 3.696 de 5.163 = 71,6% |
| E4 | "ru: 5.786, 95% frase, 33% glosa, 41% frases traduzidas" | **PARCIAL** | **5.761** palavras (−25); 95,7%; 33,5%; 2.277/5.513 = 41,3% |
| E5 | "ja: 5.947, 87%, 26%, 18%" | **CONFIRMADO** | 5.947 · 87,1% · 25,6% · 18,1% |
| E6 | "85.668 palavras, 16 idiomas" | **CONFIRMADO** | ao número exato, com zero duplicata literal, zero por caixa, zero colisão NFC e zero entrada vazia |
| E7 | "`foraDaEscrita` tira a sujeira" | **PARCIAL** | funciona onde o idioma está no mapa. **Não roda para escrita latina** — achado **N2** |
| E8 | "marcas combinantes: 445 árabes e 744 híndis" | **CONFIRMADO indiretamente** | `hi` tem 3.010 palavras publicadas; sem a correção seriam ~2.266. Medição 12: 13 entradas híndis ainda gravadas em NFD, sem colisão |
| E9 | "o gate recusa <5% de glosa ou >10% fora da escrita" | **PARCIAL — provado que reprova, e provado o que não vê** | ver abaixo |
| E10 | "`th` não foi publicado" | **CONFIRMADO** | `th` não está em `public/trilha/`. E a régua de fato erra em tailandês: medição 10, frase de teste dá **21** pela régua contra **11** pelo ICU |
| E11 | "34,0 → 27,7 MB; entrada 742 kB" | **CONFIRMADO** | ver D27 |
| E12 | "233 KB → 20,4 KB no que `cefrWordlist` puxa" | **NÃO VERIFICÁVEL** | exige o build anterior. Fase 5 |

### E9 — o gate de publicação, testado com fixture

Montei uma árvore mínima no scratchpad, copiei `scripts/trilha/verificar.mjs` sem alterar um byte
e rodei contra dados deliberadamente ruins (`medicoes/COMANDOS.md` traz o comando):

```
ru: 600 palavras · 2% fora da escrita · 50% de glosa    → passa (correto)
ja: 600 palavras · 30% fora da escrita · 50% de glosa   → REPROVA
zh: 600 palavras · 2% fora da escrita · 2% de glosa     → REPROVA
tr: 600 palavras · 50% em escrita árabe · 50% de glosa  → PASSA  ← o buraco

❌ trilha/verificar:
  ja: 30% das palavras não estão na escrita do idioma (máximo 10%)
  zh: só 2% das palavras têm tradução (mínimo 5%)
EXIT=1
```

**O gate reprova de verdade** — os dois limiares funcionam. Mas `ESCRITA_DO_IDIOMA`
(`scripts/trilha/verificar.mjs:30-34`) tem **oito** entradas: `ar, he, hi, ja, zh, ko, ru, th`.
Todo idioma de escrita latina — de, en, es, fr, it, nl, pl, sv e **tr** — cai no `if (escrita)`
da linha 48 como `undefined`, e **a checagem de escrita simplesmente não roda**.

Isso corrige o que escrevi na Fase 0. Eu disse que o turco passava porque 7,9% está abaixo do
limiar de 10%. Está errado: **o turco passaria com 50%**, porque o limiar nunca é consultado.

---

## Achados novos — nenhuma alegação os cobre

| id | severidade | achado |
|---|---|---|
| **N1** | **P2** | locale cravado que o gate não enxerga |
| **N2** | **P2** | 455 palavras em escrita árabe na trilha turca, 171 na faixa A1 |
| **N3** | **P2** | `?ui=` sem allowlist: busca caminho arbitrário de mesma origem e envenena o locale |
| **N4** | **P3** | 239 `toLowerCase()`/`toUpperCase()` sem locale, com o turco na trilha |
| **N5** | **P3** | a régua de palavras erra 17,2% em japonês contra o segmentador padrão |

### N1 — `new Intl.NumberFormat('pt-BR')` invisível para o gate

`src/components/Honestidade.tsx:79-81`:

```ts
export function rotuloDaBase(base: BaseDeCalculo): string {
  const n = new Intl.NumberFormat('pt-BR')
  return `calculado sobre ${n.format(base.considerados)} de ${n.format(base.total)}`
}
```

```
$ ./node_modules/.bin/ast-grep scan -c sgconfig.yml src/components/Honestidade.tsx
(nenhum achado)
```

A regra `locale-cravado` casa com `.toLocaleString(...)`, não com `new Intl.NumberFormat(...)`.
`rotuloDaBase` é importada por **8 componentes**, incluindo `views/Hub.tsx`, `views/Metrics.tsx`,
`views/Analysis.tsx` e `views/perfil/AbaProgresso.tsx` — telas que a migração deu por concluídas.
A frase de retorno também é português concatenado, fora do sistema de tradução.

É exatamente o defeito que `docs/i18n-como-testar.md:65-66` diz ter eliminado, sobrevivendo por
um caminho que o gate não cobre.

### N2 — a trilha turca em escrita árabe

455 de 5.787 palavras (7,9%) estão em escrita árabe — turco otomano vindo das legendas do
OpenSubtitles. Distribuição por faixa:

```
A1 171/965 (17,7%)   A2 81/965   B1 57/965   B2 52/965   C1 54/965   C2 40/962
```

Amostra: `چوق` `آما` `أوت` `وار` `دگل` `خایر`.

Causa raiz: `tr` não está em `ESCRITA_DO_IDIOMA` (`verificar.mjs:30-34`), então a checagem não
roda. Nenhum dos outros 15 idiomas tem vazamento — 0,0% em todos.

Impacto: o iniciante de turco encontra ~1 em 6 "palavras" que não estão no alfabeto do idioma
que está aprendendo, e não tem como saber disso.

### N3 — `?ui=` aceita qualquer coisa

`src/lib/langConfig.ts:43-46` lê o parâmetro cru. `src/lib/i18n.ts:144-156` faz
`fetch('/i18n/${base(lang)}.json')`, e `base()` (`i18n.ts:51`) só aplica `toLowerCase()` e
`split('-')[0]` — não remove `/` nem `..`. Não há allowlist, e não há gate de produção.

Observado em navegador contra o servidor local (porta 3105):

```
?ui=../../termos.html%3f   → GET http://localhost:3105/termos.html?.json  → 200 OK
?ui=../../trilha/es        → GET http://localhost:3105/trilha/es.json     → 200 OK
```

Com o segundo, `document.documentElement.lang` recebeu a string crua `"../../trilha/es"`
(evidência: `evidencias/ui-param/ajustes-locale-envenenado.png`), e os três formatadores quebram:

```js
(1234.5).toLocaleString(document.documentElement.lang)
// RangeError: Incorrect locale information provided
```

`numero()`, `data()`, `dataHora()` e `moeda()` (`src/lib/i18n.ts:177-201`) chamam
`toLocaleString(atual)` **sem `try/catch`**.

Três consequências, em ordem de gravidade:

1. **Qualquer JSON de mesma origem vira catálogo de tradução.** `usarIdioma` aceita a resposta se
   `r.ok`. Se houver qualquer caminho de mesma origem com JSON que um terceiro influencie
   (upload servido na mesma origem, endpoint que reflete dado do usuário), o texto da interface
   passa a vir dali — falsificação de UI por link.
2. **Locale inválido derruba a formatação.** Um link preparado leva a `RangeError` em toda tela
   que formate número ou data.
3. **`lang` do documento recebe string arbitrária**, quebrando leitor de tela, hifenização e
   qualquer CSS por idioma.

**Ressalva honesta sobre o alcance:** o estado envenenado **não é estável em todas as rotas**. O
`OVERRIDE_DA_URL` é lido uma vez na carga do módulo, e várias rotas reescrevem a URL e recarregam,
descartando o parâmetro. Reproduzi o envenenamento em `/ajustes` e em `/jogar`; em `/vocabulario`
o app recarregou e voltou a `pt`. Ou seja: o vetor é real e a falta de validação é certa, mas a
exploração depende da rota. A classificação final de severidade é da Fase 6.

### N4 — caixa sem locale, com o turco na trilha

**239** chamadas de `toLowerCase()`/`toUpperCase()` sem locale em `src/` e `server/`; **zero**
usos de `toLocaleLowerCase`/`toLocaleUpperCase`. Em turco, `'I'.toLowerCase()` devolve `i` com
pingo — outra letra. Concentração: `views/Study.tsx` 17, `views/Analysis.tsx` 16,
`views/Reading.tsx` 15, `views/Play.tsx` 10, `lib/traducao/prepararFala.ts` 10.

Este é um **censo, não uma lista de defeitos**: quantas dessas chamadas tocam texto turco de
verdade é medição da Fase 3. Mas nenhuma delas está preparada, e o turco é um dos 16 idiomas.

### N5 — a régua de palavras contra o segmentador padrão

`contarPalavras` (`src/core/learning/quality.ts:245-251`) conta `chars / 2` onde não há espaço, e
o comentário declara que é aproximação. Medido contra `Intl.Segmenter(lang, {granularity:'word'})`
em 400 frases por idioma (medição 10):

| lang | média régua | média ICU | erro médio | erro relativo | decisão diverge |
|---|---:|---:|---:|---:|---:|
| ja | 7,35 | 8,87 | 1,72 | **−17,2%** | **10,0%** |
| zh | 5,82 | 6,71 | 1,04 | −13,4% | 5,8% |
| ko | 6,27 | 6,29 | 0,03 | −0,4% | 0,0% |

"Decisão diverge" = frases em que a régua e o ICU discordam sobre caber na faixa 5–12 que
`scripts/trilha/frases.mjs:8` usa para aceitar a frase. **Uma em cada dez frases japonesas
publicadas seria recusada por um segmentador padrão.**

O coreano em 0,4% confirma a decisão de deixar Hangul fora de `ESCRITA_SEM_ESPACO` — o comentário
do código está certo.

Escritas sem espaço que a régua **não** cobre, e onde ela devolve 1 para a frase inteira:

| idioma | régua | ICU |
|---|---:|---:|
| khmer | 1 | 7 |
| lao | 1 | 6 |
| birmanês | 1 | 9 |
| tibetano | 1 | 9 |

Nenhum está na trilha hoje. É gap latente, não defeito ativo.

---

## O que foi verificado e está certo

Registro explícito, porque resultado negativo é resultado:

- **`<T>` não tem caminho de HTML cru.** Nenhum `dangerouslySetInnerHTML` nem `innerHTML` em
  `src/lib/T.tsx`; o parser (`T.tsx:66-123`) só produz nós de React, e as tags existentes são as
  que o código declarou em `PADRAO` (`T.tsx:52-54`). Atributos nunca são lidos. Tag desconhecida
  degrada para texto. O único `dangerouslySetInnerHTML` do repo está em
  `src/components/auth/SecurityPanel.tsx:13` e recebe o SVG do enrolamento MFA do Supabase —
  fora do caminho de tradução. **Não é P0.**
- **A normalização Unicode é consistente entre ingestão e runtime.** `derivar.mjs:16`,
  `verificar.mjs:14` e `cefrWordlist.ts:51` aplicam a mesma transformação (NFD + remove
  diacrítico + minúscula). O coreano funciona porque os dois lados ficam decompostos — 100% das
  palavras coreanas mudam na chave, e mesmo assim **zero colisões** e **zero glosas órfãs** nos
  16 idiomas. Ressalva de manutenção (P3): a função está copiada literalmente em três arquivos e
  nada garante que continuem iguais.
- **As frases do Tatoeba estão no idioma certo.** Zero frases fora da escrita esperada, nos 16
  idiomas. Não há vazamento de marcação de idioma.
- **O desenclítico tem guarda dupla e não produz falso positivo no dado publicado.** 15 de 16
  casos nomeados corretos, incluindo `carme`, `firme`, `informe`, `parte`, `menos`, `alumnos`,
  `dormi` e `figli` — todos preservados. Varrendo o vocabulário real de `es` e `it`, **0 palavras
  seriam cortadas**. O único caso que falhou (`suerte` → `suer`) só falha porque **injetei
  `suer` no dicionário de teste**: como `suer` termina em `er`, `pareceVerbo` devolve verdadeiro,
  e a única defesa é a checagem de dicionário. Isso prova que a guarda de dicionário é
  carregadora — não é redundância.
- **Zero duplicata na trilha**, em qualquer definição: literal, por caixa (com
  `toLocaleLowerCase` do idioma) ou por forma Unicode.
- **A melhora de 70% para 90% nas glosas é estatisticamente significativa** em teste pareado.
  Meu primeiro cálculo comparou intervalos de confiança e concluiu o contrário — era o teste
  errado para amostra pareada.

---

**GATE 1.** Aguardando aceite para prosseguir à Fase 2 (censo de cobertura por tela).

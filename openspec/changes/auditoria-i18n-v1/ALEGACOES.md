# Alegações extraídas — o relatório sob auditoria

O balanço "✅ FEITO / ❌ FALTA" do agente anterior não foi entregue em texto. Por decisão do
solicitante, o relatório sob auditoria passa a ser **o que esse agente escreveu e commitou**.
São cinco arquivos, todos na branch `multi-idioma`:

| # | arquivo | commit que o criou | papel |
|---|---|---|---|
| A | `docs/i18n.md` | `2461883` | manual de uso + tabela "feito / falta" |
| B | `docs/i18n-lacunas.md` | `2461883` | análise de decisão, com "números medidos" |
| C | `docs/i18n-como-testar.md` | `173fcde` | roteiro de verificação manual e do CI |
| D | `docs/auditoria/trilha-multi-idioma-v1.md` | — | balanço da trilha |
| E | `openspec/changes/trilha-multi-idioma/tasks.md` | — | checklist da mudança, com números por fase |

Abaixo, cada alegação numérica com `arquivo:linha`. **Nenhum veredito aqui** — veredito é a
Fase 1. Esta lista é só o insumo: a coluna "alegado" da tabela do GATE 0.

---

## Alegações sem fonte no repositório

O briefing da auditoria cita números que **não existem em documento nenhum** deste repositório.
Vieram do balanço de chat que não foi colado. Registro para que ninguém os trate como
verificados:

| alegação do briefing | achei no repo? |
|---|---|
| "704 mil formas → lema" | **não**. Nenhuma ocorrência de `704 mil`, `704.000` ou `704000` em `docs/` ou `openspec/` |
| "257 classes lógicas" | **não** como texto. O número é plausível (medi 253 com regex próprio), mas não está escrito em lugar nenhum |
| "glosas 41% / precisão 90% sobre amostra de 60" | **parcial**: 41% em `D:28` e `E:46`; 90%/60 em `D:78-82` e `E:48-50` |
| "desenclítico" e sua taxa de erro | **não**. Nenhuma ocorrência de `desenclí`/`enclí` |
| "US$ 19 mil / US$ 8 mil / US$ 600" | **não**. `B:169` traz US$ 0,08–0,20/palavra e US$ 1.200–3.000 por idioma; os três totais não aparecem |
| "16 idiomas de UI" | **não**. Os 16 são de **trilha** (`E:89`). Idiomas de interface declarados são 3 (`src/lib/i18n.ts:36`) |
| "2.000 chaves" como fato | **é estimativa**, não medição: `A:10` diz "~1.800 a 2.200 strings **medidas**", `B:147` e `C:147` dizem "~2.000" |

O último item importa para o resto da auditoria: **o briefing trata como consumado ("depois de
2.000 chaves") um número que os próprios documentos apresentam como faixa estimada.** O
catálogo real tem 693 chaves.

---

## A — `docs/i18n.md`

| # | linha | alegação |
|---|---|---|
| A1 | 10 | "O app tem ~1.800 a 2.200 strings de interface medidas" |
| A2 | 23 | "Sem biblioteca. i18next resolveria o mesmo com ~40 kB gzip" |
| A3 | 37 | "Plural pelo CLDR — feito. `Intl.PluralRules`, nativo" |
| A4 | 38 | "RTL (árabe, hebraico) — feito. `dir`/`lang` no `<html>` acompanham o idioma" |
| A5 | 39 | "Números e datas no locale — os helpers existem; faltam ~50 pontos migrados" |
| A6 | 40 | "Tradução por falante nativo — não feito" |
| A7 | 45-52 | Formas de plural: 1 = ja/zh/ko · 2 = pt/en/es/fr/de/it/nl/sv/tr/hi · 3 = ru/pl/he · 6 = ar |
| A8 | 54 | "Seis dos dezesseis não cabem em duas formas" |
| A9 | 100-106 | Traduzido: COPY do perfil 150 · jogos 63 · menu 36 · panelMeta 20 · descartes 27 · avisos ~47 |
| A10 | 108 | "`public/i18n/en.json` (325 chaves), `public/i18n/es.json` (20)" |
| A11 | 121 | "~400 strings ainda em tabelas de rótulo" |
| A12 | 125-126 | "~1.100 espalhadas em JSX. Analysis 129, LiveCapture 79, Library 51, Reading 49, Settings 38" |
| A13 | 127 | "688 casos de texto rico" |
| A14 | 129 | "540 template literals com `${}`" |
| A15 | 130 | "~60 plurais" |
| A16 | 132 | "~50 pontos de locale com `'pt-BR'` cravado" |
| A17 | 134 | "O onboarding não pergunta o idioma da pessoa" |
| A18 | 143 | "~55 chaves de `localStorage` `babel.*`" |

## B — `docs/i18n-lacunas.md`

| # | linha | alegação |
|---|---|---|
| B1 | 58-59 | "78 plurais decididos no código, fora do `tp()`" |
| B2 | 70-74 | "Gênero não está resolvido" — sem ICU `select` |
| B3 | 98 | "O meu `t()` devolve `string` e não resolve texto rico" |
| B4 | 117-118 | "1.053 template literals com interpolação e 4 concatenações" |
| B5 | 126 | "RTL resolvido — `lang` e `dir` do `<html>`, verificado em árabe" |
| B6 | 127-129 | "57 chamadas de `toLocale*` ainda com `'pt-BR'` cravado" |
| B7 | 147 | "~2.000 strings por idioma" |
| B8 | 169 | "Profissional — US$ 0,08–0,20 por palavra ... US$ 1.200–3.000 por idioma" |
| B9 | 205-208 | "O perfil triplica tudo: ~2.000 strings viram ~2.000 × 3" |
| B10 | 212 | "28 idiomas × 3 nativos ≈ 24 MB de glosas" |
| B11 | 221 | "Strings traduzidas para inglês: 325 — feito" |
| B12 | 224 | "Helpers de número e data — feitos, 57 pontos por migrar" |
| B13 | 225-226 | "~300 em tabelas de rótulo · ~1.100 espalhadas em JSX" |
| B14 | 229 | "Texto rico: 20 diretos, ~688 no total" |
| B15 | 230 | "Idiomas com catálogo: 3 (en, es, ar parcial)" |
| B16 | 247 | "Migrar as ~1.400 strings restantes" |

## C — `docs/i18n-como-testar.md`

| # | linha | alegação |
|---|---|---|
| C1 | 21-29 | "`?ui=<idioma>` funciona em qualquer endereço; `xx` é o pseudo-idioma; sem o parâmetro volta ao português" |
| C2 | 65-66 | "Os números com vírgula: `2,733` — não `2.733`" em inglês |
| C3 | 84-88 | "`document.documentElement.dir` deve ser `rtl` e `lang` deve ser `ar`" |
| C4 | 90 | "Só uma parte do árabe está traduzida (21 chaves)" |
| C5 | 112 | "Varre 5 telas e falha se algum texto de interface for cortado" |
| C6 | 121 | "`npm test` — 2.775 testes unitários" |
| C7 | 124 | "`npx playwright test` — 20 testes de ponta a ponta, no navegador" |
| C8 | 134 | "A regra `locale-cravado` impede que volte a existir `toLocaleString('pt-BR')` — foi ela que faltou para os 44 pontos não terem entrado em primeiro lugar" |
| C9 | 116-125 | O bloco inteiro é apresentado como "o que o CI faz" — logo, todos passam |
| C10 | 147 | "O número real: ~330 chaves traduzidas de ~2.000" |

## D — `docs/auditoria/trilha-multi-idioma-v1.md`

| # | linha | alegação |
|---|---|---|
| D1 | 7 | "Curso de palavras · 5.727" (espanhol) |
| D2 | 24 | "704 palavras do A1" (inglês) · "955 palavras da faixa 1" (espanhol) |
| D3 | 28 | "O rodapé do painel mostra 41%, que é a cobertura real de tradução daquela trilha" |
| D4 | 44-45 | "Neste banco: 0 — não há cartão vindo da trilha (2.922 do Anki, 467 de sessão)" |
| D5 | 71-74 | en CEFR 2.784 / 92% / embutida · de 5.758 / 93% / 49% · fr 5.752 / 93% / 58% · es 5.727 / 90% / 37% |
| D6 | 78-79 | "Amostra determinística de 60 (10 por faixa), revisada por modelo, não por falante nativo humano" |
| D7 | 81-82 | "Antes das correções: 70%. Depois: 90% (54/60), com a cobertura caindo de 41% para 37%" |
| D8 | 97-98 | "`embarazo=embaraço` é falso amigo" — custo declarado do desempate por cognato |
| D9 | 103 | "exemplo do Tatoeba em ~90% das palavras" |
| D10 | 108-110 | es-pt 3.696 de 5.163 (72%) · fr-pt 2.721 de 5.340 (51%) · de-pt 2.373 de 5.370 (44%) |
| D11 | 120 | "77 mil linhas para es-pt" no export do Tatoeba |
| D12 | 128 | "37% de cobertura de glosa no espanhol, 58% no francês, 49% no alemão" |
| D13 | 131 | "Nomes próprios na lista de frequência (`harry`, `curtis`, `Tokio`)" |
| D14 | 138-139 | "`en.json` continua em v1" |
| D15 | 143 | "`npx tsc --noEmit` limpo" |
| D16 | 144 | "`vitest`: 2.715 passando, 0 falhando" |
| D17 | 145 | "`playwright` (BASE_URL=3101): 8 passando, 0 falhando" |
| D18 | 147 | "Os 44 avisos do repositório são anteriores" (ESLint) |
| D19 | 159 | "O que baixa ao abrir o site: 739 kB bruto — index 376 + vendor-react 190 + CSS 173" |
| D20 | 169-171 | trilha es 271 kB / 103 gzip · glosas es-pt 329 / 130 · níveis es 44 / 21 |
| D21 | 173-174 | "Um usuário baixa ~239 kB gzip" · "a trilha do francês carregou em 122 ms" |
| D22 | 180-181 | "Os 29 MB do `dist/` — 22,5 MB são o WASM do ONNX Runtime mais 1,5 MB dos workers. Os quatro idiomas somam 2,1 MB — 7% do total" |
| D23 | 185 | "O custo por idioma é ~628 kB bruto" |
| D24 | 190-192 | 28×1 nativo ≈ 17 MB · 28×3 ≈ 40 MB · 28×5 ≈ 57 MB |
| D25 | 201-204 | "A interface é 100% pt-BR e não há infraestrutura de i18n — nenhum `t()`, nenhum arquivo de tradução" |
| D26 | 233 | "os 6,4 MB de trilhas e glosas passavam pelo build" |
| D27 | 241-243 | entrada 742 kB → 742 kB · `dist/assets` 34,0 → **27,7 MB** · 6,4 MB em 31 arquivos |
| D28 | 249 | "`niveis/*.json` (864 kB)" |

## E — `openspec/changes/trilha-multi-idioma/tasks.md`

| # | linha | alegação |
|---|---|---|
| E1 | 46 | "Trilha piloto `es`: 5.727 palavras lematizadas, 955 por faixa, 41% com glosa (59% na A1)" |
| E2 | 48-50 | "Amostra de 60 revisada — por modelo, não por falante nativo. 70% antes, 90% depois" (marcada `[~]`) |
| E3 | 72 | "Ter tradução vira o critério mais pesado (20% → 72% em es-pt)" |
| E4 | 78 | "`ru`: 5.786 palavras, 95% com frase, 33% glosas, 41% frases traduzidas" |
| E5 | 79 | "`ja`: 5.947 palavras, 87% com frase, 26% glosas, 18% frases traduzidas" |
| E6 | 89 | "Entraram: ar, de, en, es, fr, he, hi, it, ja, ko, nl, pl, ru, sv, tr, zh — **85.668 palavras**" |
| E7 | 90-91 | "`foraDaEscrita` tira a sujeira da fonte: legenda chinesa trazia `hello` e `ok`, 11% das palavras fora de Han" |
| E8 | 92-93 | "Marcas combinantes (`\p{M}`) fazem parte da palavra — 445 palavras árabes e 744 híndis eram descartadas" |
| E9 | 95-96 | "**Gate de publicação** no `verificar.mjs`: recusa trilha com menos de 5% de glosa ou mais de 10% fora da escrita do idioma" |
| E10 | 97-99 | "`th` NÃO foi publicado: a fonte não segmenta o tailandês" (marcada `[~]`) |
| E11 | 102 | "`dist/assets` 34,0 → 27,7 MB; entrada intacta em 742 kB" |
| E12 | 13 | "Medir: 233 KB → 20,4 KB (91% a menos) no que `cefrWordlist` puxa" |

---

## Contradições entre os próprios documentos

Antes de comparar com a realidade, os documentos já discordam entre si. Todas as três colunas
saem do mesmo autor, na mesma semana:

| assunto | A/B dizem | C diz | D/E dizem |
|---|---|---|---|
| chaves traduzidas para inglês | **325** (`A:108`, `B:221`) | **~330** (`C:147`) | — |
| testes unitários | — | **2.775** (`C:121`) | **2.715** (`D:144`) |
| testes e2e | — | **20** (`C:124`) | **8** (`D:145`) |
| pontos de locale a migrar | **~50** (`A:39`) / **57** (`B:127`) | **44**, já migrados (`C:134`) | — |
| avisos de ESLint | — | — | **44** (`D:147`) |
| cobertura de glosa do espanhol | — | — | **41%** (`D:28`, `E:46`) e **37%** (`D:128`) |
| strings em tabelas de rótulo | **~400** (`A:121`) | — | **~300** (`B:225`) |
| existe infraestrutura de i18n? | sim, detalhada | sim | **"não há infraestrutura de i18n"** (`D:201`) |

A última linha é a mais séria como documentação: `D:201` afirma, num arquivo que ainda está no
repositório e não traz aviso de data, que **não existe `t()` nem arquivo de tradução**. Isso era
verdade quando foi escrito e deixou de ser onze commits depois. Quem ler `D` hoje sem ler `A` sai
com o retrato errado do produto.

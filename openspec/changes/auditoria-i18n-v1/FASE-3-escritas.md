# Fase 3 — estresse por escrita e por idioma

Medição: `medicoes/14-estresse-por-escrita.mjs` (Node 24.18, ICU 78.3) e navegação real com
Playwright contra servidor próprio na porta 3106. Capturas em `evidencias/`.

Só 3 catálogos de interface existem (`en` 693 chaves, `ar` 21, `es` 20) mais o pseudo `xx`. Os
outros 13 idiomas de trilha não têm catálogo, então "testar a interface neles" significa testar
**como o app degrada** — que é o que interessa.

---

## Matriz: idioma × escrita × status

| idioma | escrita | catálogo de UI | status | causa raiz |
|---|---|---:|---|---|
| português | latina | origem | **PRONTO** | — |
| inglês | latina | 693 | **PRONTO** | — |
| espanhol | latina | 16 úteis | **PARCIAL** | catálogo é estube (2,3% do universo) |
| árabe | árabe | 21 | **QUEBRADO** | ver §5 — texto latino em contexto RTL sem isolamento bidi |
| hebraico | hebraica | 0 | **NÃO TESTADO** | sem catálogo; `ehRTL` o cobre, mas nada a exibir |
| turco | latina | 0 | **QUEBRADO** | ver §1 — 34,5% do vocabulário muda de identidade com caixa invariante |
| alemão, holandês, sueco, francês, italiano, polonês | latina | 0 | **PARCIAL** | degrada para português; ordenação errada (§2) |
| russo | cirílica | 0 | **PARCIAL** | degrada; ordenação errada |
| japonês, chinês | Han/kana | 0 | **PARCIAL** | degrada; fonte do sistema (§5); régua de palavras erra (Fase 1, N5) |
| coreano | Hangul | 0 | **PARCIAL** | degrada; normalização OK (Fase 1) |
| híndi | devanágari | 0 | **PARCIAL** | degrada; fonte do sistema |
| tailandês | tailandesa | 0 | **FORA** | trilha não publicada (`tasks.md:97`); a régua conta 21 onde o ICU conta 11 |
| islandês, vietnamita | latina | — | **NÃO SUPORTADO** | não estão entre os 16 |

---

## 1. Turco — o `i` sem ponto

O caso clássico, e aqui ele é real porque **o turco é um dos 16 idiomas da trilha**.

| operação | invariante | com locale `tr` | igual? |
|---|---|---|---|
| `'I'.toLowerCase()` | `"i"` | `"ı"` | **não** |
| `'i'.toUpperCase()` | `"I"` | `"İ"` | **não** |
| `'İSTANBUL'` minúsculo | `"i̇stanbul"` | `"istanbul"` | **não** |

Sobre as 5.787 palavras reais da trilha turca:

- **1.996 (34,5%)** mudam de identidade com `toUpperCase()` invariante
- 17 (0,3%) mudam com `toLowerCase()` invariante

```
için → IÇIN   (certo: İÇİN)
seni → SENI   (certo: SENİ)
biraz → BIRAZ (certo: BİRAZ)
hadi → HADI   (certo: HADİ)
```

Combinado com o censo da Fase 1 (**239 chamadas** de `toLowerCase()`/`toUpperCase()` sem locale e
**zero** com locale), qualquer uma delas que toque palavra turca produz erro silencioso: a busca
não acha, a comparação de chave falha, o rótulo em maiúsculas sai errado. Uma em cada três
palavras.

**Veredito: QUEBRADO.** Não é hipótese — é 34,5% do vocabulário publicado.

---

## 2. Ordenação — `Intl.Collator` contra a ordenação binária

Os quatro casos testados divergem. Nenhum é sutil:

| idioma | entrada | `.sort()` binário | `Intl.Collator` |
|---|---|---|---|
| islandês | `zebra þór ær öl að` | `að zebra ær öl þór` | `að zebra þór ær öl` |
| sueco | `ö z å ä a` | `a z ä å ö` | `a z å ä ö` |
| turco | `z ç ş i ı` | `i z ç ı ş` | `ç ı i ş z` |
| alemão | `ß ss z ä` | `ss z ß ä` | `ä ss ß z` |

No código: **5 arquivos** usam `Intl.Collator` ou `localeCompare` (`CoberturaDosIdiomas.tsx`,
`MapaDoConteudo.tsx`, `fillers.ts`, `painelDaPratica.ts`) e há **4** `.sort()` sem comparador.

O número baixo de `.sort()` cru limita o dano hoje. Vira problema quando alguma lista de palavras
por idioma for ordenada para exibição — e o islandês, se um dia entrar, quebra de forma visível
(`þ` deve vir **depois** de `z`, e a ordenação binária o coloca antes de `æ`).

---

## 3. Cluster de grafema — `.length` mente

`.length` conta unidades UTF-16; o que o leitor vê são grafemas.

| lang | palavra | `.length` | grafemas (ICU) | razão |
|---|---|---:|---:|---:|
| híndi | तुम्हें | 7 | **2** | 3,5× |
| híndi | क्षत्रिय | 8 | **3** | 2,7× |
| árabe | مُحَمَّد | 8 | **4** | 2,0× |
| coreano | 한국어 | 3 | 3 | 1,0× |

Censo no código: **58** `.slice(0, N)` sobre string e **4** `.substring`/`.substr`. Cada um trunca
por unidade UTF-16.

Nenhum dos casos que testei quebrou com `slice(0,3)` — os pontos de corte caíram fora de matra. É
**censo de risco, não defeito comprovado**: para afirmar que corta errado seria preciso rastrear
quais dos 58 recebem texto em devanágari ou árabe. Não rastreei.

---

## 4. Chinês — `zh-Hans` e `zh-Hant` são o mesmo idioma para o app

O seletor oferece as duas variantes:

```
zh-CN → short 'zh'
zh-TW → short 'zh'
```

Ambas colapsam para `zh`, e existe **um só** `public/trilha/zh.json`. Das 5.221 palavras, **75
(1,4%)** contêm caractere exclusivo de tradicional — ou seja, a trilha é essencialmente
**simplificada**.

Consequência: quem escolhe **中文 (繁體)** recebe vocabulário simplificado, sem aviso. O app tem o
padrão de honestidade (`Honestidade.tsx`) para dizer o que falta, e aqui ele não é acionado.

---

## 5. Fontes — e o achado que o briefing previu ao contrário

| medida | valor |
|---|---|
| arquivos de fonte no repositório | **0** |
| famílias importadas do Google Fonts | 8 (Inter, Archivo, IBM Plex Mono, Geist, Geist Mono, Baloo 2, Silkscreen, VT323) |
| `@font-face` próprio | 0 |
| `unicode-range` próprio | 0 |
| fallback declarado para escrita não latina | **NÃO** |

Tudo vem de `@import url('https://fonts.googleapis.com/…')` em `src/index.css:1`.

**O briefing esperava "CJK sem subsetting é o maior item de peso, P1 de performance". Não existe:
o app não embarca fonte CJK nenhuma — zero byte.** Confirmado em navegador: com `?ui=ar`, o
`font-family` computado do `<body>` é `Inter, sans-serif`, e Inter não tem árabe.

O custo é outro, e é de previsibilidade: árabe, hebraico, CJK, devanágari e tailandês são
renderizados pela **fonte do sistema de quem lê**. Em Windows sem pacote de idioma instalado, isso
vira caixa vazia. Nenhum fallback (`Noto Sans Arabic`, `Noto Sans CJK`…) está declarado.

Há também um ponto de conformidade para a Fase 6: `@import` do Google Fonts é requisição a
terceiro que expõe o IP de todo visitante, e é bloqueante de renderização.

---

## 6. Árabe em navegador — o que a captura mostra

`?ui=ar` em `http://localhost:3106/jogar`. Medido no documento:

```js
document.documentElement.lang  // "ar"
document.documentElement.dir   // "rtl"
scrollWidth > clientWidth      // false — sem estouro horizontal
```

O espelhamento do documento **funciona** (`langConfig.ts:164-167`). O que não funciona é o que
acontece dentro dele.

### 6a. O fallback português vira defeito visual em RTL

Medido na página:

| medida | valor |
|---|---|
| elementos de texto em contexto `dir=rtl` | 69 |
| desses, **sem uma única letra árabe** | **69** |
| elementos `<bdi>` no documento inteiro | **0** |

Com 21 chaves traduzidas de 693, ~97% da interface em árabe é **texto português dentro de um
container RTL**. Sem isolamento bidi, a pontuação de cada frase latina é reordenada.

Evidência visual (`evidencias/ar/jogar-rtl.png`): o modal de conquista mostra

```
.Nada novo para equipar neste nível — o próximo desbloqueio vem aí
```

com o ponto final **no começo da linha**. A fonte é
`src/components/RecompensaDesbloqueada.tsx:136`, onde o texto termina em `.` e é seguido de um
ícone inline.

Este é o achado conceitual da fase: **a decisão "chave = texto português, tradução ausente mostra
o português" é segura em idioma LTR e ativamente errada em RTL.** O fallback que protege o
inglês desconfigura o árabe. Não se resolve traduzindo mais rápido — se resolve envolvendo texto
de direção oposta em `<bdi>` ou `U+2068/2069`, e não há nenhum.

### 6b. A tela em árabe está em português

A mesma captura mostra o modal inteiro em português com `?ui=ar`: "CONQUISTA FEITA", "Primeira
captura", "Ver em Personalizar", "Resgatar tudo e continuar". É a confirmação visual do censo da
Fase 2 — `Conquistas.tsx` e `RecompensaDesbloqueada.tsx` estão em 0%.

---

## 7. Pseudo-localização — o que ela pega e o que deixa passar

`?ui=xx` em `/ajustes` (`evidencias/xx/ajustes-pseudo.png`). Medido:

| medida | valor |
|---|---|
| elementos com estouro de conteúdo | **0** |
| navegação fora da tela | não (`navX = 74`) |

O teste e2e está **certo** ao passar: com texto 40% mais longo, nada corta. Verifiquei
especificamente a barra de navegação, que na captura parece cortada à esquerda — ela rola na
horizontal, comportamento legítimo.

O que a captura revela são as strings que **não passam por `t()`** e por isso aparecem em
português limpo no meio do texto acentuado:

```
Buscar · Ctrl K · Português (BR) · Auditoria de idioma · Cartões · Falas
Conferir o idioma dos meus cartões · iChat · Context · Babel iChat · Contexto:
```

A ferramenta funciona. O problema é que o check que as detecta
(`stringsNaoTraduzidas()`, `tests/e2e/pseudo-localizacao.e2e.ts:123-130`) **só relata, não falha**
— confirmado na Fase 1. Ou seja: o CI vê essa lista e passa mesmo assim.

---

## Resumo da fase

**QUEBRADO (2):** turco, por 34,5% do vocabulário mudar de identidade com caixa invariante e 239
chamadas despreparadas. Árabe, por texto latino sem isolamento bidi em 97% da interface.

**PARCIAL (11):** todos os idiomas sem catálogo degradam para português de forma legível — o que
é o comportamento desenhado e funciona. Ordenação e fonte ficam por conta do sistema.

**FORA (1):** tailandês, não publicado, com razão medida (a régua conta 21 onde o ICU conta 11).

**NÃO SUPORTADO:** islandês e vietnamita não estão entre os 16; o islandês foi testado só na
ordenação, onde `Intl.Collator('is')` diverge da binária como esperado.

**Um resultado negativo relevante:** o app não embarca nenhuma fonte, então não há custo de CJK a
otimizar. O risco de fonte é de renderização imprevisível, não de peso.

---

**GATE 3.** As fases 4 a 7 (arquitetura contra o padrão da indústria, performance e custo,
segurança e licenciamento, veredito) **não foram executadas**.

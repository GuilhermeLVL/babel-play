# Internacionalizar de verdade: o problema, as lacunas e como a indústria resolve

Escrito em 2026-09-03 para embasar a decisão de até onde levar o multi-idioma. Números medidos
neste repositório, não estimados.

A tradução de palavras é a parte visível e a menos difícil. O que decide se o app atende alguém
fora do Brasil são seis problemas estruturais — três já resolvidos aqui, três abertos — mais uma
questão que não é técnica e é a mais cara de todas.

---

## 1. Onde mora a frase: chave-texto contra chave simbólica

**O problema.** Uma frase na tela precisa de um identificador para o catálogo de traduções. Há duas
escolas, e a diferença decide o custo de tudo o mais.

| | chave é o texto-fonte | chave é um símbolo |
|---|---|---|
| como se escreve | `t('Jogo da memória')` | `t('play.memory.title')` |
| migrar uma tela | envolver a string | batizar cada frase e criar o `pt.json` |
| tradução faltando | **mostra o português** | mostra `play.memory.title` ou vazio |
| mudar a redação PT | **quebra a tradução dos outros idiomas** | não quebra nada |
| quem usa | gettext — WordPress, GNOME, Django, Rails | i18next, react-intl, apps móveis |

**O que eu escolhi aqui e por quê.** Chave-texto. Com ~2.000 strings já escritas dentro do JSX, a
chave simbólica exigiria batizar duas mil frases e revisar tudo *antes* de a primeira tela
funcionar — e uma chave errada não quebra teste, só abre buraco na tela. Com o português como
chave, o fallback é sempre legível e uma tela traduzida convive com dez que não são.

**O que isso custa, e é real.** Mudar uma vírgula no português troca a chave e devolve aquela
frase ao português em *todos* os idiomas. Com dois catálogos é gerenciável; com quinze, cada
ajuste de redação exige revisar quinze arquivos. `scripts/i18n/orfas.mjs` mostra o estrago, mas
quem conserta é gente.

**Para pesquisar:** `string externalization`, `gettext msgid`, `source string as key vs key-based
i18n`, `i18n key naming conventions`.

---

## 2. Plural — e por que `n === 1` é um erro, não um atalho

**Resolvido aqui.** Estava errado, e o conserto foi medido.

"Uma ou muitas" é a regra do português, do inglês e do espanhol. Medido com `Intl.PluralRules` nos
dezesseis idiomas que já têm trilha neste app:

| formas | idiomas |
|---:|---|
| 1 | japonês, chinês, coreano |
| 2 | português, inglês, espanhol, francês, alemão, italiano, holandês, sueco, turco, híndi |
| 3 | russo, polonês, hebraico |
| **6** | **árabe** — zero, um, dois, poucos, muitos, outro |

**Seis dos dezesseis não cabem em duas formas.** O russo muda a palavra em 1, em 2–4 e em 5+, e
volta à primeira forma no 21. Escrever `n === 1 ? 'palavra' : 'palavras'` é escolher errar.

Hoje `tp()` usa `Intl.PluralRules` (o CLDR, que vem no runtime) e o catálogo guarda as categorias
que cada idioma pede. Ainda há **78 plurais decididos no código**, fora do `tp()`, que precisam
migrar — e os piores são os por sufixo, `erro${n > 1 ? 's' : ''}`, que não sobrevivem a idioma
nenhum.

**Onde eu divirjo do padrão.** A indústria resolve plural, gênero e aninhamento com **ICU
MessageFormat** — uma sintaxe única dentro da própria string:

```
{n, plural, one {# palavra} other {# palavras}}
{genero, select, feminino {ela salvou} other {ele salvou}}
```

Eu não implementei ICU: resolvi só o plural, com um objeto de categorias. **Gênero não está
resolvido** — e importa em russo, alemão, francês, árabe e hebraico, onde adjetivos e particípios
concordam com quem fala ou com o objeto. Se o app um dia disser "você salvou 3 palavras novas" com
adjetivo, isso aparece.

**Para pesquisar:** `ICU MessageFormat`, `CLDR plural rules`, `gender select localization`,
`Intl.PluralRules`.

---

## 3. Texto rico — a frase com negrito no meio

**Aberto.** É o trabalho mais delicado que resta.

O problema é que a frase está partida pelo JSX:

```jsx
Encontrei <strong>{sessoes}</strong> sessões e <strong>{cartoes}</strong> cartões.
```

Isso não é uma string — são cinco pedaços. Traduzir pedaço por pedaço quebra em qualquer idioma
que mude a ordem das palavras, e o japonês muda.

**Como a indústria resolve.** A string vira uma só, com marcadores, e o componente reconstrói:

- **react-intl**: `<FormattedMessage>` com `values={{ b: (txt) => <strong>{txt}</strong> }}`
- **i18next**: componente `<Trans>`, que casa `<0>`/`<1>` com os filhos do JSX

O meu `t()` devolve `string` e **não resolve isso**. Cada caso precisa virar uma string com
marcador ou ser reescrito para não ter formatação no meio.

**Para pesquisar:** `rich text translation react`, `i18next Trans component`, `react-intl rich text
formatting`.

---

## 4. Ordem das palavras, interpolação e concatenação

**Parcialmente resolvido.** `t('{n} de {total}', { n, total })` funciona: o tradutor move `{n}` e
`{total}` para onde o idioma dele pede.

O que **não** funciona é frase montada por pedaços:

```ts
'Web Speech indisponível: ' + erro.message + ', troque para o motor Whisper.'
```

O tradutor recebe dois fragmentos sem contexto e não pode reordenar. Medido aqui: **1.053 template
literals com interpolação** e **4 concatenações** desse tipo.

**Para pesquisar:** `sentence splicing i18n anti-pattern`, `named interpolation localization`.

---

## 5. Números, datas e RTL

**RTL resolvido** — `lang` e `dir` do `<html>` acompanham o idioma, verificado em árabe. Sem isso a
interface fica espelhada ao contrário do texto, e nenhuma tradução conserta.

**Locale parcialmente resolvido.** Os helpers existem (`numero`, `data`, `dataHora`), mas há **57
chamadas de `toLocale*`** ainda com `'pt-BR'` cravado. Um americano lê "2.733" como 2,733 — três
ordens de grandeza de erro numa contagem de palavras, dita com toda a confiança. Datas são piores:
03/09 e 09/03 são dias diferentes e ambos parecem certos.

**O que ainda falta e não é óbvio:** expansão de texto. O alemão ocupa ~30% mais espaço que o
inglês; o japonês, bem menos. Botões que hoje cabem justo vão quebrar. A regra da indústria é
projetar para +30–50% e testar antes de traduzir, com **pseudo-localização** (item 7).

**Para pesquisar:** `text expansion localization`, `RTL layout CSS logical properties`,
`Intl.NumberFormat`, `bidirectional text`.

---

## 6. Quem traduz — o gargalo verdadeiro

Tudo acima é engenharia e tem fim. Isto não.

São **~2.000 strings por idioma**. Hoje quem traduz sou eu, sem falante nativo revisando. Dá para
sustentar inglês e espanhol defensáveis; **não dá para prometer japonês ou árabe que alguém queira
ler**. Eu escreveria algo plausível e possivelmente constrangedor — o mesmo risco que produziu
`embarazo = embaraço` nas glosas, e ali havia dicionário conferindo.

**Como a indústria resolve.** Um *Translation Management System* (TMS) no meio do caminho:

```
código → extração → arquivos → TMS → tradutores → volta como PR → CI
```

| ferramenta | modelo |
|---|---|
| **Weblate** | open source, self-host — combina com um app que já é self-host |
| **Crowdin, Lokalise, Phrase, Transifex** | SaaS, integram com GitHub, têm contexto visual |
| **Tolgee** | open source, edição direto na tela |

**Quem faz a tradução, nos três modelos:**

1. **Profissional** — US$ 0,08–0,20 por palavra. Para 2.000 strings (~15.000 palavras), algo como
   US$ 1.200–3.000 **por idioma**. Qualidade previsível.
2. **Máquina + revisão humana** (*post-editing*, MTPE) — a máquina traduz, um humano revisa.
   Bem mais barato, e é hoje o padrão de mercado.
3. **Comunidade** — grátis, e é como Telegram e VLC fazem. Risco: qualidade desigual, idiomas
   abandonados pela metade, e você precisa de gente para revisar mesmo assim.

O catálogo aqui é JSON simples de propósito — é o formato que qualquer um desses importa.

**Para pesquisar:** `translation management system`, `continuous localization`, `MTPE machine
translation post-editing`, `crowdsourced translation quality`, `Weblate self-hosted`.

---

## 7. Como se garante qualidade num idioma que ninguém da equipe fala

Existe resposta, e é mais barata do que parece.

- **Pseudo-localização.** Antes de traduzir, troca-se todo texto por uma versão acentuada e ~40%
  mais longa: `[Ĵöĝö dá mémöŕíá ~~~]`. Em uma passada pela tela você vê **toda string que não foi
  extraída** (ela continua em português limpo) e **todo lugar que quebra com texto mais longo**.
  É o teste de i18n com melhor custo-benefício que existe, e não precisa de tradutor nenhum.
- **Contexto para quem traduz.** Captura de tela junto da string. Sem isso, "Save" pode virar
  substantivo. Os TMS acima fazem isso automaticamente.
- **Glossário e guia de estilo.** Como traduzir "trilha", "baralho", "cartão" — e o registro de
  voz. Sem isso, dez tradutores produzem dez vocabulários.
- **LQA** (*Linguistic Quality Assurance*): revisão por um segundo nativo, por amostragem.

**Para pesquisar:** `pseudolocalization`, `localization QA`, `translation glossary style guide`,
`screenshot context translation`.

---

## 8. Duas dificuldades que são específicas deste app

**a) O perfil triplica tudo.** Este app escreve cada frase em três registros — `kids`, `pro`,
`senior` — e são **redações diferentes de propósito**, não sinônimos. Isso é incomum: a maioria
dos produtos tem uma voz só.

Consequência direta: **~2.000 strings viram ~2.000 × 3 para traduzir**, e o tradutor precisa
entender que "Jogo da memória" e "Memória: palavra e tradução" são a mesma tela falando com
públicos diferentes. Isso triplica o custo do item 6 e é uma decisão de produto que vale
reexaminar antes de multiplicar por quinze idiomas.

**b) O conteúdo também é por par de idiomas.** Fora da interface, as glosas da trilha são
`praticado → nativo`. Um alemão estudando espanhol precisa de `es-de`, que não existe. Já
dimensionado: 28 idiomas × 3 nativos ≈ 24 MB de glosas. A interface em alemão sem a glosa em
alemão entrega meia experiência — e a tela hoje ao menos **diz isso**, em vez de ficar muda.

---

## Onde estamos, em números medidos

| | quantidade | estado |
|---|---:|---|
| Strings traduzidas para inglês | 325 | feito |
| Plural pelo CLDR | — | feito |
| RTL (`lang`/`dir`) | — | feito |
| Helpers de número e data | — | feitos, **57 pontos por migrar** |
| Strings em tabelas de rótulo | ~300 | mecânico |
| Strings espalhadas em JSX | ~1.100 | volume |
| Plurais decididos no código | 78 | migrar para `tp()` |
| Interpolações em template literal | 1.053 | migrar para `t(..., {})` |
| Texto rico (frase com `<b>` dentro) | 20 diretos, ~688 no total | precisa de solução própria |
| Idiomas com catálogo | 3 (en, es, ar parcial) | — |

---

## A pergunta que fica para você decidir

Não é técnica: **quem traduz, e com que orçamento.** Tudo o mais acima eu consigo construir.

Três caminhos, e cada um implica um esforço diferente daqui para a frente:

1. **Um ou dois idiomas bem feitos** (inglês e espanhol). Eu traduzo, um nativo revisa por
   amostragem. Barato, e cobre a maior parte do mercado potencial.
2. **Muitos idiomas com TMS e comunidade.** Investe-se em pseudo-localização, glossário e
   Weblate; a qualidade fica desigual, e alguns idiomas ficam pela metade.
3. **Muitos idiomas com tradução profissional.** Previsível e caro — multiplicado por três, por
   causa dos perfis.

O trabalho de engenharia que **falta em qualquer um dos três** é o mesmo: migrar as ~1.400 strings
restantes, resolver o texto rico e os 57 pontos de locale.

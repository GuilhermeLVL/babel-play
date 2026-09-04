# Fase 2 — cobertura real do aplicativo

O relatório sob auditoria fala em "~1/3 traduzido" (o briefing) e "~330 de ~2.000"
(`i18n-como-testar.md:147`). Este é o censo que confirma ou refuta, tela a tela e **superfície a
superfície** — incluindo as que uma migração de i18n costuma esquecer.

Medição: `medicoes/13-censo-de-cobertura.mjs`.

---

## 1. O número global, com o denominador mais estrito

| método | denominador | `t()` | cobertura |
|---|---:|---:|---:|
| do repo (`orfas.mjs:52`, literais com acento) | 3.145 | 373 | **11,9%** |
| meu, Fase 0 (todo nó de texto JSX) | 2.150 | 367 | **17,1%** |
| meu, Fase 2 (só nó de texto que **parece frase**: tem espaço ou acento) | 1.599 | 367 | **23,0%** |

O terceiro é o mais justo: descarta identificador, classe CSS, chave de união discriminada
(`'trilha-sem-frase'`) e nome de ícone — exatamente as armadilhas que `i18n.md:141-148` lista.

**A resposta honesta é 12% a 23%.** O "~1/3" do briefing fica acima de qualquer um dos três.

---

## 2. Onde a tradução está, e onde não está

| área | arquivos | texto visível | `t()` | cobertura |
|---|---:|---:|---:|---:|
| `src/components/minigames` | 20 | 145 | 47 | **32,4%** |
| `src/components/views` | 39 | 974 | 301 | **30,9%** |
| `src/components/conta` | 5 | 14 | 5 | 35,7% |
| `src/components/shell` | 9 | 13 | 2 | 15,4% |
| `src/core/minigames` | 22 | 33 | 0 | **0%** |
| `src/core/learning` | 23 | 28 | 0 | **0%** |
| `src/components/auth` | 5 | 25 | 0 | **0%** |
| `src/lib/exercicios` | 5 | 19 | 0 | **0%** |
| todo o resto (60+ arquivos) | — | ~350 | ~12 | ~3% |

Duas áreas concentram 95% do trabalho feito. Tudo fora de `views/` e `minigames/` está
praticamente intocado.

`src/core` estar em 0% é **decisão declarada, não descuido**: `i18n.md:123-124` diz que o núcleo
não importa `lib/` e devolve o português para a UI traduzir no ponto de exibição. O custo dessa
decisão é que as 61 strings de `core/` precisam de um helper por tabela para sair — não basta
envolver em `t()`.

---

## 3. O achado da fase: a tradução foi feita onde não está o dinheiro

| tela | texto visível | `t()` | cobertura |
|---|---:|---:|---:|
| `Onboarding.tsx` | 49 | 0 | **0%** |
| `Loja.tsx` | 30 | 0 | **0%** |
| `Planos.tsx` | 16 | 1 | 6% |
| `PasseDeTemporada.tsx` | 15 | 0 | **0%** |
| `Login.tsx` | 13 | 0 | **0%** |
| `OnboardingLeve.tsx` | 11 | 1 | 9% |
| `Conquistas.tsx` | 9 | 0 | **0%** |
| `CardDePlanos.tsx` | 5 | 0 | **0%** |
| **soma** | **148** | **2** | **1,4%** |

`src/core/planos.ts`, `src/core/creditos.ts` e `src/lib/entitlements.ts`: **zero** chamadas de
`t()`.

Comparado com `views/` em 30,9%, isto é o oposto do que a prioridade comercial pediria. O
estrangeiro que chega ao app encontra:

1. **onboarding** em português — e ele nem pergunta o idioma da pessoa (`i18n.md:134`);
2. **login** em português;
3. **paywall e planos** em português, com preço em BRL;
4. e só então, se chegar lá, as telas de prática parcialmente traduzidas.

A porta de entrada e a porta de pagamento são as duas menos traduzidas do app.

---

## 4. Superfícies esquecidas

| superfície | literal cravado | via `t()` | cobertura | risco |
|---|---:|---:|---:|---|
| `title=` (tooltip) | 136 | 0 | **0,0%** | descoberta de função |
| `aria-label` | 118 | 8 | **6,3%** | acessibilidade |
| `placeholder` | 34 | 0 | **0,0%** | formulário |
| `alt` | 4 | 0 | **0,0%** | acessibilidade |
| **total** | **292** | **8** | **2,7%** | |

Exemplos medidos:

```
aria-label   GuidePanel.tsx: "Guia do Babel Play" · CardDePlanos.tsx: "Dispensar este aviso de planos"
title=       ChatTranscript.tsx: "Clique para pronúncia nativa e detalhes" · EditablePanel.tsx: "Ocultar do Layout"
placeholder  BuscaGlobal.tsx: "Buscar gravação, palavra ou tela…" · CommandPalette.tsx: "Buscar exercício…"
alt          Library.tsx: "Prévia da capa" · Sobre.tsx: "Foto de ${CRIADOR.nome}"
```

**`aria-label` em 6,3% é o item mais grave desta tabela.** Um leitor de tela em inglês vai
anunciar rótulos em português numa interface que o resto do tempo fala inglês. A pseudo-localização
não pega isso: o teste e2e mede overflow visual (`pseudo-localizacao.e2e.ts`), e atributo não tem
caixa para estourar.

### Superfícies que simplesmente não existem

Verificado: **0** arquivos com e-mail transacional (`nodemailer`/`sendgrid`/`resend`), **0** com
exportação de PDF, **1** com notificação. Não são gaps — são superfícies ausentes do produto. Bom
para o escopo da tradução.

---

## 5. Strings vindas do servidor — não há caminho de tradução

| medida | valor |
|---|---|
| mensagens de erro/motivo literais em `server/` | **98** |
| o servidor importa `lib/i18n`? | **NÃO** |
| arquivos `.ts` em `server/` | 75 |

Amostra, toda ela visível ao usuário:

```
server/ai/mtProxy.ts: "tradução por IA gerenciada requer plano Pro"
server/ai/mtProxy.ts: "limite mensal do plano atingido"
server/ai/mtProxy.ts: "tradução indisponível: ${ultimaFalha}"
server/ai/mtProxy.ts: "payload inválido: text/tgt obrigatórios"
server/ai/proxy.ts:   "header x-credential-id ausente"
```

As duas primeiras são **mensagens de paywall**. Um usuário em inglês que bate no limite do plano
recebe a explicação em português — no momento exato em que se pede dinheiro a ele.

Isto responde à pergunta do briefing: **a UI não é traduzível de ponta a ponta.** Falta um
caminho arquitetural, não trabalho de tradução. As opções são o servidor devolver **código de
erro** em vez de frase (e o cliente traduzir), ou o cliente mandar `Accept-Language` e o servidor
carregar catálogo. Nenhuma das duas existe hoje. Recomendação quantificada na Fase 4.

---

## 6. `<title>` e as meta tags

```html
<title>Babel Play — Ouça, entenda e fale outro idioma</title>
<meta name="description"     content="Capture qualquer áudio — vídeos, reuniões, podcasts…">
<meta property="og:title"    content="Babel Play — Ouça, entenda e fale outro idioma">
<meta property="og:description" content="Vídeos, reuniões, podcasts: cada conversa vira prática…">
<meta name="twitter:title"   content="Babel Play — Ouça, entenda e fale outro idioma">
```

Estáticas no HTML, servidas iguais para todo idioma. Consequências: a aba do navegador fica em
português qualquer que seja a interface; o card de compartilhamento em rede social é sempre
português; e o buscador indexa uma página só, em português, para um produto que quer vender
fora do Brasil.

Também não há `<html lang>` correto na entrega estática — `lang` só é ajustado depois que o
React monta (`langConfig.ts:164-167`), o que basta para o leitor de tela mas não para o
rastreador que lê o HTML servido.

---

## 7. Estados vazios

O app tem um padrão próprio e bom — `Honestidade.tsx`, com `motivo` obrigatório. Medido: **12**
arquivos o usam e **23** passam `motivo` como literal cravado. Ou seja, o padrão que existe
justamente para explicar ao usuário por que a tela está vazia explica **em português**.

E `rotuloDaBase` (mesmo arquivo, linha 79) monta `calculado sobre X de Y` com número em `pt-BR`
cravado — o achado N1 da Fase 1.

---

## 8. O gap, classificado por esforço e risco

| # | superfície | strings | esforço | risco | por quê |
|---|---|---:|---|---|---|
| G1 | erros do servidor | 98 | **alto** (precisa de arquitetura) | **alto** | inclui paywall; não há caminho nenhum |
| G2 | onboarding + login | 73 | baixo (mecânico) | **alto** | é a porta de entrada do estrangeiro |
| G3 | loja, planos, passe, conquistas | 75 | baixo | **alto** | é onde se cobra |
| G4 | `aria-label`/`title`/`placeholder`/`alt` | 292 | baixo, mas volumoso | **médio-alto** | acessibilidade; invisível para o teste atual |
| G5 | `<title>` e meta tags | 11 | baixo | médio | SEO e compartilhamento |
| G6 | `motivo` dos estados vazios | 23 | baixo | médio | o padrão de honestidade fala português |
| G7 | resto de `views/` | ~670 | médio | médio | volume |
| G8 | tabelas de `src/core` | 61 | médio (um helper por tabela) | baixo | decisão arquitetural declarada |
| G9 | `src/components/auth` | 25 | baixo | médio | segurança/2FA em português |

**G1 é o único que não se resolve traduzindo.** Todos os outros são trabalho mecânico com o
motor que já existe.

---

## Resposta às perguntas da fase

**A cobertura abrange o app inteiro ou só a parte medida?** Só a parte medida, e a parte medida
é a de menor valor comercial. 23% no total; 30,9% em `views/`; **1,4%** nas telas de dinheiro e
porta de entrada; 2,7% nos atributos de acessibilidade; **0%** no servidor.

**Strings do servidor têm caminho de tradução?** Não. `server/` não importa `lib/i18n`, e as 98
mensagens incluem paywall.

---

**GATE 2.** Prossigo para a Fase 3 (estresse por escrita e idioma).

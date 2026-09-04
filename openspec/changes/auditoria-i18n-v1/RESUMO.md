# Auditoria i18n v1 — resumo

> **Estado: fases 0 a 3 concluídas. Fases 4 a 7 NÃO executadas.**
>
> **Esta auditoria não tem veredito.** O veredito é a Fase 7, que não foi feita — o trabalho foi
> interrompido para integrar a branch `multi-idioma` em `main`. O que existe é levantamento
> factual com evidência: 63 alegações verificadas e 17 achados numerados. As perguntas de
> escalabilidade, custo, licenciamento e recomendação arquitetural seguem **sem resposta medida**.

## Onde está cada coisa

| arquivo | o que traz |
|---|---|
| [proposal.md](./proposal.md) | por que a auditoria existe, o que está sendo auditado, as regras |
| [ALEGACOES.md](./ALEGACOES.md) | cada alegação dos cinco documentos, com `arquivo:linha` |
| [FASE-0-baseline.md](./FASE-0-baseline.md) | a tabela alegado × medido × delta |
| [FASE-1-verificacao.md](./FASE-1-verificacao.md) | **o veredito de cada alegação, e os achados novos** |
| [FASE-2-cobertura.md](./FASE-2-cobertura.md) | censo por tela e por superfície esquecida |
| [FASE-3-escritas.md](./FASE-3-escritas.md) | matriz idioma × escrita × status, com capturas |
| [tasks.md](./tasks.md) | as oito fases como checklist |
| [medicoes/](./medicoes/) | 14 scripts, `COMANDOS.md` e as saídas cruas |
| [evidencias/](./evidencias/) | capturas de tela |

## Placar dos vereditos

| veredito | n |
|---|---:|
| CONFIRMADO | 41 |
| PARCIAL | 12 |
| REFUTADO | 4 |
| NÃO VERIFICÁVEL | 6 |

**O núcleo do relatório se sustenta.** 85.668 palavras em 16 idiomas: exato, com zero duplicata
em qualquer definição. `dist/assets` em 27,66 MiB, os 22,5 MB de WASM, os 6,4 MB em 31 arquivos,
os 2.775 testes, a tabela de plural, as quatro linhas da tabela de trilha, os três pares de
frases: todos conferem ao número. A recontagem independente bate com `indice.json` nos 32 valores.

**Quatro refutações:** o e2e tem **14** testes, não 20 nem 8. ESLint tem **35** avisos, não 44.
`ru` tem **5.761** palavras, não 5.786. E `trilha-multi-idioma-v1.md:201` afirma que "não há
infraestrutura de i18n" — era verdade quando foi escrito, deixou de ser onze commits depois, e o
arquivo não avisa que envelheceu.

**Uma correção minha, da Fase 0 para a Fase 1:** eu havia escrito que o turco passa no gate de
publicação por estar abaixo do limiar de 10%. Errado — e a causa real é pior.

## Cinco achados que nenhuma alegação cobre

| id | sev. | achado | evidência |
|---|---|---|---|
| **N1** | P2 | `new Intl.NumberFormat('pt-BR')` cravado, **invisível para o gate** `locale-cravado`, usado por 8 componentes incluindo Hub, Metrics e Analysis | `Honestidade.tsx:80`; `ast-grep scan` no arquivo não acha nada |
| **N2** | P2 | **455 palavras em escrita árabe na trilha turca**, 171 (17,7%) na faixa A1. A checagem de escrita **não roda** para idioma latino — provado por fixture: `tr` passa com 50% | `verificar.mjs:30-34` tem 8 escritas; nenhuma latina |
| **N3** | P2 | **`?ui=` sem allowlist**: busca caminho arbitrário de mesma origem, aceita qualquer JSON como catálogo, e envenena `document.lang` a ponto de os formatadores lançarem `RangeError` | observado em navegador; `evidencias/ui-param/` |
| **N4** | P3 | **239 `toLowerCase()`/`toUpperCase()` sem locale**, zero com locale — e o turco está na trilha | medição 07 |
| **N5** | P3 | a régua de palavras **erra −17,2% em japonês** contra `Intl.Segmenter`; 1 em 10 frases publicadas seria recusada por um segmentador padrão | medição 10 |

Do lado da infraestrutura: **`npm run audit:gate` sai 1** (`HIGH browserslist`), então o CI está
vermelho nesta branch e aborta antes do e2e.

## O que foi checado e está certo

Resultado negativo é resultado:

- **`<T>` não tem caminho de HTML cru** — nenhum `dangerouslySetInnerHTML` no módulo de tradução,
  o parser só produz nós de React, e as tags são as que o código declarou. **Não é P0.**
- **A normalização Unicode é consistente** entre ingestão e runtime, inclusive em coreano (onde
  100% das palavras mudam na chave): zero colisões e zero glosas órfãs nos 16 idiomas.
- **As frases do Tatoeba estão no idioma certo** — zero fora da escrita esperada.
- **O desenclítico não produz falso positivo no dado publicado** — `carme`, `firme`, `informe`,
  `parte`, `menos`, `dormi` e `figli` são todos preservados; 0 palavras seriam cortadas em `es`
  e `it`.
- **O gate de publicação reprova de verdade** quando o idioma está no mapa de escritas.
- **A melhora de 70% para 90% nas glosas é significativa** (McNemar pareado, p = 0,0005). Meu
  primeiro cálculo comparou intervalos de confiança e concluiu o contrário — era o teste errado.
  O que fica é que o documento reporta 90% **sem intervalo**: são **90% ± 7,7 pp**, e ±3 pp
  exigiria 385 itens, não 60.

## Fases 2 e 3, em uma tela

**A tradução foi feita onde não está o dinheiro.** As telas de prática estão em 30,9%; onboarding,
login, loja, planos, passe e conquistas somam **1,4%** (2 chamadas de `t()` em 148 strings). O
servidor tem **98** mensagens literais e **não importa** `lib/i18n` — duas delas são de paywall.
Atributos de acessibilidade: **2,7%**.

**Dois idiomas estão quebrados, não só incompletos.** Turco: 34,5% do vocabulário publicado muda
de identidade com `toUpperCase()` invariante, e há 239 chamadas sem locale. Árabe: `dir=rtl`
funciona, mas há **0 elementos `<bdi>`** e 69 blocos de texto latino em contexto RTL — a
pontuação salta para o lado errado (`evidencias/ar/jogar-rtl.png`).

**O achado conceitual:** a decisão "chave = texto português, sem tradução mostra o português" é
segura em idioma LTR e **ativamente errada em RTL**. O fallback que protege o inglês desconfigura
o árabe, e isso não se resolve traduzindo mais rápido.

**Um resultado negativo que corrige o briefing:** não existe custo de fonte CJK a otimizar — o app
não embarca fonte nenhuma (0 arquivos), tudo vem do Google Fonts e nenhuma família cobre escrita
não latina. O risco é de renderização imprevisível, não de peso.

## O que falta para isto virar decisão

As fases 4 a 7. Sem elas não há recomendação: nem sobre ICU MessageFormat e chaves estáveis, nem
sobre custo real de tradução, nem sobre a **atribuição CC BY-SA do Wikcionário**, que é risco
jurídico e continua sem verificação.

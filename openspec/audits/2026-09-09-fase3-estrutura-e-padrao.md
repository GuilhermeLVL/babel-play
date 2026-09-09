# Fase 3 — Estrutura e padronização (entregável do Gate 3)

Rodada de saneamento, branch `saneamento/2026-09-08`. Escopo decidido pelo dono depois da medição:
**dividir os arquivos-deus primeiro, mover os domínios depois, formatação por último.**

## 1. A medição que mudou o plano

O plano previa mover 349 arquivos para uma árvore por domínio. O mapa levantado do grafo de
imports (`openspec/changes/estrutura-por-dominio-proposta/mapa.csv`, 437 linhas) mostrou que o
problema não era onde os arquivos estavam:

| arquivo | linhas | domínios dentro dele |
|---|---:|---|
| `LiveCapture.tsx` | 4.260 | sessão, transcrição, vocabulário, i18n, jogos |
| `Play.tsx` | 4.236 | jogos, vocabulário, sessão, economia, dados |
| `Analysis.tsx` | 3.465 | sessão, estatísticas, vocabulário, jogos, transcrição |
| `api.ts` | 1.163 | o funil + 8 domínios de rota |
| `App.tsx` | 1.030 | app, auth, conta, personalização, estatísticas, economia, sessão |
| `efemero/servidor.ts` | 976 | espelha os mesmos 8 |
| `server.ts` | 703 | infra + uma rota de negócio inteira |

Mover um arquivo que pertence a cinco domínios não o coloca em domínio nenhum. Eles se dividem.

## 2. Resultado da divisão

| arquivo | antes | agora | delta |
|---|---:|---:|---:|
| `LiveCapture.tsx` | 4.260 | 2.805 | −1.455 |
| `Analysis.tsx` | 3.465 | 2.326 | −1.139 |
| `api.ts` | 1.163 | 46 | −1.117 |
| `efemero/servidor.ts` | 976 | 104 | −872 |
| `App.tsx` | 1.030 | 461 | −569 |
| `Play.tsx` | 4.236 | 3.874 | −362 |
| `server.ts` | 703 | 347 | −356 |
| **total** | **15.833** | **9.963** | **−5.870** |

42 módulos novos, 7.875 linhas, cada um com dono: `src/lib/{captura,analise,estado,jogos}/`,
`src/data/rotas/`, `src/data/efemero/rotas/`, `src/core/minigames/rodada.ts`, `server/http/app.ts`,
`server/routes/gemini.ts`.

### A ordem dos efeitos foi verificada, não suposta

Em `LiveCapture` e `Analysis` a sequência completa de chamadas de hook foi comparada com
`git show HEAD:` — **166 antes e 166 depois** num, **70 e 70** no outro, `diff` vazio nos dois.
Nenhum hook mudou de posição; as extrações só foram possíveis onde os blocos eram contíguos.

### `montarRodada` foi para o núcleo

O acoplamento mais citado das duas auditorias: oito ramos, doze pontos de chamada, dentro de uma
closure que lia quinze valores do componente. **Nenhum tinha teste**, porque exercitá-la exigia
renderizar 4.236 linhas com a rede de pé.

Agora é função pura em `src/core/minigames/rodada.ts`, com 25 casos de caracterização. As três
dependências de navegador entraram por parâmetro: `Date.now()` virou `agora`, duas closures viraram
funções injetadas, e a URL de blob virou `temAudio: boolean`. Nenhum ramo ficou para trás, zero
`any`, e o núcleo continua `strict` e sem DOM.

O limite honesto: o teste roda contra a função já extraída. Não havia seam — a extração *é* o seam.
Quem prova a ausência de regressão ponta a ponta é o e2e que joga três jogos até o fim.

## 3. Padronização

| item | estado |
|---|---|
| Prettier | configurado com as **duas convenções medidas**: `src/` fecha statement com ponto e vírgula (6.691 × 1.952), `server/`/`tests/`/`scripts/` não (2.063 × 32). Aspas simples são unânimes (3.168 × 4) |
| `.editorconfig` | criado |
| husky + lint-staged | pré-commit formata e corrige o que está no índice |
| Ordem de import | `eslint-plugin-simple-import-sort` ligado; 664 avisos corrigidos |
| **`strict` do TypeScript** | **81 erros → 0**, na árvore inteira. `npm run typecheck:estrito` no CI |
| Passada geral do Prettier | **pendente por decisão** — vem depois das movimentações de domínio |

Trinta dos 81 erros de `strict` vinham de uma assinatura só: `lazyComRecarga` declarava
`ComponentType<unknown>`, que parece mais estrito e é o oposto — props são contravariantes, e as 30
telas de `App.tsx` só passavam porque a flag estava desligada. Zero `as any` adicionados; um
removido.

## 4. Três portões que teriam sido desligados em silêncio

`env-fora-de-config.yml` e `rota-fala-com-o-banco.yml` casavam `server/routes/*.ts` — **um nível
só**. Com rotas em `server/dominios/<d>/rotas/`, passariam a cobrar de zero arquivo, sem erro e sem
aviso. `eslint.config.js` tinha o mesmo problema com `no-console` por pasta de camada.

Os três foram reescritos por camada, com **prova negativa registrada**: uma rota criada na árvore
futura com as três violações, os três portões acusando, e a limpeza
(`openspec/changes/portoes-cobram-por-camada/evidencias/prova-negativa.md`).

O mesmo cuidado salvou a regra do funil: quando o `fetch` saiu de `src/data/api.ts` para
`src/data/funil.ts`, o `ignores` da regra `fetch-fora-do-funil` — um caminho literal — foi atrás,
também com prova negativa.

## 5. Um portão pegou uma regressão de verdade

A divisão de `api.ts` e do espelho deixou cada módulo de rota importando `apiFetch` de volta da
fachada que os reexporta: **17 ciclos de importação**, num repositório que tinha zero. `morto:ciclos`
(madge) é portão de CI e teria barrado o merge.

A correção moveu a folha para fora da fachada (`src/data/funil.ts` e `src/data/efemero/nucleo.ts`),
e os ciclos voltaram a zero.

## 6. Três ADRs, e os três corrigem o diagnóstico da auditoria

| ADR | o que a auditoria dizia | o que a medição mostrou |
|---|---|---|
| **0002** — pareamento de recompensa | "cálculo de seeds duplicado em 3 lugares" | os valores já tinham fonte única; o que se repetia era o **pareamento** XP↔Seeds. Unificar traria estado de tela para dentro do núcleo. Um teste compara as três tabelas — e **já achou uma divergência**: a missão "capturar" do Hub promete o XP de *salvar a sessão* com os Seeds de *cinco minutos gravados*, então quem grava dois minutos recebe o XP e nenhum Seed |
| **0003** — montagem de rodada | "closure de componente, sem teste" | confirmado, e resolvido (§2) |
| **0004** — normalização de texto | "15 cópias de `normalize('NFD')`" | são **três perguntas diferentes**: identidade de palavra (remove espaço), comparação de texto (preserva espaço), alfabeto de grade (só A-Z, maiúsculo). Unificar quebraria a comparação de frases. Só a segunda estava duplicada, em quatro variantes que diferiam apenas no tratamento de espaço |
| **0005** — configuração | plano previa schema Zod para as 60 leituras | das 60, **zero** estavam fora do inventário. O que escapava eram as **duas leituras montadas** (`process.env[nome]`), invisíveis ao grep, ao inventário e à regra ao mesmo tempo — e a lista de exceções cobria só `PRO_*` e `ESSENCIAL_*`, enquanto o código aceita os quatro planos |

Os testes dos ADRs também corrigiram **suposições minhas**, o que vale registrar: `ł` sobrevive à
chave de palavra (é letra); quem o apagava era a grade, restrita a A-Z. E sobreposição de fala com
um único falante devolve `null`, não zero.

## 7. Não-determinações pré-existentes encontradas no caminho

- `buildRodadasEscuta`, `buildRodadasDitado` e `buildRodadasConectores` chamam `embaralhar` **sem
  semente**: com mais falas que o teto do jogo, até o *conjunto* de itens varia entre duas
  montagens idênticas.
- `minimo` com `exerciseKind === ''` (`metrics.ts:319`, `servidor.ts:820`): o `&&` devolve string
  vazia, que o `>=` coage para 0 — qualquer rodada vira "perfeita".
- `SpeakOptions.lang` é obrigatório e cinco chamadas passavam `undefined`; o comentário de `tts.ts`
  afirmava que isso "só acontece por chamada sem tipos", e não era verdade.

## 8. O que fica para a continuação

- **Movimentação por domínio** dos 349 arquivos: a árvore, o mapa e a ordem estão prontos e
  aprovados; os portões já sobrevivem a ela.
- **Passada geral do Prettier** (1.111 arquivos), por decisão, depois das movimentações.
- `aoTerminar` e o acervo da prática continuam em `Play.tsx`: são cadeias de `useMemo`/`setState`
  sobre dez ou mais valores locais, e movê-las hoje trocaria uma closure por uma função de doze
  parâmetros **sem ganhar teste** — o oposto do que a extração de `montarRodada` comprou.
- Glossário e catraca de idioma de identificadores.

## 9. Bateria verde ao fim da fase

`typecheck` · `typecheck:core` · **`typecheck:estrito`** · `lint --max-warnings 0` · `knip` ·
**`madge` (zero ciclos)** · **3.755 testes** · `build` · i18n (4 portões) · `audit:gate` ·
`ast-grep test` (6 fixtures) + `scan` · `rotas-sem-caracterizacao` · `rotas-sem-consumidor` ·
e2e nos três viewports.

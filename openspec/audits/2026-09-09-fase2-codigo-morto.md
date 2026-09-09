# Fase 2 — Código morto (entregável do Gate 2)

Rodada de saneamento, branch `saneamento/2026-09-08`. Cada remoção tem a ferramenta que apontou, a
verificação manual contra referência dinâmica e a bateria verde depois. Nada foi removido sem
prova, e — o que acabou sendo o achado da fase — nem tudo que uma ferramenta chama de morto é
morto.

## 1. O que as ferramentas achavam, e o que era

| Categoria | Ferramenta | Antes | Depois | Ação |
|---|---|---:|---:|---|
| Arquivos sem uso | knip | 0 | 0 | já é portão no CI |
| Dependências sem uso | knip + depcheck | 0 | 0 | idem |
| Ciclos de importação | madge | 0 | 0 | idem |
| Exports sem uso | knip | 16 | 8 | 8 removidos, 8 são barril |
| Tipos sem uso | knip | 15 | 13 | 2 removidos (+2 em cascata), 13 são barril ou divergentes |
| Exports duplicados (named + default) | knip | 2 | 0 | o nomeado saiu |
| Chaves de i18n órfãs | `i18n:orfas` | 0 | 0 | já é portão |
| Classes de CSS sem consumidor | script novo | 9 | 1 | 8 removidas; a que fica é dinâmica |
| Rotas sem consumidor | script novo | 6 | 0 órfãs | nenhuma removida — ver §3 |

Saldo: **10 inserções, 155 deleções** em código; `src/index.css` de 1.776 para 1.760 linhas.
Arranque do bundle: 210,0 → 209,9 KB gz (a poda de CSS escrito à mão não muda peso de forma
mensurável; muda o custo de ler o arquivo).

## 2. Os 33 itens do knip, classificados

A casa não cobra export sem chamador, por decisão escrita no `ci.yml`: re-export de barril produz
falso positivo. A verificação que a ferramenta não faz — `grep` do nome no repositório inteiro,
inclusive strings, `.mjs`, `.md`, workers e o espelho anônimo — separou os 33 em cinco categorias:

| Categoria | Quantos | O que aconteceu |
|---|---:|---|
| (a) morto de verdade | 8 | removidos, junto com o que só eles usavam |
| (b) re-export de barril | 19 | mantidos, com o consumidor real anotado |
| (c) cópia sem consumidor | 2 | o re-export saiu, a origem ficou |
| (c) **divergentes** | 2 | intactos — não são o mesmo tipo (§4) |
| (d) só testes usam | 2 | mantidos, já documentados no arquivo |
| (e) nomeado + default | 2 | o nomeado saiu |

Removidos: `calculateMultiplier`, `LearningMetric` + `MetricSource`, `Flashcard` + `CefrBadge`,
`isModelCached`, `bytesFaltando`, `StatPill` (com quatro imports que ficaram órfãos).

## 3. As seis rotas sem tela — e por que nenhuma foi removida

O script novo `scripts/testes/rotas-sem-consumidor.mjs` faz a pergunta que faltava (a inversa de
`rotas-espelhadas.test.ts`) e achou seis rotas que nenhum código de `src/` chama. **Nenhuma é
código que sobrou de algo removido**: todas são capacidade de servidor pronta e testada cuja tela
nunca foi feita. Apagá-las destruiria trabalho e transformaria uma lacuna de produto em lacuna de
servidor.

| Rota | Situação |
|---|---|
| `DELETE /api/ai/credentials/:id` | **Lacuna de produto, vai para a Fase 4**: o funil tem `listCredentials` e `createCredential` e nenhuma função de apagar. Quem cola uma chave de IA hoje não consegue removê-la pela interface. O servidor responde 200 e 404, coberto por teste |
| `GET /api/vocab/distribuicao-dificuldade` | sem tela; o dado só passou a existir quando `recalcularDificuldade` ganhou gatilho na rodada |
| `GET /api/vocab/:id/ocorrencias` | "onde eu vi esta palavra" existe no servidor e no repositório; nenhuma tela abre |
| `GET /api/anki/imports/:id` | a importação de hoje é síncrona; o ledger existe para a assíncrona que `motor-anki-*` planeja |
| `POST /api/ai/llm/chat/completions` | achado A52 de 07/09. O adapter do navegador fala direto com o provedor; esta rota é o único caminho que usa o segredo cifrado no servidor |
| `GET /api/sessions/:id/capa` | a Biblioteca renderiza a `data:` URI direto; esta rota serviria a capa como binário |

O script se exclui da própria varredura: ele cita todas as rotas nas justificativas e, lendo a si
mesmo, daria toda rota como viva — um portão que passa sempre é pior que portão nenhum.

## 4. Duas divergências reais (entram na Fase 3 como ADR)

1. **`ExerciseResult`** — `src/core/learning/contract.ts:144` × `server/db/repositories/exerciseResults.ts:8`.
   Não são o mesmo tipo. O do contrato é um DTO de resultado (`kind` com seis valores, `correct`
   booleano); o do servidor é a linha da tabela (`$inferSelect`), onde `score` é um `real` que
   guarda **três unidades diferentes** conforme `exercise_kind`. Unificar exige decidir se o DTO
   vira o `insert` da tabela ou desaparece.
2. **`LeituraAnki`** — `src/data/api.ts:494` × `server/import/anki.ts:73`. A cópia do cliente é um
   subconjunto vencido: faltam `baralhos`, `truncado`, `totalNoArquivo` e `mapaDeMidia`. A remoção
   já estava pendente na change arquivada `contratos-alinhados-nas-tres-pontas` (tarefa 3.3) e
   depende da reescrita da tela de importação.

## 5. Correção ao baseline: a duplicação medida estava inflada

O baseline de 08/09 registrou "171 clones, 23.459 linhas duplicadas, 16,2 %". O número contava
**JSON e CSS**: 108 dos 171 clones são snapshots de migração do Drizzle e catálogos de i18n, onde
repetição é o formato, não defeito.

Medindo só código (`--format typescript,tsx`): **48 clones, 649 linhas, 0,70 %**. É esse o número
que a Fase 3 deve baixar, e a concentração diz onde:

| linhas | arquivos |
|---:|---|
| 40 | `culturais/ChoseongGame.tsx` × `culturais/TenseTennisGame.tsx` |
| 34 | `culturais/BaoGame.tsx` × `culturais/KofferGame.tsx` |
| 32 | `shell/MenuDaConta.tsx` × `shell/MenuDeConforto.tsx` |
| 29 | `views/Play.tsx` (consigo mesmo) |
| 28 | `DitadoGame.tsx` × `ScrambleGame.tsx` |
| 26 | `ConectoresGame.tsx` × `EscutaGame.tsx` |
| 23 | `core/learning/keywords.ts` × `core/learning/quality.ts` |

O padrão dominante é o andaime da rodada repetido entre minijogos (relógio, pontuação, resposta
certa/errada). É exatamente o que o ADR de montagem de rodada da Fase 3 ataca.

## 6. Portões novos

- `node scripts/testes/rotas-sem-consumidor.mjs` no `ci.yml`: rota registrada sem chamador e sem
  razão escrita derruba a run.
- O gate de classes de CSS ficou como script de medição, não como portão: a checagem exige
  interpretar concatenação (`age-${perfil}`) e um falso positivo aqui pararia o CI por um nome que
  o TypeScript não vê. Fica no relatório, e a próxima medição o compara.

## 7. Documentos vencidos corrigidos

- `src/components/minigames/culturais/README.md` afirmava que os nove jogos não eram alcançáveis
  por rota nenhuma. Eles voltaram em 08/09, `telaDoJogo.ts` os importa, e o e2e cobra que estejam
  na grade. Reescrito.
- `AUDITORIA-ESTADO.md` saiu da raiz para `docs/auditoria/2026-09-02-ux-e-economia-estado.md`, com
  cabeçalho dizendo que é histórico. O conteúdo não foi alterado.
- `server/ai/llmRequest.ts:8` dizia "a rota usa a chave do dono, sem auth". `/api/gemini/chat` está
  atrás do `authMiddleware` desde `server.ts:171`.
- `tsconfig.json`: a nota sobre `_graveyard/` descrevia um diretório que não existe mais.

## 8. Bateria verde após a fase

`typecheck` · `typecheck:core` · `lint --max-warnings 0` · `knip` · `madge` · **3.684 testes** ·
`build` · i18n (pseudo, órfãs, cobertura, piso 420) · `audit:gate` · `ast-grep test` + `scan` ·
`rotas-sem-caracterizacao` (0 sobrando) · `rotas-sem-consumidor` (0 órfãs).

Cobertura: linhas 43,80 % · ramos 35,26 % · funções 37,60 % — acima do piso, sem queda.

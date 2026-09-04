# Mapa da aplicação — o que está conectado e o que está solto

Grafo de conhecimento gerado em 2026-08-30 com o `graphify`: extração estrutural (AST) de 614
arquivos de código + extração semântica de 50 documentos.

**Saída interativa: `graphify-out/graph.html`** — abre em qualquer navegador, sem servidor.
(`graphify-out/` está no `.gitignore`: é reconstruível.)

| | |
|---|---|
| Nós | 4.041 |
| Arestas | 9.858 |
| Comunidades | 258 (187 com massa) |
| Procedência das arestas | **98% EXTRAÍDAS**, 2% inferidas, 0% ambíguas |

A procedência importa: quase tudo aqui é fato tirado de `import`/`call` reais, não inferência de
modelo. As 149 arestas inferidas vêm dos documentos e têm confiança média de 0,83.

---

## 1. O código está bem conectado — o buraco está na fronteira HTTP

De **2.815 nós da aplicação, apenas 8 estão ilhados** (grau zero) — e os 8 são arquivos `.sql` de
migração, que por natureza ninguém importa: o migrador os lê em tempo de execução.

Ou seja, **não há ilhas de código**. Mas isso não quer dizer que não haja pontos soltos: quer dizer
que eles não estão onde um grafo de AST consegue olhar.

**O grafo não atravessa a fronteira HTTP.** O cliente chama `fetch('/api/metrics/presenca')` — uma
*string*, não uma função. Para o AST, a chamada morre ali; do outro lado, a rota do servidor é um
nó sem ninguém apontando para ele. As duas metades ficam desconectadas no grafo mesmo quando
funcionam, e conectadas na aparência mesmo quando não funcionam.

Foi por isso que os pontos soltos reais apareceram **inspecionando a rede com a aplicação rodando**,
não no grafo (ver `seguranca-v1.md` §4): três rotas que o cliente chama e o servidor real não tem.

**Lição de método:** grafo estático e observação em execução acham coisas diferentes. Nenhum dos
dois sozinho responde "o que está solto?".

## 2. Código morto — três módulos que ninguém importa

Dos 16 nós nunca referenciados, treze têm explicação legítima: `main.tsx` é a entrada do Vite
(referenciada pelo `index.html`), `migrate.ts` roda por `npm run db:migrate`, os `.sql` são lidos
pelo migrador, `env.d.ts` e `tsconfig.json` são configuração, e os três *workers*
(`mtWorker`, `whisperWorker`, `speakerIdWorker`) são carregados por `new Worker(new URL(…))` — que
o AST não enxerga.

Sobram três, verificados um a um por busca no código:

| módulo | linhas | situação |
|---|---|---|
| `src/gateway/ocr.ts` | 128 | **OCR completo com Tesseract.js, nunca importado.** Nenhuma tela chama |
| `src/gateway/adapters/streamingCloudStt.ts` | 67 | Stub de Deepgram/AssemblyAI, **não registrado em `resolveStt` nem em perfil nenhum** |
| `server/db/repositories/index.ts` | 27 | Barril com 30 reexportações que ninguém importa (todos importam direto) |

O `ocr.ts` é o mais notável: é implementação real e funcional de reconhecimento de texto em imagem,
com ciclo de vida de worker e caixas em pixels, **pronta e desligada**. Ou virou funcionalidade
esquecida, ou a tela que a usaria nunca foi feita.

## 3. Os centros de gravidade

Os dez nós mais conectados dizem onde o peso arquitetural está:

| nó | arestas |
|---|---|
| `Play()` | 86 |
| **`apiFetch()`** | 77 |
| `LiveCapture()` | 73 |
| `AgeProfileType` | 73 |
| `asUserId()` | 60 |
| `App()` | 52 |
| `setupEphemeralDb()` | 52 |
| `EphemeralDb` | 51 |
| `VocabCard` | 50 |
| `Analysis()` | 42 |

Dois merecem comentário. **`apiFetch()` com 77 arestas confirma que o "funil único" é real** — é a
invariante que a regra `fetch-fora-do-funil` guarda, e o grafo mostra que ela é obedecida em quase
todo lugar (as duas exceções estão em `src/lib/ranking.ts`, ver `seguranca-v1.md` §3).

**`asUserId()` com 60 arestas** mostra que o `UserId` marcado por tipo permeia o servidor inteiro —
que é exatamente o desenho pretendido para impedir vazamento entre contas.

`Play()` e `LiveCapture()` no topo confirmam o óbvio de outra forma: são os dois maiores arquivos do
projeto (2.581 e 4.009 linhas) e concentram responsabilidade demais. Já estava na fila de
decomposição.

---

## Como reproduzir

```bash
graphify .                # reconstrói tudo
graphify query "pergunta" # navega o grafo já construído, sem reconstruir
```

## O que este mapa NÃO mostra

- **Chamadas HTTP** (§1) — a maior fonte de desconexão real deste produto.
- **Carregamento dinâmico**: `new Worker(new URL(…))`, `lazyComRecarga(() => import(…))` e as rotas
  registradas por string. Três dos "órfãos" são falsos positivos por essa razão.
- **Se o código é bom.** Conectividade não é qualidade: um módulo pode estar bem conectado e errado.

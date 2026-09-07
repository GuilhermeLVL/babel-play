# Auditoria de performance — edição leve (2026-08-27)

Pergunta do dono: "a aplicação está leve, rápida e performática?" Método: medir primeiro
(build de produção + navegador), otimizar só o que os números apontarem, sem mudar comportamento.

## 1. Peso de rede no arranque (build `--mode leve`)

O que o navegador baixa ao abrir o app, medido no grafo real de imports do `dist/`:

| Recurso | Tamanho | Quando carrega |
| --- | --- | --- |
| `index-*.js` (entry) | 282 KB | boot |
| `vendor-react` | 189 KB | boot (modulepreload) |
| CSS | 164 KB | boot |
| `en-*.js` (ícones lucide + bandeiras) | 237 KB | só com Play/Perfil/Analysis (lazy) |
| `vendor-supabase` | 214 KB | NUNCA na leve (dynamic import atrás de gate, F0-08) |
| workers (whisper/mt/speakerId) | ~1,5 MB | só quando a função é usada |

Veredito: **o grafo já está saudável.** O boot custa ~635 KB (pré-gzip); tudo pesado é lazy.
O chunk `en-*` parecia um dicionário de inglês suspeito — é o bundle de ícones (license header
do lucide-react confirma), compartilhado pelas views lazy, e não entra no boot. Nenhuma ação.

## 2. Custo de runtime encontrado e corrigido

### 2a. rAF eterno do ParticleCanvas com zero partículas
Com ambiente desligado (perfil sênior, painel de leitura) e nenhuma rajada viva, o loop ficava
limpando um canvas de viewport inteira a 60 fps para sempre — CPU/bateria por nada.
**Fix:** o loop DORME quando `particles.length === 0` e a fila está vazia; o barramento
(`onBurst` → `wakeRef`) o acorda no próximo pedido, com `lastTs` zerado para o `dtReal` do
cochilo não matar a rajada nova. Com ambiente ligado nada muda (sempre há partícula viva).

### 2b. localStorage + JSON.parse por PARTÍCULA
`emojisDoPack()` era chamado dentro do loop de spawn — dezenas de leituras síncronas por
comemoração. **Fix:** lido uma vez por rajada (`packDaLoja`).

### 2c. localStorage a cada pointermove
O rastro do mouse lia `babel.rastro` em todo movimento, antes do acelerador. **Fix:** o
throttle de 45 ms vem primeiro; a leitura caiu para ≤22/s no pior caso (e zero em repouso? não —
só quando o ponteiro se move, que é o gatilho do evento).

### 2d. Rajada invisível em aba estrangulada (bônus de correção)
Partícula recém-nascida pagava o `dtReal` do quadro em que nasceu; com rAF a ~1 fps
(aba sem foco/minimizada) uma faísca de 650 ms morria antes do primeiro desenho.
**Fix:** flag `nova` — o primeiro quadro não desconta vida. Validado por pixel-diff no
navegador estrangulado (antes: rajada nunca pintava; depois: pinta).

## 3. O que foi checado e NÃO precisa de ação

- Long tasks no boot: nenhuma registrada (PerformanceObserver `longtask`).
- Heap após boot: ~42 MB (dev server; produção tende a menos).
- Supabase na leve: já é dynamic import atrás de `temSupabase` (F0-08) — não baixa nem conecta.
- Teto de 420 partículas vivas + poda que preserva o ambiente: segue valendo por cima dos
  multiplicadores da loja (`ajusteDeBurst` tem teto duro 2.2×/2×).
- `dist/` de 69 MB inclui 37 MB de wasm do onnxruntime — servido sob demanda, não afeta o boot.

## Verificação

`tsc` limpo, ESLint limpo, suíte completa 1856 ✔ (0 falhas), smoke no navegador em
http://localhost:5199 (rajada pinta, ambiente segue vivo, rastro funciona).

---

# Medicao de 2026-09-07 (change `arranque-leve-e-payloads-enxutos`)

Reprodutivel: `npm run build && node scripts/perf/medir-rotas.mjs --api=http://127.0.0.1:<porta>`,
com o servidor de dev sobre COPIA do banco real (2.818 cartoes), 15 repeticoes por rota, via
`127.0.0.1` — nao `localhost`, que no Windows custa ~200 ms de fallback IPv6 e mascara tudo.

## Antes e depois

| Medida | Antes | Depois | O que mudou |
| --- | --- | --- | --- |
| `GET /api/metrics/profile` | 95 ms p50 | **43 ms p50** | as cinco consultas do perfil pararam de fazer `SELECT *` |
| Perfil por abertura da tela de Metricas | 2 chamadas (~190 ms) | **1 chamada (~43 ms)** | `Metrics` recebe o perfil do `App` em vez de buscar de novo |
| `GET /api/vocab` por rodada | 1 por rodada (2,17 MB) | **0** | o baralho e costurado com o que `reviewCard`/`bulkAddCards` ja devolvem |
| Aviso de import misto no build | 1 | **0** | `eventosDeJogo` importado de uma forma so |
| Arranque (o que o `index.html` pede) | 211,9 KB gz | 211,8 KB gz | ver abaixo |

## O arranque: por que o alvo de 120 KB nao se aplica mais

A proposta pedia arranque < 120 KB gzip, e o numero fazia sentido quando foi escrito: o chunk de
entrada continha o catalogo mestre de cosmeticos (129 KB de fonte), arrastado por
`export * from './catalogoMestre'` no barril do nucleo. Essa camada saiu de `main` na change
`linha-de-base-verde` (foi para a branch `gamificacao-v2-wip`), e com ela o motivo do alvo.

O arranque medido hoje sao tres arquivos, e nenhum deles e gordura evidente:

```
   125,8 KB gz  index-*.js      (o app)
    59,3 KB gz  vendor-react    (react + react-dom + scheduler)
    26,8 KB gz  index-*.css
```

O `vendor-supabase` (56 KB gz) NAO conta: `src/lib/supabase.ts` o carrega por `import()` e so
quando ha URL e chave. A primeira versao do script de medicao somava tudo que se chamasse
`vendor-*` e anunciava 392 KB — um numero inflado que teria mandado otimizar o lugar errado.

Cortar os 125,8 KB restantes exige decidir o que sai da primeira pintura, e isso e trabalho de
produto (que tela abre primeiro), nao de bundler. Fica registrado com o numero, para a proxima
conversa comecar de um fato.

## O que continua grande, e por que nao foi mexido agora

`GET /api/vocab` responde **2,17 MB** em 134 ms. Ele deixou de ser chamado a cada rodada, mas
continua sendo o que o lobby baixa ao abrir. Trocar por um `resumo` agregado exige decidir o que
acontece com o FALLBACK LOCAL: `composicaoLocal` monta a rodada no cliente quando o servidor nao
responde — e e o unico caminho no modo anonimo. Sem o baralho em maos, esse fallback deixa de
existir, e a promessa "local-first" cai junto. A decisao pertence a `modo-anonimo-em-paridade`,
que e a change dona da paridade entre as duas pontas.

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

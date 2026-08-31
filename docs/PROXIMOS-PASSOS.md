# Próximos passos — Babel Play

Documento vivo. Existe para você **não reconstruir contexto** ao voltar cansado: o que está pronto,
o que falta, e em que ordem. Atualizado em 2026-08-31 (pós E1–E5).

---

## Onde o produto está

**Funciona e está medido.** As duas metades do plano pago têm vantagem comprovada em número, não em
promessa:

| | grátis (navegador) | pago (nuvem) |
|---|---|---|
| Erro de transcrição (WER) | 57% | **24%** |
| Tradução (chrF++) | 57% | **85%** |
| Expressão idiomática | 27% | **83%** |
| Download inicial | 230–413 MB | nenhum |

Método e ressalvas: `docs/auditoria/eval-producao-v1.md`.

**A cobrança agora EXISTE em código** (Asaas: assinar, webhook idempotente, cancelar — 2.067
testes) e falta só o teste com a conta sandbox real. Três planos: Grátis, **Essencial R$ 9,90**
(tradução de nuvem, transcrição local) e Pro R$ 19,90 — todos derivados de uma matriz única
(`src/core/planos.ts`). Observabilidade fechou o laço: erro do navegador vai ao diário, o diário é
lido em `/api/admin/erros`, e um workflow de uptime abre issue quando a produção cai. LGPD tem
interface (Perfil → Seus dados), e as páginas de privacidade e termos existem e estão linkadas.

---

## Decisões que só você pode tomar

Estas travam trabalho. Estão detalhadas em `docs/auditoria/decisao-infraestrutura-v1.md`.

1. ~~Provedor de pagamento~~ — **DECIDIDO: Asaas** (2026-08-31). Implementado; falta a conta.
2. ~~Preço~~ — **DECIDIDO: Essencial R$ 9,90, Pro R$ 19,90, só mensal no lançamento.**
3. **Criar a conta Asaas (CNPJ) e a chave SANDBOX** → preencher `ASAAS_API_KEY` e
   `ASAAS_WEBHOOK_TOKEN`, cadastrar o webhook no painel apontando para
   `/api/billing/webhook/asaas` — e aí rodamos o ponta a ponta de verdade.
4. **Criar conta DeepInfra** (~US$ 5 pré-pago) → medir o STT 3,3× mais barato com o harness
   (`STT_BASE_URL/STT_API_KEY/STT_MODEL`; a troca é env).
5. **Definir `HEALTH_URL`** nas variáveis do repositório do GitHub quando houver produção — arma o
   vigia de uptime.
6. **Revisão humana dos textos legais** (`public/privacidade.html`, `public/termos.html`): escritos
   do comportamento real do código, mas texto legal merece um segundo par de olhos antes do ar.
7. Crédito no OpenRouter (~US$ 5) — opcional, só para fechar a comparação de modelos.

---

## Fila de trabalho

### A — Não depende de nada seu

| # | Tarefa | Por que importa |
|---|---|---|
| A1 | ~~Backup do banco~~ — **JÁ EXISTE e funciona** | `npm run backup` faz `VACUUM INTO` (não cópia de arquivo, que sob WAL corromperia), verifica `integrity_check`, confere contagens, inclui a mídia e rotaciona. Rodado em 31/08: OK. Falta só **agendar** em produção. |
| A2 | ~~Varredura de segurança~~ — **FEITA** | gitleaks, Trivy e as regras `ast-grep` do projeto. Resultado em `docs/auditoria/seguranca-v1.md`. Só o Semgrep ficou de fora (Docker parado). |
| A3 | ~~Workflow de deploy~~ — **FEITO (31/08)** | `.github/workflows/deploy-pages.yml`: manual (workflow_dispatch), desarmado até os secrets `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` existirem; valida (typecheck+testes+audit) antes de publicar `build:leve` via wrangler (mantém o binding D1 do ranking). |
| A4 | ~~Cascata com gratuito primário~~ — **FEITA** | `LLM_RESERVA_*` no mtProxy: falha do primário cai para a reserva; quota debitada uma vez, testado. Falta só APONTAR as envs. |
| A5 | ~~Rótulo `engine`~~ — **FEITO (31/08)** | `'server-llm-mt'` no lugar de `'groq-llm'`; VocabularyPanel mantém as duas chaves para sessões antigas. |
| A6 | ~~Teste de carga~~ — **FEITO no build de produção (31/08)** | `node dist-server/server.cjs` + sonda de 10s por rota: `/api/health` 4.560 req/s (p95 12ms), estático `/` 878 req/s (p95 42ms), `POST /presenca` 2.136 req/s (p95 12ms), zero falhas (429 do rate limiter conta como tratado). Os 26 req/s antigos eram o Vite no meio. Para o lançamento indie, capacidade não é gargalo. |

### A7 — ~~economia v2 sem metade servidor~~ — **FEITO (31/08)**

Rotas `POST /api/metrics/presenca` e `POST /api/metrics/seeds/creditar` implementadas espelhando o
servidor efêmero (migração 0015: `seed_credits` + `presencas`, idempotência por índice parcial,
janela de ±2 dias na presença); `computeProfile` devolve os campos e a ofensiva usa a MAIOR entre
revisar e aparecer. 7 testes em `tests/integration/economia-v2.test.ts`. Verificado ao vivo: no
primeiro carregamento o app creditou sozinho as conquistas represadas pelos 404.

#### O achado original (histórico)

Encontrado em 2026-08-30, verificando a tela nova no navegador: duas rotas que o cliente chama
**não existem no servidor Express** e respondem 404.

| chamada do cliente | servidor real | servidor efêmero (modo sem conta) |
|---|---|---|
| `POST /api/metrics/presenca` | **404** | existe (`efemero/servidor.ts:627`) |
| `POST /api/metrics/seeds/creditar` | **404** | existe (`efemero/servidor.ts:626`) |
| `POST /api/metrics/seeds/gastar` | existe | existe |

O servidor expõe só `/profile`, `/xp` e `/seeds/gastar` (`server/routes/metrics.ts:20,38,59`).

**Consequência visível:** `src/lib/conquistas.ts:6` diz, corretamente, que sem o crédito a conquista
NÃO é marcada — "nunca conquistada sem as Seeds". Só que a falha não é de rede, é permanente: a
rota não existe. Ou seja, **na conta logada as conquistas nunca desbloqueiam**, e a tentativa se
repete a cada avaliação (foram 3 chamadas num único carregamento de página).

Vale notar a inversão: **o modo SEM conta funciona e o modo COM conta não** — o servidor em memória
da edição leve implementa as duas rotas.

**Por que não corrigi agora:** não é conserto, é implementação. Não existe tabela de créditos no
schema (só `seed_spends`), então fechar isso exige migração, repositório, rotas e testes de
idempotência — e o desenho pretendido é decisão de produto (o que a presença credita, o que uma
conquista credita, se o saldo passa a ser evento ou continua derivado). O cliente foi escrito em
2026-08-28 supondo um servidor que nunca veio.

### A8 — ~~Código morto~~ — **FEITO (31/08)**: `streamingCloudStt.ts` e `repositories/index.ts` removidos; `ocr.ts` FICA (decisão registrada em openspec/changes/vision-ocr-web).

Três módulos que ninguém importa (`docs/auditoria/grafo-v1.md` §2):

| módulo | linhas | o que fazer |
|---|---|---|
| `src/gateway/ocr.ts` | 128 | OCR real e funcional (Tesseract.js), **desligado**. Ligar ou remover |
| `src/gateway/adapters/streamingCloudStt.ts` | 67 | Stub nunca registrado em perfil nenhum. Remover |
| `server/db/repositories/index.ts` | 27 | Barril que ninguém importa. Remover |

### B — Cobrança — **FEITA em código (2026-08-31)**

| # | Tarefa | Estado |
|---|---|---|
| B1 | Webhook Asaas → `subscriptions` | ✅ idempotente por id de evento, com desmarque em falha (os dois lados testados) |
| B2 | Tela de assinatura | ✅ `views/planos/Assinar.tsx` — inicia e abre o link; quem promove é só o webhook |
| B3 | Testes de idempotência | ✅ 7 cenários em `tests/integration/billing-webhook.test.ts` |
| B4 | **Ponta a ponta no sandbox real** | ⏳ depende da conta Asaas (item 3 acima) |

### C — Depende de crédito no OpenRouter

| # | Tarefa |
|---|---|
| C1 | Finalistas no FLORES-200 e no gold set de 60 (parou na 84ª de 800 chamadas, HTTP 402) |
| C2 | Trocar o roteador para OpenRouter (3,7× mais barato, mesmo modelo) |
| C3 | Registrar a política de uso de dados do provedor recomendado |

### D — Melhorias de qualidade já identificadas

| # | Tarefa | Estado |
|---|---|---|
| D1 | Fala de 1-2 palavras: 167% de WER no modelo local | É segmentação, não modelo. Alvo mais alto. |
| D2 | Banda estreita (telefone, 8 kHz): DER 25% | Pior caso de microfone, em aberto. |
| D3 | Áudio do microfone não é diarizado | Várias pessoas no mic caem todas em "Você". |
| D4 | Importação usa Whisper local (57% WER) | Poderia usar a nuvem (24%) — agrupar ali é livre. Decisão de produto. |

---

## Armadilhas já pagas — não repetir

- **Antes de construir, procure.** Eu anotei "não existe rotina de backup" e ela existia, completa e
  boa (`scripts/backup.mjs` + `scripts/diagnosis/verificar-backup.mjs`). Uma anotação errada num
  documento de próximos passos é pior que nenhuma: manda refazer o que está pronto.


Estas custaram tempo. Estão aqui para não custarem de novo.

- **Há DUAS cópias do produto** com históricos git independentes. `babel-play-lab` é a de produção;
  `TradutorWeb` é a de engenharia. Trabalho feito na errada não migra por merge.
- **Um harness infiel mede outro produto.** Três vezes nesta sessão uma medição disse o oposto da
  verdade por defeito do medidor: filtro de alucinação aplicado onde a produção não aplica; idioma
  não passado ao filtro; falha de cota contada como erro do modelo.
- **Falha de infraestrutura não é erro do modelo.** 429 e 402 contados como resposta ruim invertem
  qualquer conclusão. Sempre separar.
- **Resposta vazia não é nota zero.** Mistura "traduziu errado" com "não respondeu".
- **16 casos não rankeiam modelos.** O mesmo modelo variou 11,3 pontos entre execuções idênticas.
- **O chrF++ subestima fala natural.** "Tá chovendo pra caramba" tira 32% e é a melhor tradução do
  conjunto. Para este produto o juiz é a métrica primária.
- **Modelo de raciocínio pode devolver vazio** dentro de um `max_tokens` que parece folgado, sem
  erro nenhum do provedor.
- **Preços e modelos somem sem aviso.** O `llama-3.3-70b-versatile` saiu do plano self-serve em
  dias e derrubou a tradução de nuvem em silêncio.

---

## Como rodar

```bash
npm run dev:local        # sobe sem login, em http://localhost:3100
npm run typecheck
npx vitest run           # 2.041 testes
openspec list            # mudanças especificadas
```

Medições (o corpus de áudio está fora do git; o manifesto está versionado):

```bash
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-wer.mjs --modelos tiny,base,nuvem
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-der.mjs
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-traducao-llm.mjs --corpus fala
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/julgar-traducao.mjs   # juiz local, via Ollama
```

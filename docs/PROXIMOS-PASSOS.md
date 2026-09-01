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

## ⇒ ONDE O PRODUTO ESTÁ (01/09)

A rodada de 31/08–01/09 fechou a **economia legível** (protótipo aprovado pelo dono em artifact):

- **Passe cheio**: 25 itens novos nas décadas 5–10 (packs, cursores e rastros montados do que já
  existia), cofres derivados e o marco de cada dezena com o item mais raro. **Nenhuma casa vazia**,
  travado por teste — antes eram 33 vazias e 8 dos 10 marcos ocos.
- **Régua das quatro origens** (nível · Seeds · conquista · créditos): cor e ícone por token, "Meu
  visual" agrupado por como o item foi conseguido, raridade fora dos hex crus, e o ícone deixou de
  ser sorteado da descrição por regex.
- **Moeda comprada**: razão `credit_purchases`/`credit_spends` com saldo derivado, cobrança avulsa
  no Asaas, e o **bug do webhook corrigido** (todo pagamento confirmado promovia a plano — uma
  compra de créditos daria assinatura de graça).
- **Telas de compra**: Passe (R$ 14,90) e pacotes (100/300/700), que só aparecem com billing
  configurado.
- **Minhas Palavras** entrega palavras (a lista estava escondida atrás do botão "Mais"), o export
  exporta o caderno, e a captura avisa quando os dois idiomas são iguais.
- **Sobre** reescrito: aprender é grátis e sem conta; paga-se nuvem e enfeite.
- **Gravar Áudio**: os três cartões de cenário viraram dois interruptores diretos.

**O que trava em você:** conta Asaas + chave sandbox (sem ela a compra responde 501 e as telas de
venda não aparecem), DeepInfra, secrets do Cloudflare, revisão dos textos legais — e a decisão
sobre perdoar o rombo histórico de Seeds (2.120 gastas contra 615 ganhas prendem o saldo em 0).

**Pendências anotadas:** unificar o cartão de item nas 4 abas (`economia-legivel-e-moedas` 2.5),
mesada mensal de créditos por plano e catálogo premium (`economia-de-creditos` 2.3/2.4), e as
divergências de sistema de design fora da economia (Hub, Library, Analysis — mapeadas no artifact).

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

### E — Tela de jogos: auditoria feita, redesenho pendente (01/09)

Auditoria completa em **`docs/auditoria/tela-de-jogos-v1.md`** — 48 achados confirmados de 49
propostos, cada um verificado por um cético que tentou refutá-lo no código. O protótipo navegável do
redesenho está em **`docs/prototipos/jogos-redesign.html`**. Os códigos `F01…F49` abaixo referenciam
achados daquele documento.

**O que a auditoria mudou no pedido:** a separação "trilha × conteúdo capturado" **já existe e está
bem construída** (`src/core/minigames/source.ts:23`, partição exclusiva em `:74-98`, e o servidor
concorda em `server/db/repositories/vocab.ts:476-486`). O trabalho não é construir a separação — é
torná-la legível na tela. Ver a armadilha logo abaixo.

#### E1 — Defeitos de correção (não dependem do redesenho)

Estes quebram promessas que a tela faz. Valem conserto isolado, na ordem que der.

| # | Defeito | Onde |
|---|---|---|
| F02 | O botão **"Jogar"** da Sala de Escolha **não joga** — ícone de play, foco inicial, e só troca a fonte | `SalaDeEscolha.tsx:364` → `aplicarEscolha` (`Play.tsx:1136`) |
| F08 | Escolher "Trilha" **sem nível entrega zero itens**; a tela promete 2.784, depois 704, depois nada | recorte por `fonte.nivel` |
| F11 | **Na trilha, acertar não conta na memória** — e o cabeçalho e as fichas prometem que conta | cartão de trilha nasce com `id:''` (`trilha.ts:147`) |
| F10 | Os jogos de frase **ignoram a fonte escolhida**; a alavanca para trocar a gravação é código morto | `Play.tsx:437`; seção `:2188-2210` inalcançável |
| F45 | **Falha de rede aparece como "Você ainda não salvou palavras"** | `Play.tsx:937-952`: no ramo de erro `deck` fica `null` |
| — | A **fonte guardada nunca é restaurada** para quem não tem gravações (escolheu "Trilha B1", volta em "Minhas palavras") | `Play.tsx:972-985`, guard `!sessoes.length` |
| F29 | A conquista **"Colecionador" é matematicamente impossível**; 8 dos 9 jogos não têm festa de combo | `eventosDeJogo.ts:89-92` × os 3 call sites de `executarEfeito` |
| F30 | A única explicação de moeda na tela **ensina uma regra revogada** ("4 por revisão certa"; a tabela viva diz 2) | `Play.tsx:1997` × `xp.ts:61-69` |
| F34 | A chama de dias seguidos **não pode ser movida por jogar**, e o texto afirma que pode | `metrics.ts:279` |
| F25 | O portão de áudio pergunta se o navegador **tem voz**, nunca se há voz **naquele idioma** — e `hasVoiceFor` existe e nunca é chamada | `estadoDosJogos.ts` × `tts.ts:171` |
| F43 | **Dois diálogos modais empilhados** na entrada, e o de cima não move o foco | `App.tsx:879` sobre `SalaDeEscolha` |
| F44 | **Esc dentro da Sala fecha a Sala inteira**, e o seletor de idioma vaza a armadilha de foco | `LangPicker.tsx:150,190` × `SalaDeEscolha.tsx:117` |
| — | **Código inerte** que qualquer refatoração carregaria: a seção `:2188-2210` e o paginador `:2337-2359` (`POR_PAGINA=9` para 9 jogos) | `Play.tsx` |

#### E2 — Redesenho da tela

Medido na tela de hoje: **317 palavras, 57 botões, 27 deles (47%) só para reordenar cartas**, 90
palavras antes de "Escolha um jogo", 3 telas cheias até jogar. O protótipo entrega **189 palavras e
32 botões** no estado padrão, com o mesmo conjunto de recursos.

| # | Tarefa | Por que importa |
|---|---|---|
| E2.1 | Abas de fonte no topo (Trilha · Minhas gravações · Difíceis), com faixa de contexto por fonte | Torna a separação a primeira leitura, em vez de um segredo atrás de "trocar". Resolve F09, F12, F13 |
| E2.2 | Inverter dois defaults: `salaAberta` só quando a fonte guardada não rende rodada, e `pularSempre` ligado | Um clique até jogar. **As duas saídas já existem** (`Play.tsx:2054` e `:2479`) — é default, não construção |
| E2.3 | Reordenar/fixar viram o modo "Organizar" da grade | Tira 27 botões da leitura padrão sem perder o recurso (F07, F47) |
| E2.4 | Refazer as 9 artes: cor = família (palavra/frase/escuta), silhueta = jogo, **uma** metáfora por carta | Hoje 3 artes são o mesmo desenho, Memória e Termo desenham no fundo, e cada carta mostra 2 metáforas (F14–F18) |
| E2.5 | Bloqueio pela porta, não pela falta; descrição e motivo mudam com a fonte | Hoje 4 descrições e 5 fichas afirmam "sua gravação" no meio da trilha (F09, F37) |
| E2.6 | Ficha + antessala viram uma folha de detalhe só, com fatos ≠ zero | "Como se joga" tem 1.203 palavras, 28% delas repetindo o tour (F36, F40) |
| E2.7 | Raspadinha e caminho para a economia na jornada | O único clímax de recompensa do app não chega à tela (F28, F32) |

#### E3 — Trilhas em outros idiomas

Decidido: **faixas por frequência, rotuladas como tal** (OpenSubtitles, CC BY-SA 4.0) — nunca chamar
de CEFR o que não foi medido. CEFR-J é inglês-only e Goethe/Cervantes não têm licença aberta.
Tradução por Wikidata Lexemes (CC0) + Wikcionário/kaikki (CC BY-SA 3.0); frases do Tatoeba
(CC BY 2.0 FR, **exige nomear os autores**). Manter a validação ida-e-volta.

| # | Tarefa | Estado |
|---|---|---|
| E3.1 | Versionar o script de geração da trilha | Hoje só a saída é versionada (`FONTES.md:178-188`). Repetir isto à mão em 7 idiomas não se sustenta |
| E3.2 | Carga sob demanda da trilha | `en.json` já é chunk de 237 KB, mas **três rotas o puxam**; o caminho ingênuo multiplica por N |
| E3.3 | Registrar o **idioma nativo** na estrutura | A trilha é "inglês para quem fala português", não "inglês" (F26) |
| E3.4 | Espanhol e Francês | O pipeline roda como está |
| E3.5 | Alemão e Italiano | Alemão estoura o teto de 6 letras do Termo (`LETRAS_POR_FAIXA`), agora com folga menor |
| E3.6 | Japonês, Chinês, Coreano | **Bloqueado**: sem espaço entre palavras, os 5 jogos de frase morrem (`quality.ts:225`, `scramble.ts:31`, `escuta.ts:112`, `pronunciation.ts:34`). Precisa de `Intl.Segmenter` e teclado próprio antes |

#### E4 — Jogos multi-idioma e rodada mista

Fase A (trocar sem fricção) depende só do conserto da fonte guardada. Fase B (rodada mista) tem
pré-requisitos duros:

| # | Barreira | Onde |
|---|---|---|
| E4.1 | `normalizarPalavra` só aceita A–Z → grade **vazia** em ru/el/ja/zh/ar/he | `wordsearch.ts:55-57,111` |
| E4.2 | Teclado do Termo é QWERTY latino fixo | `TermoGame.tsx:42,392` |
| E4.3 | TTS cai em `en-US` quando o cartão não tem `srcLang` | `tts.ts:237`, `TermoGame.tsx:365`, `KaraokeGame.tsx:124` |
| E4.4 | Numa rodada mista o Duelo **entrega a resposta pelo idioma** — regressão de um bug já consertado | `source.ts:17`, `itemSource.ts:230` |
| E4.5 | `MinigameItem.lang` promete decidir voz e teclado e está **morto** em 4 jogos | `types.ts:25-38` |
| E4.6 | Conectores e régua gramatical só en/pt/es | `escuta.ts:204-224`, `quality.ts:72-112` |

---

## Armadilhas já pagas — não repetir

- **Antes de construir, procure.** Eu anotei "não existe rotina de backup" e ela existia, completa e
  boa (`scripts/backup.mjs` + `scripts/diagnosis/verificar-backup.mjs`). Uma anotação errada num
  documento de próximos passos é pior que nenhuma: manda refazer o que está pronto.

- **E aconteceu de novo (01/09).** A tela de jogos ia ganhar uma "separação entre trilha e
  conteúdo capturado" que **já existia, exclusiva e testada** (`src/core/minigames/source.ts:23`,
  com o servidor concordando em `server/db/repositories/vocab.ts:476-486`). O que faltava era ela
  aparecer na tela. Duas vezes seguidas o mesmo erro: a diferença entre "não existe" e "existe e não
  aparece" é a diferença entre um mês de trabalho e uma tarde.


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

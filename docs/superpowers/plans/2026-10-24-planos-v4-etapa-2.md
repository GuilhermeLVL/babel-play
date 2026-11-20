# Planos v4, etapa 2 (IA de estudo: explicação da frase e resumo da sessão → cartões) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Com a chave `ia_de_estudo` ligada, a pessoa toca numa frase e recebe a explicação dela no contexto (por que essa tradução, gramática, registro, gíria), e no fim de uma sessão gera um resumo de 3 pontos com 5–10 cartões propostos para revisar e adicionar com um toque. Plus/Família/Pro têm uso justo; o Grátis tem uma amostra (5 explicações por dia, 1 resumo por semana). A tela de Planos tira o "em breve" desses dois itens quando a chave liga.

**Architecture:** Duas funções de IA novas no servidor (`explicacao`, `resumo`) sobre o mesmo esqueleto do núcleo (`sugerirAlternativas` como molde da explicação; `polirLote` como molde do resumo, lendo as falas do banco pelo dono), com resposta JSON lida de forma defensiva. A amostra do Grátis é uma franquia própria (contadores próprios, como o alívio), nunca um afrouxamento de `managedCloudLlm`. O cartão continua sendo palavra + frase de contexto: o trecho de áudio da cena fica para depois (armazenamento e LGPD novos), e o texto da tela diz só "com a frase da cena".

**Tech Stack:** TS, React 19, Express, Postgres (PGlite nos testes), Vitest, Playwright.

**Spec:** `docs/specs/2026-10-24-planos-v4.md` ("O que construir", itens 1 e 2; "Salvaguardas obrigatórias"). Mapa do código: `.superpowers/sdd/2026-10-24-planos-v4-etapa-2/mapa-do-codigo.md`.

## Global Constraints

- Flag `ia_de_estudo` nasce desligada (migração PG + SQLite + journal + docs/flags.md). Com ela desligada, nada muda (rotas novas respondem 404/503 `recurso_indisponivel`; telas idênticas).
- Cotas (em `src/core/planos.ts`, fonte única): campo novo em `QuotasDoPlano` `explicacoesMes` e `resumosMes` — Plus/Família/Pro: 300 e 60; Grátis/convidado: 0 (o Grátis usa a amostra). Amostra do Grátis: constante `AMOSTRA_DE_IA = { explicacoesDia: 5, resumosSemana: 1 }`, com teto de tokens por chamada (`explicacao` ≤ 1.200 de saída, `resumo` ≤ 2.000) e contadores próprios; métrica diária nova entra em `METRICAS_DO_DIA`. A amostra também passa pelo orçamento global de IA e pela admissão (faixa gratis).
- Toda chamada nova: `ehMenor` + `INSTRUCAO_DE_SEGURANCA_PARA_MENORES` (idade não declarada = menor); retenção zero (só provedores da lista com `zdr`); Gemini proibido.
- Consentimento de nuvem: o cliente só chama com `consentiuNuvem()`; sem ele mostra "Autorizar IA de nuvem" (padrão da Nuance).
- Perfil protegido: nunca oferta nem preço; fim de amostra/cota diz só o que continua funcionando. Adulto no Grátis, ao fim da amostra: uma frase neutra com link para Planos (copy-br-etica, sem urgência).
- 429 de uso justo nunca vira oferta (`src/core/usoJusto.ts`).
- pt-BR; toda frase por `t()` com en/es/ar + xx/cobertura.
- Nunca enfraquecer teste; commits na main com `git pull --rebase`; e2e em porta e banco próprios; nunca matar o dev server alheio (data/pg).

## Review Focus

1. Grátis sem a amostra (6ª explicação do dia / 2º resumo da semana): recusa limpa, a legenda e o resto continuam; menor não vê oferta.
2. Resposta do modelo malformada ou com campos a mais/faltando: 502 `resposta_invalida`, nada quebra, reserva estornada.
3. Sessão de outra pessoa no resumo (id alheio): 404, nada vaza.
4. Frase muito longa, vazia ou cortada: explicação recusa com 400; o resumo descarta candidatos que `avaliarFrase`/`LIMITES_DO_BULK_ADD` reprovam antes de propor (o lote nunca cai por uma linha).
5. Menor: a instrução de segurança chega ao prompt das duas funções (teste que inspeciona o corpo enviado ao provedor).

---

### Task 1: Núcleo do servidor — flag, cotas, amostra e a função `explicacao`

**Files:** `src/core/planos.ts` (`QuotasDoPlano.explicacoesMes/resumosMes`, `AMOSTRA_DE_IA`, constante `FLAG_IA_DE_ESTUDO = 'ia_de_estudo'`), migrações da flag, `server/ai/funcoesDeIa.ts` (`explicacao`, `resumo` em `FuncaoDeIa`/`FUNCOES_DE_IA`), `server/ai/niveis.ts`, `server/ai/registroDeProvedores.ts` (`pernasDaFuncao`: explicacao e resumo → tutor), `server/ai/telemetriaDeIa.ts`, `ops/ia-provedores.openrouter.json` (se as pernas não bastarem), módulo novo `server/lib/iaDeEstudo.ts` (contadores: `reservarUsoDeEstudo(userId, plano, tipo: 'explicacao'|'resumo') → {ok, origem: 'plano'|'amostra'} | {ok:false, motivo: 'sem_plano'|'amostra_acabou'|'cota_do_mes'}` + estorno), `server/ai/nucleo/explicarFrase.ts`, rota `POST /api/ai/explicar` (onde as rotas de `/api/ai` vivem), `src/lib/estudo/promptDaExplicacao.ts` (prompt + leitura defensiva, padrão de `promptDasAlternativas.ts`), `docs/flags.md`, `scripts/ia/simular-custo.ts` (a amostra no custo do Grátis), testes `tests/integration/explicar-frase.test.ts`, `tests/promptDaExplicacao.test.ts`.

**Interfaces (Produces):**

- `POST /api/ai/explicar` corpo `{ texto: string, traducao: string, lang: string, langDaTraducao: string, contexto?: string[] }` → 200 `{ explicacao: { porQue: string, gramatica: string, registro: string, girias: { termo: string, sentido: string }[] }, origem: 'plano'|'amostra', restanteNaAmostra: number | null }`; erros: 404 `recurso_indisponivel` (flag), 400 `invalido`, 402 `amostra_acabou` / `sem_plano`, 429 `uso_justo_do_dia`, 502 `resposta_invalida`.
- `reservarUsoDeEstudo`/`estornarUsoDeEstudo` (Task 3 usa para o resumo).

- Limites de entrada: `texto` 1..400 caracteres, `contexto` até 3 falas de até 400.
- Testes: plano Plus → 200 `origem:'plano'`; Grátis → 200 `origem:'amostra'` até a 5ª, a 6ª 402 `amostra_acabou`; flag desligada → 404; resposta malformada → 502 e contadores estornados; menor → corpo enviado ao provedor contém a instrução de segurança; provedor fora da lista com zdr nunca é chamado.

### Task 2: Explicação na tela (folha da frase, diálogo do computador, revisão)

**Files:** `src/data/apiDoEstudo.ts` (cliente que nunca lança, padrão `apiDaNuance.ts`), componente `src/components/views/captura/estudo/ExplicacaoDaFrase.tsx` (padrão `NuanceDaFrase.tsx`), `FolhaDaFrase.tsx` (seção nova junto da Nuance), `LiveCapture.tsx` (diálogo do computador, contexto das 3 falas anteriores), `Analysis.tsx` (FolhasDoPrototipo), i18n; testes `tests/explicacaoDaFrase.test.tsx` + e2e `tests/e2e-publico/explicacao.e2e.ts` (com `semIaDeVerdade`/mock da rota).

**Interfaces:** consome `POST /api/ai/explicar` da Task 1.

- Botão "Explicar esta frase" (ícone do conjunto que a tela usa); estado carregando; resultado em quatro blocos curtos (Por que essa tradução · Gramática · Registro · Gíria, este só se houver); "Isto é uma IA" em letra pequena.
- Sem consentimento: "Autorizar IA de nuvem" (mesmo componente da Nuance). Grátis: mostra "N de 5 hoje" depois do primeiro uso; ao acabar, frase neutra e (só adulto) link para Planos; protegido: só "Volta amanhã" sem link.
- Flag desligada: a seção não aparece.
- Testes: os estados acima; protegido sem link nem preço; erro 502 mostra "Não deu para explicar agora" e não quebra a folha.

### Task 3: Resumo da sessão → cartões

**Files:** `server/ai/nucleo/resumirSessao.ts` (lê as falas da sessão do DONO; molde `polirLote`), rota `POST /api/ai/resumir` `{ sessionId: string }`, `src/lib/estudo/promptDoResumo.ts`, `src/components/views/analise/ResumoDaSessao.tsx` em `Analysis.tsx`, uso de `bulkAddCards`/`ficharCartao`, i18n; testes `tests/integration/resumir-sessao.test.ts`, `tests/resumoDaSessao.test.tsx`.

**Interfaces:** consome `reservarUsoDeEstudo(…, 'resumo')` da Task 1. Produz `POST /api/ai/resumir` → 200 `{ pontos: string[] (exatamente 3), cartoes: { word: string, back: string, sentence: string, srcLang: string, tgtLang: string }[] (0..10, já filtrados), origem, restanteNaAmostra }`; erros como a Task 1, mais 404 `sessao_inexistente` (inclui sessão alheia) e 400 `sessao_curta` (menos de 4 falas finais).

- O servidor manda no máximo as falas que cabem em `FUNCOES_DE_IA.resumo.tetoEntrada` (as últimas, se passar) e filtra os candidatos com `avaliarFrase` e `LIMITES_DO_BULK_ADD` antes de responder.
- Tela: botão "Resumir a sessão" na revisão; mostra os 3 pontos e a lista de cartões com caixa marcada; "Adicionar N cartões" chama o bulk-add só com os marcados e diz quantos entraram e quais foram pulados (motivo legível). Mesmos estados de consentimento/amostra/protegido da Task 2 (Grátis: 1 por semana).
- Testes: sessão alheia 404; sessão curta 400; candidato inválido não chega à resposta; amostra semanal; tela adiciona só os marcados.

### Task 4: Planos e fechamento

**Files:** `src/components/views/planos/quatroPlanos.ts`/`Planos.tsx` (com `ia_de_estudo` ligada os itens "Explicação da frase" e "Resumo da sessão que vira cartões" deixam o "em breve"; o Grátis ganha a linha "Amostra da IA: 5 explicações por dia e 1 resumo por semana"; o texto do resumo vira "com a frase da cena" — sem áudio), `docs/lgpd/ropa.csv` (T04 cita explicação e resumo), testes da tela v4 nas duas posições da flag. Depois: verificador, revisão final, deploy staging, ligar `ia_de_estudo` no staging.

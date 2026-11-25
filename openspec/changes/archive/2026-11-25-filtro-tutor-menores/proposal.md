## Why

O tutor (`POST /api/tutor/chat`, funções `tutor` e `corretor`) recebe a instrução de segurança de menores quando quem pede
é perfil protegido (menor de 18 ou idade não declarada, `ehMenor` em `server/lib/idade.ts`). Instrução é persuasão: o modelo
pode desobedecer, e mesmo com o histórico assinado (PR #133, `assinaturaDoTutor.ts`) um many-shot de pares verdadeiros ainda
é possível. Falta uma guarda que não dependa de o modelo obedecer. Decisão do dono (15/11/2026): **opção B**, um filtro
LOCAL e determinístico da saída, custo zero; a moderação por IA (opção C) fica para depois, encaixando na mesma interface.

## What Changes

- **Moderador de saída** (`server/ai/moderacao/moderarSaidaDoTutor.ts`): a interface `ModeradorDeSaida` (texto e perfil
  entram; sai `{ ok }` ou `{ ok: false, motivo }`) e a cadeia `moderarSaidaDoTutor`, hoje com um só moderador, o local.
- **Listas do filtro** (`server/ai/moderacao/listasParaMenores.ts`), pequenas e comentadas: sexual explícito, automutilação
  (instrução/incentivo), drogas (obter/usar), armas e violência (instrução), ódio (ofensas inequívocas), pedido de dado
  pessoal/foto, aliciamento (segredo, encontro, "está sozinho?"), contato externo (link, e-mail, telefone, `@` de rede,
  convite para WhatsApp/Discord…). Em pt, en e es; texto normalizado (acento, leetspeak, letra espaçada, invisíveis).
- **No núcleo do tutor** (`conversarComTutor.ts`): só para perfil protegido, o texto do modelo (nuvem ou Ollama) passa pelo
  moderador antes de sair. Barrado: sai uma frase fixa em pt-BR (`src/lib/ichat/respostaFiltrada.ts`) com `filtrada: true`,
  **sem assinatura**; o log `tutor_saida_filtrada` leva só categoria, função e `requestId`; a métrica
  `ia_saida_filtrada_total{funcao,categoria}` e a anotação `saidaFiltrada` do rastro contam a frequência.
- **No cliente** (`IChat.tsx`): `filtrada` mostra a frase traduzida (`t()`), sem origem e sem assinatura — ela não volta ao
  modelo no histórico. Catálogos `en`, `es`, `ar` e `xx`.

## Non-Goals

- Moderação por IA (opção C) e qualquer chamada paga de moderação.
- (Escopo inicial; FEITO depois, tarefas 4.1, 4.1b e 4.2) Filtrar as outras saídas de IA (explicação, "Como respondo?",
  parceiro de leitura, alternativas, resumo, escrita, polimento). Segue de fora só a `traducao` (legenda, texto de terceiros).
- Mudar o comportamento para adulto declarado (nada muda) ou para o self-host (`ehMenor` é sempre falso).

## Impact

- Novos: `server/ai/moderacao/{listasParaMenores,moderarSaidaDoTutor}.ts`, `src/lib/ichat/respostaFiltrada.ts`.
- Alterados: `server/ai/nucleo/conversarComTutor.ts`, `server/routes/tutor.ts`, `server/lib/logger.ts` (campos
  `categoria` e `funcao` na allowlist), `server/http/metricas.ts`, `server/ai/telemetriaDeIa.ts`, `src/components/IChat.tsx`,
  `public/i18n/*.json`, `src/data/i18n/cobertura.json`.
- Sem variável de ambiente nova, sem migração. Custo zero (regex local, sem rede).
- Risco: falso positivo troca uma resposta de aula boa pela frase fixa (mitigado: frases de intenção em vez de palavra solta,
  citação ignorada para dado pessoal/aliciamento, e um conjunto de respostas de aula no teste). Falso negativo: paráfrase,
  eufemismo e idioma fora de pt/en/es passam — é a rede de baixo, não o juiz.

## Revisão de 25/11/2026

- **Estado**: o código está completo (tarefas 1 a 4.2, mais a 4.1b de 8a91706e: o polimento filtra também as polidas já gravadas e o filtro confere o texto juntado dos campos). Falta só o que é do dono: 4.3 (opção C) e 4.4 (listas e métrica). Nada dos PRs #201, #202, #205 e #206 tocou o filtro. Velho: o Non-Goals (acima) e a frase final do `design.md` sobre o polimento já gravado; corrigidos. Ponto novo a vigiar: o núcleo `server/ai/nucleo/` ganhou funções desde a 4.1 e nada prende que toda saída nova de LLM passe pelo filtro (tarefa 4.5, nova). Fora do filtro por decisão: `traduzirNoNivel` (tradução de terceiros; a ocultação de termos sensíveis na legenda é o núcleo `legenda-segura`, de 17/11), `transcrever` e `sintetizarVoz`.
- **Esforço**: P (a 4.5 é meio dia; a 4.3, se escolhida, é M e tem custo de IA declarado).
- **Valor para quem usa**: alto para menores e responsáveis (ECA Digital/LGPD); invisível para adultos.
- **Dependências**: nenhuma de código. A opção C usaria a cadeia plugável (`ModeradorDeSaida`) e a regra de custo (`src/core/planos.ts` e `custo-de-ia`); Gemini é proibido como moderador.
- **Decisões do dono**:
  1. Opção C (moderação por IA) como segundo moderador: (A) não fazer agora e manter o filtro local (custo zero); (B) fazer em SOMBRA (só registra o que a IA barraria e o filtro deixou passar, nada bloqueia) por 2 a 4 semanas, com teto de custo declarado e provedor sem retenção; (C) bloqueante desde já. **Recomendo A agora e B só se a 4.4 mostrar falso negativo real**: o falso positivo de aula é o custo conhecido, e C põe texto num terceiro e gasto novo no fluxo de menores.
  2. Revisão das listas e acompanhamento (4.4): (A) o dono revisa em 2 semanas com `ia_saida_filtrada_total` por categoria; (B) o agente gera um relatório semanal das contagens e o dono só aprova; (C) adiar até haver volume. **Recomendo B** (reduz o trabalho do dono sem ampliar escopo).

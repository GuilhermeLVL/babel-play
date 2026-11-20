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
- Filtrar as outras saídas de IA (explicação, assistente ao vivo "Como respondo?", parceiro de leitura, alternativas,
  resumo, polimento): não passam pelo caminho do tutor. Ficam listadas como próximas tarefas.
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

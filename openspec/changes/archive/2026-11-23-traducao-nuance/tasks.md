> Retroativa: os itens marcados já estão na `main` (merge `cd0aa88`). Plano aprovado:
> `functional-doodling-crane` (Fase D). Branches: `feat/d-traducao-nuance` (D1–D4, D6; merge `654bae7`) e
> `feat/d-polir-sessao` (D5, D7; merge `1d31327`). Cada item cita o commit principal e o teste que o cobre.
> Conferido em 30/09/2026 na `main` (`cd0aa88`): todos os arquivos de vitest citados abaixo passam, com
> `tests/planos-tela-v2.test.tsx`, `tests/integration/niveis-na-rota.test.ts`,
> `tests/integration/politica-de-custo.test.ts` e `tests/caracterizacao/paridade-de-forma.test.ts` (o dono
> do snapshot da paridade): 24 arquivos, 264 testes, 1 pulado que não é da Fase D. O
> e2e do D7 não foi rodado nesta conferência; ele roda no job "E2E com AUTH_REQUIRED=1" do CI.

## D0 — O modelo da Nuance (aberto)

- [ ] 0.1 Rodar a `bancada-nuvem.yml` com os segredos do dono (`workflow_dispatch`, teto de US$ 3)
- [ ] 0.2 Marcar no `IA_PROVEDORES` o modelo de `niveis: ["nuance"]` e o de `["polimento"]` com o resultado
      (hoje, sem modelo marcado, a nuance é a própria rápida: `tests/integration/niveis-de-traducao.test.ts`)
- [ ] 0.3 Decidir se a bancada mede os prompts da Nuance (registro, variantes, `promptDasAlternativas`,
      `promptDoPolimento`); hoje `scripts/eval-fala/bancada/nuvem.mjs` importa só o prompt comunicativo

## D1 — O nível pedido, rebaixado no servidor

- [x] 1.1 `POST /api/ai/mt` aceita `nivel: 'rapida' | 'nuance'`; `polimento` e nomes inventados são 400
      (`cd76edb`; `tests/seguranca/modelo-por-plano-nivel.test.ts`, "nível fora do contrato da rota")
- [x] 1.2 `nivelDaTraducaoPedida` passa sempre por `rebaixarNivel`: sem `traducaoNuance`, a rápida, sem erro,
      mesmo num plano pago forjado sem a capacidade (`cd76edb`; `modelo-por-plano-nivel.test.ts`)
- [x] 1.3 Sem `nivel` (legenda ao vivo), a rápida também para quem paga; `NUANCE_AO_VIVO=1` liga a nuance ao
      vivo, declarada em `server/lib/config.ts` e no `.env.production.example` (`cd76edb`;
      `modelo-por-plano-nivel.test.ts`)
- [x] 1.4 Os testes da Nuance pegam o plano pago da matriz, não do nome (`cd8a726`; `tests/harness/planoPago.ts`)
- [x] 1.5 A regra do `/mt` no núcleo sem Express, com os mesmos status e corpos (`4675c13`, Fase F;
      `tests/integration/nucleo-de-ia.test.ts`, "traduzirNoNivel")

## D2 — Registro e variantes

- [x] 2.1 `registro` (`formal | informal`) e `variante` (`pt-BR | pt-PT | es-419 | es-ES`) no `/mt`; fora da
      lista é 400 (`519e4b5`; `tests/integration/nuance-registro-e-variante.test.ts`)
- [x] 2.2 Sufixo do registro no fim do `system`, depois da linha do idioma; `nomeDoIdioma` guarda a região
      das quatro variantes (`519e4b5`; `tests/promptComunicativo.test.ts`, `nuance-registro-e-variante.test.ts`)
- [x] 2.3 Registro e variante na chave do cache, com hash dos sufixos; sem eles, a chave e a versão do
      prompt de antes (`519e4b5`; `nuance-registro-e-variante.test.ts`, "o registro na chave do cache")
- [x] 2.4 Sem `traducaoNuance`, registro e variante ignorados: o prompt e a chave de sempre (`519e4b5`;
      `nuance-registro-e-variante.test.ts`, "sem traducaoNuance: o prompt e a chave de sempre")

## D3 — Glossário pessoal à prova de injeção

- [x] 3.1 Migração 0042 `glossario` (aditiva, `IF NOT EXISTS`, com reversão) e o repositório; entra em
      `TABELAS_DO_TITULAR` (`612c1d9`; `tests/integration/glossario.test.ts`, "LGPD: o glossário é dado do titular")
- [x] 3.2 `GET` e `DELETE` em qualquer plano; `POST` só com `traducaoNuance` (402 `exige_nuance`); 409
      `glossario_cheio` com 500 entradas; id alheio é 404 (`612c1d9`; `tests/caracterizacao/glossario.test.ts`,
      `tests/seguranca/idor.test.ts`)
- [x] 3.3 Saneamento na gravação e na montagem; bloco JSON numa linha entre os delimitadores; regra no fim do
      `system` (`612c1d9`; `tests/seguranca/glossario-injecao.test.ts`)
- [x] 3.4 Até 12 entradas por pedido, só do par, só termo inteiro, as mais longas primeiro (`612c1d9`;
      `glossario-injecao.test.ts`, "o teto por pedido")
- [x] 3.5 Com glossário, nada de cache L1 nem L2 (`612c1d9`; `glossario.test.ts`, "a tradução com glossário
      nunca vai ao cache compartilhado")
- [x] 3.6 Cliente: "Sempre traduzir assim" na folha da palavra, com cadeado e convite sem a Nuance, e sem
      convite no perfil protegido (`612c1d9`; `tests/nuanceNasFolhas.test.tsx`, "D3")

## D4 — "Outras formas"

- [x] 4.1 `POST /api/ai/mt/alternativas`: até 3 formas e a nota, função `alternativas` em `FUNCOES_DE_IA`,
      nível `nuance`, portão, política de custo, admissão, reserva, cascata e custo (`0e45844`;
      `tests/integration/alternativas.test.ts`, `tests/caracterizacao/ia.test.ts`)
- [x] 4.2 402 `exige_nuance` sem provedor e sem cota; 502 `resposta_invalida` com o custo registrado; 429
      `nuvem_ocupada` com todas as pernas em 429 (`0e45844`; `alternativas.test.ts`)
- [x] 4.3 Prompt com o fixo na frente e a leitura defensiva do JSON (`0e45844`; `tests/promptDasAlternativas.test.ts`)
- [x] 4.4 Folha da frase (celular) e botão por fala final (computador) com a Nuance da frase, "Outras
      formas" e Formal/Informal; nada troca a fala sem a pessoa escolher; sem IA de nuvem autorizada, nenhum
      pedido sai (`7080788`; `tests/nuanceNasFolhas.test.tsx`, "D4")
- [x] 4.5 A regra no núcleo sem Express (`4ccadf7`, Fase F; `nucleo-de-ia.test.ts`, "sugerirAlternativas")
- [ ] 4.6 As "Outras formas" e o teste de 14 dias: `emTeste: false` em `server/ai/alternativas.ts` (decisão
      do dono, pergunta 3 do `design.md`)

## D5 — "Polir a tradução da sessão"

- [x] 5.1 `POST /api/ai/mt/polir` e a migração 0044 (`traducao_polida`, `polimento_modelo`,
      `polimento_versao`, `polido_em`); função `polimento` e linha em `IA_NIVEIS` (`2b28066`;
      `tests/integration/polimento.test.ts`, `tests/integration/niveis-de-traducao.test.ts`)
- [x] 5.2 Blocos de até 40 falas e peso 6.000, com 3 de contexto já polidas; prompt e leitura defensiva
      (`2b28066`; `tests/promptDoPolimento.test.ts`)
- [x] 5.3 Idempotência por bloco (`jaPolido`), resposta parcial, 409 `polimento_em_andamento`, 404 da sessão
      alheia e do bloco inexistente, 402 antes de ler a sessão (`2b28066`; `polimento.test.ts`)
- [x] 5.4 Retomar a captura e o lote repetido mantêm a polida das falas que voltam iguais (`0925269`;
      `polimento.test.ts`, "retomar a captura (troca das falas)…")
- [x] 5.5 Aba Transcrição da Análise: progresso por bloco, cancelar, retomar, "Original | Polida"; Grátis
      com cadeado e convite (`9be4777`; `tests/polirSessao.test.tsx`, `tests/polimentoDaSessao.test.ts`)
- [x] 5.6 Cancelar espera o bloco em curso; sair da tela corta a espera (`9a28848`; `polimentoDaSessao.test.ts`,
      "cancelar aplica o bloco em curso…")
- [x] 5.7 O espelho sem conta fica sem a polida, registrado na paridade (`b91e7c4`;
      `tests/caracterizacao/paridade-de-forma.test.ts`, snapshot `paridade.faltando-no-espelho.json`)
- [x] 5.8 A 0044 antes da 0045 no journal (merge `8dfb893`)
- [x] 5.9 A regra no núcleo sem Express (`070a860`, Fase F; `nucleo-de-ia.test.ts`, "polirLote")
- [ ] 5.10 O Batch da Groq para o polimento (ponto de extensão comentado em `server/ai/nucleo/polirLote.ts`;
      pergunta 5 do `design.md`)

## D6 — Painel "Tradução Nuance" nos Ajustes

- [x] 6.1 Ajustes → Idiomas: registro padrão e variantes em `settings.ui` pelas `preferencias` (`bfd1bfc`;
      `tests/painelDaNuance.test.tsx`, `tests/preferenciasDaNuance.test.ts`)
- [x] 6.2 A legenda ao vivo e a folha da frase levam só o que foge do padrão, só com `traducaoNuance`; a
      legenda ao vivo continua sem o `nivel` (`bfd1bfc`; `tests/serverLlmMt-nuance.test.ts`)
- [x] 6.3 O glossário listado ("x de 500") e apagável, também sem a Nuance (`bfd1bfc`; `painelDaNuance.test.tsx`)
- [x] 6.4 O polimento leva o registro e as variantes das preferências (`9be4777`; `preferenciasDaNuance.test.ts`,
      "o que vai no polir a sessão")

## D7 — E2E

- [x] 7.1 Celular (Pixel 7): Formal/Informal e "Outras formas" na folha da frase, e a escolhida entra na fala
      (`c978d1e`, toque no rótulo em `bb60d50`; `tests/e2e-publico/nuance-alternativas.e2e.ts`)
- [x] 7.2 Computador: polir com progresso, cancelar, retomar e alternar; no Grátis, cadeado e convite sem
      pedido de IA (`c978d1e`; `tests/e2e-publico/nuance-polir.e2e.ts`)

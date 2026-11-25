## Context

- `decidirRota` (`politicaDeRota.ts:783`) devolve motivo, reservas, descartadas e destino dos dados, com teste de equivalência contra
  `routeStt`/`routeMt` e a regra de que nuvem é descartada sem consentimento, plano, cota ou com perfil protegido sem responsável.
  O ramo `politicaLigada: true` lê só `fatorDeTempoReal` (até 0,5 acompanha). Só roda em dev (`conferenciaDaRota.ts`).
- Já existem sinais de qualidade espalhados: `audioDificil.ts` (confiança média dos tokens, histerese 3 em 6 falas), o regulador
  (`reguladorDeDesempenho.ts`, `reguladorDaCaptura.ts`: RTF, fila de parciais, escada de modelos) e `roteadorDeTraducao.ts` (M0-M5).
- Instanciação duplicada de motores: `src/gateway/index.ts:79-137` e `src/core/harness/registroDeMotores.ts` descrevem os mesmos
  motores por caminhos distintos. A sombra precisa de um só catálogo para dizer "trocaria para o motor X".
- Pesquisa: SOL-001, ADR-004 (opção A, estender `PedidoDeRota`), A-009 (os sinais predizem o atraso sem oscilar), A-011 (custo),
  A-012 (privacidade), E-005 (portão). Lab: marcas `frasy:*`, `captureMetrics`, telemetria v2 atrás de `rum_latencia`.
- Restrições: Gemini proibido; retenção zero; menores (perfil protegido nunca envia); planos e cotas só em `src/core/planos.ts`, não tocados.

## Goals / Non-Goals

**Goals**

1. Calcular e registrar, em sombra, o que o roteador adaptativo decidiria, sem efeito na rota real.
2. Medir, com critério escrito antes, se ele acerta, não oscila e não encarece.
3. Provar custo de CPU desprezível e zero vazamento.

**Non-Goals (este ciclo)**

- Mudar a rota real, ligar `rota_inteligente` ou `politicaLigada`, ou alterar `routeStt`/`routeMt`.
- Mudar planos, cotas, preços ou UI.
- Medir WER do inglês (é da `stt-ingles-volume-e-rota`; aqui só se lê).
- Unificar a instanciação de motores (ver Decisão 4; vira dívida registrada).
- **Passo seguinte, só com o E-005 aprovado e mudança própria:** sair da sombra em degraus (1) ligar para o perfil que só ganha
  aparelho→modelo menor (sem nuvem), (2) subir trechos à nuvem só com conta, consentimento e cota, (3) retirar o ramo duplicado do
  `audioDificil`. Cada degrau com flag e critério próprios; ligar é ato do dono.

## Decisions

### 1. Reaproveitar a `politicaDeRota` em vez de criar um roteador novo

Opção A (escolhida): `PedidoDeRota.sessao?` opcional + `decidirAdaptativo(pedido, estado)` no mesmo módulo, compondo `decidirRota`.
A guarda (consentimento, protegido, cota, plano, privado) é a MESMA função e roda ANTES; o adaptativo só escolhe entre degraus que a
guarda já deixou. Assim não há segunda regra de privacidade para divergir. Opção B (módulo paralelo): isolamento total, mas duplica
a guarda e obriga a migrar no passo seguinte (ADR-004 já rejeitou). Custo da A: interface pública maior; mitigado por campo opcional
e teste de equivalência com `sessao` presente e sombra desligada (decisão idêntica).

### 2. Sinais e regra (puros, sem relógio)

Entradas: RTF (média móvel já do regulador), fila (pendentes na `filaDeTraducao`), ms de MT, confiança média do STT (a de
`audioDificil.ts`), `medicoesDeStt` para o par de idioma. Regra: sobe um degrau se RTF > 0,8 OU fila ≥ 2 OU confiança < 0,75 por
N falas; desce só depois de RTF < 0,5 e fila 0 por M falas. Os limiares são parâmetros EXPLÍCITOS e começam nos já documentados
("A CALIBRAR"); a sombra existe para calibrá-los. Histerese por contagem de falas, não por tempo. A `medicoesDeStt` entra como
prior: se a medição do idioma diz que a nuvem NÃO vence o local com IC, o adaptativo não sugere "nuvem" por confiança, só por RTF/fila.
Degraus possíveis na sombra: manter, modelo menor, nativo, nuvem (esta só se a guarda permitir).

### 3. O que se registra (privacidade)

Só contagens por (classe de aparelho, idioma-base, decisão que tomaria, decisão efetiva, motivo da lista fechada
`MOTIVOS_DA_ROTA`), no campo `roteador` do lote `v: 2` (telemetria do lab), atrás de `rum_latencia` E `roteador_adaptativo_sombra`. Nunca
texto, áudio, id, hora ou valores brutos de sinal (só baldes). Perfil protegido: nada sai, os números ficam no aparelho (ring
buffer em memória, sem persistência). O servidor só incrementa histogramas, como já faz.

### 4. Instanciação duplicada de motores

Não unificar aqui: é refator sem relação com a decisão e arrisca a rota real. A sombra resolve nomes de motor SÓ por
`registroDeMotores.ts` (puro) e nunca instancia nada; a divergência com `gateway/index.ts:79-137` é coberta por um teste que compara
os ids dos dois catálogos e entra como pendência registrada, não correção.

### 5. Avaliação a posteriori

"Melhor rota a posteriori" = a rota (dentre as que a guarda permitiria) que teria dado o menor `fimDaFalaAteLegenda` na bancada
(`scripts/perf/latencia-legenda/`), reexecutando as mesmas falas por rota. Precisão = fração das falas em que a decisão da sombra
coincide com essa rota, ou ao menos tem latência dentro de 10% dela. Trocas/min = mudanças de decisão sustentadas por minuto.
Custo/h = nuvem que a sombra teria usado × preço do `custo-de-ia`, menos a nuvem da rota efetiva (acréscimo), comparado a US$ 0,01/h; a rota Parakeet entra como candidata.

## Risks / Trade-offs

- **A bancada não é o campo** (rede, aparelho real). Mitigação: perfil fraco e 4G simulado no protocolo do lab; o campo (`rum_latencia`)
  só entra com o parecer do dono, então a primeira calibração é de bancada.
- **Oscilação** por RTF ruidoso. Mitigação: histerese por falas e média móvel; critério de ≤ 2 trocas/min.
- **Vazamento pelo registro.** Mitigação: lista fechada, baldes, teste de forma do lote, perfil protegido nunca sai.
- **Sombra enganar com guarda errada** (ramo `politicaLigada` nunca rodou): teste em grade plano × consentimento × idade × cota (A-012).
- **Dependência de `medicoesDeStt`** ainda não implementada: sem ela, o adaptativo ignora o prior e a tarefa fica bloqueada na 3.3.
- Migrações PG 0025 e SQLite 0067 são provisórias: outras mudanças em voo podem tomar o número.

## Como medir

- E-005 (critério fixado ANTES de coletar; registrar em `docs/auditoria/` com a data antes da primeira rodada):
  **seguir** se precisão ≥ 80% contra a melhor rota a posteriori, ≤ 2 trocas/min, acréscimo de custo sobre a rota efetiva ≤ US$ 0,01/h (reconciliado em 25/11; ver `docs/auditoria/2026-11-25-criterio-do-roteador-adaptativo.md`) e zero decisão de
  rede para convidado/menor sem consentimento. Qualquer um falhar = **não sair da sombra**, recalibrar ou arquivar.
- CPU: `decidirAdaptativo` com p99 ≤ 0,05 ms e < 0,1% de um núcleo a 1 decisão/s no perfil fraco; microbench em teste (vitest, 10 000
  chamadas) com folga de 10x sobre a meta, mais medição no aparelho pela marca `frasy:*` do lab.
- Equivalência: com a flag desligada ou `sessao` ausente, `decidirRota` idêntica à de hoje (teste existente + novo).
- Rodar a bancada só quando outro agente não estiver medindo latência (a coleta não é parte do passo de escrita desta proposta).

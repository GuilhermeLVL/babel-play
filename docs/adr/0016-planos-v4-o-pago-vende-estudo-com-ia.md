# ADR 0016 — Vender Plus, Família e Pro por trabalho de estudo, e encerrar Essencial, Premium e Ao Vivo

- **Data:** 2026-11-25 (decisão do dono em 2026-10-24; registrada aqui no fechamento da change)
- **Estado:** aceito. Substitui parcialmente o [ADR 0013](0013-quatro-planos-por-nivel-de-servico.md): a matriz de capacidades, o contador por nível, o "valor pago decide o plano" e a venda fechada por flag continuam; os planos vendidos e os preços mudam.
- **Change OpenSpec:** `planos-v3-e-rota-inteligente` (fechamento; spec em `specs/matriz-de-planos/`)
- **Spec de produto:** `docs/specs/2026-10-24-planos-v4.md`; painel de avaliação em `docs/auditoria/planos-v4-painel/`

## Contexto

O ADR 0013 vendia três tamanhos de horas de nuvem (Essencial R$ 9,90, Premium R$ 19,90, Ao Vivo R$ 39,90). Em 23/10 o modelo
"Preciso" (Parakeet v3, `docs/specs/2026-10-23-modelos-no-aparelho.md`) passou a rodar de graça no aparelho com ~6 erros em 100 palavras
em pt/es, e o argumento "horas de nuvem para errar menos" perdeu força. O painel com 8 avaliadores (`docs/auditoria/planos-v4-painel/`)
deu média 7,43 à opção B (Plus, Família, Pro) contra 6,44 da v3 ajustada; B ganhou em 6 de 8. O anual da v3 dava prejuízo no assinante
pesado (Premium anual com 20 h e voz: −R$ 6,39/mês no pior caso). O serviço de fluxo do Ao Vivo nunca foi escolhido
(`TRANSPORTE_AO_VIVO_EXISTE = false`, `src/lib/captura/nivelDeServico.ts`).

## Decisão

A matriz (`src/core/planos.ts`) passa a vender, com a flag `venda_planos_v4` (migração PG 0007, `docs/flags.md`):

- **Plus**: R$ 14,90 por mês ou R$ 149 por ano (dez mensalidades), 8 h/mês de nuvem em "Precisão", IA de estudo (explicação da frase,
  resumo que vira cartões), voz natural até 150 mil caracteres por mês. Teste de 14 dias passa do Premium para o Plus.
- **Família** (`venda_familia`) e **Pro** (`venda_pro4`): aparecem como "em breve", sem preço, até as flags abrirem.
- **Essencial, Premium e Ao Vivo** deixam de ser vendidos (`encerradoPor: [venda_planos_v4]`); continuam na matriz para quem já os
  tem (ninguém assina em produção, então não há migração de cliente). O Ao Vivo deixa de existir como plano; o "texto durante a fala na
  nuvem" só volta se um dia houver serviço de fluxo escolhido (ver `ao-vivo-streaming-de-terceiro`, arquivada em 25/11).
- Todo valor cobrável continua distinto dos demais (o webhook identifica o plano pelo valor). O anual segue desligado por
  `ANUAL_ENABLED` até o parecer jurídico (decisão 6 de `docs/backlog/decisoes-do-dono.md`); abrir o mensal do Plus antes dele.
- Os números (cotas, preços, teto) vivem só em `src/core/planos.ts`; specs e docs os citam sem repetir.

## Alternativas consideradas

- **A, v3 ajustada (média 6,44).** Mantém três tamanhos do mesmo trabalho; o Grátis já cobre quem tem computador bom.
- **C, Premium único mais Família (média 7,35).** Ganhou com a professora e o adolescente, mas perdeu para B no financeiro, na
  ética e na estratégia (o Pro de voz e o Família com painel dão três motivos de pagar diferentes).
- **Manter o Ao Vivo "em breve" no Pro.** Prometeria uma capacidade sem fornecedor, DPA nem custo medido; contraria a regra de
  "nada prometido que o servidor recusa". Descartado pela decisão assumida de 25/11 (decisão 7 e 39 do dono).
- **Abrir o anual junto com o mensal.** Depende do parecer jurídico (CDC e ECA Digital sobre renovação); fica desligado.

## Consequências

Melhor: cada plano vende um trabalho (estudar, controlar sem vigilar, falar); o anual deixa de dar prejuízo; o Grátis não perde nada.
Pior: a receita por assinante cai no topo e sobe na entrada; os custos por plano ainda são estimativas do painel (pior caso de
R$ 0,65 por hora de nuvem) até haver uso real; a conversa por voz do Pro depende de custo medido (≤ ~US$ 0,15/h) e fica fora do
lançamento. Proibido: comparar o nome do plano fora da matriz e da cobrança, valor cobrável repetido, vender com a chave de
venda desligada, oferta ou preço para perfil protegido.

## Como isto é cobrado

`tests/planos-v4-matriz.test.ts` (planos vendáveis, encerrados e valores distintos), `tests/planos-tela-v4.test.tsx` (a tela só
promete o que a matriz concede), `tests/integration/billing-por-plano.test.ts` (cobrança por valor e venda fechada) e a
`openspec/changes/archive/2026-11-25-planos-v3-e-rota-inteligente/specs/matriz-de-planos/spec.md`, que substitui a spec antiga da matriz no arquivamento.

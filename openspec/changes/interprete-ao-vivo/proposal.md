> **Fase 6 de 6 do "Intérprete v3".** Começa por um **spike de medição**; o produto só entra se o portão passar.
> Plano: `C:\Users\Guilh\.claude\plans\faca-um-brain-storm-temporal-crystal.md`.
> **Decisão do dono (02/10/2026):** latência em camadas. A cascata em streaming (Fases 1–3) é a base; **fala→fala ao vivo é o nível
> "Ao vivo"** da proposta de níveis (`No aparelho` / `Precisão` / `Ao vivo`, memória `planos-niveis-de-servico-2026-10-01`).

## Why

Mesmo com tudo otimizado, uma cascata (reconhecer, traduzir, falar) espera o fim de cada frase. Modelos de interpretação
simultânea decidem sozinhos quando já têm contexto e falam enquanto a pessoa ainda fala (Gemini Live Translate; Hibiki e
Seamless como abertos). Isso reduz o atraso percebido para poucos segundos, mas custa mais (≈ US$ 0,12 por hora em streaming,
referência da memória de planos) e tem limites conhecidos: a voz pode trocar após pausas e errar o gênero, e os modelos abertos
cobrem pares limitados (Hibiki: francês→inglês; Hibiki-Zero: quatro idiomas→inglês). Antes de vender, é preciso medir.

## What Changes

- **Spike (portão).** Bancada comparando a cascata atual (com as Fases 1–3), Gemini Live Translate e, se couber nos pares do
  produto, Hibiki-Zero/Seamless: atraso até o fim (End Offset), atraso médio (LAAL), qualidade (COMET sobre a transcrição) e
  erros de voz/gênero, nos pares pt↔en, pt↔es, pt↔zh e en↔zh, com áudio de conversa.
- **Nível "Ao vivo" (condicional).** Atrás do mesmo botão, uma sessão de fala→fala via **proxy no servidor** (nunca com a chave
  no navegador), uma sessão por sentido, com **queda automática para a cascata** se faltar rede, crédito ou cobertura.
- **Cobrança honesta.** Horas inclusas no Premium e pacote de horas por Pix; **nunca "ilimitado"**; teto sempre visível e queda
  para o nível "Precisão" em vez de bloqueio.
- **Medidor.** Minutos e custo por sessão (reaproveita o medidor da Fase 2).

## Capabilities

### New Capabilities
- `interprete-ao-vivo`: nível "Ao vivo" de fala→fala simultânea, com proxy no servidor, queda para a cascata, tetos e medidor.

### Modified Capabilities
<!-- Nenhuma: o comportamento do modo intérprete ainda mora na change `modo-interprete` (não arquivada). -->

## Impact

- Bancada: novo `scripts/eval-fala/bancada/ao-vivo.mjs` e relatório em `docs/auditoria/eval/`.
- Servidor (só se o portão passar): `server/ai/aoVivo.ts` (WebSocket para o provedor), rota de sessão, contagem de minutos e custo
  em `core/planos.ts` (entitlement e tetos) e na carteira.
- Cliente: `ModoInterprete.tsx` (escolha do nível), `controleDoInterprete.ts` (fonte "fala→fala"), cola em `LiveCapture.tsx`.
- Dependências: chave do provedor (a do dono; hoje a chave Groq é da camada gratuita) e termos de uso do modelo escolhido.
- Sem mudança no Grátis. Pré-requisitos: Fases 1 a 3 entregues e o medidor da Fase 2.

---
name: custo-de-ia
description: Use ao mexer em provedores ou modelos de IA, planos, cotas, teste grátis, orçamento, preço ou roteamento do Frasy. Aplica as regras de custo, privacidade e qualidade do projeto e dá os comandos para medir antes de afirmar. Palavras-chave - custo, OpenRouter, Groq, modelo, cota, plano, teste, orçamento, STT, tradução, retenção zero.
---

# Custo de IA do Frasy

O produto precisa ser **acessível, dar lucro e ser eficiente**. O grátis custa zero (roda no aparelho); a nuvem é a amostra de qualidade que vende a assinatura. Antes de mudar qualquer coisa que gaste dinheiro, siga isto.

## Regras duras (não negociáveis)

1. **Nunca Gemini**, em nenhuma forma (base, Vertex, gateway, modelo). O app atende menores; o registro (`server/ai/registroDeProvedores.ts`) recusa. Gemma é permitido (pesos abertos). Pesquisa de terceiros (inclusive subagente) pode recomendar Gemini: ignore.
2. **Só retenção zero.** Todo pedido ao OpenRouter leva `provider: { zdr: true, data_collection: "deny" }` e ignora o Google (`parametrosDoProvedor`). Nada de modelo `:free` (pode treinar com dados).
3. **Chave nunca em arquivo versionado, nunca impressa.** Está no `.env` (`OPENROUTER_API_KEY`); scripts a leem em tempo de execução e só mostram "definida/ausente".
4. **Não contradiga o dono**: preços, Ao Vivo fechado, anúncios desligados, anual fechado até o parecer. Fonte: `openspec/changes/planos-v3-e-rota-inteligente/design.md`.
5. **O teste de 14 dias acaba no que vier primeiro, os 14 dias ou `FRANQUIA_DO_TESTE`** (3 h de nuvem). Não devolva o Premium inteiro ao teste.

## Medir antes de afirmar

- Preço e retenção zero de um modelo: `https://openrouter.ai/api/v1/models` e `/api/v1/endpoints/zdr` (públicos, sem chave).
- Validar um registro de provedores (dev e produção, cascata por função e nível, chaves nomeadas): `npm run ia:validar -- ops/ia-provedores.openrouter.json`.
- Quanto custa uma base de usuários, com as **cotas reais** do código: `npm run ia:custo -- --usuarios 1000 --essencial 50 --premium 30 --testes 100`.
- Qualidade e custo reais de um modelo: chame de verdade com as MESMAS frases/áudios em vários idiomas (incluindo **silêncio e ruído**, que fazem modelo de chat alucinar) e leia `usage.cost`. Não escolha por benchmark de terceiro.
- Captura de ponta a ponta no navegador: Chrome do sistema via Playwright com `--use-file-for-fake-audio-capture` e fala gerada com `say -v "Eddy (Chinese (China mainland))"`.

## Ao mudar plano, cota, preço ou modelo

- [ ] A conta de custo no comentário de `src/core/planos.ts` continua verdadeira (hora de legenda ≈ US$ 0,028 a 0,058).
- [ ] `tests/planos-matriz.test.ts` passa: todo valor cobrável é único (o plano é identificado pelo valor pago).
- [ ] `npm run ia:custo` ainda fecha: margem no pior caso ≥ 0 nas misturas de 3%, 8% e 15% de pagantes.
- [ ] Teto em USD ou em horas para toda via gratuita ou de teste (convidado, alívio, teste).
- [ ] `AI_BUDGET_USD_*` em `.env.production.example` coerente com o crédito carregado.
- [ ] Mudança de comportamento: `openspec/changes/<nome>/` (proposal, spec, tasks).
- [ ] `npm run typecheck`, `npm test`; o hook `guarda-de-ia` roda o subconjunto de IA a cada edição.

## Camadas de economia (da mais barata à mais cara)

Aparelho primeiro → cache de tradução → cascata barata (Whisper turbo, Gemma 4, Llama; `gpt-oss-120b` só na nuance) → VAD (só fala vai à nuvem) → cota por plano e uso justo → admissão (`IA_EM_VOO_STT=2`) → degradação a 70/90% → orçamento global → crédito pré-pago sem recarga automática. Detalhe e números: `docs/estrategia-comercial-e-custos-br.md`.

## 1. Implementação

- [x] 1.1 `montarPedidoDeStt` e a repetição em `json` (`server/ai/cascataDeStt.ts`)
- [x] 1.2 `ops/ia-provedores.openrouter.json` validado em desenvolvimento e produção (`validarRegistro`)
- [x] 1.3 Testes do pedido (JSON, `ogg`, roteamento, sem `response_format`) em `tests/integration/cascata-de-stt.test.ts`
- [x] 1.4 `.env` do desenvolvedor fora dos testes (`tests/setup-db-isolada.ts`)
- [x] 1.5 `.env.production.example` e `docs/lgpd/operadores.md`

## 2. Verificação

- [x] 2.1 Chamadas reais com retenção zero: Whisper turbo acerta zh/pt/en/es/fr e devolve vazio em silêncio e ruído; Voxtral e
      Qwen3-ASR foram descartados (alucinou em silêncio / errou o espanhol)
- [x] 2.2 Tradução, 8 frases em 5 idiomas: Gemma 4 26B melhor custo/latência (1,0 s, ~US$ 0,00007), sem erros
- [x] 2.3 Navegador, captura dupla: com `IA_EM_VOO_STT=1` o 2º trecho recebia 429 `nuvem_ocupada/em_voo` e caía no modelo local
      (7,8 s, `东源` no lugar de `公园`); com 2, zero 429 e 0,8 a 1,0 s na nuvem

## 3. Pendências

- [ ] 3.1 Atualizar a política de privacidade antes de produção (provedor deixa de ser a Groq) — texto jurídico do dono
- [ ] 3.2 Decidir `IA_EM_VOO_STT` em produção (recomendado 2)
- [ ] 3.3 Prompt/dica para o Whisper manter o chinês simplificado (às vezes sai tradicional)

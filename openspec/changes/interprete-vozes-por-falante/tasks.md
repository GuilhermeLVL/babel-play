## 1. Catálogo no servidor

- [ ] 1.1 Registrar gênero e idioma por voz em `provedoresDeVoz.ts` (Qwen3-TTS, Chirp 3 HD), conferido na documentação de cada provedor; teste de contrato que falha se uma voz sem gênero for exposta
- [ ] 1.2 Criar `GET /api/ai/vozes?idioma=` e validar `voz` contra o catálogo em `ttsProxy.ts`, mantendo `CAMPOS_DE_CLONAGEM`; testes
- [ ] 1.3 Aceitar `voz` em `functions/quest/tts.js` onde o motor aceita; teste

## 2. Cliente: catálogo e escolha

- [ ] 2.1 Criar `src/lib/voz/catalogoDeVozes.ts` (nuvem + aparelho, gênero desconhecido no aparelho salvo tabela curta), com teste
- [ ] 2.2 Fazer `pickVoice` em `lib/tts.ts` aceitar uma voz pedida; `vozDaNuvem.ts` enviar `voz`
- [ ] 2.3 Folha de voz (lista, prévia, velocidade) e chip "Voz" na faixa do meio de `ModoInterprete.tsx`; guardar em `babel.interprete.vozes` com `try/catch`

## 3. Estimativa e fixação por falante

- [ ] 3.1 Criar `src/lib/voz/generoDoFalante.ts` (F0 por YIN, mediana de ≥ 1,5 s, três faixas, confiança), puro, com teste usando sinais sintéticos de 110 Hz, 220 Hz e 170 Hz
- [ ] 3.2 Criar `src/lib/voz/vozPorFalante.ts` (casar com o catálogo, fixar por lado, indeterminado tenta até 3 vezes, override manual), com teste
- [ ] 3.3 Ligar no `controleDoInterprete.ts` e no pipeline: entregar o PCM da fala ao estimador sem gravar; "Sempre a mesma voz" desliga
- [ ] 3.4 Rótulos "voz aproximada" e "voz escolhida" na faixa do meio e aviso "sem voz parecida neste idioma"

## 4. Medir e verificar

- [ ] 4.1 Avaliar o F0 num conjunto de falas de teste (FLEURS, vozes masculinas e femininas): acerto, % indeterminado; decidir se o classificador ONNX entra
- [ ] 4.2 Typecheck e testes dos arquivos tocados; ampliar `tests/e2e/modo-interprete.e2e.ts` (escolher voz, voz fixa)
- [ ] 4.3 Conferir com fala real de voz grave e aguda, fone e alto-falante

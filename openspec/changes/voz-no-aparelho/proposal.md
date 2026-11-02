## Why

O dono ouviu a Supertonic 3 na página de teste do spike (`spike-supertonic-web`, 02/11/2026) e aprovou a voz ("bem
naturais e boas"), mas no app "não está legal": fora do capítulo I do Dom Casmurro (o único com áudio pré-gerado), o
"Ouvir" lê com as vozes do aparelho (`speechSynthesis`). O spike mediu que o modelo roda no navegador com o
`onnxruntime-web` que o app já traz: WebGPU com RTF ~0,03, WASM ~0,3 (8 threads) ou ~0,64 (1 thread), 1,9 a 3,2 GB de
memória e ~400 MB de download que o gzip não reduz.

A pré-geração no servidor continua (catálogo, qualquer aparelho, tela bloqueada). A voz no aparelho é o caminho para
QUALQUER texto (livro da pessoa, importação), que o servidor não pode receber pela regra de privacidade.

## What Changes

- **Motor `neural-local` real**: um adaptador Supertonic 3 em `src/gateway/adapters/` registrado pela porta que já existe
  (`registrarMotorDeVoz`, `core/voz/portaDeVoz.ts`), com a inferência num Web Worker (WebGPU, queda automática para WASM),
  os pesos no OPFS (download retomável por `Range`, tamanho e sha256 conferidos), progresso, cancelar, apagar e `liberar()`.
- **Narração frase a frase com pré-busca**: a próxima frase (até 2 à frente) é sintetizada enquanto a atual toca; o fim da
  frase (e o destaque) segue a duração real do áudio; o texto passa por `prepararTextoParaVoz`; frase longa é cortada com o
  mesmo corte de `frasesDoTexto`; frase que falha cai para a voz do aparelho sem silêncio, com aviso uma vez.
- **Escolha no `SeletorDeVoz`**: "Voz de alta qualidade (no aparelho)", com o custo dito antes de baixar, progresso,
  cancelar, "pronta" e apagar; rótulo "Voz sintetizada" (`ChipVozSintetizada`) enquanto ela lê.
- **Elenco**: com o motor ativo, as 10 vozes (F1–F5, M1–M5) entram no `atribuirVozes` determinístico; o narrador usa a voz
  escolhida pela pessoa (padrão F1). Sem gênero inferido pelo nome.
- **Portão por perfil** (função pura em `core/harness/vozNoAparelho.ts`): celular, Quest e iOS não recebem a oferta (com o
  motivo em uma linha); desktop sem isolamento (Safari) recebe por escolha explícita com aviso de memória; perfil protegido
  (menor ou idade não declarada) não recebe (licença OpenRAIL-M em revisão jurídica).
- **Flag `voz_no_aparelho`**, nascida DESLIGADA (PG 0018, SQLite 0060). `VITE_VOZ_MODELO_URL` (opcional,
  `degrada-capacidade`) com a origem na CSP `connect-src`.
- **Carregamento tardio**: o código do motor só chega por `import()`, com a flag ligada e o perfil permitindo.
- **Primeiro contato (02/11/2026)**: o dono ouviu "uma voz péssima" porque a "Automática" era a voz do sistema e a voz boa
  só entrava depois de abrir o seletor e baixar. Agora a "Automática" resolve para a voz no aparelho quando o modelo já está
  pronto (escolha manual de outra voz vence), e o primeiro "Ouvir" de quem pode usá-la mostra, na barra do narrador, um
  convite não modal ("Baixar e usar" / "Agora não", 30 dias) enquanto a voz do sistema já lê; pronta, a voz troca no
  próximo limite de frase. Para quem não pode (celular, iOS, Quest, perfil protegido, flag desligada, idioma fora do
  motor) e para capítulo com áudio pré-gerado, nada muda.

## Non-Goals

- Substituir o áudio pré-gerado do catálogo; clonar voz; voz para perfil protegido; ouvir com a tela bloqueada.
- Quantizar o modelo (fp16/int8) ou publicar os pesos no R2 (ato do dono, documentado no design).
- pt-BR × pt-PT (o modelo não distingue).

## Impact

- `src/core/voz/supertonic.ts`, `src/core/harness/vozNoAparelho.ts` (puros, novos).
- `src/gateway/adapters/supertonicLocal.ts` e `supertonicLocal.worker.ts`, `src/lib/voz/motorNoAparelho.ts` (lazy).
- `src/lib/voz/vozNoAparelho.ts` (estado e portão, estático e pequeno), `preferenciaDeVoz.ts`, `catalogoDeVozes.ts`,
  `lib/tts.ts` (métodos opcionais `preparar`/`liberar` no `TtsEngine`), `lib/leitor/narrador.ts`.
- `src/components/voz/SeletorDeVoz.tsx`, `VozNoAparelho.tsx`, leitor (`useElencoDoLivro`, `BarraDoNarrador`).
- Migrações de flag, `docs/flags.md`, `server/lib/config.ts`, `server/http/csp.ts`, `.env.production.example`.

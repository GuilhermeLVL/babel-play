> **Fase 3 de 6 do "Intérprete v3".** Independente da Fase 2; usa o histórico da Fase 1 só para mostrar a voz de cada fala.
> Plano: `C:\Users\Guilh\.claude\plans\faca-um-brain-storm-temporal-crystal.md`.
> **Decisão do dono (02/10/2026):** voz parecida pelo **gênero e faixa de tom aproximados, sem clonar a voz de ninguém.**

## Why

A tradução é lida sempre com a mesma voz do idioma: o app nunca informa uma voz (`o.voz`) ao servidor, a voz do aparelho
vem só da preferência do narrador da Leitura, e não existe escolha por gênero. Numa conversa entre duas pessoas, ouvir uma
voz masculina lendo a fala de uma mulher quebra a naturalidade. O servidor já tem vozes com gênero conhecido (Qwen3-TTS e
Chirp 3 HD); falta o seletor e uma estimativa honesta do gênero do falante.

## What Changes

- **Seletor de voz** por idioma: vozes disponíveis (nuvem e aparelho), com gênero quando se sabe, prévia ao tocar e
  velocidade. A escolha vale por idioma e fica neste aparelho.
- **Voz parecida automática.** Nos primeiros ~2 s de fala voiced de cada falante, o app estima faixa de tom (F0) e
  gênero **só como dica**, escolhe a voz do catálogo mais próxima e **fixa por falante** durante a sessão.
- **Override sempre à mão.** Um chip "Voz" na faixa do meio troca a voz do falante; a escolha manual vence e fica fixa.
- **Honestidade.** A tela diz "voz aproximada" quando é automática e "voz escolhida" quando é manual. Nunca afirma o
  gênero da pessoa. Nada de áudio é guardado nem enviado para estimar; só o rótulo fica na memória da sessão.
- **Sem clonagem.** `CAMPOS_DE_CLONAGEM` continua bloqueado; o contrato fica pronto para um opt-in futuro.

## Capabilities

### New Capabilities
- `catalogo-de-vozes`: lista de vozes por idioma com gênero, motor e prévia; escolha por idioma.
- `voz-por-falante`: estimativa local de faixa de tom, escolha automática da voz mais próxima, fixação por falante e override.

### Modified Capabilities
<!-- Nenhuma: o comportamento do modo intérprete ainda mora na change `modo-interprete` (não arquivada). -->

## Impact

- Servidor: `server/ai/provedoresDeVoz.ts` (metadados de gênero e idioma por voz) e nova rota
  `GET /api/ai/vozes?idioma=`; `ttsProxy.ts` já aceita `voz` (validar contra o catálogo, bloquear clonagem).
- Site estático (Quest): `functions/quest/tts.js` ganha o parâmetro `voz` onde o motor tiver.
- Cliente: novo `src/lib/voz/generoDoFalante.ts` (F0 local, puro), `src/lib/voz/catalogoDeVozes.ts`,
  `src/lib/voz/vozPorFalante.ts`; `vozDaNuvem.ts`, `lib/tts.ts` (`pickVoice` aceita voz pedida), `ModoInterprete.tsx`
  (chip e folha de voz), `controleDoInterprete.ts`.
- Plano: seletor vale em todos; voz de nuvem segue o entitlement `vozNatural` e a flag `voz_natural`.

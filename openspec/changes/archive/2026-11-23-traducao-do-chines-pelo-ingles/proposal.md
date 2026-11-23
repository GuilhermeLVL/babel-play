## Why

Falar mandarim no Babel Play transcrevia bem e ficava sem tradução quando o Chrome Translator não estava pronto. Medido em
17/10/2026 (Chrome 155, perfil novo, sem consentimento de nuvem): a transcrição local saiu certa em 1,0 a 1,9 s
(`我喜欢学习中文。今天天气很好,我们去公园散步吧!`), mas a tradução caía em `NoRouteError: sem rota disponível para a
capacidade "mt"`. Não há modelo local zh→pt, e os tradutores seguintes da cadeia (MyMemory, LLM do servidor) enviam o texto
para fora e exigem o consentimento de nuvem. Com o pacote do Chrome Translator já baixado o chinês funciona; no primeiro uso,
em outro navegador ou sem o pacote, fica sem tradução. Dois defeitos somados: o separador de frases não conhecia `。！？`
(uma fala com duas frases ia inteira ao opus-mt, que descarta a segunda) e o tradutor local não tinha o par zh→en.

## What Changes

- **Pivô pelo inglês no `OpusMtLocal`**: zh→en (`Xenova/opus-mt-zh-en`, ~113 MB em q8) e depois en→alvo (pt, es, fr, it, de),
  com os modelos que já existem. `supports`, `preload` e `translate` tratam o par. Só o chinês; o sentido contrário (→zh) e os
  outros idiomas ficam como estavam.
- **`separarEmFrases` entende `。！？`**: terminam a frase sem espaço depois e sem maiúscula depois (essas escritas não têm).
- **Lista de download** (`expectedModelIds`) e **cobertura anunciada na tela** (`mtCoverage`) passam a refletir os dois modelos.
- **Revisão fixada** do modelo novo em `revisoesDosModelos.ts` (cadeia de suprimentos), como os demais.

## Non-Goals

- zh↔pt com qualidade de LLM (isso segue sendo o Tradutor IA, com consentimento) e pt→zh local.
- Pivô para ja/ko/ar/ru/hi (o `ja-en` existe no Hub; fica registrado como `it.todo`).
- Normalizar a escrita do Whisper (às vezes tradicional, às vezes simplificada) para o zh-CN: mudança própria.

## Impact

- `src/gateway/adapters/opusMtLocal.ts`, `mtWorker.ts`, `modelCache.ts`, `revisoesDosModelos.ts`, `src/lib/languages.ts`,
  `src/core/texto/frases.ts`, `tests/traducao-zh-pivo.test.ts`, `tests/outros-idiomas.test.ts`.
- Download novo só para quem fala chinês: +113 MB (zh-en) além do en→alvo que o par já pedia. Dois tradutores cabem no LRU do worker.
- Latência: duas traduções em sequência por frase (cada uma na ordem de centenas de ms em WASM).

## Why

A pesquisa de 17/10/2026 sobre como entregar o mesmo valor com menos IA apontou que o maior atalho é **não chamar IA**: quem já tem a
legenda de uma série, de um anime ou de uma aula (o .srt ao lado do vídeo) não precisa transcrever nada. O app já EXPORTA legendas
(.srt/.vtt, `ExportarTranscricao.tsx`), mas não importa: a importação de documento aceitava só .txt, .pdf e .docx. A transcrição é a
parte mais cara da nuvem e a que mais depende do idioma; o texto da legenda já vem pronto, no idioma certo, sem custo.

## What Changes

- **`src/lib/import/legendas.ts`** (puro, sem DOM nem rede): lê .srt, .vtt e .ass/.ssa e devolve uma fala por linha, sem número de
  bloco, tempo, etiqueta (`<i>`, `{\an8}`), entidade HTML nem repetição consecutiva (legenda de rolagem).
- **A fila de importação** (`filaDeImportacao.ts`) lê a legenda NO NAVEGADOR (sem servidor, sem nuvem, também na edição estática) e
  monta a sessão-documento como qualquer texto; o idioma é detectado pelo texto.
- **A tela de importar** aceita `.srt,.vtt,.ass,.ssa` e diz isso ("Documento ou legenda").

## Non-Goals

- Ler legendas de plataformas (YouTube, Netflix, Prime): termos de uso e DRM; o parecer jurídico vem antes.
- Guardar os tempos das falas e sincronizar com o vídeo: a sessão é de leitura e estudo.
- Legendas bitmap (PGS/VobSub): precisam de OCR.

## Impact

- `src/lib/import/legendas.ts` (novo), `src/lib/import/filaDeImportacao.ts`, `src/components/views/Library.tsx`, `tests/legendas.test.ts`.
- Sem mudança de servidor, de banco nem de custo: o arquivo não sai do aparelho.

## Why

O leitor do Frasy narra com a voz do aparelho, que varia por celular e sistema, e não há audiolivro pronto com a frase
destacada em sincronia. O motor neural local está travado por licença (espeak-ng, GPL-3.0, no Kokoro pt-BR/es), e não há
bancada de qualidade de voz como a da transcrição e da tradução. Gerar voz na nuvem para todos, a cada audição, não escala
em custo. A pesquisa de 31/10/2026 (`reports/Audiolivros e leitura soluções atuais.md`) mostra caminhos com licença limpa
(Qwen3-TTS, Chatterbox MIT, VoxCPM2) que pedem GPU própria, o que combina com pré-gerar o catálogo de domínio público uma vez.

## What Changes

- **T1 Catálogo:** pré-geração em lote OFFLINE de áudio Opus + JSON de tempos por frase, guardados no R2 e servidos por CDN.
- **T2 Livro do usuário:** narração no aparelho por padrão; voz natural da nuvem só em plano com `vozNatural`, com
  consentimento por livro e as cotas atuais; sem exportar áudio.
- **T3 Elenco:** arquivo de "quem fala" gerado offline por livro do catálogo, consumido por `planejarElenco(..., previas)`.
- **Bancada** `scripts/eval-voz/` (round-trip Whisper, itens difíceis, estabilidade, RTF, escuta cega) com limiares por idioma.
- **Pré-processamento** de texto pt-BR em `src/core` (números, siglas, travessão).
- **Três flags** novas, desligadas: `audiolivros`, `audiolivros_nuvem`, `audiolivros_elenco` (migração PG 0017, número provisório).
- Esta change entrega só a especificação. Nenhum código de produção.

## Intenção, metas e não-metas

**Metas.** (1) Ouvir um clássico do catálogo com boa voz sem depender do aparelho. (2) Frase destacada, retomar, sono, offline por
capítulo. (3) Livro próprio ouvido no aparelho sem enviar texto a terceiros. (4) Custo marginal ~0 no catálogo e teto em USD na
nuvem paga. (5) Qualidade medida e decidida pelo ouvido do dono. (6) Abertura gradual com kill-switch.

**Não-metas.** Clonagem de voz. Exportar áudio de livro trazido. ZIP/MP3 de download do catálogo nesta entrega. Classificador de
nível de leitura. Ligar flag em produção. Definir preço.

**Anti-metas.** Avatar como única forma de ouvir. Contagem regressiva, urgência ou culpa nos textos de cota. Telemetria de escuta de menor.

## Capabilities

### New Capabilities

- `audiolivros`: audiolivro do catálogo (T1), narração do livro próprio (T2), elenco (T3), qualidade, abertura e custos.

### Modified Capabilities

- `leitura-e-livros` (spec de 26/10): o audiolivro NAR05 passa de "MP3 sob demanda + ZIP" para "pré-geração em lote + streaming".

## Impact

`src/core` (pré-processador, contrato do manifesto), `src/lib/leitor` (player sincronizado), `src/components/views/leitor`
(botão Ouvir, chip), `scripts/audiolivros` e `scripts/eval-voz`, `server/db/migrations-pg` (flags), `docs/flags.md`, `docs/runbooks/audiolivros.md`,
R2 (`frasy-audio`, `frasy-audio-staging`), CSP (`VITE_AUDIO_URL`). Documento principal: `docs/specs/2026-10-31-audiolivros-e-leitura.md`.

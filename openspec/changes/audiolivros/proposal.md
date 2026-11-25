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

## Revisão de 25/11/2026

**Estado:** precisa decisão do dono. Feito (de 21 tarefas abertas, 7 já são código): spike de motores (1.2), bancada `scripts/eval-voz/` (2.1),
pré-processador pt-BR (2.2), gerador de capítulo (3.2), player sincronizado no leitor com chip "Voz sintetizada" (3.3) e as três flags
desligadas (3.4, PG 0017 e SQLite 0059). Só o capítulo 1 de Dom Casmurro foi gerado (voz F1 provisória). Falta quase tudo o que depende do
dono: parecer jurídico (espeak-ng e OpenRAIL-M), limiares travados, lista dos 10 livros, buckets e CDN, amostra de 5%, beta. Elenco (F3) e
nuvem do livro próprio (F4) não têm código além das flags.

**O que ficou velho:**

- **O motor.** A F0 previa spike em GPU (Qwen3-TTS, Chatterbox, VoxCPM2, teto US$ 5). Em 02/11 o dono ouviu e aprovou a Supertonic 3
  (CPU, pesos OpenRAIL-M, repositório arquivado em 09/09/2026) e rejeitou o Kokoro. O spike de GPU deixa de ser necessário para o piloto;
  fica como plano B se o parecer reprovar a Supertonic.
- **Limiares provisórios** (CER ≤ 3%, WER ≤ 8%): nenhum motor os passa, e mesmo assim o dono aprovou a escuta. Precisam ser recalibrados (2.3).
- **"Premium"** (cota de voz natural e teto de US$ 0,60): o plano com `vozNatural` é o Plus na v4; spec ajustada.
- **A voz no aparelho** (`voz-no-aparelho`, `voz-natural-no-aparelho-kitten`) disputa o mesmo motor local e o mesmo bucket de pesos; a
  decisão "Supertonic ou Kitten" (README, incerta 3) vale também aqui para o T2.
- **Licença:** a spec ganhou o requisito de registrar licença de motor e o cenário do espeak-ng; antes só o runbook falava nisso.
- Retenção zero e menores continuam como estavam: sem telemetria de escuta de menor, nuvem só com consentimento e fora do perfil protegido.

**Esforço:** G (gerar 10 livros, ~72 h de áudio no piloto; elenco e nuvem são fases próprias). O caminho curto (3.1, 3.5 e 3 livros) é M.
**Valor para quem usa:** alto para quem lê clássicos em pt (voz boa e frase destacada, de graça); médio para o resto; o elenco é só acabamento.

**Dependências e conflitos:** depende do parecer jurídico e do bucket (`modelos-confiaveis-e-offline` também precisa do R2); do elenco da
`avatar-interprete` (`leitura_elenco`) para a F3; de `voz-no-aparelho` para o T2. Arquivos em disputa: `src/lib/leitor/`,
`src/components/views/leitor/`, `src/core/planos.ts`, `docs/flags.md` e migrações (numeração conferida contra a `main`).
Custo: geração local em CPU, sem API paga; R2 sem egress (~US$ 0,5 por mês estimado); nuvem do livro próprio só com teto declarado.

**Decisões do dono:**

1. Motor do catálogo: (a) Supertonic 3 F1, aprovada de ouvido, condicionada ao parecer sobre OpenRAIL-M; (b) rodar o spike de GPU
   (até US$ 5) antes de decidir; (c) esperar o parecer e usar Piper (vozes CC0 pt-BR). **Recomendo (a)**, com (c) como reserva.
2. Parecer jurídico (1.1): (a) enviar já um pedido só (espeak-ng, OpenRAIL-M, rótulo de voz gerada, ECA Digital para menores);
   (b) só depois de o piloto ficar pronto. **Recomendo (a)**: a resposta demora e não bloqueia a geração local.
3. Piloto (0.2, 3.5): (a) os 10 livros de `piloto.json`; (b) 3 livros curtos primeiro; (c) só Dom Casmurro inteiro. Ortografia: a do texto
   que o leitor mostra, porque o manifesto confere o hash do texto (a modernizada exigiria outra edição do livro). **Recomendo (b)**.
4. Abrir o beta e as flags (6.x): só depois de 3.1 (bucket e CDN), 3.5 e do parecer. Opções: (a) beta com 10 a 30 convidados adultos;
   (b) abrir direto para 5%; (c) adiar o beta para depois do parecer sobre menores. **Recomendo (a)**.

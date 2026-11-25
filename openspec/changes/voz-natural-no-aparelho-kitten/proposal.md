## Why

A voz grátis do app é a do sistema (`speechSynthesis`): em muitos aparelhos ela é robótica, ou nem existe para o idioma.
A Supertonic 3 (`voz-no-aparelho`) soa bem, mas pesa ~400 MB, pede 2 a 3 GB de memória, não roda no celular e fica
fora do perfil protegido pela licença OpenRAIL-M. O dono aprovou o **Kitten TTS 2** (KittenML, Apache-2.0) como a voz
GRATUITA de qualidade: `kitten-tts-2-mini` (~83 MB int8, um modelo para todos os idiomas) no computador e
`kitten-tts-2-pico` (~8 MB por idioma) no celular, rodando no navegador da pessoa.

O ponto crítico era a licença do caminho texto→fonemas: o pacote Python usa espeak-ng (GPL-3) para pt e es. O spike de
17/11/2026 (`scripts/voz/kitten/`) mostrou um caminho limpo: fonetizador PRÓPRIO por regras (pt-BR, es) e, no inglês, o
léxico CMUdict no alfabeto do misaki que já vem no repositório do modelo. Contra a saída do espeak (o que o modelo ouviu
no treino), o erro por símbolo ficou em 1,0% (pt, 15,6 mil frases), 0,4% (es, 8,2 mil) e 2,0% (en, 3 mil); pelo ouvido de
um ASR (Whisper small) o áudio com os fonemas do app é tão inteligível quanto o com os do espeak (CER pt 1,1% × 0,9%,
es 1,2% × 1,5%, en 0% × 0%). Nenhum código GPL entra no app.

## What Changes

- **Motor `kitten`** ao lado da Supertonic, na MESMA infraestrutura: worker próprio (`kittenLocal.worker.ts`) com o
  `onnxruntime-web` do app, pesos no OPFS (download retomável, tamanho e sha256 conferidos — o código comum sai do worker
  da Supertonic para `pesosNoAparelho.ts`), o mesmo motor de fila/pré-busca/cache/cancelamento/reserva
  (`motorNoAparelho.ts`, agora com o resolvedor de voz injetável) e a vaga `neural-local` da porta de voz.
- **Fonetizador próprio** (`src/core/voz/kitten/`: pt, es, en), puro, sem espeak.
- **Variante por aparelho** (função pura `core/harness/vozKitten.ts`): mini no computador com isolamento de origem
  (WASM em 4 threads garante tempo real; WebGPU é bônus conferido no aquecimento); pico no celular, no iOS e sem
  isolamento. Serve TODO perfil, inclusive o protegido.
- **Download sob demanda, por idioma**, só no toque da pessoa, com o tamanho dito antes e confirmação acima do teto do
  perfil (`confirmarDownloadAcimaDeMb` de `perfil.ts`). No mini, o 2º idioma custa só as vozes.
- **Quem lê em voz alta** (com a flag): voz natural no aparelho → voz boa do sistema (sem efeito nem robótica) →
  nenhuma (o texto fica na tela). Escolha explícita (voz do sistema, nuvem, Supertonic) vence.
- **Ajustes → Modelos no aparelho**: seção "Voz natural" com pt/en/es, baixar/cancelar/progresso, a voz escolhida
  (2 por idioma, do model card), ouvir amostra e apagar.
- **Flag `voz_kitten`** nascida DESLIGADA (PG 0020, SQLite 0062). `VITE_VOZ_KITTEN_URL` (opcional,
  `degrada-capacidade`) com a origem só em `connect-src`.
- **Espelho no R2**: `scripts/modelos/publicar-kitten-no-r2.ts` (baixa da revisão fixada no HF, confere sha256, grava em
  `kitten-tts-2/<variante>/<caminho>`). Nada é publicado nesta mudança.

## Non-Goals

- Ligar a flag ou publicar os pesos (ato do dono).
- Substituir a Supertonic ou a voz da nuvem; clonar voz; outros idiomas além de pt, en, es.
- O BART de G2P do inglês para palavra fora do léxico (fica com regras simples; melhoria futura).
- A lista de permissão de vozes do sistema (PR de vozes de qualidade): aqui só o corte de efeito/robótica que já existe
  em `vozesUteis.ts`; a lista entra quando aquele PR chegar.

## Impact

- Código: `src/core/voz/kitten.ts`, `src/core/voz/kitten/*`, `src/core/harness/vozKitten.ts`,
  `src/gateway/adapters/{kittenLocal,kittenLocal.worker,pesosNoAparelho}.ts`, `src/lib/voz/{vozKitten,motorGlobal,
motorNoAparelho,vozNoAparelho}.ts`, `src/components/voz/VozNaturalNoAparelho.tsx`, Ajustes, leitor.
- Dados: migração de flag (só semente). Config: `VITE_VOZ_KITTEN_URL`, CSP `connect-src`.
- Tamanho: nada no JS inicial (motor e worker por `import()`); a seção de Ajustes ~6 KB no chunk de Ajustes.

## Revisão de 25/11/2026

- **Estado**: o código está pronto (spike, core puro, fonetizador sem GPL, motor, tela de Ajustes, flag `voz_kitten` PG 0020/SQLite 0062 desligada, `VITE_VOZ_KITTEN_URL` e CSP, script de publicação, testes e prova no app real). Abertas: 4.3 (R2, flag e escuta, do dono), 4.4 (seletor do leitor, é dev, confirmado ausente em `SeletorDeVoz.tsx`) e 4.5 (opcional). Velho: a premissa "depende da decisão de `voz-no-aparelho`" segue de pé e é a pergunta 3 da faxina; o texto "a lista de permissão de vozes do sistema entra quando aquele PR chegar" ficou sem dono. Os PRs #201, #202, #205 e #206 não tocam a voz. A diferença que justifica a change continua valendo: o Kitten (Apache-2.0, ~8 MB por idioma no celular) serve também o perfil protegido, a Supertonic (OpenRAIL-M, ~400 MB) não.
- **Esforço**: P para a 4.4 (cerca de 1 dia); a 4.3 e a escuta são do dono (cerca de 0,5 dia, junto da sessão do R2).
- **Valor para quem usa**: alto para quem lê livros e usa jogos de áudio sem boa voz do sistema (muitos Android e o Chrome em Linux), inclusive menores; zero para quem já tem voz boa do sistema.
- **Dependências**: decisão de `voz-no-aparelho` (motor); o R2 e o portão de `modelos-confiaveis-e-offline` (mesma sessão de publicação); `SeletorDeVoz.tsx` é compartilhado com `voz-no-aparelho` e com `audiolivros` (elenco): fazer a 4.4 antes de mexer neles. Sem conflito com as outras quatro changes desta revisão.
- **Decisões do dono**:
  1. Motor local: (A) Kitten como padrão e arquivar `voz-no-aparelho` (a Supertonic fica como possível extra futuro); (B) manter os dois, Kitten no celular e perfil protegido e Supertonic no computador para adultos; (C) só Supertonic. **Recomendo A** (uma só manutenção, licença limpa para menores, peso 50x menor no celular) e reavaliar a Supertonic só se a escuta achar o Kitten claramente pior no computador.
  2. Publicar no R2 e ligar `voz_kitten` (4.3): fazer na mesma sessão do espelho de `modelos-confiaveis-e-offline` e ligar primeiro só para o id do dono, depois rampa; **recomendo** essa ordem.
  3. Escuta (4.3): o dono ouve pt, en e es no computador e no celular, ou delega uma escuta cega curta com 2 pessoas; **recomendo o dono ouvir, 10 minutos**.

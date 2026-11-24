## Context

- O inglês de quem tem nuvem vai à nuvem no `auto` (`sttRouter.ts`, ~linhas 529-533): `localModel` Moonshine como reserva,
  `preferCloud: true`, rótulo "nuvem (large-v3-turbo) · reserva local". O comentário justifica com "4,9% do
  large-v3-turbo contra 13,5% do Moonshine (bancada 2026-09)". Essa medição era Groq direto; o app passa pelo OpenRouter
  (`ops/ia-provedores.openrouter.json`, `openai/whisper-large-v3-turbo`, funções `stt`, `roteamento.zdr: true`).
- Medições de 09/10/2026 (mesmas 100 falas FLEURS en): nuvem pela rota padrão 27,8% [22,1–33,9], mediana 981 ms, p90
  1.573 ms; nuvem com pico a −3 dBFS 6,1% [4,8–7,5]; Parakeet 7,1%; Moonshine base q8 13,6% [10,5–17,2] (RTF 0,069). Diferença
  pareada nuvem normalizada × Parakeet: −0,9 [−2,2; +0,3] (empate); × Moonshine: −7,4 [−10,5; −4,6] (nuvem vence). A própria
  auditoria avisa que esse número não é comparável de forma justa com o aparelho, pois os modelos locais não receberam ganho.
- O envio: `systemAudio.ts` entrega `onUtterance(pcm: Float32Array, sampleRate, …)`; `GroqWhisperStt.transcribePcm`
  chama `audioParaStt(pcm, sampleRate)` (`src/gateway/audio/opusDoStt.ts`: Ogg Opus 24 kbps, WAV de reserva; no Quest, WAV
  direto). Nenhum ponto aplica ganho. `autoGainControl` está desligado nas capturas (`systemAudio.ts`, ~197-217), de propósito.
- A bancada de nuvem (`scripts/eval-fala/bancada/nuvem/stt.mjs`) envia WAV 16 kHz pelo OpenRouter, com `--ganho` que normaliza
  o pico a −3 dBFS (função local `normalizarPico`, ganho de até 40 dB). Pontuação em `pontuar.mjs`: WER de `src/core/eval/wer.ts`,
  IC 95% por bootstrap e diferença pareada (`src/core/eval/bootstrap.ts`).

## Decisions

1. **Normalizar no cliente, antes do encode.** Função pura `normalizarVolume(pcm, opts)` em `src/core/audio/normalizarVolume.ts`
   (core: sem DOM, sem React, sem rede). Chamada em `GroqWhisperStt.transcribePcm`, antes de `audioParaStt` e do `encodeWav`
   do Quest, só quando a flag `stt_nuvem_normalizar` está ligada. Não toca `onUtterance`, o buffer da captura nem o caminho
   local: devolve uma CÓPIA (o PCM original ainda alimenta os motores locais, a reserva local e a gravação).
2. **Como**: pico do trecho → ganho `g = 10^(−3/20) / pico`, limitado a `[1, 10^(40/20)]` (o teto de 40 dB é o do diagnóstico
   medido; nunca atenua, para não mexer em quem já está alto). Trecho quase silêncio (pico abaixo de um piso, ex.: −70 dBFS)
   não é amplificado, para não transformar ruído de fundo em "fala" e alimentar alucinação do Whisper. Como o pico final é
   −3 dBFS (< 1,0), não há clipping; um teste garante `|x| ≤ 1` na saída. Alternativa RMS descartada: dá ganho menor em
   fala com picos curtos e a evidência medida é com pico.
3. **Custo de CPU**: duas passagens lineares sobre o `Float32Array` (achar o pico, multiplicar), O(n), sem alocação além da
   cópia. Uma fala de 12 s a 16 kHz são 192 mil amostras (sub-milissegundo no desktop; ainda desprezível no celular frente
   ao encode Opus). O teste de desempenho do desenho é medir o tempo da função em 30 s de áudio no Quest/Android e registrar.
4. **Flag nascida desligada** (padrão do repo, como `voz_no_aparelho`): `stt_nuvem_normalizar`, migração PG
   `0024_flag_stt_nuvem_normalizar.sql` (`ON CONFLICT DO NOTHING`) e SQLite `0066_…` (`INSERT OR IGNORE`), `habilitada` falsa,
   `regras '{}'` (sem regra de plano), snapshots e journals, `PainelFlags`, `docs/flags.md` (com data para morrer: some depois
   de 100% estável) e a contagem do baseline PG. O cliente lê com `flagLigada(...)` em `pipelineDeFala.ts` e repassa um
   booleano à configuração do adaptador (o gateway não importa de `src/lib`; a ligação concreta é verificada na implementação).
5. **A medição é constante versionada, não comentário.** `src/core/rota/medicoesDeStt.ts` exporta, por idioma e motor, `{ wer,
ic95, n, data, fonte }` (os números de 09/10/2026 acima, e o resultado da nova rodada). `sttRouter` usa uma função pura
   (ex.: `inglesNuvemVenceAparelho(medicoes)`) que decide pela comparação com IC: a nuvem só é "primeiro" no inglês se a
   diferença pareada contra o motor local de inglês tiver o limite superior < 0. Sem medição normalizada registrada, ou com
   a flag desligada, vale o que a evidência dá hoje: o inglês fica no aparelho. Teste cobre os dois lados da decisão e
   proíbe "4,9" no comentário do roteador.
6. **Critério de decisão, escrito antes de medir** (REQ-014, REQ-015, REQ-017):
   - Liga `stt_nuvem_normalizar` se: WER en nuvem normalizada ≤ 8% (IC 95% reportado), a diferença pareada contra o "antes"
     tem limite superior < 0, o WER pt (100 falas) não piora além do IC 95% pareado do "antes", e a latência mediana e o p95
     não pioram mais que 10% (o normalizar é local e leve).
   - A rota do inglês muda para "nuvem primeiro" se, e só se, a nuvem normalizada vencer o motor local de inglês medido com
     IC 95% pareado (limite superior da diferença < 0). Empate (como o −0,9 [−2,2; +0,3] contra o Parakeet) NÃO basta para
     mudar: o inglês fica no aparelho. Contra o Moonshine, que é o motor local de inglês da rota `auto` hoje, a medição de
     outubro indica vitória da nuvem; a rodada nova confirma ou não.
   - Se o WER normalizado passar de 8%, a flag não liga e a rota do inglês fica no aparelho.

### Alternativas consideradas

| Opção                                        | Resultado                           | Por que não / por que sim                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Normalizar no cliente** (escolhida)        | 27,8% → 6,1% medido                 | Corrige na origem, serve a qualquer provedor, não envia nada novo à rede, reversível pela flag. Custo: CPU mínimo no cliente.                                                                                                                                                                                                                                                                       |
| Normalizar no servidor (`/api/stt`)          | Mesmo efeito esperado               | Exige decodificar o Ogg Opus no servidor (CPU e memória por pedido, mexe em `duracaoDeAudio`) e fica de fora do cliente do Quest/estático. A regra de privacidade continua intacta nas duas, mas o cliente é o lugar certo: já tem o PCM.                                                                                                                                                           |
| Fixar o provedor (Groq) no OpenRouter        | **Não funciona**                    | Medido: `only: ['groq']` foi atendido e cobrado pela DeepInfra; o `provider` da transcrição só aceita `zdr`, `data_collection`, `options`. `ignore` (usado hoje para Google) também não está documentado para STT; testar `ignore: ['deepinfra']` é possível, mas reduz a pool, pode zerar disponibilidade com ZDR e não é verificável no código. Fica como experimento futuro, fora desta mudança. |
| Groq direto, fora do OpenRouter              | 4,9% (set/2026), 365 ms mediana     | É troca de provedor, de contrato e de custo (mínimo de 10 s por pedido); decisão do dono, não desta mudança.                                                                                                                                                                                                                                                                                        |
| Manter o inglês no aparelho e não normalizar | 13,6% (Moonshine) / 7,1% (Parakeet) | É o fallback da regra de decisão; não corrige quem usa a nuvem por escolha ou por plano.                                                                                                                                                                                                                                                                                                            |

## Como medir

Mesmas 100 falas FLEURS em (a bancada `bancada-2026-10-navegador`), mesma chave, mesmo modelo, em sequência no mesmo dia:

```bash
# Antes (rota padrão, sem ganho)
node scripts/eval-fala/bancada/nuvem/stt.mjs --conjuntos fleurs_en
# Depois (ganho pela função pura nova; hoje existe o diagnóstico --ganho)
node scripts/eval-fala/bancada/nuvem/stt.mjs --conjuntos fleurs_en --ganho
# Guarda do português (não pode piorar)
node scripts/eval-fala/bancada/nuvem/stt.mjs --conjuntos fleurs_pt
node scripts/eval-fala/bancada/nuvem/stt.mjs --conjuntos fleurs_pt --ganho
# Pontuação: WER, IC 95%, diferença PAREADA e latência mediana/p95
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/nuvem/pontuar.mjs
```

Limites: a bancada envia WAV, não Ogg Opus; o efeito do Opus sobre áudio amplificado precisa de uma rodada à parte (Opus
24 kbps não piorou o WER em setembro, mas só sem ganho). Se o Node não codifica Opus, a verificação do Opus é uma rodada
manual no navegador (bancada `navegador/`). Custo estimado por lote: cerca de US$ 0,013 (medição de 09/10/2026).

## Risks / Trade-offs

- **Amplificar ruído**: ganho de até 40 dB em trecho sem fala pode virar alucinação. Mitigação: piso de pico abaixo do qual
  não amplifica; o filtro `filtrarAlucinacao` e a triagem do servidor seguem valendo; o português e uma amostra de áudio
  com ruído entram na checagem.
- **Medição só em FLEURS** (fala lida, volume baixo uniforme): não prova ganho em conversa, vídeo e ruído. A decisão vale
  para esse defeito de gravação; áudio real fica no experimento E-004/E-005 da pesquisa.
- **Medição do aparelho sem ganho**: a comparação nuvem × aparelho é injusta contra o aparelho. Se o dono quiser a comparação
  justa, é preciso medir os motores locais com o mesmo ganho (fora do escopo; registrado na auditoria como não medido).
- **Opus × ganho**: possível interação não medida (ver Como medir).
- **Dois pontos de verdade**: a bancada e o app devem usar a MESMA função (o `.mjs` passa a importá-la via tsx), para o
  número medido ser o do código entregue.
- **Latência**: o provedor continua sendo o mesmo (DeepInfra); a normalização não muda a latência de rede, só acrescenta
  microssegundos locais.
- **Não confirmado no código**: o comportamento de `ignore` para STT no OpenRouter, e se o `sttRouter` já oferece o Parakeet
  em inglês (o comentário diz que o Parakeet do "aparelho primeiro" é pt/es).

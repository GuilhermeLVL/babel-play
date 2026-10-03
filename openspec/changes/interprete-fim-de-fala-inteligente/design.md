## Context

O VAD (Silero, `systemAudio.ts`) fecha a fala com `REDENCAO_MS = 800`, descarta menos de 400 ms (`minSpeechMs`) e corta
à força em 12 s. Com STT local há decodificação especulativa a partir de 450 ms de silêncio (`ESPECULATIVO_MS`), mas ela
não vale na nuvem nem no aparelho leve. A tradução roda só no final (timeout 8 s), e a voz só lê o final traduzido; a
fila (`filaDeFala`) tem prazo de 8 s para começar e `10 s + 120 ms/caractere` para terminar, e a voz da nuvem tem 6 s
antes de cair para a voz do aparelho. Guarda de eco: cauda de 800 ms depois da voz.

Soma medida na nuvem: ~1,9 s (VAD 0,8 + STT 0,37 + tradução 0,72). A meta `tts_inicio` é ≤ 2,5 s no p50, só conferida
com a nuvem simulada. Decisões da bancada que não podem regredir: VAD 800 ms (custo 2,06× → 1,08×), tradução
gpt-oss-120b "low", filtro de alucinação nível 4.

## Goals / Non-Goals

**Goals:**
- Reduzir em pelo menos 400 ms o p50 do fim da fala até o início da voz, sem piorar WER nem custo.
- Mostrar tradução em andamento sem falar por cima do que ainda vai ser dito.
- Medir cada etapa para decidir com número, não com impressão.

**Non-Goals:**
- Modelo fala→fala (Fase 6). STT em streaming de verdade (fora do escopo; o parcial local atual fica como está).
- Mudar a cauda de eco (medir e propor depois; hoje serve ao guarda de eco).
- Trocar o Silero por outro VAD.

## Decisions

1. **Silero continua detectando o silêncio; o modelo de turno só decide se fecha.** O VAD passa a sinalizar
   "silêncio candidato" aos ~300 ms. Nesse ponto o modelo recebe os últimos ≤ 8 s de áudio (16 kHz mono) e devolve a
   probabilidade de "completa". `p ≥ θ` fecha agora; senão continua esperando, e o teto (hoje 800 ms de silêncio
   total, configurável até 2,5 s) fecha de qualquer jeito. Alternativas: modelo de texto (precisa do STT pronto, pior
   para a latência) e VAD puro mais curto (a bancada já mostrou que piora WER e custo).
2. **Smart Turn v3 em ONNX num worker.** ~8 MB, CPU, inferência na faixa de dezenas de ms; mesmo `onnxruntime-web` do
   VAD. O modelo é ativo estático, carregado no aquecimento. Cobertura de idiomas **verificada antes de ligar**: fora
   dela, cai no VAD fixo de 800 ms (queda silenciosa, registrada no medidor). Falha de inferência → "completa" com baixa
   confiança (nunca trava a conversa), como o `fail open` do projeto de origem.
3. **Piso dinâmico.** `pisoDoSilencio` = média móvel (alfa 0,9) das pausas **dentro** de falas da própria pessoa,
   limitada a [250 ms, 600 ms]; reinicia por sessão. Função pura com teste. Alternativa (piso fixo de 300 ms) descartada:
   pessoas devagar seriam cortadas.
4. **Tradução parcial só do que é estável.** Texto parcial vira "estável" depois de duas leituras seguidas iguais e
   terminando em fronteira de oração (pontuação ou ≥ 6 palavras). No máximo 1 chamada a cada 1,2 s por fala, e só com
   tradução local (opus-mt/Bergamot/Chrome) ou nuvem gerenciada com teto de custo; no plano Grátis só a local. O
   parcial traduzido é cinza, **nunca lido em voz alta**, e some quando o final chega. Alternativa (traduzir todo
   parcial) descartada: custo e piscadas.
5. **Voz por frase com ordem garantida.** O texto final é partido por `Intl.Segmenter` (sentence). Cada frase pede a
   síntese em paralelo (limite 2 em voo); o reprodutor toca na ordem; barge-in cancela pedidos e áudio. A primeira
   frase entra sem esperar as outras. Os prazos atuais (6 s da nuvem com queda para a voz do aparelho) valem por frase.
6. **Aquecimento ao abrir a tela.** `aquecerInterprete()` carrega VAD e modelo de turno (e o Whisper local quando é o
   motor), e chama `destravarVozDaNuvem`. Não envia áudio nem texto.
7. **Medidor com os campos que já existem.** Estender `captureMetrics` com `etapas: {vad, stt, mt, tts}`, `motor` e
   `custoEstimado` por fala; agregar por sessão; `/diagnostico` mostra p50/p95. Somente metadados; sem texto.
8. **Chave e portão.** `babel.interprete.fimInteligente` (desligada). Liga por padrão só depois da bancada: WER
   ≤ baseline de 800 ms (IC 95% pareado), fragmentos por fala ≤ baseline, custo de nuvem ≤ 1,08×, p50 do tempo até a
   voz ≥ 400 ms menor.

## Risks / Trade-offs

- [Modelo corta cedo demais em idioma fora da cobertura] → lista de idiomas aprovados; o resto usa o VAD fixo.
- [Parcial traduzido muda e pisca] → só trecho estável, cinza, com transição suave; o final sempre vence.
- [Custo de MT sobe com os parciais] → no máximo 1 chamada/1,2 s, só local no Grátis, e medidor de custo por sessão.
- [Síntese paralela fora de ordem] → fila com índice por frase; o reprodutor só avança na ordem.
- [Modelo de 8 MB pesa no Quest/aparelho leve] → carregado só no aquecimento; ausente, o app usa o VAD fixo.
- [Reduzir silêncio piora o eco] → a cauda de eco de 800 ms não muda nesta change.

## Migration Plan

Atrás de `babel.interprete.fimInteligente` (desligada) e, para o Premium, de um teste A/B local de duas semanas no
medidor. Reversão = desligar a chave. O ativo ONNX entra no `build:estatica` e na lista de ativos que o deploy já publica.

## Open Questions

- Quais idiomas o Smart Turn v3 cobre bem para os pares do produto (pt, en, es, zh, ja, ko, fr)? Medir na bancada com
  FLEURS antes de definir a lista.
- Vale reduzir a cauda de eco quando há fone? Medir antes: a detecção de fone no navegador não é confiável.

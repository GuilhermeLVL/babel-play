## Why

A leitura ativa em voz alta (`/leitura`, flag `leitura_ativa`, spec `leitura-ativa-voz-alta`) só funciona onde há Web Speech
com `processLocally` (Chrome/Edge 139+ no computador). Em todo o resto o modo "Ler em voz alta" aparece esmaecido: Safari,
iOS, Android, Firefox, Quest e Chrome mais antigo. Como os textos do acervo são só em inglês, e o app já roda o Moonshine
(inglês, MIT) no aparelho, o segundo motor era parte do desenho original e ficou aberto:

- `openspec/changes/archive/2026-11-20-leitura-ativa-textos-simples/tasks.md`, nota da 5.3: "o modelo local do roteador
  (Moonshine via `startLive`) como segundo motor ainda não está ligado".
- `src/lib/leituraAtiva/ouvinteLocal.ts:25`: `MOTORES_LOCAIS = [WEB_SPEECH_LOCAL]`, com o comentário `[Pendente: o modelo
local do roteador (Moonshine, startLive) como segundo motor]`.
- Falta, de fato, o `startLive` do modelo local: `WhisperLocalStt` expõe `transcribePcm` e `transcribeIfIdle` (parcial
  best-effort), mas não uma sessão contínua com `onPartial`/`onFinal` como a do Web Speech (`SttSession`). O desenho da
  change arquivada citava `startLive` do `sttRouter.ts`, que hoje não tem essa função.

Pedido do dono (ideia X4): leitura ativa ouvindo com Moonshine local, em inglês.

Esta change é um DELTA da spec `leitura-ativa-voz-alta` (já vigente em `openspec/specs/`); não repete as regras de mic,
privacidade, janela do alinhador e "pulada não é erro", que continuam valendo e passam a valer também para o segundo motor.

Sobreposição conferida: `parciais-incrementais` (arquivada) entregou o parcial vivo do Moonshine com LocalAgreement-2
(`parcialVivo.ts`, `parcialEstavel.ts`, flag `parciais_vivos`) para a CAPTURA; aqui reaproveitamos a ideia, não o código de
captura. `sombra-sem-web-speech` (nova) entrega o capturador de PCM e o VAD de uma frase; esta change o reutiliza.

## Para quem

Quem lê em voz alta no Safari/iPhone, Android, Firefox e Quest (o público do app é o celular), estudando inglês, incluindo
menores (a voz nunca sai do aparelho; o aviso do microfone de sempre).

## What Changes

- **Segundo motor local** `moonshine-local` em `src/lib/leituraAtiva/ouvinteLocal.ts`, depois do Web Speech local em
  `MOTORES_LOCAIS`. Implementa `MotorLocal.iniciar(lang, cb)` com um `SttSession`: PCM 16 kHz do microfone (o capturador de
  `sombra-sem-web-speech`), VAD em Worker para os limites da fala, e a decodificação do Moonshine do aparelho (`tiny` no
  celular fraco, Quest e economia de dados; `base` no resto, como `moonshineDoAparelho` do roteador).
- **Parciais para o alinhador**: a cada ~0,7 s de fala, decodifica a janela que cresce (só se o worker estiver ocioso, como
  `transcribeIfIdle`), passa pelo estabilizador (prefixo confirmado em duas decisões) e entrega `onPartial`; ao fim da fala
  (pausa do VAD), decodificação final com `onFinal`. O cursor monotônico do alinhador (`alinhadorDeLeitura.ts`) já tolera
  parcial que muda: a janela de 6 palavras e o "só avança" ficam como estão.
- **`descartar()` real**: zera os buffers de PCM e o estado do estabilizador, sem fechar o worker nem o modelo (reabrir o
  modelo a cada frase custaria segundos).
- **Disponibilidade** (`ouvinteDisponivel`): o modo "Ler em voz alta" deixa de esmaecer quando o idioma do texto é inglês,
  o aparelho comporta o Moonshine e a flag nova `leitura_voz_local` está ligada. Antes de ligar o microfone, mostra o
  tamanho do modelo (tiny ~32 MB, base ~67 MB) e só baixa com o toque da pessoa; sem modelo pronto e sem aceite, o modo
  continua esmaecido com a explicação.
- **Flag** `leitura_voz_local` (nova, nasce DESLIGADA, sem regra de plano, em `FLAGS_SENSIVEIS`); só tem efeito com
  `leitura_ativa` ligada. Desligada, o comportamento é o de hoje.
- Os textos e telas não mudam; muda de onde vem o parcial.

## Fora de escopo

- Outros idiomas (o Moonshine é só inglês, e o acervo de textos também; outro idioma exige outra change e outro motor).
- Nota de pronúncia, precisão em porcentagem ou "trocada": a regra "pulada não é erro" continua (ver `sombra-sem-web-speech`
  para nota).
- Reconhecimento em nuvem, em qualquer circunstância (a regra de "voz nunca sai do aparelho" não muda).
- Parciais do Moonshine para a CAPTURA ao vivo (já na `parciais-incrementais`); Moonshine v2 em fluxo
  (`planos-v3-e-rota-inteligente` Q.5) fica como evolução, não depende dele.
- Outros textos além do acervo atual.

## Riscos

- **O Moonshine não é de fluxo**: ele decodifica trechos inteiros. O parcial por janela que cresce custa CPU (re-decode a
  cada tick) e atrasa em celular fraco. Mitigação: cadência adaptativa pelo worker ocioso, tiny no fraco, e plano de medição
  com porta de saída (se o atraso do cursor passar de 1,5 s no celular fraco, fica só o modo "por pausa").
- **Sotaque brasileiro**: erro maior do modelo faz o cursor travar. A janela de 6 palavras, o lema e o aviso "O Frasy se
  perdeu" com toque que reposiciona já cobrem; medir com 10 a 20 brasileiros (pendência da change arquivada, agora com data).
- **Alucinação do Moonshine**: baixa (0 a 0,8%), mas o texto ouvido de silêncio nunca avança o cursor porque o parcial só
  vale com fala detectada pelo VAD.
- **Microfone e menores**: iguais ao da spec vigente (toque explícito, aviso em versão infantil, para ao ir para segundo
  plano). Áudio só em memória, solto a cada frase.
- **Memória no iPhone e no Quest**: o Moonshine tiny é leve, mas ele coexiste com a voz do aparelho (a narração) e com a
  tela; testar o heap (**[R]**).

## Custo

Zero de IA paga e de servidor. Banda: 32 a 67 MB uma vez por aparelho (cache). Esforço de dev: M depois da
`sombra-sem-web-speech` 2.2 (reuso do capturador); G se o capturador for feito aqui primeiro.

## Métrica de sucesso

Medida num conjunto fixo: os textos de `src/data/leitura/textos.json` lidos por 10 a 20 brasileiros e por TTS (referência).

- Palavras realmente lidas que o cursor marca como `lida`: >= 90% (sensibilidade).
- Palavras realmente puladas que viram `lida` por engano: <= 5%.
- Atraso do cursor depois da palavra dita: p50 <= 0,8 s e p95 <= 1,5 s (desktop); p95 <= 2,5 s no celular fraco (**[R]**).
- Avisos "O Frasy se perdeu" por texto: média <= 1.
- Adoção: % dos leitores em Safari/Android/Firefox/Quest que escolhem "Ler em voz alta" quando ele deixa de esmaecer.

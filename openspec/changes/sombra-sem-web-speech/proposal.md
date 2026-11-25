## Why

A nota da sombra (pronúncia) depende do reconhecimento de fala do navegador (Web Speech). Onde ele não existe, a pessoa
fica só com a gravação, sem nota:

- `SombraDaFala.tsx` tem dois ramos: com `reconhecimentoDoNavegador` (nota 0 a 100 por `scorePronunciation`) e sem ele
  (`data-testid="sombra-sem-reconhecimento"`: grava, ouve a própria voz, e o texto "A nota de 0 a 100 não está disponível
  no Quest/neste navegador").
- `recursosDoAparelho(...).reconhecimentoDoNavegador` é falso no Quest e no Firefox (e em qualquer navegador sem
  `SpeechRecognition`/`webkitSpeechRecognition`).
- O karaokê (`KaraokeDoPrototipo.tsx`) e a prática "Falar" da revisão (`Gravador.tsx`, `Pratica.tsx`) têm o mesmo corte.

Dois problemas de uma vez:

1. **Acesso desigual**: quem usa Firefox ou Quest (público do dono) não tem nota nem "o que o aparelho entendeu".
2. **Privacidade**: onde o Web Speech existe, no Chrome SEM `processLocally` ele manda o áudio ao fabricante
   (`registroDeMotores.ts:104`). O `SombraDaFala` chama `new SR()` direto, sem a régua `rapidoDoMicPermitido` que o
   `Gravador.tsx` usa para o perfil protegido. Isto é uma observação para o dono (ver "Fora de escopo"); um motor local
   resolve a causa: a sombra deixa de precisar da nuvem.

O app já tem, no navegador, tudo o que falta para ouvir uma frase curta sem Web Speech: Moonshine em inglês
(`moonshine-tiny` ~32 MB, WER 15,5%; `moonshine-base` ~67 MB, WER 10,9%; `adapters/moonshine.ts`), Whisper local
multilíngue (`WhisperLocalStt.transcribePcm`, `whisperLocal.ts:660`), Parakeet para pt/es onde cabe
(`parakeetCabeNoAparelho`) e o VAD em Worker (`gateway/capture/vadEmWorker.ts`). O que não existe é um caminho de
"gravar uma frase e transcrever depois, no aparelho" para a prática. Pedido do dono (ideia X3).

Sobreposição conferida: `modelos-confiaveis-e-offline` cuida da carga e da cura dos modelos (e a pré-carga 4.1);
`quest-caminho-leve` cuida do custo de CPU do Quest na captura; `leitura-ativa-voz-alta` (arquivada) usa só Web Speech
local. Nenhuma cobre a sombra sem Web Speech. Esta change USA o que elas entregam e não mexe neles.

## Para quem

Quem usa Firefox (computador) ou Meta Quest, e quem estuda com perfil protegido (menor) em qualquer navegador, onde a
nuvem não pode ouvir. Prioridade ao inglês (Moonshine, o motor mais leve e mais exato do app); pt, es e fr pelo Whisper
base na segunda fatia.

## What Changes

- **Motor local de enunciado** `src/lib/fala/ouvirFraseNoAparelho.ts`: grava a frase (PCM 16 kHz mono por AudioWorklet, com
  corte por silêncio pelo VAD) e a transcreve UMA vez, no aparelho, por `transcribePcm`. Escolha do modelo pela mesma
  política do roteador (`routeStt`/`modeloLocalDaImportacao`: inglês -> Moonshine, tiny no Quest e com economia de dados;
  outros idiomas -> Whisper base). Devolve texto e duração. O áudio fica só em memória e é descartado ao fim da tentativa.
- **A sombra, o karaokê e a prática "Falar" ganham a nota local** quando NÃO há Web Speech (ou quando o perfil não pode usar
  o Web Speech em nuvem), atrás da flag nova `sombra_local` (nasce DESLIGADA, sem regra de plano). Com a flag desligada,
  tudo continua como hoje.
- **Nota honesta e marcada como palpite**: a mesma `scorePronunciation` (similaridade textual, sem fonemas), com o texto
  "O aparelho entendeu: ..." e a ressalva de que o modelo pequeno erra. Palavra a palavra (o `conferirDitado` já diz quais
  saíram e quais escaparam). Sem reprovar, sem vermelho, sem som de erro, no tom da `leitura-ativa-voz-alta`.
- **Pedido de download com consentimento**: o modelo (32 a 117 MB) só baixa depois de a pessoa aceitar o tamanho, com
  `ModelPrepPanel`/aviso de preparo existentes; no Quest e com economia de dados, o tiny. Cache já existente do navegador.
- **Quem pode usar o quê**: no perfil protegido o motor local é o ÚNICO caminho com nota (nunca a nuvem); no adulto, o Web
  Speech continua preferido onde existir (zero download) e o local cobre o resto. A régua de escolha vive em função pura.

## Fora de escopo

- Nota por fonemas ou por acústica (GOP, wav2vec2): modelo de 300 MB ou mais e sem validação em português do Brasil; a nota
  continua textual.
- Trocar o motor dos jogos de ditado e de escuta, ou a captura ao vivo (já têm motor próprio).
- Qualquer envio de áudio ou texto ao servidor: nada novo vai à rede.
- Corrigir a sombra de hoje, que chama o `SpeechRecognition` sem `rapidoDoMicPermitido` (possível envio ao fabricante do
  navegador no perfil protegido): registrado como achado para o dono (relatório); consertar é change de conformidade
  própria, não parte desta (o motor local só remove a necessidade).
- Mais idiomas além de en, pt, es, fr nesta change.

## Riscos

- **Qualidade do modelo pequeno**: Moonshine tiny erra 15,5% das palavras em fala limpa (bancada FLEURS); sotaque
  brasileiro e microfone de headset pioram. A nota pode punir quem falou certo. Mitigação: nota como palpite; só avisar "o
  aparelho não entendeu" abaixo de limiar de confiança; medir concordância antes de ligar (plano abaixo).
- **Memória e CPU do Quest**: 3 núcleos e uma thread por motor (`quest-caminho-leve`); a transcrição roda fora da captura
  (a sombra não corre junto), e o tiny é obrigatório ali.
- **Alucinação em silêncio**: Whisper alucina em trechos sem fala (70,6% no tiny); o Moonshine quase não (0 a 0,8%). Em
  idiomas via Whisper, corte por VAD e por duração mínima, e descartar texto quando o VAD não achou fala.
- **Download em dados móveis**: aviso de tamanho, pergunta antes, nunca silencioso.
- **Menores**: áudio só em memória e descartado; microfone só por toque; sem upload; texto de aviso em versão infantil.

## Custo

Zero de IA paga e de servidor. Custo é de banda e CPU do aparelho, e de hospedagem dos modelos, que já estão no CDN/Hub
(o Moonshine vem do Hub; o espelho no R2 é a pendência de `modelos-confiaveis-e-offline` 3.4). Esforço de dev: G (motor
novo, três telas, medição em aparelho).

## Métrica de sucesso

- Cobertura: % das tentativas de sombra em Firefox/Quest/perfil protegido que terminam com nota (hoje 0%; meta >= 80% das
  tentativas com fala audível).
- Qualidade: concordância da nota local com a nota do Web Speech nas MESMAS gravações (Chrome desktop), correlação de
  Spearman >= 0,8 e diferença absoluta mediana <= 10 pontos; WER do modelo nas frases do acervo <= 20% (en).
- Experiência: tempo da nota depois de parar, p50 <= 2 s no desktop e <= 4 s no Quest (**[R]**).

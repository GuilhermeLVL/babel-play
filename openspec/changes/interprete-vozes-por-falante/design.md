## Context

`provedoresDeVoz.ts:77-141` descreve os motores: Chatterbox Multilingual (padrão, 23 idiomas, **sem voz selecionável**),
Qwen3-TTS (Vivian, Serena, Uncle_Fu, Dylan, Eric, Ryan, Aiden, Ono_Anna, Sohee) e Chirp 3 HD (Kore, Charon, Aoede, Puck,
Leda, Orus). O cliente só envia `voz` se `o.voz` vier preenchido, e a tela nunca preenche. A voz do aparelho
(`speechSynthesis`) vem de `pickVoice` e `babel_voice_prefs`; o navegador **não informa o gênero** das vozes do aparelho.
A diarização por embedding (`speakerCluster.ts`) existe mas não roda no intérprete. No intérprete há dois falantes
conhecidos pelo lado (`meu` e `outro`), porque o app já sabe de que lado vem cada fala.

## Goals / Non-Goals

**Goals:**
- Escolher e prever a voz por idioma, com prévia e sem surpresa.
- Aproximar o gênero/tom do falante na leitura da tradução, de forma estável durante a sessão.

**Non-Goals:**
- Clonar a voz (bloqueado de propósito). Reconhecer identidade. Diarizar mais de dois falantes (Fase 4, conversa virtual).
- Garantir acerto: o gênero estimado é uma dica, e o usuário manda.

## Decisions

1. **Catálogo = metadados no servidor + prévia.** `GET /api/ai/vozes?idioma=` devolve `{id, nome, genero, idioma, motor}`
   do que o provedor ativo oferece; gênero vem de tabela conferida na documentação de cada provedor (guardada em
   `provedoresDeVoz.ts`, com teste que falha se uma voz sem gênero for exposta). Voz do aparelho entra no catálogo com
   `genero: 'desconhecido'`, exceto nomes de uma tabela curta de vozes conhecidas. Alternativa (adivinhar gênero por
   nome de voz do aparelho) descartada: errada com frequência.
2. **Estimativa local de F0.** `generoDoFalante(pcm16k)` calcula F0 por autocorrelação/YIN em quadros com voz, usa a
   **mediana** de pelo menos 1,5 s de fala voiced e devolve `{faixa, genero, confianca}`: masculino abaixo de ~155 Hz,
   feminino acima de ~185 Hz e **indeterminado** entre os dois (a zona de sobreposição), com confiança por quantidade de
   quadros. Roda no PCM que o pipeline já tem; nada vai ao servidor nem é gravado. Alternativa mais precisa (classificador
   ONNX de gênero) fica como melhoria medida na bancada, não bloqueia esta change.
3. **Casar com o catálogo.** Dada a faixa e o gênero, escolher a voz do idioma da tradução com o mesmo gênero e, entre
   as empatadas, a de tom mais próximo (tabela de tom médio por voz quando existe; senão a primeira estável). Sem voz
   do gênero, usar a padrão e **dizer** que não há voz parecida.
4. **Fixar por falante.** `vozPorFalante` guarda `lado → voz` na sessão. A primeira escolha automática vale até o fim;
   só o override manual troca. Indeterminado não fixa: usa a padrão até uma medição mais confiável (no máximo 3 tentativas).
5. **Override sempre à mão.** Chip "Voz" na faixa do meio abre a folha com as vozes do idioma da leitura daquele lado,
   com prévia e velocidade. A escolha manual grava em `babel.interprete.vozes` (por idioma, neste aparelho) e vence a
   automática.
6. **Honestidade na tela.** Rótulo "voz aproximada" (automática) ou "voz escolhida" (manual). Sem texto que afirme o
   gênero da pessoa. O recurso pode ser desligado ("Sempre a mesma voz").
7. **Caminho no servidor.** `ttsProxy.ts` valida `voz` contra o catálogo do idioma; qualquer campo de clonagem continua
   sendo rejeitado (`CAMPOS_DE_CLONAGEM`). No site estático (`functions/quest/tts.js`), `voz` vale onde o motor a aceita.

## Risks / Trade-offs

- [Gênero errado por F0] → só dica, indeterminado não decide, rótulo honesto, override a um toque.
- [Voz muda no meio da conversa] → fixa por falante; só manual troca.
- [Chatterbox não tem vozes] → o catálogo diz que não há escolha nesse motor; a escolha só vale em Qwen3/Chirp/aparelho.
- [Inferir gênero pela voz é sensível] → local, sem gravar, sem enviar, sem rótulo afirmativo, desligável.
- [Metadados de gênero desatualizados] → teste de contrato e conferência com a documentação do provedor a cada troca.

## Migration Plan

Aditivo. O padrão sem escolha continua como hoje. Preferência nova em `babel.interprete.vozes` é opcional. Reversão =
desligar "voz parecida" (chave) ou reverter o commit.

## Open Questions

- Gravar a preferência de voz na conta (entre aparelhos) ou só neste aparelho? Proposta: só neste aparelho agora.
- Medir um classificador ONNX de gênero na bancada antes de oferecer "voz parecida" como padrão? Proposta: sim, se o F0
  der mais de 20% de "indeterminado" ou acerto abaixo de 90% no conjunto de teste.

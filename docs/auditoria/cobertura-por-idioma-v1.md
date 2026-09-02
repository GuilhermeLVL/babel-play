# Cobertura por idioma (G1 da frente B)

O que a plataforma entrega em cada um dos idiomas que oferece. Levantado no código e medido na
máquina em 02/09/2026, depois das correções do G1 multi-idioma.

## Níveis

| Nível | Significado |
|---|---|
| **Completo** | Trilha + níveis + voz + os 9 jogos elegíveis |
| **Parcial** | Vocabulário funciona, mas falta trilha, nível ou voz; parte dos jogos indisponível |
| **Só seu conteúdo** | Funciona apenas com o que você importa ou grava |
| **Não suportado** | Detecção, comparação de resposta ou entrada não funcionam |

## Estado hoje

| Idioma | Nível | Trilha | Voz TTS¹ | Jogos elegíveis | O que falta para subir |
|---|---|---|---|---:|---|
| **inglês** | Completo | 2.784 palavras (CEFR-J + Octanove) | sim | 9 | — |
| **português** | Parcial | não | sim | 9 | trilha |
| espanhol, francês, alemão, italiano, holandês, polonês, turco, indonésio, vietnamita, sueco, dinamarquês, norueguês, finlandês, húngaro, tcheco, romeno | Só seu conteúdo | não | depende do SO | 9 (6 sem voz) | trilha + voz |
| **russo, ucraniano, grego** | Só seu conteúdo | não | depende do SO | 7 | trilha + voz + gate de alfabeto² |
| **japonês, coreano, chinês** | Só seu conteúdo | não | depende do SO | 7 | trilha + voz + gate de alfabeto² |
| **árabe, hebraico** | Só seu conteúdo | não | depende do SO | 7 | trilha + voz + RTL exercitado em uso real |
| **hindi, tailandês** | Só seu conteúdo | não | depende do SO | 7 | trilha + voz + validar a detecção nova sobre baralho real |

¹ **Voz é do sistema operacional, não do app.** Medido neste navegador: **2 dos 28** idiomas têm
voz (pt e en). Sem voz, os três jogos de áudio ficam bloqueados com motivo `sem-voz`, a menos que
haja gravação real do usuário. Em outra máquina o número muda — é por isso que a coluna diz
"depende do SO" em vez de um sim/não fixo.

² Termo e Caça-palavras exigem alfabeto latino por gate declarado (`requisitos: { alfabeto:
'latino' }`): a grade e o teclado QWERTY não escrevem a palavra. É recusa honesta com motivo, não
falha.

## O que mudou com o G1

Antes das correções desta rodada, a coluna "jogos elegíveis" das linhas não-latinas era menor e a
razão era invisível:

- **Japonês perdia 70% do baralho** na importação (`palavra-curta` descartando kanji isolado).
  Um baralho de 10 palavras virava 3 — abaixo do mínimo de qualquer jogo.
- **Bingo e conectores quebravam calados** fora do gate.
- **Hindi e tailandês não eram reconhecidos** pelo detector de escrita.
- **RTL não existia**: texto árabe e hebraico sem direção declarada.

## Como isto chega ao usuário

A tabela precisa aparecer na escolha de idioma — não como documento. Quem vai estudar japonês tem
de saber, **antes de investir tempo**, que ali não há trilha e que dois jogos não abrem. Sem isso,
o G2 conserta o dado e deixa a expectativa intacta (risco 4 do plano).

Forma proposta: a faceta de idioma já mostra a contagem de palavras; ganha um selo curto de nível
de cobertura, e a Sala mostra a linha completa do idioma selecionado.

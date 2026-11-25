# Leitura em voz alta com Moonshine local: réguas (escritas ANTES de medir)

Change `leitura-ativa-com-moonshine`, tarefa 1.1. Data: 25/11/2026. Este arquivo é commitado antes de qualquer resultado; mudar uma régua depois de medir exige nova data e o motivo, no fim do arquivo.

## Réguas do acompanhamento da leitura

| Régua                                                                   | Limite                                 | Onde se mede                                             |
| ----------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| Sensibilidade: palavra lida em voz alta é marcada como lida             | >= 90%                                 | 1.2 (offline, TTS) e 1.3 (3 pessoas)                     |
| Falso positivo: palavra pulada marcada como lida                        | <= 5%                                  | 1.2 (texto lido pulando uma palavra) e 1.3               |
| Atraso entre a fala e o destaque (p95)                                  | <= 1,5 s no desktop; <= 2,5 s no fraco | 1.2 (cadências 0,5, 0,7 e 1,0 s) e 4.2 [R] nos aparelhos |
| Avisos "O Frasy se perdeu um pouco" por texto lido                      | <= 1                                   | 1.3 e 4.2                                                |
| Alucinação: parcial ou final com texto durante silêncio e ruído de sala | <= 1% dos trechos                      | 1.2 e 1.3 (filtro `filtrarAlucinacao` incluído)          |

Modelos candidatos: Moonshine tiny (celular fraco, Quest, economia de dados) e base (o resto), como a escolha do roteador (`moonshineDoAparelho`). Parar na primeira régua reprovada. Reprovou o atraso no aparelho fraco: manter o modo "por pausa" (`soPorPausa` em `motorMoonshine.ts`) ali e reescrever a régua de atraso para "no fim de cada frase".

## O que fica FORA destas réguas

- Sotaque brasileiro em inglês: é o que a avaliação com 10 a 20 pessoas (4.2 [D]) mede; a simulação com TTS americano não prova isso.
- Memória e tempo de carga no iPhone e no Quest (4.3 [R]).

## Registro de mudanças das réguas

Nenhuma até agora.

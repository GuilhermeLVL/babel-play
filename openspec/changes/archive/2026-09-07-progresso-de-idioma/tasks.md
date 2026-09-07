## 1. Servidor

- [x] 1.1 Split mic/tab no speakingMs
- [x] 1.2 Ranking de palavras difíceis
- [x] 1.3 Acerto por tipo de exercício

## 2. Cliente

- [x] 2.1 Painel "Suas palavras difíceis"
- [x] 2.2 Relatório exportável (sessão/semana)
- [x] 2.3 Jogos com fonte "difíceis" — FonteId 'dificeis' no core (recorta pelo ranking do
      servidor, NA ORDEM dele; ids injetados vivos, nunca persistidos), opção na Sala de Escolha
      com estado vazio honesto, origem própria gravada em exercise_results, degradação para o
      baralho quando o ranking esvazia (revisar bem TIRA palavra do ranking — é o objetivo)

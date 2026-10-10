# Tarefas

Nenhuma fatia começa sem o sim do dono. Em toda fatia: `tsc --noEmit`, `tsc -p tsconfig.estrito.json --noEmit`,
lint e os testes dos arquivos tocados; a suíte inteira roda na CI. Fatia que mexe em dado gravado: backup,
ensaio numa cópia do banco, contagem antes e depois, reversão escrita.

## 1. Medir sem mudar comportamento (risco baixo)

Feita em 10/10/2026 (migração 0052; sem commit). Só o servidor com conta grava os campos novos: a
edição estática (IndexedDB) continua gravando a revisão de antes.

- [x] 1.1 `review_logs` ganha origem (revisão ou qual jogo), formato, tempo de resposta, meta usada e
      retenção prevista; colunas novas, nulas para o passado
- [x] 1.2 Rodada de jogo grava o nível jogado e a fonte
- [x] 1.3 Relatório de calibração do FSRS (previsto × real) por usuário, só leitura, no admin
      (`GET /api/admin/calibracao/:id`; sem tela, por `curl`)
- [x] 1.4 Testes de gravação e de calibração com histórico sintético

## 2. Agregados e limpeza (risco baixo)

Feita em 10/10/2026 (migração 0053; sem commit), com duas ressalvas escritas abaixo.

- [x] 2.1 Tabela de agregados diários por usuário e idioma, preenchida na escrita e reconstruível do bruto
- [ ] 2.2 `/api/metrics/*` e a Memória dos Cartões leem dos agregados; teste de igualdade com a conta antiga
      - [x] Memória dos Cartões: as revisões de sempre (11 ms para 0,3 ms no sintético)
      - [x] `/api/metrics/profile`: total de revisões, acertos e dias de prática. Sem ganho de tempo
            (149 para 156 ms no sintético): as palavras difíceis (por cartão) e a ofensiva no fuso do
            processo não saem de agregado por dia, e a leitura das revisões continua
      - [ ] `/xp`, `/temporada`, `/missoes`, `/maestria`: ficaram no caminho antigo (baldes pela
            meia-noite do processo, janelas por instante exato e soma por rodada não saem de agregado
            por dia no fuso do usuário). Pedem decisão: mudar o balde para o dia do usuário, ou
            guardar por rodada
      - [ ] Falas do perfil (tempo de fala, palavras por minuto): é a leitura mais cara e não foi tocada
- [x] 2.3 Estado por item nos jogos (acertos, erros, último resultado); ninguém lê ainda
- [ ] 2.4 Tarefa diária: apagamento físico do que tem `deleted_at` com mais de 30 dias, `PRAGMA optimize`,
      checkpoint do WAL; orçamento de tamanho por usuário conferido na CI de carga
      - [x] apagamento físico (prazo em `LIMPEZA_RETENCAO_DIAS`) e `PRAGMA optimize`
      - [x] checkpoint do WAL: existe, DESLIGADO por padrão (`LIMPEZA_CHECKPOINT=1`), porque não foi
            possível confirmar que não atrapalha o Litestream 0.5.17
      - [ ] orçamento de tamanho por usuário na CI de carga
- [x] 2.5 Medir antes e depois: tempo das rotas de métricas e tamanho do banco sintético

## 3. Seletor único (risco médio, sem migração)

- [ ] 3.1 `src/core/selecao/`: uma definição de "difícil", uma régua de memória, uma função que devolve
      itens, ordem e dificuldade; caracterização do comportamento atual antes de trocar
- [ ] 3.2 A Revisão usa o seletor (limites por dia, novas pela carga prevista)
- [ ] 3.3 Os jogos usam o seletor, no servidor e na edição estática; some a divergência cliente × servidor
- [ ] 3.4 Regra de jogo × memória: só recordação conta; mapa por jogo revisto; um efeito por palavra por dia
- [ ] 3.5 Elo por palavra e por usuário com desconto de chute; dificuldade para todo cartão, não só os jogados
- [ ] 3.6 Dificuldade adaptativa dos jogos atrás de flag, com a medida de acerto e de abandono por rodada

## 4. Métricas na tela (depois de 2 e do protótipo aprovado)

- [ ] 4.1 As três da tela principal e as nove da Memória, com a definição e a frase da pesquisa
- [ ] 4.2 Cobertura de um vídeo ou texto pelo vocabulário conhecido, dita como "conhece X% das palavras"
- [ ] 4.3 Agrupamento por fonte no padrão do catálogo de fontes

## 5. Corrigir a chave de dedup (risco alto: dado gravado)

- [ ] 5.1 Chave nova por idioma (mantém acentos e marcas que distinguem palavras; kana, hindi, tailandês,
      cirílico), com a tabela de colisões de hoje como teste
- [ ] 5.2 Ensaio numa cópia do banco do dono: quantos cartões se separam, quantos mudam de chave
- [ ] 5.3 Migração com backup e reversão; cartões fundidos por engano voltam a ser dois quando há ocorrência
      que prove
- [ ] 5.4 A mesma regra na edição estática (IndexedDB)

## 6. Dicionário e forma base (risco alto)

- [ ] 6.1 Dicionário por idioma com forma base e faixa de frequência (embarcar o mapa do Wikidata que já
      existe nos scripts; conferir licença e tamanho por idioma)
- [ ] 6.2 Cartões e ocorrências apontam para o dicionário; ocorrência aponta para a fala em vez de copiar a
      frase
- [ ] 6.3 Contagem de palavras conhecidas por forma base
- [ ] 6.4 Anki enxuto: o texto da nota guardado uma vez

## 7. Compactar e ajustar (por último)

- [ ] 7.1 Histórico bruto por 180 dias; o resto vira (palavra, dia, nota). Só depois de 2 em produção
- [ ] 7.2 Pesos do FSRS por usuário, no máximo uma vez por mês, só se a calibração de 1.3 mostrar ganho

## Decisões do dono

- [ ] D.1 Alvo de acerto dos jogos (proposta: 80 a 90%) e se a dificuldade adaptativa nasce ligada
- [ ] D.2 Jogo de reconhecer deixa de mexer na agenda (hoje mexe)
- [ ] D.3 Prazo do apagamento físico (proposta: 30 dias depois de apagar)
- [ ] D.4 Guardar tempo de resposta (dado de comportamento; não usado em anúncio)
- [ ] D.5 Dois botões como padrão na Revisão (o hábito de usar "difícil" para "esqueci" é o que mais
      atrapalha o algoritmo)

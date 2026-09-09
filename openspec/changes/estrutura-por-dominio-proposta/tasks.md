> **Esta change é a PROPOSTA.** Ela não move arquivo nenhum: entrega a árvore, o `mapa.csv` com os
> 349 arquivos e a ordem de execução. As movimentações são as changes que ela lista.

## 1. Levantamento

- [x] 1.1 mapa de 349 arquivos (domínio, camada, importadores) a partir do grafo de imports
- [x] 1.2 seções por faixa de linha dos seis arquivos-deus
- [x] 1.3 acoplamentos de caminho catalogados (45 literais em 20 arquivos de configuração)
- [x] 1.4 cruzamentos de fronteira `server/` -> `src/` (3 fora do núcleo, 42 legítimos)
- [x] 1.5 `mapa.csv` versionado

## 2. Decisão do dono

- [ ] 2.1 aprovar (ou ajustar) a árvore-alvo e a ordem antes de qualquer `git mv`

## 3. As changes que esta proposta abre (nenhuma começa sem 2.1)

- [ ] 3.1 `servidor-app-e-bootstrap`
- [ ] 3.2 `portoes-cobram-por-camada-e-nao-por-pasta` (com prova negativa por regra)
- [ ] 3.3 `dividir-arquivos-deus` (6 commits)
- [ ] 3.4 `mover-<dominio>` (10 commits)
- [ ] 3.5 `nucleo-recebe-o-que-o-servidor-usa`
- [ ] 3.6 `formatacao-e-lint-estrito` (a passada do Prettier, por último)

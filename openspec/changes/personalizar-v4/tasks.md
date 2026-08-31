## 1. Protótipos

- [x] 1.1 Página HTML com as 3 direções (impeccable + artifact-design)
- [x] 1.2 Escolha do dono — DIREÇÃO A (trilha de temporada), 31/08; versão completa publicada no artifact para aprovação final antes da etapa 2

## 2. Implementação (após 1.2)

- [x] 2.1 `ItemDaColecao` único; raridade única
- [x] 2.2 Reorganização das abas na direção escolhida
- [x] 2.3 Conquistas em um lugar só (aba Desafios; Perfil mantém por decisão de acesso)
- [ ] 2.4 (pendente: pooling/cache no ParticleCanvas) Pooling + cache de emoji no ParticleCanvas

## 3. v4 no app (31/08, protótipo aprovado)

- [x] 3.1 `galeria/passe.ts` — lente de 100 slots sobre a economia existente; conteúdo antes de moeda (teste prende)
- [x] 3.2 `PasseDeTemporada.tsx` — trilha com equipar, pager por décadas, Seeds de slot creditadas idempotentes (verificado ao vivo)
- [x] 3.3 Loja.tsx → 4 áreas: Passe · Biblioteca · Loja · Desafios (ícones lucide; alias 'progressao'→'passe'; aba Progressão absorvida)
- [x] 3.4 Taxonomia de editabilidade E0–E3 + estratégia de geração de conteúdo (design.md)
- [ ] 3.5 Fileira Premium do passe — atrás da spec economia-de-creditos
- [ ] 3.6 Vitrine rotativa da Loja e desafios por minijogo com recompensas exclusivas — próxima rodada

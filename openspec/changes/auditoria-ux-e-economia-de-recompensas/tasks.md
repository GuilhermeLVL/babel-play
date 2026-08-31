## 1. Auditoria (a fazer PRIMEIRO, antes de qualquer código novo)

- [ ] 1.1 Percorrer tela a tela como usuário leigo (navegador + árvore de acessibilidade) e
      registrar incoerências em `docs/auditoria/ux-v2.md`: ícones, nomes, redirecionamentos
- [ ] 1.2 Rodar o detector da skill `impeccable` em todas as telas (não só nas novas)
- [ ] 1.3 Inventariar TODA capacidade de edição do app e classificar em E0–E3
- [ ] 1.4 Matriz liberdade × progressão: para cada capacidade, dizer se é DIREITO (nunca tranca)
      ou RECOMPENSA (nível/moeda/conquista) — e apontar as que estão na categoria errada hoje
- [ ] 1.5 Listar as funções antigas que furam a gamificação, com o custo de cada correção

## 2. Economia de recompensa do passe

- [ ] 2.1 Desenhar a curva: o que cada um dos 100 níveis entrega (planilha/tabela na spec)
- [ ] 2.2 Agrupar Seeds em blocos densos; nenhum nível "vazio"
- [ ] 2.3 Recompor `galeria/passe.ts` para a curva nova (testes de invariante seguem valendo)
- [ ] 2.4 Verificar no navegador a sensação de ganho ao longo de várias décadas

## 3. Perfis e restauração

- [ ] 3.1 Tela/superfície de perfis salvos (salvar do estado atual, aplicar, renomear, excluir)
- [ ] 3.2 "Voltar ao visual original" em Personalizar — reset para os defaults de `appearance.ts`
- [ ] 3.3 Testes: perfil só aplica o que o usuário possui (`faltaParaOPerfil` já faz a checagem)

## 4. Correções da auditoria

- [ ] 4.1 Aplicar as correções de coerência e redirecionamento achadas em 1.1
- [ ] 4.2 Reposicionar as capacidades classificadas na categoria errada em 1.4

## 1. Auditoria (a fazer PRIMEIRO, antes de qualquer código novo)

- [x] 1.1 Percorrer tela a tela como usuário leigo (navegador + árvore de acessibilidade) e
      registrar incoerências em `docs/auditoria/ux-v2.md`: ícones, nomes, redirecionamentos
- [x] 1.2 Rodar o detector da skill `impeccable` em todas as telas (não só nas novas)
- [x] 1.3 Inventariar TODA capacidade de edição do app e classificar em E0–E3
- [x] 1.4 Matriz liberdade × progressão: para cada capacidade, dizer se é DIREITO (nunca tranca)
      ou RECOMPENSA (nível/moeda/conquista) — e apontar as que estão na categoria errada hoje
- [x] 1.5 Listar as funções antigas que furam a gamificação, com o custo de cada correção

## 2. Economia de recompensa do passe

- [x] 2.1 Desenhar a curva: o que cada um dos 100 níveis entrega (tabela em design.md — Cofre
      único por década; achado decisivo: slots da década destravam todos juntos)
- [x] 2.2 Agrupar Seeds em blocos densos (9 Cofres de 60–315; trilha grátis esparsa é honesta
      porque a Premium preenche as 100 colunas — spec delta atualizada antes do código)
- [x] 2.3 Recompor `galeria/passe.ts` para a curva nova (11 testes verdes; creditoId novo
      `cofre-dN` sem colisão com créditos antigos)
- [x] 2.4 Verificar no navegador a sensação de ganho ao longo de várias décadas (Cofres com
      estado honesto creditado/disponível/nível N; coluna vazia mostra traço, sem cartão falso)

## 3. Perfis e restauração

- [x] 3.1 Superfície de perfis salvos: seção "Meus perfis salvos" separada dos presets, com
      aplicar/renomear/excluir (`renomearPerfil` novo em perfis.ts; bug de colisão de id no
      salvar pego por teste e corrigido)
- [x] 3.2 "Voltar ao visual original" em Personalizar (`galeria/restaurar.ts`; verificado no
      navegador: Floresta completo → padrão, posse intacta)
- [x] 3.3 Testes: renomear no lugar + reset sem tocar posse (galeria.test.ts; aplicar já era
      coberto por `faltaParaOPerfil`)

## 4. Correções da auditoria

- [x] 4.1 Aplicar as correções de coerência e redirecionamento achadas em 1.1 — feito o núcleo:
      palavra de nível única por perfil (word.level em profile.ts, TEXTOS/Faixa/Perfil/Loja),
      aba "Meu visual" (fim do duplo "Biblioteca"), nav com camiseta, passe fala em "casa",
      Trophy/Flame/Ticket sem overload (Medal/Zap/LayoutGrid nos jogos), datas por dia de
      calendário, Planos sem caminho de repo. PENDENTES (baixa prioridade, ux-v2 §6 item 5):
      sub-aba na URL (1.6), cluster duplicado no DOM em Capturar (1.11), avisos do detector em
      Analysis/Reading/LiveCapture (1.13), conciliação 615×409 seeds (2.2)
- [x] 4.2 Reposicionar capacidades na categoria errada — gate interno do Estúdio (a régua vale
      dentro, não só na porta) e o direito de desfazer criado (3.2). PENDENTES: mover a seção
      "tela" (perfil de exibição) para fora da tela de recompensas (4.4) e tirar os
      itens-padrão da trilha do passe (4.3 — depende da spec própria de catálogo)

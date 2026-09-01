## Context

### Por que auditoria de usuário e não mais uma auditoria técnica

As auditorias anteriores (grafo, segurança, UX-v1) olharam o código e a árvore de acessibilidade.
Esta olha o PRODUTO: um usuário leigo abrindo telas em sequência e perguntando "onde estou, o que
posso fazer, e por que isso está aqui?". O relatório do dono já traz os sintomas; a auditoria
precisa achar as causas e a extensão.

### O problema central: liberdade × progressão

Funções foram construídas em fases diferentes, cada uma coerente consigo mesma:
- Fase "ferramenta" (até 08/2026): personalização era um AJUSTE — quanto mais liberdade, melhor.
- Fase "gamificação" (28/08 em diante): personalização virou RECOMPENSA — liberdade é o prêmio.

As duas convivem hoje, e a primeira esvazia a segunda. A auditoria precisa mapear cada capacidade
de edição contra a taxonomia E0–E3 (já registrada em `personalizar-v4/design.md`) e responder:
esta liberdade é um direito do usuário (acessibilidade, controle dos próprios dados) ou é uma
recompensa (estética, expressão)? **Direito nunca se tranca; recompensa nunca vem de graça.**
Essa é a régua que a auditoria deve aplicar item a item.

### Economia de recompensa: densidade em vez de diluição

Hoje: 42 slots de Seeds espalhados, 10–50 por slot. O usuário passa vários níveis "sem ganhar
nada de verdade". Direção a desenhar (números a validar):
- **Blocos**: Seeds concentradas em poucos níveis, em quantidade que compra algo de fato.
- **Todo nível entrega ALGO nomeável**: item, bloco de moeda, ou desbloqueio de capacidade —
  nunca um slot que o usuário não sabe dizer o que foi.
- **Marcos ★** (dezenas) continuam sendo os momentos altos.
- Aceitar retrabalho: `galeria/passe.ts` foi escrito para ser recomposto (layout determinístico,
  testes prendem as invariantes, não a distribuição).

### Curva decidida na auditoria (31/08, ver docs/auditoria/ux-v2.md §2)

Achado que muda o desenho: **todos os slots de uma década destravam no MESMO instante**
(`slotDestravado` = nível ≥ década). Fatiar a moeda da década em 5–8 slots de 10–50 era
gotejamento ilusório — o usuário recebia as migalhas todas juntas e o rótulo "+25" repetido é
que criava o "não ganhei nada". Logo:

- **Um Cofre de Seeds por década** (bloco único, denso, nomeado), na primeira vaga sem item.
  A trilha grátis fica ESPARSA (convenção do gênero: grátis esparso, premium cheio — e a
  fileira premium continua preenchendo todas as 100 colunas).
- Totais por década (soma 1615 ≈ os 1613 atuais; mesma quantidade, outra forma):
  | Década | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | Cofre | 60 | 60 | — | 100 | 150 | 210 | 220 | 240 | 260 | 315 |
  (d3 tem 11 itens — sem vaga; o excedente segue anexado como hoje.)
- `creditoId` novo: `passe:t1:cofre-d<N>` — ids frescos, sem colisão parcial com os
  `slot-N` já creditados (quem já recebeu migalhas fica com elas; o Cofre credita uma vez,
  windfall único e limitado, documentado). O teste de formato passa a aceitar os dois padrões.
- Honestidade do resgate: o cartão só diz "creditado" depois da confirmação do servidor;
  antes diz "disponível". Defaults ("Cursor do sistema", "Rastro desligado", posições de menu)
  saem da leitura de recompensa numa etapa futura (tarefa 4.2 — hoje eles são itens de catálogo
  nível 1 e mexer no catálogo é a spec própria).

### O que já existe e NÃO deve ser reinventado

- `galeria/perfis.ts`: salvar/aplicar perfil e `faltaParaOPerfil` (valida o que o perfil exige).
- `galeria/acesso.ts` + `loja.ts` (`estadoDoItem`): a régua única de acesso.
- `appearance.ts`: temas, paletas e presets — o "voltar ao original" é resetar para os defaults
  daqui, não inventar um segundo caminho.
- `passe.ts`: layout do passe, determinístico e testado.

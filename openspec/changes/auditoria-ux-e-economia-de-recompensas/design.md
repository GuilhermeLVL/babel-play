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

### O que já existe e NÃO deve ser reinventado

- `galeria/perfis.ts`: salvar/aplicar perfil e `faltaParaOPerfil` (valida o que o perfil exige).
- `galeria/acesso.ts` + `loja.ts` (`estadoDoItem`): a régua única de acesso.
- `appearance.ts`: temas, paletas e presets — o "voltar ao original" é resetar para os defaults
  daqui, não inventar um segundo caminho.
- `passe.ts`: layout do passe, determinístico e testado.

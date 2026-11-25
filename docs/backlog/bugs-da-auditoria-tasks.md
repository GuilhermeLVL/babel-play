# Bugs da auditoria de telas (Onda 5)

O dono manteve o desenho original: nada aqui muda visual, layout nem navegação. Só correções.
Origem: `auditoria-biblioteca.md` (A2, A3, B2), `auditoria-ao-vivo.md` (A6, M7, M9), `auditoria-shell-inicio.md` (M8).

- [x] 1. iChat flutuante: no Leitor sobe acima do pé (não cobre "Próxima página"); no Início e na Biblioteca o palco já
     reserva o espaço e, no fim da rolagem, nada fica sob o botão (travado em e2e). `src/styles/leitor.css`.
- [x] 2. "Exportar" do Intérprete (conversa vazia): desligado, com `title` e texto para leitor de tela "Nada para exportar
     ainda" (`ConversaDoPrototipo`, `lista.podeExportar`).
- [x] 3. "Failed to fetch" cru no Intérprete: `avisoComAVozPrimeiro` passava `prep.error` sem o mapa; agora usa
     `falhaDaCaptura` como `avisoDoPreparo`.
- [x] 4. "Como transcrever a sua voz?": vem marcado o "Privado" (decisão assumida: recomendação, 25/11; o áudio não sai
     do aparelho, então não há consentimento a registrar). O "Rápido" nunca vem marcado.
- [x] 5. Biblioteca no celular: "Renomear", "Fixar", "Excluir" não partem mais no meio da palavra
     (`overflow-wrap: normal`; letra de 13 px até 400 px e 12 px até 340 px).
- [x] 6. "Jogar com esta" e "Revisar palavras" desligados mostram uma linha com o motivo (sem texto, processando ou sem
     palavras guardadas) e ligam o motivo aos botões por `aria-describedby`.
- [ ] [D] Conferir em aparelho real (iChat sobre o Leitor, rótulos a 320 px).

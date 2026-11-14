## Why

A auditoria do modo sem conta (14/11/2026, sobre `873c4fd0`) achou oito lugares em que o visitante via uma tela de conta que
não existe, um botão morto ou um erro cru: Ajustes → Conta mostrava e-mail vazio "· não verificado", 2FA e "Excluir a conta"
até um 501; "Pedir uma cópia" virava "tente de novo"; "Trazer do Anki" não fazia nada; Personalizar dizia "Desafios" em
toda aba; o convite modal só aparecia uma vez por visita e depois sobrava "conta necessária"; o parceiro de leitura dizia
"Entre na sua conta" sem botão; o canal E-mail aparecia para quem não tem e-mail; e as até 5 sessões gravadas sem conta
ficavam invisíveis. O dono aprovou corrigir tudo, inclusive mostrar as sessões locais.

## What Changes

- **Clique explícito sempre convida** (`pedirConta`, `src/lib/pedirConta.ts`): o evento `babel_exige_conta` com
  `explicito: true` ignora o `babel.convite_visto`; o aviso automático do servidor em memória continua 1x por visita.
- **Dois botões em todo convite**: "Criar conta" (abre o Login já no cadastro: `pedindoLogin: false | 'login' | 'signup'`,
  `Login modoInicial`) e "Já tenho conta". O `GateDeConta` mantém também "Continuar sem conta"; o `CartaoDeConvite` de tela
  cheia mantém "Continuar sem conta" como saída discreta; o inline (`inline`) não.
- **Ajustes → Conta sem conta**: no lugar de Entrada, Aparelhos, Atividade, Sair e Excluir, o convite (`CONVITE.conta`) e
  "Apagar os dados deste navegador" (`limparTudo`, com confirmação). "Rever a apresentação" e o cartão do plano ficam.
  O convidado anônimo do Supabase cai aqui também (sem "Trocar e-mail", que vincularia a conta por caminho escondido).
- **Privacidade**: "Pedir uma cópia" vira o convite `CONVITE.exportar`.
- **Cartões**: "Trazer um baralho do Anki" e as linhas Palavra nova / Trazer e levar / Exportar do "…" continuam à vista e
  abrem o convite; a aba Palavras mostra o convite do vocabulário em vez de "Seu caderno está vazio".
- **Personalizar**: cada aba com o seu convite (`maestria`, `passe`, `conquistas`, `loja`); comentário de `exigeConta.ts` atualizado.
- **iChat, chave de IA, importar página**: o toque abre o convite sempre; o iChat diz o fato na conversa em vez do erro cru.
- **Parceiro de leitura**: frase nova e os dois botões.
- **Notificações**: canal E-mail e resumo semanal desligados sem conta, com convite inline.
- **Início**: as sessões locais (até o teto do modo sem conta, 5) aparecem, abrem em Jogar, com o aviso "Elas ficam só
  neste navegador. Com uma conta, vão com você."
- **Uma regra para o App** (`conviteNoLugarDaTela`): o convite e a tela que exige conta saem da mesma condição.

## Non-Goals

- Abrir a Análise ou a Biblioteca sem conta (continuam com convite).
- Mudar o que o servidor aceita do convidado, flags, provedores ou produção.

## Impact

- Código: `src/lib/pedirConta.ts` (novo), `src/lib/estado/useGateDeConta.ts`, `src/lib/estado/useNavegacao.ts`, `src/App.tsx`,
  `src/components/Login.tsx`, `src/components/conta/{exigeConta.ts,CartaoDeConvite.tsx,GateDeConta.tsx}`,
  `src/components/views/ajustes/{AbaConta,AbaPrivacidade,AbaNotificacoes}.tsx`, `src/components/views/Cartoes.tsx`,
  `src/components/views/personalizar/polimento/PersonalizarDoPrototipo.tsx`, `src/components/IChat.tsx`,
  `src/components/AiEnginePanel.tsx`, `src/components/views/livros/TrazerOSeu.tsx`,
  `src/components/views/leitor/PainelDoParceiro.tsx`, `src/components/views/quest/InicioDoQuest.tsx`.
- Catálogos `en`/`es`/`ar` com as frases novas; `xx.json` e `cobertura.json` regenerados.
- Sem migração, sem variável nova, sem custo de IA.

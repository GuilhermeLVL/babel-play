> **Estado em 2026-09-07** (auditoria `openspec/audits/2026-09-07-coerencia.md`): 3 tarefas abertas (2.4 testes da recusa no efemero, 3.3 teste do gate por aba, 6.2 navegador com login). Achado A15: `ABAS_QUE_EXIGEM_CONTA`/`abaExigeConta` nao tem chamador, entao o gate por aba nao esta ligado; `codigo-morto-removido` decide ligar ou remover. A40 (`/perfil` vazio e `/plano` sem backend na edicao leve) em `modo-anonimo-em-paridade`.

## 1. A porta se inverte

- [x] 1.1 `porta()` devolve `app` quando não há sessão e o anônimo ainda não escolheu
      (`components/conta/exigeConta.ts:36-41`)
- [x] 1.2 A escolha "seguir sem conta" deixa de ser pré-requisito para usar; continua registrada
      para o convite não repetir
- [x] 1.3 Teste da função pura: primeira visita → `app`; pedindo login → `login`; com sessão → `app`

## 2. O teto do modo sem conta

- [x] 2.1 Constantes do teto no core (sessões e palavras), com o número visível num lugar só
- [x] 2.2 O servidor efêmero recusa a gravação e a palavra além do teto, com motivo
- [x] 2.3 Aviso ao se APROXIMAR (não ao bater), dispensável — `AvisoDeConta` no Hub
- [ ] 2.4 Testes da RECUSA no servidor efêmero. Revisão de 25/11: o 507 de SESSÕES já tem teste (`tests/efemero-teto-e-lotes.test.ts`: a 6ª gravação na completa, a 21ª na estática, e o reenvio no teto não vira 507). Falta o 507 de PALAVRAS (`adicionarCartoes`, `POST /api/vocab/bulk-add`, teto de 80). Verificar: `npx vitest run tests/efemero-teto-e-lotes.test.ts` com um caso novo "a 81ª palavra recebe 507 `TETO_ANONIMO` com `recurso: 'palavras'`" e o reenvio da mesma palavra não conta.

## 3. A economia exige conta — a acessibilidade não

- [x] 3.1 Gate por ABA na tela Personalizar: Loja, Passe e Desafios pedem conta; Meu visual não
- [x] 3.2 O convite de cada aba diz o que a conta destrava ALI
- [ ] 3.3 (REESCRITA em 25/11) A função `abaExigeConta` foi removida em 08/09 (`codigo-morto-removido`); o gate por aba hoje é o convite em `PersonalizarDoPrototipo.tsx` (`VIEW_DO_CONVITE`: Maestria, Temporada, Conquistas e Loja pedem conta) e a aba livre se chama **Coleção** (não "Meu visual"). Verificar: teste de componente em `tests/personalizar-v2.test.tsx` com `estaAnonimo()` verdadeiro na edição completa: Coleção mostra o conteúdo e o perfil de exibição, e as outras quatro abas mostram o `CartaoDeConvite` com o texto próprio.

## 4. Google

- [x] 4.1 `SOCIAL_ENABLED` deixa de ser constante e passa a derivar do ambiente
- [x] 4.2 Só Google no lançamento (Facebook e Apple ficam para quando o dono decidir)

## 5. Avisos por marco de uso

- [x] 5.1 `marcosDeConta.ts`: quais marcos existem, o texto de cada um, e a memória do que já foi
      dispensado
- [x] 5.2 Marco da segunda sessão salva
- [x] 5.3 Marco de chegar perto do teto do caderno
- [x] 5.4 Testes da regra pura (dispara uma vez, dispensa lembra)

## 6. Verificação

- [x] 6.1 `npx vitest run` · `npm run typecheck` · `npm run lint` · `npm run audit:gate` ·
      `npx ast-grep scan -c sgconfig.yml src server server.ts`
- [ ] 6.2 **[D]** (FUNDIR com `acesso-sem-conta-v2` 6.1, que está em `docs/pendencias-do-dono.md`) Navegador com `VITE_AUTH_REQUIRED=1` e a flag `acesso_restrito_sem_conta` DESLIGADA: primeira visita abre no app, a Loja pede conta, a Coleção não, e o aviso da segunda sessão aparece uma vez. Verificar: roteiro de 5 passos com captura de tela anexado ao PR; com a flag LIGADA o comportamento é o da porta obrigatória (outra change, já arquivada).

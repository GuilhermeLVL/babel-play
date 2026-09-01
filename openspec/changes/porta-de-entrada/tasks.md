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
- [ ] 2.4 Testes da RECUSA no servidor efêmero (o teto e o aviso já são testados em
      `tests/marcosDeConta.test.ts`; falta exercitar o 507 do `criarSessao`/`adicionarCartoes`,
      que exige subir o IndexedDB do harness)

## 3. A economia exige conta — a acessibilidade não

- [x] 3.1 Gate por ABA na tela Personalizar: Loja, Passe e Desafios pedem conta; Meu visual não
- [x] 3.2 O convite de cada aba diz o que a conta destrava ALI
- [ ] 3.3 Teste do gate por aba — a regra pura (`abaExigeConta`) está escrita e o convite ligado,
      mas falta o teste de tela que prova "Meu visual continua alcançável sem conta"

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
- [ ] 6.2 Navegador com `VITE_AUTH_REQUIRED=1`: primeira visita abre no app, a Loja pede conta,
      Meu visual não, e o aviso da segunda sessão aparece uma vez

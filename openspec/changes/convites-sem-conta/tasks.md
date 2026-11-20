## 1. Mecanismo

- [x] 1.1 `pedirConta`/`pedirEntrada`/`comConta`/`semContaComPorta` (`src/lib/pedirConta.ts`)
- [x] 1.2 `useGateDeConta`: `explicito` ignora `convite_visto`; `pedindoLogin` com modo; escuta `babel_pedir_entrada`
- [x] 1.3 `Login modoInicial`; `navigateTo('login', { modo: 'signup' })`
- [x] 1.4 `CartaoDeConvite` e `GateDeConta` com "Criar conta" e "Já tenho conta"; `inline`
- [x] 1.5 `conviteNoLugarDaTela` como a regra única do App

## 2. Telas

- [x] 2.1 Ajustes → Conta sem conta: convite + "Apagar sessões, palavras e progresso deste navegador" (livros e avatar ficam)
- [x] 2.2 Ajustes → Privacidade: "Pedir uma cópia" vira convite
- [x] 2.3 Cartões: Anki e o "…" convidam; Palavras mostra o convite do vocabulário
- [x] 2.4 Personalizar: convite por aba; comentário de `exigeConta.ts`
- [x] 2.5 iChat, chave de IA e importar página: convite a cada toque
- [x] 2.6 Parceiro de leitura: frase e botões
- [x] 2.7 Notificações: e-mail e resumo desligados, convite inline
- [x] 2.8 Início: sessões locais (até 5) com o aviso, abrindo em Jogar

## 3. Textos e testes

- [x] 3.1 Catálogos `en`/`es`/`ar`; `xx.json` e `cobertura.json` regenerados; órfãs zeradas
- [x] 3.2 `tests/convites-sem-conta.test.tsx` (Conta, Privacidade, Notificações, inventário)
- [x] 3.3 `funil-login` (explícito reabre, automático 1x, porta no cadastro, `modoInicial`), `cartoesTela`, `questPersonalizar`,
      `questCasca`, `leitor-ia-visivel`, `app-gate-anonimo`, `questConta`
- [x] 3.4 `tests/e2e-publico/convite-volta-ao-destino.e2e.ts` (/perfil → Criar conta → entra → /perfil)
- [ ] 3.5 Rodar o e2e público no CI (não rodado localmente)

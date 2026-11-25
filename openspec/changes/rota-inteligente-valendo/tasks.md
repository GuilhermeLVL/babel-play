# Tarefas

> Só spec. Nada começa antes de `roteador-adaptativo-em-sombra` sair da sombra. **[D]** = ato do dono; **[R]** = aparelho real; **[B]** = bancada.
> Em toda tarefa: `npm run typecheck`, `npm run lint` e só os testes dos arquivos tocados. Migração: número provisório, o integrador renumera.

## 1. Flag e política valendo

- [ ] 1.1 Migração da flag `rota_inteligente` (desligada, PG e SQLite idempotentes, reversível), linha em `docs/flags.md`, teste de contagem de flags.
- [ ] 1.2 A política decide em `pipelineDeFala`, `traducaoDaFala` e no gateway com `politicaLigada` vindo da flag; reconciliar com `audioDificil` e os parciais.
      Verificar: flag desligada, zero divergência (`tests/conferenciaDaRotaMt.test.ts`); ligada, tabela aparelho × plano × tarefa × estado verde.
- [ ] 1.3 e2e de captura com a flag ligada e desligada. Verificar: `npx playwright test tests/e2e/captura-*.e2e.ts` nos dois estados.
- [ ] 1.4 **[D]** Ligar por percentual e acompanhar quedas de rota; reversão ensaiada.

## 2. Transparência (sobras)

- [ ] 2.1 Botão "Testar sem internet" em `FolhaComoFunciona.tsx`. Verificar: teste de componente e e2e com `context.setOffline(true)`; a legenda segue no aparelho.
- [ ] 2.2 Textos nos quatro catálogos e captura do selo em en, es, ar e pt. Verificar: `npm run i18n` sem diferença.
- [ ] 2.3 Teste de que o aviso de mudança de rota espera o fim da fala.

## 3. Qualidade no aparelho (sobras)

- [ ] 3.1 Correção determinística de vocabulário e nomes (antiga Q.7). Verificar: ≥ 30 falsos positivos conhecidos, nenhum corrigido; core sem React nem rede.
- [ ] 3.2 **[R]** Sondar a fala do navegador no aparelho em Chrome e Edge reais (pt-BR, en, es) e o diagnóstico no Quest 3; tabela em `docs/auditoria/`.

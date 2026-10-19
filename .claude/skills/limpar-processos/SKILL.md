---
name: limpar-processos
description: Use quando a máquina estiver lenta, quente ou com swap alto, quando um teste ou script deixar servidor filho vivo, ou antes de rodar suítes em paralelo. Lista e encerra processos órfãos deste repositório (node server.ts, workers do vitest, esbuild) e dá o diagnóstico de carga. Palavras-chave - travando, lento, memória, swap, órfão, processo, kill, carga, vitest.
---

# Limpar processos órfãos

Testes que sobem servidor filho e scripts via `tsx` deixam processos vivos quando são interrompidos ou falham. O macOS não os mata (eles respondem), só manda para o swap, e a máquina trava. Este repositório tem `npm run limpar` para isso e um hook de fim de sessão que o chama sozinho.

## Passos

1. **Diagnóstico rápido** (não muda nada):

   ```bash
   uptime; sysctl -n vm.swapusage
   npm run limpar -- --dry-run
   ```

   Carga média maior que o número de núcleos (`sysctl -n hw.ncpu`) ou swap acima de metade do total é sinal de que vale limpar.

2. **Encerrar os órfãos** (só processos com pai morto e cujo comando cita esta pasta; `SIGTERM`, depois `SIGKILL` em quem resistir):

   ```bash
   npm run limpar
   ```

   Órfãos com menos de 10 min são poupados por padrão, porque podem pertencer a uma suíte ainda em curso. Para incluir tudo: `npm run limpar -- --tudo`.

3. **Se o assistente for bloqueado ao encerrar processos** (o modo automático pode recusar `kill`), peça ao dono para rodar o comando acima no terminal dele e confira o resultado com o `--dry-run`.

4. **Suítes em paralelo**: o `vitest.config.ts` já limita os workers a metade dos núcleos fora do CI. Mesmo assim, nunca rode duas suítes completas ao mesmo tempo em worktrees diferentes; cheque `pgrep -fl "vitest run"` antes.

## O que NÃO fazer

- Não use `pkill -f node` nem `killall node`: derruba o servidor de desenvolvimento, o editor e outros projetos.
- Não "resolva" apagando ou enfraquecendo o teste que deixou o órfão; corrija o `afterAll`/`finally` dele.

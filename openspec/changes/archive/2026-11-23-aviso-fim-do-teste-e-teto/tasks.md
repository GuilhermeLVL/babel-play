## 1. Aviso do fim do teste por uso

- [x] 1.1 Gatilhos funcionais `uso_perto` e `uso_acabou` (`src/core/ofertas.ts`)
- [x] 1.2 `faseDeUsoDoTeste` e disparo no host no lugar de `cota_proxima`/`fim_de_cota` para quem testa
- [x] 1.3 Textos em `public/i18n/en.json` (e `xx.json` pelo `i18n:pseudo`)
- [x] 1.4 Testes (`tests/ofertas-fim-do-teste.test.tsx`)

## 2. Teto em dólar por conta nos planos pagos (estrutura, desligada)

- [x] 2.1 `server/lib/tetoUsdDaConta.ts`: leitura de `TETO_USD_MES_<PLANO>`, contador, conferência
- [x] 2.2 Soma em `registrarGastoDeIa`; recusa 402 `teto_usd_da_conta` em `reservarLlm`, STT e voz
- [x] 2.3 Testes (`tests/integration/teto-usd-da-conta.test.ts`)

## 3. Pendências do dono

- [ ] 3.1 Escolher o teto em US$ por plano (Essencial, Premium, Ao Vivo) e definir `TETO_USD_MES_*` em produção
- [ ] 3.2 Conferir no navegador o aviso do teste com uma conta de teste perto das 3 h

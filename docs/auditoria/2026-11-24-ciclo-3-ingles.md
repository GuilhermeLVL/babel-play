# Ciclo 3: parcial vivo no inglês (encerrado na simulação)

Data: 24/11/2026. Branch `lab/ciclo-3-simulador` (sem push, sem PR).

## Veredito

**Sem finalista; nenhum A/B real foi rodado.** Pela regra 4 do critério (`scripts/perf/latencia-legenda/resultados/2026-11-24/ciclo-3-simulacao/criterio.md`), nenhuma política elegível (erasure média <= 0,5 e proxy de renders no limite) chega a -20% de atraso p50 sobre o `atual`. A melhor elegível (acrescenta-decode, máscara 0, x1) tem p50 1.405 ms contra 1.216 ms do `atual` real no desktop (16% pior), erasure 0,351. Não há IC de A/B porque a bancada não rodou, por regra do ciclo.

O inglês continua fora da V7. A rota pt/Parakeet aprovada não foi alterada.

## Fronteira atraso x erasure (desktop, simulada)

cauda-decode x3: p50 1.060 ms, erasure 0,82. x2: 790 ms, 1,31. x1: 331 ms, 1,90. cauda-token: 223 ms, 3,70. O atraso só fica abaixo do `atual` com erasure acima de 0,5.

## Tempo

Só gravação (4 rodadas medidas por perfil e braço) e simulação; nenhuma triagem nem confirmação foi gasta. Em relação ao ciclo 2 (triagem + confirmação completas), o ciclo parou antes da fase mais cara.

## Próximos passos (decisão do dono)

1. Manter o inglês fora da V7.
2. Para ganho no inglês, mexer no ritmo e no custo do decode (cadência, janela, modelo), não na regra de tela.
3. Ou aceitar mais piscar: cauda-decode x3 dá p50 1.060 ms com erasure 0,82, acima do orçamento de 0,5.

Detalhes, validação do simulador e limites: `docs/auditoria/2026-11-24-ciclo-3-simulacao.md`.

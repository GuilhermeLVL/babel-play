## Abordagem escolhida: snapshot estático semanal

```
lotes v2 -> Prometheus / Analytics Engine --(cron semanal)--> publicar-latencia.mjs --> latencia.json (estático)
                                                                    |                      |-> selo no app (GET sem credencial)
                                                                    +-- piso N_MIN --------+-> /desempenho (build) e painel do dono
```

- O agregador é a ÚNICA peça com credencial de leitura. O app e o site só leem o arquivo.
- Percentil por soma dos baldes fixos (250 ... 10000 ms, mais "acima de 10 s" = 30000): p50 e p75 são o LIMITE do balde que
  cruza o quantil (o mesmo critério do runbook). Publica-se o balde, não um valor "exato" inventado.
- Contrato do arquivo (`v: 1`): `{ v, geradoEm, janelaDias, celulas: [{ classe, idioma, n, p50Ms, p75Ms, falha, estado }] }`,
  `estado` em `ok | insuficiente`; `p50Ms`/`p75Ms` ausentes quando `insuficiente`. Listas fechadas, como no recebimento.
- O selo escolhe a célula `classe do aparelho x idioma de origem`; sem idioma, usa a linha da classe somada (soma de baldes).
- Staleness: arquivo com mais de 35 dias não é mostrado.

## Alternativa descartada: endpoint ao vivo que consulta o Analytics Engine

`GET /api/latencia` consultando a API SQL por pedido. Descartada: põe um token de leitura no runtime do Worker, custa uma consulta
por visita, expõe células pequenas em tempo real (a diferença entre dois pedidos vira instrumento de reidentificação) e amarra o
selo à disponibilidade do Analytics Engine. O snapshot semanal dá a mesma utilidade com a superfície mínima.

## Método rápido (skill `ciclo-rapido`)

1. **Simular antes de medir**: lotes sintéticos com distribuições conhecidas por classe; conferir que o agregador recupera p50/p75
   dentro de meio balde e que `N_MIN` evita publicar célula instável (tarefa 1.1). Não precisa de dado real nem de flag.
2. **Triagem curta**: `rum_latencia` ligada SÓ no staging por alguns dias, com tráfego do dono e de testadores. Parar cedo se
   nenhuma célula passar de `n` = 50.
3. **Só a finalista na medição longa**: produção só depois do parecer e de uma semana de dados reais.
4. **Pré-voo**: dry-run do agregador contra um dump de staging, conferido com a consulta manual do runbook.

## Privacidade (resumo; o parecer é do dono)

Nada novo sai do aparelho. O arquivo é agregado, sem texto, id, hora, IP nem dispositivo individual; a classe é um dos 5 perfis.
Menores e perfil protegido não contribuem (regra de `rum_latencia`) e não recebem nada diferente: o selo é leitura de arquivo
estático. Retenção zero preservada: o servidor continua só incrementando histogramas.

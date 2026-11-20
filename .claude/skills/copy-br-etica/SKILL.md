---
name: copy-br-etica
description: Use ao escrever ou revisar texto de produto do Frasy que fala de plano, preço, teste, cota, upgrade, cancelamento ou onboarding, em português do Brasil. Garante linguagem de benefício, tom de ajuda e ausência de manipulação (ECA Digital, LGPD, menores). Palavras-chave - copy, oferta, gatilho, paywall, upgrade, preço, teste grátis, mensagem de cota.
---

# Texto de produto, PT-BR, sem manipular

## Princípios

1. **Benefício, não recurso.** "Entenda a série sem pausar", não "STT + tradução em tempo real".
2. **Diga o fato e a saída.** Toda mensagem de limite explica o que continua funcionando ("a legenda segue no aparelho") e o que fazer.
3. **Valor antes do preço.** Fale de plano depois de uma sessão boa, no fim do teste, a 80% da cota. **Nunca no instante da recusa** (429 e 503 não viram oferta; o código já respeita).
4. **Preço em contexto**, com o fato: "R$ 9,90 por mês, cancele em dois toques". Anual no Pix: "pague uma vez e economize cerca de 33%".
5. **Honestidade sobre o teste**: "3 horas de nuvem por nossa conta, sem cartão; depois volta ao Grátis, nada é cobrado sozinho".
6. **Brasileiro de verdade**: "você", frases curtas, sem anglicismo desnecessário, sem "R$" colado em número sem espaço, vírgula decimal.

## Proibido (menores e consumidor)

Urgência falsa, contagem regressiva, "últimas vagas", culpa em notificação ("seus palavras vão morrer"), cobrança surpresa, cancelar mais difícil que assinar, recompensa aleatória paga, pressão sobre menores (para menores de 18, o responsável decide a compra). O ECA Digital (Lei 15.211/2025) e a LGPD valem; na dúvida, revisar com advogado.

## Onde mora o texto

Gatilhos funcionais: `src/core/ofertas.ts` (`GATILHOS_FUNCIONAIS`); avisos de cota: `src/components/views/captura/AvisoDoUsoDoDia.tsx`; planos: `src/components/views/Planos.tsx`; catálogo en/es: `public/i18n/*.json` (o texto em português É a chave: mudar a frase tira a tradução; rode `node scripts/i18n/orfas.mjs`).

## Mensagens-modelo

- Teste: "Suas primeiras 3 horas de nuvem são por nossa conta. Sem cartão."
- Saldo: "Você usou 2 h de 3. Quando acabar, a legenda continua no aparelho."
- Valor: "Hoje você entendeu um episódio inteiro e salvou 23 palavras."
- Fim do teste: "Seu teste acaba em 3 dias. Nada é cobrado sozinho; se quiser seguir com a nuvem, o Essencial é R$ 9,90."
- Cancelamento: "Seu progresso é seu. Se cancelar, ele fica guardado."

/**
 * O MODO DA SESSÃO É CONSEQUÊNCIA DAS FONTES, NÃO UMA ESCOLHA À PARTE.
 *
 * O QUE ISTO SUBSTITUI. A tela de captura abria com três cartões grandes — "Som do Computador",
 * "Chamada de Vídeo", "Gravar Minha Voz" — e o usuário tinha de traduzir a própria intenção para
 * uma dessas categorias. O cartão então ligava mic e sistema por baixo (`applyScenario`), sem
 * dizer que era isso que estava fazendo. Quem queria só ouvir um vídeo E falar junto não tinha
 * cartão; quem escolhia errado não descobria por quê.
 *
 * Agora o usuário liga as duas fontes REAIS — o som do computador e o próprio microfone — e o
 * cenário sai daí. É a mesma informação, na ordem em que a pessoa pensa: ela sabe o que quer
 * gravar, não sabe o nome que demos para a combinação.
 *
 * O CENÁRIO CONTINUA EXISTINDO porque cinco comportamentos dependem dele (diarização, direção da
 * tradução do mic, painel de Falantes, layout dos balões e os rótulos de idioma). O que muda é
 * quem manda: antes o cenário decidia as fontes; agora as fontes decidem o cenário.
 */

export type CenarioDeCaptura = 'media' | 'conversation' | 'mic'

/**
 * Sem nenhuma fonte ligada não existe sessão — mas o tipo precisa de um valor. Devolvemos
 * `'media'` como neutro: é o cenário que NÃO liga microfone nem carrega o modelo de voz, então
 * um estado impossível nunca vira permissão pedida. Quem impede a gravação é o botão Iniciar,
 * que já exige ao menos uma fonte.
 */
export function cenarioDasFontes(micLigado: boolean, sistemaLigado: boolean): CenarioDeCaptura {
  if (micLigado && sistemaLigado) return 'conversation'
  if (micLigado) return 'mic'
  return 'media'
}

/**
 * As fontes que um cenário salvo implica — usado ao restaurar a preferência da visita anterior.
 *
 * O SOM DO SISTEMA DEIXOU DE SER UMA ESCOLHA (redesign do Espaço de Gravação). A tela não tem
 * mais interruptor de fonte: o som do computador entra sempre, e o microfone é um MUDO/ATIVO
 * alternável durante a sessão. Por isso `sistema` é `true` para qualquer cenário salvo.
 *
 * Consequência assumida: um `'mic'` gravado numa visita antiga NÃO faz a volta idêntica — ele
 * normaliza para `'conversation'`. É de propósito. Se devolvêssemos `sistema: false`, a pessoa
 * ficaria sem som do computador e sem nenhum controle na tela para religá-lo — exatamente o beco
 * sem saída que o teste de ida e volta existia para impedir.
 */
export function fontesDoCenario(c: CenarioDeCaptura): { mic: boolean; sistema: boolean } {
  return { mic: c !== 'media', sistema: true }
}

/**
 * FICHA DA RODADA — a única decisão que a maioria das visitas à tela de prática precisa tomar.
 *
 * Porta o bloco `.ficha` de `docs/prototipos/praticar-v2.html` para o design system real do app
 * (`card-panel`, `label-mono`, `btn-solid`/`btn-outline` do `src/index.css`). O protótipo tinha
 * paleta e tipografia próprias só para provar a composição; aqui usamos os tokens de verdade, para
 * a tela nascer coerente com o resto do produto.
 *
 * O traço-lacuna (`———` em `text-accent`) é o motivo visual do redesenho: o app trocou dicas que
 * vazavam a resposta por um exercício de verdade, e a mesma lacuna que entrou nas dicas aparece
 * aqui, no título, como assinatura visual. `aria-hidden` porque três travessões lidos em voz alta
 * não comunicam nada — quem usa leitor de tela já tem o sentido pela frase ao redor.
 */
import type { SugestaoDaRodada } from '../../core/minigames/painelDaPratica'

export interface FichaDaRodadaProps {
  sugestao: SugestaoDaRodada
  /** Nome do jogo sugerido, já resolvido para o perfil de idade. Vazio quando sugestao.jogo é null. */
  nomeDoJogo: string
  /** De onde o material vem, para a ficha dizer antes de a pessoa clicar. */
  origem: { baralho?: string; idioma?: string }
  aoJogar: () => void
  aoEscolherOutro: () => void
  /** Só usado quando momento === 'vazio'. */
  aoTrazerMaterial: () => void
}

/** O traço-lacuna do título: decorativo, a frase ao redor já carrega o sentido. */
function Lacuna() {
  return <span className="text-accent" aria-hidden="true">———</span>
}

export function FichaDaRodada({
  sugestao,
  nomeDoJogo,
  origem,
  aoJogar,
  aoEscolherOutro,
  aoTrazerMaterial,
}: FichaDaRodadaProps) {
  const { momento, quantas, justificativa } = sugestao
  const vazio = momento === 'vazio'
  const quantidade = quantas.toLocaleString('pt-BR')

  /* Frase de origem: cada parte tem a SUA preposição, porque as duas não são intercambiáveis —
     um baralho é de onde o material vem, um idioma é em que ele está. Tratá-las como uma lista
     genérica produzia "Vem de inglês" quando só havia idioma, que foi o que apareceu na tela. */
  const fraseDeOrigem = [
    origem.baralho ? ` Vem de ${origem.baralho}` : '',
    origem.idioma ? `${origem.baralho ? ', em' : ' Em'} ${origem.idioma}` : '',
  ].join('')
  const origemComPonto = fraseDeOrigem ? `${fraseDeOrigem}.` : ''

  return (
    <section className="card-panel bg-surface p-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
      <div>
        <p className="label-mono mb-2">Sua próxima rodada</p>

        {/* `h2`, não `h1`: a ficha vive DENTRO da tela de prática, que já tem o próprio título de
            nível 1. Dois `h1` na mesma página desfazem a hierarquia de quem navega por cabeçalhos.
            A lacuna fica entre as duas metades da frase — nunca partindo um par como "palavras
            novas", que separado por três travessões deixa de se ler como uma coisa só. */}
        <h2 className="font-display font-extrabold text-ink text-[22px] md:text-[28px] leading-tight">
          {momento === 'revisao' && (
            <>Revisar <span className="tabular-nums">{quantidade}</span> palavras <Lacuna /> que voltaram a vencer</>
          )}
          {momento === 'aprender' && (
            <><span className="tabular-nums">{quantidade}</span> palavras novas <Lacuna /> nada vencido hoje</>
          )}
          {vazio && <>Nada para jogar <Lacuna /> ainda</>}
        </h2>

        <p className="mt-2.5 text-[13.5px] text-ink-muted max-w-[52ch]">
          {vazio ? (
            'Este recorte não tem material suficiente para nenhum jogo. Desligue um filtro, ou traga um baralho.'
          ) : (
            <>
              Sugerimos o <b className="text-ink">{nomeDoJogo}</b>: {justificativa}.{origemComPonto}
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2 items-stretch min-w-[200px]">
        <button type="button" onClick={vazio ? aoTrazerMaterial : aoJogar} className="btn-solid px-6 py-3.5 text-[16px] cursor-pointer">
          {vazio ? 'Trazer material' : 'Começar'}
        </button>
        {/* No vazio não há jogo nenhum escolhido — "escolher outro" não tem o que oferecer. */}
        {!vazio && (
          <button
            type="button"
            onClick={aoEscolherOutro}
            className="text-[12.5px] text-ink-muted underline underline-offset-4 hover:text-accent px-1 py-1 cursor-pointer"
          >
            escolher outro jogo
          </button>
        )}
      </div>
    </section>
  )
}

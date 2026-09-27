import { direcaoDoTexto } from '../../../lib/languages';

/**
 * O AVISO DA JOGADA — a linha que diz o que aconteceu e, quando a pessoa não chegou lá, QUAL ERA a
 * resposta. Uma cara só para todos os jogos (QA dos jogos, 2026-09-26).
 *
 * Antes só o Rali dizia "Fora! Era: …". O Choseong, o Bao, o Tabu, a Karuta, o Shiritori e a Mala
 * passavam para o item seguinte sem mostrar a palavra quando o tempo acabava ou as tentativas
 * esgotavam: a pessoa saía da rodada sem aprender justamente o que não sabia. O desenho é o do aviso
 * que o Rali já tinha (borda, fundo suave e tinta do tom), agora com os três tons do app.
 *
 * `role="status"`: o leitor de tela anuncia a resposta sem roubar o foco da jogada seguinte.
 */
export default function AvisoDaJogada({
  tom,
  rotulo,
  resposta,
  lang,
}: {
  tom: 'erro' | 'certo' | 'aviso';
  /** O que aconteceu ("Fora! Era:", "O tempo acabou. Era:"). */
  rotulo: string;
  /** A palavra que a pessoa precisa ver — em destaque, no idioma dela. */
  resposta?: string;
  lang?: string;
}) {
  const cor =
    tom === 'erro'
      ? 'border-error bg-error-soft text-error-ink'
      : tom === 'certo'
        ? 'border-good bg-good-soft text-good-ink'
        : 'border-warn bg-warn-soft text-warn-ink';
  return (
    <p
      role="status"
      data-aviso-da-jogada={tom}
      className={`w-full text-center px-4 py-3 rounded-2xl border font-bold text-sm animate-in fade-in ${cor}`}
    >
      {rotulo}
      {resposta && (
        <>
          {' '}
          <b lang={lang || undefined} dir={direcaoDoTexto(lang)} className="font-display font-black text-base">
            {resposta}
          </b>
        </>
      )}
    </p>
  );
}

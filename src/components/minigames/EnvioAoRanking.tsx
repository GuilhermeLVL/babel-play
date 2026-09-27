import { Medal } from 'lucide-react';
import { useState } from 'react';

import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { perfilProtegido } from '../../lib/protecaoDoMenor';
import { apelidoValido, enviarParaRanking, lerApelido, salvarApelido } from '../../lib/ranking';

/**
 * O ENVIO AO RANKING GLOBAL, no fim de rodada COMUM.
 *
 * Morava na tela de resultado própria do Duelo, que tinha outra régua de estrelas e vinha ANTES da
 * tela comum — duas telas de fim para a mesma rodada. A tela própria saiu; o envio veio para cá e
 * aparece só nos jogos com ranking (`temRanking`). Envia o número que a tela mostra.
 *
 * Opt-in, com apelido: só pontos e combo saem daqui. No perfil protegido (menor, ou idade
 * desconhecida — ECA Digital) o envio nem é oferecido; na edição estática não há placar.
 */
export default function EnvioAoRanking({ jogo, pontos, combo }: { jogo: string; pontos: number; combo: number }) {
  const [apelido, setApelido] = useState(lerApelido());
  const [envio, setEnvio] = useState<'parado' | 'enviando' | 'ok' | 'indisponivel' | 'recusado'>('parado');
  if (pontos <= 0 || perfilProtegido() || edicaoEstatica()) return null;

  const enviar = async () => {
    if (!apelidoValido(apelido)) {
      setEnvio('recusado');
      return;
    }
    salvarApelido(apelido);
    setEnvio('enviando');
    setEnvio(await enviarParaRanking(jogo, pontos, combo));
  };

  return (
    <section className="cartao p5 secao" aria-label="Ranking global">
      <p className="label-mono linha" style={{ gap: 6, marginBottom: 8 }}>
        <Medal aria-hidden style={{ width: 14, height: 14 }} /> Ranking global
      </p>
      {envio === 'ok' ? (
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--good-ink)' }}>
          Pontuação enviada! Veja a tabela em "Recordes e ranking".
        </p>
      ) : envio === 'indisponivel' ? (
        <p className="mut" style={{ fontSize: 12.5 }}>
          Não deu para enviar agora. A pontuação fica guardada aqui; tente de novo depois.
        </p>
      ) : (
        <div className="linha" style={{ gap: 8 }}>
          <input
            className="campo"
            style={{ flex: 1, minWidth: 0 }}
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            placeholder="Seu apelido (3–20 letras)"
            maxLength={20}
            aria-label="Apelido para o ranking"
          />
          <button
            type="button"
            className="btn btn-solid peq"
            onClick={() => void enviar()}
            disabled={envio === 'enviando'}
          >
            {envio === 'enviando' ? 'Enviando…' : `Enviar ${pontos} pts`}
          </button>
        </div>
      )}
      {envio === 'recusado' && (
        <p style={{ fontSize: 11.5, marginTop: 6, color: 'var(--error-ink)' }}>
          Apelido inválido ou envio recusado — use 3 a 20 letras/números.
        </p>
      )}
    </section>
  );
}

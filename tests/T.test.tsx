// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { T, montar } from '../src/lib/T';
import { registrarCatalogo, usarIdioma } from '../src/lib/i18n';

/**
 * O que justifica `<T>` existir é o caso de REORDENAÇÃO: uma frase com formatação no meio,
 * traduzida para um idioma que muda a ordem das palavras. Se só isso funcionasse, já valeria.
 * O resto dos casos existe porque a tradução vem de um JSON baixado da rede — ou seja, de fora do
 * nosso controle — e nenhuma malformação pode derrubar a tela.
 */
afterEach(cleanup);

const FRASE = 'Encontrei <b>{sessoes}</b> sessões e <b>{cartoes}</b> cartões.';

describe('montar — o motor', () => {
  beforeEach(async () => { await usarIdioma('pt'); });

  it('texto sem marcação passa inteiro', () => {
    expect(montar('Salvar agora')).toEqual(['Salvar agora']);
  });

  it('separa texto e tag', () => {
    const nos = montar('a <b>x</b> c');
    expect(nos).toHaveLength(3);
    expect(nos[0]).toBe('a ');
    expect(nos[2]).toBe(' c');
  });

  it('interpola valores', () => {
    render(<>{montar('{n} palavras', { n: 42 })}</>);
    expect(document.body.textContent).toBe('42 palavras');
  });

  it('valor ausente deixa a chave intacta — mesmo contrato de t()', () => {
    render(<>{montar('{n} palavras')}</>);
    expect(document.body.textContent).toBe('{n} palavras');
  });

  it('aceita ReactNode como valor', () => {
    render(<>{montar('veja {link} agora', { link: <a href="/x">aqui</a> })}</>);
    expect(screen.getByRole('link', { name: 'aqui' })).toBeTruthy();
  });

  it('a mesma tag duas vezes vira dois elementos', () => {
    const { container } = render(<>{montar(FRASE, { sessoes: 2, cartoes: 9 })}</>);
    expect(container.querySelectorAll('strong')).toHaveLength(2);
  });

  it('suporta aninhamento', () => {
    const { container } = render(<>{montar('<b>muito <i>mesmo</i></b>')}</>);
    const forte = container.querySelector('strong');
    expect(forte?.querySelector('em')?.textContent).toBe('mesmo');
  });

  it('<br/> e <br> não consomem o resto da frase', () => {
    const { container } = render(<>{montar('antes<br/>depois')}</>);
    expect(container.querySelectorAll('br')).toHaveLength(1);
    expect(container.textContent).toBe('antesdepois');
  });

  it('tags custom sobrepõem as padrão', () => {
    const { container } = render(<>{montar('<b>x</b>', undefined, { b: <span className="z" /> })}</>);
    expect(container.querySelector('span.z')).toBeTruthy();
    expect(container.querySelector('strong')).toBeNull();
  });

  it('não emite warning de key', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<>{montar('<b>a</b> e <b>c <i>d</i></b>')}</>);
    expect(erro).not.toHaveBeenCalled();
    erro.mockRestore();
  });
});

describe('reordenação — o caso que justifica o componente', () => {
  beforeEach(async () => {
    registrarCatalogo('ja', {
      [FRASE]: '<b>{cartoes}</b>枚のカードと<b>{sessoes}</b>個のセッションが見つかりました。',
    });
    await usarIdioma('ja');
  });

  it('a ordem do japonês é respeitada, e os valores continuam dentro das tags', () => {
    const { container } = render(<T txt={FRASE} val={{ sessoes: 3, cartoes: 7 }} />);
    const texto = container.textContent ?? '';
    expect(texto.indexOf('7')).toBeLessThan(texto.indexOf('3'));
    const fortes = [...container.querySelectorAll('strong')].map(e => e.textContent);
    expect(fortes).toEqual(['7', '3']);
  });

  it('tradução que omite uma tag renderiza o valor como texto puro', async () => {
    registrarCatalogo('ja', { [FRASE]: '{cartoes}枚と<b>{sessoes}</b>個' });
    await usarIdioma('ja');
    const { container } = render(<T txt={FRASE} val={{ sessoes: 3, cartoes: 7 }} />);
    expect(container.querySelectorAll('strong')).toHaveLength(1);
    expect(container.textContent).toContain('7');
  });
});

describe('tradução malformada — nada quebra', () => {
  beforeEach(async () => { await usarIdioma('pt'); });

  const naoQuebra = (entrada: string) => {
    const { container } = render(<>{montar(entrada)}</>);
    return container.textContent ?? '';
  };

  it('tag aberta e não fechada vira texto, preservando o conteúdo', () => {
    expect(naoQuebra('<b>sem fechar')).toBe('<b>sem fechar');
  });

  it('fechamento sem abertura vira texto', () => {
    expect(naoQuebra('fechou </b> sem abrir')).toBe('fechou </b> sem abrir');
  });

  it('tags cruzadas não perdem nenhuma palavra', () => {
    const texto = naoQuebra('<b>a<i>b</b>c</i>');
    for (const parte of ['a', 'b', 'c']) expect(texto).toContain(parte);
  });

  it('tag inventada pelo tradutor não vira elemento', () => {
    const { container } = render(<>{montar('<blink>x</blink>')}</>);
    expect(container.querySelector('blink')).toBeNull();
    expect(container.textContent).toBe('<blink>x</blink>');
  });

  it('SEGURANÇA: <script> vindo do catálogo sai como texto, não como elemento', () => {
    const { container } = render(<>{montar('<script>alert(1)</script>')}</>);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('alert(1)');
  });

  it('frase vazia e frase que é só uma tag não quebram', () => {
    expect(naoQuebra('')).toBe('');
    expect(naoQuebra('<b></b>')).toBe('');
  });
});

describe('T — integração com o catálogo', () => {
  it('em português renderiza a própria chave, formatada', async () => {
    await usarIdioma('pt');
    const { container } = render(<T txt={FRASE} val={{ sessoes: 2, cartoes: 5 }} />);
    expect(container.textContent).toBe('Encontrei 2 sessões e 5 cartões.');
    expect(container.querySelectorAll('strong')).toHaveLength(2);
  });

  it('plural escolhe a forma e mantém a marcação', async () => {
    registrarCatalogo('en', {
      '<b>{n}</b> sessões': { one: '<b>{n}</b> session', other: '<b>{n}</b> sessions' },
    });
    await usarIdioma('en');
    const um = render(<T n={1} um="<b>{n}</b> sessão" txt="<b>{n}</b> sessões" />);
    expect(um.container.textContent).toBe('1 session');
    cleanup();
    const varias = render(<T n={4} um="<b>{n}</b> sessão" txt="<b>{n}</b> sessões" />);
    expect(varias.container.textContent).toBe('4 sessions');
    expect(varias.container.querySelector('strong')).toBeTruthy();
  });

  it('t() e T leem a mesma entrada do mesmo catálogo', async () => {
    const { t } = await import('../src/lib/i18n');
    registrarCatalogo('en', { 'a <b>x</b>': 'the <b>y</b>' });
    await usarIdioma('en');
    expect(t('a <b>x</b>')).toBe('the <b>y</b>');
    const { container } = render(<T txt="a <b>x</b>" />);
    expect(container.textContent).toBe('the y');
    expect(container.querySelector('strong')?.textContent).toBe('y');
  });
});

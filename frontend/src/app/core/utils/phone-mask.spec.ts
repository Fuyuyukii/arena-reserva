import { formatBrazilianPhone } from './phone-mask';

describe('formatBrazilianPhone', () => {
  it('retorna vazio para entrada vazia', () => {
    expect(formatBrazilianPhone('')).toBe('');
  });

  it('formata progressivamente enquanto o usuário digita', () => {
    expect(formatBrazilianPhone('1')).toBe('(1');
    expect(formatBrazilianPhone('11')).toBe('(11');
    expect(formatBrazilianPhone('119')).toBe('(11) 9');
    expect(formatBrazilianPhone('1198765')).toBe('(11) 9876-5');
    expect(formatBrazilianPhone('11987654321')).toBe('(11) 98765-4321');
  });

  it('ignora caracteres não numéricos', () => {
    expect(formatBrazilianPhone('(11) 98765-4321')).toBe('(11) 98765-4321');
  });

  it('trunca em 11 dígitos', () => {
    expect(formatBrazilianPhone('119876543219999')).toBe('(11) 98765-4321');
  });
});

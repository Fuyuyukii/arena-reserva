import { formatCpf } from './cpf-mask';

describe('formatCpf', () => {
  it('retorna vazio para entrada vazia', () => {
    expect(formatCpf('')).toBe('');
  });

  it('formata progressivamente enquanto o usuário digita', () => {
    expect(formatCpf('123')).toBe('123');
    expect(formatCpf('123456')).toBe('123.456');
    expect(formatCpf('123456789')).toBe('123.456.789');
    expect(formatCpf('12345678900')).toBe('123.456.789-00');
  });

  it('ignora caracteres não numéricos', () => {
    expect(formatCpf('123.456.789-00')).toBe('123.456.789-00');
  });

  it('trunca em 11 dígitos', () => {
    expect(formatCpf('123456789009999')).toBe('123.456.789-00');
  });
});

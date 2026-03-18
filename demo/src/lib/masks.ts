/**
 * Utility functions for Brazilian input masks (CPF, Phone, Currency)
 */

/** Extract only digits from a string */
export const unmaskDigits = (value: string): string => value.replace(/\D/g, "");

/** Mask CPF: 000.000.000-00 */
export const maskCPF = (value: string): string => {
  const digits = unmaskDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

/** Mask Phone: (00) 00000-0000 or (00) 0000-0000 */
export const maskPhone = (value: string): string => {
  const digits = unmaskDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

/**
 * Mask Currency (BRL): R$ 0,00
 * Input fills from right to left (cents first).
 * e.g. typing "1" → "R$ 0,01", then "3" → "R$ 0,13", then "5" → "R$ 1,35"
 */
export const maskCurrency = (value: string): string => {
  const digits = unmaskDigits(value);
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  const formatted = (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `R$ ${formatted}`;
};

/** Convert masked currency string back to a number. "R$ 1.234,56" → 1234.56 */
export const unmaskCurrency = (value: string): number => {
  const digits = unmaskDigits(value);
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
};

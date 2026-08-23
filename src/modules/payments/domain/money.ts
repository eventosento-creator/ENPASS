export function minorToMajor(amount: number) {
  assertSafeMinor(amount);
  return Number((amount / 100).toFixed(2));
}

export function majorToMinor(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError("Monto de proveedor inválido.");
  const minor = Math.round(amount * 100);
  assertSafeMinor(minor);
  return minor;
}

function assertSafeMinor(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError("Monto fuera del rango seguro.");
  }
}

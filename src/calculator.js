export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateGstQst(subtotal) {
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new Error("Subtotal must be a non-negative number.");
  }

  const normalizedSubtotal = roundCurrency(subtotal);
  const gstAmount = roundCurrency(normalizedSubtotal * GST_RATE);
  const qstAmount = roundCurrency(normalizedSubtotal * QST_RATE);
  const totalTax = roundCurrency(gstAmount + qstAmount);
  const total = roundCurrency(normalizedSubtotal + totalTax);

  return {
    subtotal: normalizedSubtotal,
    gstRate: GST_RATE * 100,
    gstAmount,
    qstRate: QST_RATE * 100,
    qstAmount,
    totalTax,
    total,
  };
}

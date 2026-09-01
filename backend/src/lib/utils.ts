const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generate a short room join code like FC26-7XQ2 */
export function generateRoomCode(): string {
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return `FC26-${suffix}`;
}

/** Format money: 85000000 → "85M" */
export function formatMoney(amount: number): string {
  if (amount >= 1000000) {
    const millions = amount / 1000000;
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (amount >= 1000) {
    const thousands = amount / 1000;
    return thousands % 1 === 0 ? `${thousands}K` : `${thousands.toFixed(1)}K`;
  }
  return amount.toString();
}

/** Full format with commas: 85000000 → "85,000,000" */
export function formatMoneyFull(amount: number): string {
  return amount.toLocaleString("en-US");
}

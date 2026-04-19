export function fmtSeconds(s: number | null | undefined): string {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

export function cmToFtIn(cm: number | null | undefined): string {
  if (!cm) return "—";
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inches = Math.round(totalIn % 12);
  return `${ft}'${inches}"`;
}

export function kgToLbs(kg: number | null | undefined): string {
  if (!kg) return "—";
  return `${Math.round(kg * 2.205)} lbs`;
}

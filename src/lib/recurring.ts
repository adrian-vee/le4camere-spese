export function shouldGenerate(freq: string, month: number): boolean {
  switch (freq) {
    case "mensile": return true;
    case "bimestrale": return month % 2 === 0;
    case "trimestrale": return [3, 6, 9, 12].includes(month);
    case "semestrale": return [6, 12].includes(month);
    case "annuale": return month === 12;
    default: return false;
  }
}

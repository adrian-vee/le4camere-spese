export type SpiritGroup = {
  name: string;
  keywords: string[];
  defaultCapacityMl: number;
  defaultPourMl: number;
};

export const SPIRIT_GROUPS: SpiritGroup[] = [
  {
    name: "Whisky",
    keywords: [
      "whisky", "whiskey", "bourbon", "scotch", "rye",
      "jack daniel", "jameson", "johnnie walker", "glenfiddich",
      "glenlivet", "macallan", "lagavulin", "talisker", "laphroaig",
      "maker's mark", "wild turkey", "bulleit", "woodford",
      "chivas", "ballantine", "dewar",
    ],
    defaultCapacityMl: 700,
    defaultPourMl: 40,
  },
  {
    name: "Gin",
    keywords: [
      "gin", "london dry", "bombay", "sapphire", "tanqueray",
      "hendrick", "beefeater", "gordon", "monkey 47", "roku",
      "malfy", "mare",
    ],
    defaultCapacityMl: 700,
    defaultPourMl: 40,
  },
  {
    name: "Vodka",
    keywords: [
      "vodka", "absolut", "grey goose", "belvedere", "stolichnaya",
      "smirnoff", "ketel one", "tito", "ciroc",
      "russian standard",
    ],
    defaultCapacityMl: 700,
    defaultPourMl: 40,
  },
  {
    name: "Rum",
    keywords: [
      "rum", "rhum", "ron", "bacardi", "captain morgan",
      "mount gay", "appleton", "diplomatico", "zacapa",
      "havana club", "pampero",
    ],
    defaultCapacityMl: 700,
    defaultPourMl: 40,
  },
  {
    name: "Tequila",
    keywords: [
      "tequila", "mezcal", "patron", "don julio", "jose cuervo",
      "herradura", "clase azul", "casamigos", "espolon",
      "olmeca", "altos",
    ],
    defaultCapacityMl: 700,
    defaultPourMl: 40,
  },
  {
    name: "Amari",
    keywords: [
      "amaro", "bitter", "fernet", "branca", "brancamenta",
      "montenegro", "averna", "lucano", "ramazzotti",
      "jägermeister", "jagermeister", "cynar", "unicum",
      "vecchio amaro del capo", "caffo", "del capo",
    ],
    defaultCapacityMl: 700,
    defaultPourMl: 30,
  },
  {
    name: "Liquori",
    keywords: [
      "liquore", "liqueur", "limoncello", "amaretto",
      "disaronno", "baileys", "kahlua", "cointreau",
      "grand marnier", "chartreuse", "frangelico", "midori",
      "galliano", "maraschino", "luxardo", "strega",
      "molinari", "sambuca", "borghetti", "caffè espresso",
    ],
    defaultCapacityMl: 700,
    defaultPourMl: 30,
  },
  {
    name: "Grappa",
    keywords: [
      "grappa", "marc", "acquavite", "distillato",
      "nonino", "nardini", "poli", "bertagnolli",
      "trentina", "marzadro", "amarone",
    ],
    defaultCapacityMl: 500,
    defaultPourMl: 30,
  },
  {
    name: "Brandy",
    keywords: [
      "brandy", "cognac", "armagnac", "hennessy", "remy martin",
      "courvoisier", "martell", "torres",
      "stravecchio", "vecchia romagna",
    ],
    defaultCapacityMl: 700,
    defaultPourMl: 30,
  },
  {
    name: "Aperitivi",
    keywords: [
      "aperol", "campari", "spritz", "select", "hugo",
      "prosecco", "spumante", "crodino",
      "bitter nardini", "carpano", "vermouth", "punt e mes",
      "martini bianco", "martini rosso", "martini dry",
    ],
    defaultCapacityMl: 1000,
    defaultPourMl: 60,
  },
];

export function detectSpiritGroup(name: string): SpiritGroup | null {
  const lower = name.toLowerCase();
  for (const group of SPIRIT_GROUPS) {
    for (const kw of group.keywords) {
      if (lower.includes(kw)) return group;
    }
  }
  return null;
}

/**
 * Reference data for cities: canonical Hebrew name, English name and known alternative
 * spellings. This seeds the `cities` and `city_aliases` tables and is used only to map
 * spellings found in the data to one city. It deliberately holds no facts about cities
 * (such as location) – those must come from an official source.
 */
export interface CityReference {
  key: string;
  /** Official CBS locality code (סמל יישוב), verified against the CBS localities file. */
  cbsCode: number;
  nameHe: string;
  nameEn: string;
  aliases: string[];
}

export const CITY_REFERENCES: readonly CityReference[] = [
  {
    key: 'tel-aviv-yafo',
    cbsCode: 5000,
    nameHe: 'תל אביב-יפו',
    nameEn: 'Tel Aviv-Yafo',
    aliases: ['תל אביב', 'ת"א', 'תא', 'תל-אביב', 'Tel Aviv', 'Tel-Aviv', 'TLV', 'Jaffa', 'יפו'],
  },
  {
    key: 'jerusalem',
    cbsCode: 3000,
    nameHe: 'ירושלים',
    nameEn: 'Jerusalem',
    aliases: ['י-ם', 'Yerushalayim'],
  },
  {
    key: 'haifa',
    cbsCode: 4000,
    nameHe: 'חיפה',
    nameEn: 'Haifa',
    aliases: [],
  },
  {
    key: 'rishon-lezion',
    cbsCode: 8300,
    nameHe: 'ראשון לציון',
    nameEn: 'Rishon LeZion',
    aliases: ['ראשל"צ', 'Rishon Lezion', 'Rishon Le Zion'],
  },
  {
    key: 'petah-tikva',
    cbsCode: 7900,
    nameHe: 'פתח תקווה',
    nameEn: 'Petah Tikva',
    aliases: ['פתח תקוה', 'פ"ת', 'Petach Tikva', 'Petah Tiqva', 'Petah Tikvah'],
  },
  {
    key: 'ashdod',
    cbsCode: 70,
    nameHe: 'אשדוד',
    nameEn: 'Ashdod',
    aliases: [],
  },
  {
    key: 'netanya',
    cbsCode: 7400,
    nameHe: 'נתניה',
    nameEn: 'Netanya',
    aliases: ['Natanya'],
  },
  {
    key: 'beer-sheva',
    cbsCode: 9000,
    nameHe: 'באר שבע',
    nameEn: "Be'er Sheva",
    aliases: ['ב"ש', 'Beer Sheva', 'Beersheba', 'Beer-Sheva'],
  },
  {
    key: 'holon',
    cbsCode: 6600,
    nameHe: 'חולון',
    nameEn: 'Holon',
    aliases: [],
  },
  {
    key: 'ramat-gan',
    cbsCode: 8600,
    nameHe: 'רמת גן',
    nameEn: 'Ramat Gan',
    aliases: ['ר"ג'],
  },
  {
    key: 'rehovot',
    cbsCode: 8400,
    nameHe: 'רחובות',
    nameEn: 'Rehovot',
    aliases: ['Rechovot'],
  },
  {
    key: 'bat-yam',
    cbsCode: 6200,
    nameHe: 'בת ים',
    nameEn: 'Bat Yam',
    aliases: [],
  },
  {
    key: 'beit-shemesh',
    cbsCode: 2610,
    nameHe: 'בית שמש',
    nameEn: 'Beit Shemesh',
    aliases: ['Bet Shemesh'],
  },
  {
    key: 'kfar-saba',
    cbsCode: 6900,
    nameHe: 'כפר סבא',
    nameEn: 'Kfar Saba',
    aliases: ['כ"ס', 'Kfar Sava'],
  },
  {
    key: 'herzliya',
    cbsCode: 6400,
    nameHe: 'הרצליה',
    nameEn: 'Herzliya',
    aliases: ['הרצלייה', 'Herzliyya', 'Herzlia'],
  },
  {
    key: 'modiin',
    cbsCode: 1200,
    nameHe: 'מודיעין-מכבים-רעות',
    nameEn: "Modi'in-Maccabim-Re'ut",
    aliases: ['מודיעין', 'מודיעין מכבים רעות', "Modi'in", 'Modiin'],
  },
  {
    key: 'raanana',
    cbsCode: 8700,
    nameHe: 'רעננה',
    nameEn: "Ra'anana",
    aliases: ['Raanana'],
  },
  {
    key: 'givatayim',
    cbsCode: 6300,
    nameHe: 'גבעתיים',
    nameEn: "Giv'atayim",
    aliases: ['גבעתים', 'Givatayim'],
  },
];

/** Latin tokens → Hebrew, for city names written half in Hebrew and half in English. */
export const LATIN_TOKEN_TRANSLATIONS: Readonly<Record<string, string>> = {
  tel: 'תל',
  aviv: 'אביב',
  yafo: 'יפו',
  jaffa: 'יפו',
  jerusalem: 'ירושלים',
  haifa: 'חיפה',
  rishon: 'ראשון',
  lezion: 'לציון',
  petah: 'פתח',
  petach: 'פתח',
  tikva: 'תקווה',
  tikvah: 'תקווה',
  beer: 'באר',
  sheva: 'שבע',
  ramat: 'רמת',
  gan: 'גן',
  bat: 'בת',
  yam: 'ים',
  beit: 'בית',
  bet: 'בית',
  shemesh: 'שמש',
  kfar: 'כפר',
  saba: 'סבא',
  sava: 'סבא',
  modiin: 'מודיעין',
  maccabim: 'מכבים',
  reut: 'רעות',
};

/** Translates the Latin words of a match key to Hebrew ("tel אביב" → "תל אביב"). */
export function translateLatinTokens(matchKey: string): string {
  return matchKey
    .split(' ')
    .map((token) => {
      return LATIN_TOKEN_TRANSLATIONS[token] ?? token;
    })
    .join(' ');
}

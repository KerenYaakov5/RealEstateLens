/**
 * Reference data for cities: canonical Hebrew name, English name and known alternative
 * spellings. This seeds the `cities` and `city_aliases` tables and is used only to map
 * spellings found in the data to one city. It deliberately holds no facts about cities
 * (such as location) – those must come from an official source.
 */
export interface CityReference {
  key: string;
  nameHe: string;
  nameEn: string;
  aliases: string[];
}

export const CITY_REFERENCES: readonly CityReference[] = [
  {
    key: 'tel-aviv-yafo',
    nameHe: 'תל אביב-יפו',
    nameEn: 'Tel Aviv-Yafo',
    aliases: ['תל אביב', 'ת"א', 'תא', 'תל-אביב', 'Tel Aviv', 'Tel-Aviv', 'TLV', 'Jaffa', 'יפו'],
  },
  {
    key: 'jerusalem',
    nameHe: 'ירושלים',
    nameEn: 'Jerusalem',
    aliases: ['י-ם', 'Yerushalayim'],
  },
  {
    key: 'haifa',
    nameHe: 'חיפה',
    nameEn: 'Haifa',
    aliases: [],
  },
  {
    key: 'rishon-lezion',
    nameHe: 'ראשון לציון',
    nameEn: 'Rishon LeZion',
    aliases: ['ראשל"צ', 'Rishon Lezion', 'Rishon Le Zion'],
  },
  {
    key: 'petah-tikva',
    nameHe: 'פתח תקווה',
    nameEn: 'Petah Tikva',
    aliases: ['פתח תקוה', 'פ"ת', 'Petach Tikva', 'Petah Tiqva', 'Petah Tikvah'],
  },
  {
    key: 'ashdod',
    nameHe: 'אשדוד',
    nameEn: 'Ashdod',
    aliases: [],
  },
  {
    key: 'netanya',
    nameHe: 'נתניה',
    nameEn: 'Netanya',
    aliases: ['Natanya'],
  },
  {
    key: 'beer-sheva',
    nameHe: 'באר שבע',
    nameEn: "Be'er Sheva",
    aliases: ['ב"ש', 'Beer Sheva', 'Beersheba', 'Beer-Sheva'],
  },
  {
    key: 'holon',
    nameHe: 'חולון',
    nameEn: 'Holon',
    aliases: [],
  },
  {
    key: 'ramat-gan',
    nameHe: 'רמת גן',
    nameEn: 'Ramat Gan',
    aliases: ['ר"ג'],
  },
  {
    key: 'rehovot',
    nameHe: 'רחובות',
    nameEn: 'Rehovot',
    aliases: ['Rechovot'],
  },
  {
    key: 'bat-yam',
    nameHe: 'בת ים',
    nameEn: 'Bat Yam',
    aliases: [],
  },
  {
    key: 'beit-shemesh',
    nameHe: 'בית שמש',
    nameEn: 'Beit Shemesh',
    aliases: ['Bet Shemesh'],
  },
  {
    key: 'kfar-saba',
    nameHe: 'כפר סבא',
    nameEn: 'Kfar Saba',
    aliases: ['כ"ס', 'Kfar Sava'],
  },
  {
    key: 'herzliya',
    nameHe: 'הרצליה',
    nameEn: 'Herzliya',
    aliases: ['Herzlia'],
  },
  {
    key: 'modiin',
    nameHe: 'מודיעין-מכבים-רעות',
    nameEn: "Modi'in-Maccabim-Re'ut",
    aliases: ['מודיעין', 'מודיעין מכבים רעות', "Modi'in", 'Modiin'],
  },
  {
    key: 'raanana',
    nameHe: 'רעננה',
    nameEn: "Ra'anana",
    aliases: ['Raanana'],
  },
  {
    key: 'givatayim',
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

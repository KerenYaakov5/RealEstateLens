/**
 * Reference data for cities: canonical Hebrew name, English name, approximate center
 * coordinates and known alternative spellings. This seeds the `cities` and `city_aliases`
 * tables; a city missing from here is geocoded at runtime and stored in the DB.
 */
export interface CityReference {
  key: string;
  nameHe: string;
  nameEn: string;
  lat: number;
  lng: number;
  aliases: string[];
}

export const CITY_REFERENCES: readonly CityReference[] = [
  {
    key: 'tel-aviv-yafo',
    nameHe: 'תל אביב-יפו',
    nameEn: 'Tel Aviv-Yafo',
    lat: 32.0853,
    lng: 34.7818,
    aliases: ['תל אביב', 'ת"א', 'תא', 'תל-אביב', 'Tel Aviv', 'Tel-Aviv', 'TLV', 'Jaffa', 'יפו'],
  },
  {
    key: 'jerusalem',
    nameHe: 'ירושלים',
    nameEn: 'Jerusalem',
    lat: 31.7683,
    lng: 35.2137,
    aliases: ['י-ם', 'Yerushalayim'],
  },
  {
    key: 'haifa',
    nameHe: 'חיפה',
    nameEn: 'Haifa',
    lat: 32.794,
    lng: 34.9896,
    aliases: [],
  },
  {
    key: 'rishon-lezion',
    nameHe: 'ראשון לציון',
    nameEn: 'Rishon LeZion',
    lat: 31.973,
    lng: 34.7925,
    aliases: ['ראשל"צ', 'ראשון', 'Rishon Lezion', 'Rishon Le Zion'],
  },
  {
    key: 'petah-tikva',
    nameHe: 'פתח תקווה',
    nameEn: 'Petah Tikva',
    lat: 32.084,
    lng: 34.8878,
    aliases: ['פתח תקוה', 'פ"ת', 'Petach Tikva', 'Petah Tiqva', 'Petah Tikvah'],
  },
  {
    key: 'ashdod',
    nameHe: 'אשדוד',
    nameEn: 'Ashdod',
    lat: 31.8014,
    lng: 34.6435,
    aliases: [],
  },
  {
    key: 'netanya',
    nameHe: 'נתניה',
    nameEn: 'Netanya',
    lat: 32.3215,
    lng: 34.8532,
    aliases: ['Natanya'],
  },
  {
    key: 'beer-sheva',
    nameHe: 'באר שבע',
    nameEn: "Be'er Sheva",
    lat: 31.2518,
    lng: 34.7913,
    aliases: ['ב"ש', 'Beer Sheva', 'Beersheba', 'Beer-Sheva'],
  },
  {
    key: 'holon',
    nameHe: 'חולון',
    nameEn: 'Holon',
    lat: 32.0158,
    lng: 34.7874,
    aliases: [],
  },
  {
    key: 'ramat-gan',
    nameHe: 'רמת גן',
    nameEn: 'Ramat Gan',
    lat: 32.0684,
    lng: 34.8248,
    aliases: ['ר"ג'],
  },
  {
    key: 'rehovot',
    nameHe: 'רחובות',
    nameEn: 'Rehovot',
    lat: 31.8928,
    lng: 34.8113,
    aliases: ['Rechovot'],
  },
  {
    key: 'bat-yam',
    nameHe: 'בת ים',
    nameEn: 'Bat Yam',
    lat: 32.0171,
    lng: 34.7454,
    aliases: [],
  },
  {
    key: 'beit-shemesh',
    nameHe: 'בית שמש',
    nameEn: 'Beit Shemesh',
    lat: 31.747,
    lng: 34.9881,
    aliases: ['Bet Shemesh'],
  },
  {
    key: 'kfar-saba',
    nameHe: 'כפר סבא',
    nameEn: 'Kfar Saba',
    lat: 32.175,
    lng: 34.907,
    aliases: ['כ"ס', 'Kfar Sava'],
  },
  {
    key: 'herzliya',
    nameHe: 'הרצליה',
    nameEn: 'Herzliya',
    lat: 32.1663,
    lng: 34.8436,
    aliases: ['Herzlia'],
  },
  {
    key: 'modiin',
    nameHe: 'מודיעין-מכבים-רעות',
    nameEn: "Modi'in-Maccabim-Re'ut",
    lat: 31.898,
    lng: 35.0104,
    aliases: ['מודיעין', 'מודיעין מכבים רעות', "Modi'in", 'Modiin'],
  },
  {
    key: 'raanana',
    nameHe: 'רעננה',
    nameEn: "Ra'anana",
    lat: 32.1848,
    lng: 34.8713,
    aliases: ['Raanana'],
  },
  {
    key: 'givatayim',
    nameHe: 'גבעתיים',
    nameEn: "Giv'atayim",
    lat: 32.0722,
    lng: 34.8125,
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

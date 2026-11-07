export const languages = ["en","pt","es","ru","uk","fr"] as const;
export type Locale = typeof languages[number];
const countries: Record<string,Locale> = {PT:"pt",BR:"pt",AO:"pt",MZ:"pt",CV:"pt",ES:"es",MX:"es",AR:"es",CO:"es",CL:"es",PE:"es",UY:"es",EC:"es",RU:"ru",BY:"ru",UA:"uk",FR:"fr",MC:"fr",SN:"fr",GB:"en",US:"en",IE:"en",AU:"en",NZ:"en"};
export function language(value: string): Locale | undefined {
  const code=value.trim().toLowerCase().split(/[-_;]/)[0];
  return languages.find(l=>l===code);
}
export function detectLanguage(country: string | null, preferred: string | null) {
  const codes=(preferred??"").split(",").map(language).filter(Boolean);
  return countries[country??""] ?? codes[0] ?? "en";
}

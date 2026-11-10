/**
 * Country Registry & Metadata
 * Country Flag Battle Arena
 */

export interface CountryData {
  id: string;
  name: string;
  iso: string;
  flag: string;
  color: string;
}

export const COUNTRIES: CountryData[] = [
  { id: 'bd', name: 'Bangladesh', iso: 'BD', flag: '🇧🇩', color: '#006a4e' },
  { id: 'us', name: 'United States', iso: 'US', flag: '🇺🇸', color: '#3c3b6e' },
  { id: 'br', name: 'Brazil', iso: 'BR', flag: '🇧🇷', color: '#009c3b' },
  { id: 'de', name: 'Germany', iso: 'DE', flag: '🇩🇪', color: '#dd0000' },
  { id: 'jp', name: 'Japan', iso: 'JP', flag: '🇯🇵', color: '#bc002d' },
  { id: 'ar', name: 'Argentina', iso: 'AR', flag: '🇦🇷', color: '#74acdf' },
  { id: 'fr', name: 'France', iso: 'FR', flag: '🇫🇷', color: '#002654' },
  { id: 'in', name: 'India', iso: 'IN', flag: '🇮🇳', color: '#ff9933' },
  { id: 'gb', name: 'United Kingdom', iso: 'GB', flag: '🇬🇧', color: '#012169' },
  { id: 'ca', name: 'Canada', iso: 'CA', flag: '🇨🇦', color: '#d80027' },
  { id: 'it', name: 'Italy', iso: 'IT', flag: '🇮🇹', color: '#009246' },
  { id: 'tr', name: 'Turkey', iso: 'TR', flag: '🇹🇷', color: '#e30a17' },
  { id: 'es', name: 'Spain', iso: 'ES', flag: '🇪🇸', color: '#aa151b' },
  { id: 'kr', name: 'South Korea', iso: 'KR', flag: '🇰🇷', color: '#cd2e3a' },
  { id: 'mx', name: 'Mexico', iso: 'MX', flag: '🇲🇽', color: '#006847' },
  { id: 'pk', name: 'Pakistan', iso: 'PK', flag: '🇵🇰', color: '#115740' },
  { id: 'nl', name: 'Netherlands', iso: 'NL', flag: '🇳🇱', color: '#ae1c28' },
  { id: 'au', name: 'Australia', iso: 'AU', flag: '🇦🇺', color: '#00008b' },
  { id: 'eg', name: 'Egypt', iso: 'EG', flag: '🇪🇬', color: '#c09307' },
  { id: 'ng', name: 'Nigeria', iso: 'NG', flag: '🇳🇬', color: '#008751' },
  { id: 'za', name: 'South Africa', iso: 'ZA', flag: '🇿🇦', color: '#007749' },
  { id: 'se', name: 'Sweden', iso: 'SE', flag: '🇸🇪', color: '#006aa7' },
  { id: 'ch', name: 'Switzerland', iso: 'CH', flag: '🇨🇭', color: '#d52b1e' },
  { id: 'pt', name: 'Portugal', iso: 'PT', flag: '🇵🇹', color: '#006600' },
];

/**
 * Returns a selected or randomly shuffled list of participants
 */
export function getRoundParticipants(count: number, shuffle = true): CountryData[] {
  const list = [...COUNTRIES];
  if (shuffle) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  return list.slice(0, Math.min(count, list.length));
}

/**
 * Returns countries matching the specified IDs in order
 */
export function getCountriesByIds(ids: string[]): CountryData[] {
  const map = new Map(COUNTRIES.map((c) => [c.id, c]));
  return ids.map((id) => map.get(id)).filter((c): c is CountryData => Boolean(c));
}

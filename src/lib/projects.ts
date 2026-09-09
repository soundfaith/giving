import type { Project } from "./supabase";

export const projects: Project[] = [
  { id: "harbor", church: "Harbor Light Church", location: "Portland, OR", title: "A clear voice for every seat", description: "A warm, intelligible sound system for a growing neighborhood congregation.", category: "Sound & AV", raised: 18420, goal: 24000, donors: 86, accent: "photo-harbor", featured: true },
  { id: "st-brigid", church: "St. Brigid Community", location: "Austin, TX", title: "A room that welcomes everyone", description: "Flexible seating and acoustic treatment for a century-old gathering hall.", category: "Worship & Gathering", raised: 9250, goal: 15000, donors: 42, accent: "photo-brigid" },
  { id: "new-day", church: "New Day Fellowship", location: "Columbus, OH", title: "Songs that travel further", description: "Replace a tired PA so music and spoken word can reach the whole room.", category: "Sound & AV", raised: 5780, goal: 10000, donors: 31, accent: "photo-day" },
  { id: "grace-table", church: "Grace Table", location: "Raleigh, NC", title: "A ramp to the front door", description: "Make the sanctuary entrance simple, dignified, and accessible year-round.", category: "Facilities & Maintenance", raised: 11300, goal: 18000, donors: 63, accent: "photo-grace" },
  { id: "open-door", church: "Open Door Chapel", location: "Tacoma, WA", title: "Light for the late service", description: "Energy-efficient lighting that keeps evening gatherings bright and calm.", category: "Facilities & Maintenance", raised: 4040, goal: 8000, donors: 19, accent: "photo-door" },
  { id: "vine", church: "Vine & Branch", location: "Richmond, VA", title: "A mic for every story", description: "A reliable wireless setup for testimony, teaching, and community voices.", category: "Sound & AV", raised: 7680, goal: 12000, donors: 27, accent: "photo-vine" },
];

export const projectCategories = ["Sound & AV", "Worship & Gathering", "Facilities & Maintenance", "Community & Outreach", "General Church Needs"] as const;
export const categories = ["All projects", ...projectCategories] as const;

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function formatExchangeRate(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 8 }).format(value);
}

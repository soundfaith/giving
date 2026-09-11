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

function fundingProgress(project: Project) {
  return project.goal > 0 ? Math.min(1, Math.max(0, project.raised / project.goal)) : 0;
}

function isNewProject(project: Project, now: number) {
  if (!project.createdAt) return false;
  const createdAt = Date.parse(project.createdAt);
  return Number.isFinite(createdAt) && now - createdAt <= 7 * 24 * 60 * 60 * 1000;
}

function hotScore(project: Project, now: number) {
  const ageDays = project.createdAt ? Math.max(0, (now - Date.parse(project.createdAt)) / (24 * 60 * 60 * 1000)) : 30;
  const recency = Math.max(0, 1 - ageDays / 30);
  return (project.likes ?? 0) * 5 + (project.shares ?? 0) * 3 + project.donors * 2 + recency;
}

export function selectFeaturedProjects(projects: Project[], count = 3, now = Date.now()) {
  const selected: Project[] = [];
  const add = (project?: Project) => {
    if (project && !selected.some((item) => item.id === project.id) && selected.length < count) selected.push(project);
  };
  const newest = projects.filter((project) => isNewProject(project, now)).sort((left, right) => Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""))[0];
  const nearFunded = projects.filter((project) => project.status !== "funded").sort((left, right) => fundingProgress(right) - fundingProgress(left))[0];
  const hottest = [...projects].sort((left, right) => hotScore(right, now) - hotScore(left, now))[0];
  add(newest);
  add(nearFunded);
  add(hottest);
  [...projects].sort((left, right) => hotScore(right, now) - hotScore(left, now)).forEach(add);
  return selected;
}

import type { Project } from "../lib/supabase";

export function Progress({ project, large = false }: { project: Project; large?: boolean }) {
  const percent = Math.min(100, Math.round((project.raised / project.goal) * 100));
  return <div className={large ? "progress progress-large" : "progress"}><div style={{ width: `${percent}%` }} /></div>;
}

export function ProjectVisual({ project, featured = false }: { project: Project; featured?: boolean }) {
  const imageUrl = project.image_urls?.[0];
  return <div className={`project-visual ${project.accent} ${featured ? "project-visual-featured" : ""} ${imageUrl ? "project-visual-has-image" : ""}`} style={imageUrl ? { backgroundImage: `url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} role="img" aria-label={`${project.title} project visual`}>
    <span className="visual-sun" /><span className="visual-arch" /><span className="visual-line" /><span className="visual-label">{project.category}</span>
  </div>;
}

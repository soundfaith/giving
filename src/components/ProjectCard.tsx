import { ArrowUpRight } from "lucide-react";
import type { Project } from "../lib/supabase";
import { formatMoney } from "../lib/projects";
import { Progress, ProjectVisual } from "./ProjectPrimitives";

export function ProjectCard({ project, index, onDetails, onDonate }: { project: Project; index: number; onDetails: () => void; onDonate: () => void }) {
  return <article className="project-card" style={{ animationDelay: `${index * 70}ms` }}>
    <ProjectVisual project={project} />
    <div className="project-card-body">
      <div className="card-meta"><span className="category-label">{project.category}</span><span>{project.location}</span></div>
      <p className="card-church">{project.church}</p><h3>{project.title}</h3><p className="card-description">{project.description}</p>
      <div className="card-funding"><div className="card-funding-copy"><strong>{formatMoney(project.raised)}</strong><span>of {formatMoney(project.goal)}</span></div><Progress project={project} /></div>
      <div className="card-footer"><span>{project.donors} donors</span><div className="card-actions"><button className="card-details" onClick={onDetails}>View project</button><button className="card-donate" onClick={onDonate}>Donate <ArrowUpRight size={14} /></button></div></div>
    </div>
  </article>;
}

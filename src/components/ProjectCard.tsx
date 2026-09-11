import { ArrowUpRight } from "lucide-react";
import type { Project } from "../lib/supabase";
import { formatMoney } from "../lib/projects";
import { Progress, ProjectVisual } from "./ProjectPrimitives";

export function ProjectCard({ project, index, onDetails, onDonate, compact = false }: { project: Project; index: number; onDetails: () => void; onDonate: () => void; compact?: boolean }) {
  return <article className={compact ? "project-card project-card-compact" : "project-card"} style={{ animationDelay: `${index * 70}ms` }}>
    <ProjectVisual project={project} compact={compact} />
    {compact ? <div className="project-card-body compact-card-body">
      <div className="compact-card-copy">
        <div className="card-meta"><span className="category-label">{project.category}</span></div>
        <p className="card-church">{project.church}</p>
        <h3>{project.title}</h3>
        <p className="card-description">{project.description}</p>
      </div>
      <footer className="compact-card-footer">
        <div className="compact-card-stat"><span>Raised</span><strong>{formatMoney(project.raised)}</strong></div>
        <div className="compact-card-actions"><button className="card-details" onClick={onDetails}>{project.status === "closed" ? "View impact" : "View project"}</button><button className="compact-status-button" disabled>{project.status === "closed" ? "Completed" : "Funded"}</button></div>
      </footer>
    </div> : <div className="project-card-body">
      <div className="card-copy">
        <div className="card-meta"><span className="category-label">{project.category}</span></div>
        <p className="card-church">{project.church}</p><h3>{project.title}</h3><p className="card-description">{project.description}</p>
      </div>
      <footer className="card-footer-area"><div className="card-funding"><div className="card-funding-copy"><strong>{formatMoney(project.raised)}</strong><span>of {formatMoney(project.goal)}</span></div><Progress project={project} /></div><div className="card-footer"><span>{project.donors} donors</span><div className="card-actions"><button className="card-details" onClick={onDetails}>{project.status === "closed" ? "View impact" : "View project"}</button>{project.status !== "closed" && <button className={project.status === "funded" ? "card-donate funded-donate" : "card-donate"} disabled={project.status === "funded"} onClick={onDonate}>{project.status === "funded" ? "Funded" : <>Donate <ArrowUpRight size={14} /></>}</button>}</div></div></footer>
    </div>}
  </article>;
}

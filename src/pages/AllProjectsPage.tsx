import React from "react";
import { Search, Sparkles, X } from "lucide-react";
import type { Project } from "../lib/supabase";
import { categories, formatMoney } from "../lib/projects";
import { Progress, ProjectVisual } from "../components/ProjectPrimitives";

export function AllProjectsPage({ projects, onProject, onDonate }: {
  projects: Project[];
  onProject: (project: Project) => void;
  onDonate: (project: Project) => void;
}) {
  const [activeCategory, setActiveCategory] = React.useState<typeof categories[number]>("All projects");
  const [query, setQuery] = React.useState("");

  const visibleProjects = projects.filter((project) => {
    const matchesCategory = activeCategory === "All projects" || project.category === activeCategory;
    const haystack = `${project.title} ${project.church} ${project.location} ${project.category}`.toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase());
  });

  return (
    <main id="top">
      <section className="projects-section section-wrap">
        <div className="projects-heading">
          <div>
            <p className="eyebrow">All projects</p>
            <h1>Projects<br /><em>worth building.</em></h1>
          </div>
        </div>

        <div className="project-toolbar">
          <div className="filter-tabs" role="tablist" aria-label="Project categories">
            {categories.map((category) => (
              <button
                key={category}
                className={activeCategory === category ? "filter-tab active" : "filter-tab"}
                onClick={() => setActiveCategory(category)}
                role="tab"
                aria-selected={activeCategory === category}
              >
                {category}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
            />
            {query && (
              <button
                className="clear-search"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </label>
        </div>

        <div className="project-grid">
          {visibleProjects.map((project, index) => (
            <article key={project.id} className="project-card" style={{ animationDelay: `${index * 70}ms` }} onClick={() => onProject(project)}>
              <ProjectVisual project={project} />
              <div className="project-card-body">
                <div className="card-meta">
                  <span className="category-label">{project.category}</span>
                  <span>{project.location}</span>
                </div>
                <p className="card-church">{project.church}</p>
                <h3>{project.title}</h3>
                <p className="card-description">{project.description}</p>
                <div className="card-funding">
                  <div className="card-funding-copy">
                    <strong>{formatMoney(project.raised)}</strong>
                    <span>of {formatMoney(project.goal)}</span>
                  </div>
                  <Progress project={project} />
                </div>
                <div className="card-footer">
                  <span>{project.donors} donors</span>
                  <div className="card-actions">
                    <button className="card-details" onClick={(event) => { event.stopPropagation(); onProject(project); }}>
                      View project
                    </button>
                    <button className={project.status === "funded" ? "card-donate funded-donate" : "card-donate"} disabled={project.status === "funded"} onClick={(event) => { event.stopPropagation(); onDonate(project); }}>
                      {project.status === "funded" ? "Funded" : "Donate"}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {visibleProjects.length === 0 && (
          <div className="empty-state">
            <Sparkles size={20} />
            <h3>No projects found</h3>
            <p>Try another search or category.</p>
          </div>
        )}
      </section>
    </main>
  );
}

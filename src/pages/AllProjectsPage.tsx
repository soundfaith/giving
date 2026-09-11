import React from "react";
import { Search, Sparkles, X } from "lucide-react";
import type { Project } from "../lib/supabase";
import { categories } from "../lib/projects";
import { ProjectCard } from "../components/ProjectCard";

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
  const activeProjects = visibleProjects.filter((project) => project.status !== "funded" && project.status !== "closed");
  const fundedProjects = visibleProjects.filter((project) => project.status === "funded");
  const completedProjects = visibleProjects.filter((project) => project.status === "closed");
  const renderCards = (items: Project[], compact = false) => <div className={compact ? "project-grid project-grid-compact" : "project-grid"}>{items.map((project, index) => <ProjectCard key={project.id} project={project} index={index} compact={compact} onDetails={() => onProject(project)} onDonate={() => onDonate(project)} />)}</div>;

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

        {activeProjects.length > 0 && <section className="catalog-group"><div className="catalog-group-heading"><div><p className="eyebrow">Seeking support</p><h2>Projects to<br /><em>build together.</em></h2></div><span>{activeProjects.length}</span></div>{renderCards(activeProjects)}</section>}
        {fundedProjects.length > 0 && <section className="catalog-group catalog-group-compact"><div className="catalog-group-heading"><div><p className="eyebrow">Goal reached</p><h2>Fully<br /><em>funded.</em></h2></div><span>{fundedProjects.length}</span></div>{renderCards(fundedProjects, true)}</section>}
        {completedProjects.length > 0 && <section className="catalog-group catalog-group-compact"><div className="catalog-group-heading"><div><p className="eyebrow">Impact archive</p><h2>Completed<br /><em>projects.</em></h2></div><span>{completedProjects.length}</span></div>{renderCards(completedProjects, true)}</section>}

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

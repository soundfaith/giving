import { ArrowUpRight, Zap, Sparkles, Smartphone, Wallet, TrendingUp, Lock, Link2, Shield } from "lucide-react";
import type { Project } from "../lib/supabase";
import { formatMoney, selectFeaturedProjects } from "../lib/projects";
import { Progress, ProjectVisual } from "../components/ProjectPrimitives";

export function HomePage({ projects, onProject, onDonate }: {
  projects: Project[];
  onProject: (project: Project) => void;
  onDonate: (project: Project) => void;
}) {
  const featuredProjects = selectFeaturedProjects(projects, 3);
  
  if (projects.length === 0) {
    return (
      <main className="empty-state section-wrap">
        <Sparkles size={20} />
        <h3>No projects available</h3>
        <p>Check back soon for new church projects.</p>
      </main>
    );
  }

  return (
    <main id="top">
      {/* Hero: Single value statement + single primary CTA */}
      <section className="hero section-wrap">
        <div className="hero-copy reveal reveal-one">
          <p className="eyebrow"><span className="eyebrow-dot" /> For churches, by communities</p>
          <h1>Give toward the<br /><em>Church's mission.</em></h1>
          <p className="hero-description">A trusted way to support the Church through transparent, mission‑aligned giving.</p>
          <div className="trust-cards">
            <div className="trust-card">
              <Shield size={24} />
              <span>Every dollar goes to the project</span>
            </div>
            <div className="trust-card">
              <Link2 size={24} />
              <span>Verified through community attestations</span>
            </div>
            <div className="trust-card">
              <Lock size={24} />
              <span>Fully auditable on the blockchain</span>
            </div>
          </div>
          <div className="hero-actions">
            <a className="button button-coral" href="#/all-projects">Give now <ArrowUpRight size={16} /></a>
          </div>
        </div>
      </section>

      {/* Featured projects: 3 cards in responsive grid */}
      <section className="featured-projects section-wrap" id="featured">
        <div className="featured-header">
          <div>
            <p className="eyebrow">Featured now</p>
            <h2>Where faith<br /><em>is building.</em></h2>
          </div>
        </div>
        
        <div className="featured-grid">
          {featuredProjects.map((project, index) => (
            <article key={project.id} className="featured-card" style={{ animationDelay: `${index * 100}ms` }}>
              <ProjectVisual project={project} />
              <div className="card-body">
                <div className="card-meta">
                  <span className="category-label">{project.category}</span>
                  {project.status === "funded" && <span className="funded-badge">Funded</span>}
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
                  <button className="button button-coral button-small" disabled={project.status === "funded"} onClick={() => onDonate(project)}>
                    {project.status === "funded" ? "Funded" : <>Give now <ArrowUpRight size={14} /></>}
                  </button>
                  <button className="text-link" onClick={() => onProject(project)}>
                    Learn more
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {projects.length > 3 && (
          <div className="featured-footer">
            <a className="button button-outline" href="#/all-projects">
              Browse all {projects.length} projects <ArrowUpRight size={16} />
            </a>
          </div>
        )}
      </section>

      {/* How it works: Modern card-based with icons and animations */}
      <section className="how-it-works section-wrap" id="how-it-works">
        <div className="how-header">
          <div>
            <p className="eyebrow">Simple process</p>
            <h2>How it<br /><em>works.</em></h2>
          </div>
        </div>
        
        <div className="how-grid">
          {/* For donors */}
          <div className="how-section">
            <p className="section-label">For donors</p>
            <div className="how-cards">
              <div className="how-card reveal" style={{ animationDelay: '0s' }}>
                <div className="how-icon">
                  <Smartphone size={28} />
                </div>
                <strong>Browse & choose</strong>
                <p>See active church projects verified by local teams.</p>
              </div>
              <div className="how-card reveal" style={{ animationDelay: '0.1s' }}>
                <div className="how-icon">
                  <Wallet size={28} />
                </div>
                <strong>Give from your wallet</strong>
                <p>Donations confirm on TX blockchain instantly.</p>
              </div>
              <div className="how-card reveal" style={{ animationDelay: '0.2s' }}>
                <div className="how-icon">
                  <TrendingUp size={28} />
                </div>
                <strong>Watch impact unfold</strong>
                <p>Track progress as your project reaches its goal.</p>
              </div>
            </div>
          </div>

          {/* For church owners */}
          <div className="how-section">
            <p className="section-label">For churches</p>
            <div className="how-cards">
              <div className="how-card reveal" style={{ animationDelay: '0.05s' }}>
                <div className="how-icon">
                  <Zap size={28} />
                </div>
                <strong>Create your project</strong>
                <p>Share your vision. Set a goal. Add inspiring photos.</p>
              </div>
              <div className="how-card reveal" style={{ animationDelay: '0.15s' }}>
                <div className="how-icon">
                  <Link2 size={28} />
                </div>
                <strong>Share & receive</strong>
                <p>Donations flow in transparently on-chain.</p>
              </div>
              <div className="how-card reveal" style={{ animationDelay: '0.25s' }}>
                <div className="how-icon">
                  <TrendingUp size={28} />
                </div>
                <strong>Claim & build</strong>
                <p>At goal, claim funds and start your work.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why blockchain CTA section */}
      <section className="why-blockchain section-wrap" id="why-blockchain">
        <div className="blockchain-box">
          <div className="blockchain-content">
            <p className="eyebrow">Powered by TX blockchain</p>
            <h2>Why transparency<br /><em>matters for giving.</em></h2>
            <p>Every donation is permanently recorded. No lost receipts. No hidden fees. Complete transparency means complete trust.</p>
            <div className="blockchain-features">
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>All transactions are public and immutable</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>Instant, irreversible confirmations</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>Direct from donor to project—no intermediary</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA for church owners */}
      <section className="cta-section section-wrap" id="for-churches">
        <div className="cta-box">
          <h2>Ready to share your<br /><em>church's mission?</em></h2>
          <p>SoundFaith gives churches the tools to fund and manage meaningful projects with their communities.</p>
          <a className="button button-coral" href="#/churches">
            Create a project <ArrowUpRight size={16} />
          </a>
        </div>
      </section>
    </main>
  );
}

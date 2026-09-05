import { ArrowUpRight } from "lucide-react";

export function ChurchPage({ authenticated, onContinue }: { authenticated: boolean; onContinue: () => void }) {
  return <main className="church-route section-wrap"><p className="eyebrow">For churches</p><h1>Make room<br /><em>for more.</em></h1><p className="hero-description">Bring a practical project to a community that wants to help. Sign in to submit your project for review.</p><button className="button button-coral" onClick={onContinue}>{authenticated ? "Submit a project" : "Sign in to submit"} <ArrowUpRight size={16} /></button></main>;
}

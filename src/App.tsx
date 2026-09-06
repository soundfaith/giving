import { useEffect, useMemo, useState } from "react";
import { Menu, Wallet, X } from "lucide-react";
import { Brand, ThemeToggle } from "./components/Brand";
import { ModalLayer, type Modal } from "./components/ModalLayer";
import { HomePage } from "./pages/HomePage";
import { AllProjectsPage } from "./pages/AllProjectsPage";
import { ProjectPage } from "./pages/ProjectPage";
import { ChurchPage } from "./pages/ChurchPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ReviewPage } from "./pages/ReviewPage";
import { AdminPage } from "./pages/AdminPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { projects as fallbackProjects } from "./lib/projects";
import { projectRepository, identityRepository, supabase, type Project } from "./lib/supabase";
import { getBrowserWalletAddress } from "./lib/walletVault";

function readRoute() {
  const path = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  if (path.startsWith("projects/")) return { name: "project" as const, id: path.slice("projects/".length) };
  if (path === "all-projects") return { name: "all-projects" as const };
  if (path === "churches") return { name: "churches" as const };
  if (path === "profile") return { name: "profile" as const };
  if (path === "review") return { name: "review" as const };
  if (path === "admin") return { name: "admin" as const };
  if (path === "notifications") return { name: "notifications" as const };
  return { name: "home" as const };
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [theme, setTheme] = useState<"light" | "dark">(() => window.localStorage.getItem("soundfaith-theme") === "dark" ? "dark" : "light");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [projectList, setProjectList] = useState<Project[]>(fallbackProjects);
  const [authUser, setAuthUser] = useState<string | null>(null);

  useEffect(() => { const changeRoute = () => { if (route.name === "all-projects") sessionStorage.setItem("soundfaith-projects-scroll", String(window.scrollY)); setRoute(readRoute()); setMobileMenu(false); }; window.addEventListener("hashchange", changeRoute); return () => window.removeEventListener("hashchange", changeRoute); }, [route]);
  useEffect(() => {
    const hash = window.location.hash.replace(/^#\/?/, "");
    const [path, query = ""] = hash.split("?");
    if (route.name === "all-projects") {
      const savedScroll = sessionStorage.getItem("soundfaith-projects-scroll");
      window.requestAnimationFrame(() => window.scrollTo(0, savedScroll ? Number(savedScroll) : 0));
    } else if (route.name === "home") {
      const section = new URLSearchParams(query).get("section") ?? (path === "projects" || path === "how-it-works" ? path : null);
      if (section) window.requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth" }));
    }
  }, [route]);
  useEffect(() => { document.documentElement.dataset.theme = theme; window.localStorage.setItem("soundfaith-theme", theme); }, [theme]);
  useEffect(() => { let active = true; const handleSession = async (email: string | null) => { if (!active) return; setAuthUser(email); if (!email) return; const profile = await identityRepository.syncProfile().catch(() => null); const walletAddress = await getBrowserWalletAddress().catch(() => null); if (walletAddress) { await identityRepository.syncProfile(walletAddress).catch(() => {}); } else if (active) setModal({ type: "wallet-setup", walletAddress: profile?.wallet_address ?? null }); }; projectRepository.list().then((remote) => { if (active && remote.length) setProjectList(remote); }).catch(() => {}); if (!supabase) return () => { active = false; }; supabase.auth.getUser().then(({ data }) => handleSession(data.user?.email ?? null)); const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void handleSession(session?.user?.email ?? null); }); return () => { active = false; listener.subscription.unsubscribe(); }; }, []);

  const project = useMemo(() => projectList.find((item) => item.id === route.id), [projectList, route]);
  const openChurch = () => setModal(authUser ? { type: "church" } : { type: "wallet" });
  const openProject = (item: Project) => { window.location.hash = `#/projects/${item.id}`; };
  const openDonate = (item: Project) => setModal({ type: "donate", project: item });

  const page = route.name === "project" && project ? <ProjectPage project={project} onDonate={() => openDonate(project)} /> : route.name === "all-projects" ? <AllProjectsPage projects={projectList} onProject={openProject} onDonate={openDonate} /> : route.name === "churches" ? <ChurchPage authenticated={Boolean(authUser)} onContinue={openChurch} /> : route.name === "profile" ? <ProfilePage /> : route.name === "notifications" ? <NotificationsPage /> : route.name === "review" ? <ReviewPage /> : route.name === "admin" ? <AdminPage /> : <HomePage projects={projectList} onProject={openProject} onDonate={openDonate} />;
  return <div className="app-shell"><header className="site-header"><Brand /><nav className={mobileMenu ? "main-nav nav-open" : "main-nav"} aria-label="Primary navigation"><a href="#/all-projects" onClick={() => setMobileMenu(false)}>Browse <span className="nav-count">{String(projectList.length).padStart(2, "0")}</span></a><a href="#/?section=featured" onClick={() => setMobileMenu(false)}>Featured</a><a href="#/churches" onClick={() => setMobileMenu(false)}>For churches</a></nav><ThemeToggle theme={theme} onToggle={() => setTheme(theme === "light" ? "dark" : "light")} /><a className="button button-dark header-wallet" href={authUser ? "#/profile" : "#/"} onClick={(event) => { if (!authUser) { event.preventDefault(); setModal({ type: "wallet" }); } }}><Wallet size={15} /> {authUser ? "Profile" : "Login"}</a><button className="icon-button mobile-toggle" aria-label={mobileMenu ? "Close menu" : "Open menu"} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X size={20} /> : <Menu size={20} />}</button></header>{page}<footer className="site-footer"><div className="footer-brand"><span className="wordmark-mark">sf</span><span>Built for the people who make room.</span></div><div className="footer-bottom"><span>© 2026 SoundFaith</span><span className="footer-status"><i /> TX testnet · local demo</span><span>Made with intention</span></div></footer>{modal && <ModalLayer modal={modal} close={() => setModal(null)} onDonate={openDonate} />}</div>;
}

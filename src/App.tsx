import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Heart,
  Home,
  Menu,
  Plus,
  Search,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { Brand } from "./components/Brand";
import { ThemeToggle } from "./components/Brand";
import { ModalLayer, type Modal } from "./components/ModalLayer";
import { HomePage } from "./pages/HomePage";
import { AllProjectsPage } from "./pages/AllProjectsPage";
import { ProjectPage } from "./pages/ProjectPage";
import { ChurchPage } from "./pages/ChurchPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ReviewPage } from "./pages/ReviewPage";
import { AdminPage } from "./pages/AdminPage";
import { InboxPage } from "./pages/InboxPage";
import { TermsPage } from "./pages/TermsPage";
import { projects as fallbackProjects } from "./lib/projects";
import {
  projectRepository,
  identityRepository,
  supabase,
  type Project,
} from "./lib/supabase";
import {
  activateBrowserWalletForAddress,
  claimBrowserWalletForEmail,
  clearActiveBrowserWallet,
} from "./lib/walletVault";

function readRoute() {
  const path = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  if (path.startsWith("projects/"))
    return { name: "project" as const, id: path.slice("projects/".length) };
  if (path === "all-projects") return { name: "all-projects" as const };
  if (path === "churches") return { name: "churches" as const };
  if (path === "terms") return { name: "terms" as const };
  if (path === "profile") return { name: "profile" as const };
  if (path === "review") return { name: "review" as const };
  if (path === "admin") return { name: "admin" as const };
  if (path === "notifications") return { name: "notifications" as const };
  if (path === "activities") return { name: "activities" as const };
  if (path === "inbox") return { name: "inbox" as const };
  return { name: "home" as const };
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [mobileMenu, setMobileMenu] = useState(false);
  const mobileMenuRef = useRef<HTMLElement | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [projectList, setProjectList] = useState<Project[]>(fallbackProjects);
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">(() => window.localStorage.getItem("soundfaith-theme") === "dark" ? "dark" : "light");

  const refreshUnreadNotifications = () => {
    if (!authUser) {
      setUnreadNotifications(0);
      return;
    }
    void identityRepository.getNotifications(0, 20)
      .then((items) => setUnreadNotifications(items.filter((item) => !item.read_at).length))
      .catch(() => setUnreadNotifications(0));
  };

  useEffect(() => {
    refreshUnreadNotifications();
    window.addEventListener("soundfaith-notifications-changed", refreshUnreadNotifications);
    return () => window.removeEventListener("soundfaith-notifications-changed", refreshUnreadNotifications);
  }, [authUser, route.name]);

  useEffect(() => {
    if (!mobileMenu) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!mobileMenuRef.current?.contains(target)) setMobileMenu(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [mobileMenu]);

  useEffect(() => {
    const changeRoute = () => {
      if (route.name === "all-projects")
        sessionStorage.setItem(
          "soundfaith-projects-scroll",
          String(window.scrollY),
        );
      setRoute(readRoute());
      setMobileMenu(false);
    };
    window.addEventListener("hashchange", changeRoute);
    return () => window.removeEventListener("hashchange", changeRoute);
  }, [route]);
  useEffect(() => {
    const hash = window.location.hash.replace(/^#\/?/, "");
    const [path, query = ""] = hash.split("?");
    if (route.name === "all-projects") {
      const savedScroll = sessionStorage.getItem("soundfaith-projects-scroll");
      window.requestAnimationFrame(() =>
        window.scrollTo(0, savedScroll ? Number(savedScroll) : 0),
      );
    } else if (route.name === "home") {
      const section =
        new URLSearchParams(query).get("section") ??
        (path === "projects" || path === "how-it-works" ? path : null);
      if (section)
        window.requestAnimationFrame(() =>
          document
            .getElementById(section)
            ?.scrollIntoView({ behavior: "smooth" }),
        );
    }
  }, [route]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem("soundfaith-theme", next);
  };
  useEffect(() => {
    let active = true;
    const handleSession = async (email: string | null) => {
      if (!active) return;
      setAuthUser(email);
      if (!email) {
        clearActiveBrowserWallet();
        return;
      }
      const profile = await identityRepository.syncProfile().catch(() => null);
      const walletAddress = profile?.wallet_address ?? null;
      const localWallet = walletAddress
        ? await activateBrowserWalletForAddress(walletAddress)
        : null;
      if (localWallet && profile?.email) {
        await claimBrowserWalletForEmail(localWallet.address, profile.email);
      }
      if (!localWallet) {
        clearActiveBrowserWallet();
      } else {
        await identityRepository.syncProfile(localWallet.address).catch(() => {});
      }
      if (!localWallet && active)
        setModal({
          type: "wallet-setup",
          walletAddress: profile?.wallet_address ?? null,
        });
    };
    projectRepository
      .list()
      .then((remote) => {
        if (active && remote.length) setProjectList(remote);
      })
      .catch(() => {});
    if (!supabase)
      return () => {
        active = false;
      };
    supabase.auth
      .getUser()
      .then(({ data }) => handleSession(data.user?.email ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void handleSession(session?.user?.email ?? null);
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const project = useMemo(
    () => projectList.find((item) => item.id === route.id),
    [projectList, route],
  );
  const openChurch = () => setModal({ type: "wallet" });
  const openProject = (item: Project) => {
    window.location.hash = `#/projects/${item.id}`;
  };
  const openDonate = (item: Project) =>
    setModal({ type: "donate", project: item });

  const page =
    route.name === "project" && project ? (
      <ProjectPage project={project} onDonate={() => openDonate(project)} />
    ) : route.name === "all-projects" ? (
      <AllProjectsPage
        projects={projectList}
        onProject={openProject}
        onDonate={openDonate}
      />
    ) : route.name === "churches" ? (
      <ChurchPage authenticated={Boolean(authUser)} onSignIn={openChurch} />
    ) : route.name === "terms" ? (
      <TermsPage />
    ) : route.name === "profile" ? (
      <ProfilePage />
    ) : route.name === "notifications" || route.name === "activities" || route.name === "inbox" ? (
      <InboxPage />
    ) : route.name === "review" ? (
      <ReviewPage />
    ) : route.name === "admin" ? (
      <AdminPage />
    ) : (
      <HomePage
        projects={projectList}
        onProject={openProject}
        onDonate={openDonate}
      />
    );
  return (
    <div className="app-shell">
      <header className="site-header">
        <Brand />
        <nav
          ref={mobileMenuRef}
          className={mobileMenu ? "main-nav nav-open" : "main-nav"}
          aria-label="Primary navigation"
        >
          <a href="#/all-projects" onClick={() => setMobileMenu(false)}>
            {authUser ? "Browse" : "Browse Projects"}
          </a>
          <a href="#/churches" onClick={() => setMobileMenu(false)}>Create Project</a>
          {authUser && <a href="#/inbox" onClick={() => setMobileMenu(false)}>Inbox</a>}
        </nav>
        {!authUser && <ThemeToggle theme={theme} onToggle={toggleTheme} />}
        <a
          className="button button-dark header-wallet"
          href={authUser ? "#/profile" : "#/"}
          onClick={(event) => {
            if (!authUser) {
              event.preventDefault();
              setModal({ type: "wallet" });
            }
          }}
        >
          <Wallet size={15} /> {authUser ? "Profile" : "Sign in"}
        </a>
        <button
          className="icon-button mobile-toggle"
          aria-label={mobileMenu ? "Close menu" : "Open menu"}
          onClick={() => setMobileMenu(!mobileMenu)}
        >
          {mobileMenu ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>
      {page}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <a href="#/" className={route.name === "home" ? "active" : ""}>
          <Home size={17} />
          <span>Home</span>
        </a>
        {!authUser ? <a href="#/all-projects" className={route.name === "all-projects" ? "active" : ""}>
          <Search size={17} />
          <span>Browse</span>
        </a> : <a href="#/churches" className={route.name === "churches" ? "active" : ""}>
          <Plus size={17} />
          <span>Create</span>
        </a>}
        <a href="#/all-projects" className="mobile-donate">
          <Heart size={20} />
          <span>Donate</span>
        </a>
        {!authUser ? <>
          <a href="#/churches" className={route.name === "churches" ? "active" : ""}>
            <Plus size={17} />
            <span>Create</span>
          </a>
          <a href="#/" onClick={(event) => { event.preventDefault(); setModal({ type: "wallet" }); }}>
            <UserRound size={17} />
            <span>Sign in</span>
          </a>
        </> : <>
          <a href="#/inbox" className={route.name === "inbox" || route.name === "activities" || route.name === "notifications" ? "active" : ""}>
            <span className="mobile-profile-icon-wrap">
              <Bell size={17} />
              {unreadNotifications > 0 && <span className="notification-badge">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
            </span>
            <span>Inbox</span>
          </a>
          <a href="#/profile" className={route.name === "profile" ? "active" : ""}>
            <UserRound size={17} />
            <span>Profile</span>
          </a>
        </>}
      </nav>
      <footer className="site-footer">
        <div className="footer-brand">
          <span className="wordmark-mark">sf</span>
          <span>Helping good work reach the people who need it.</span>
        </div>
        <div className="footer-bottom">
          <span>© 2026 SoundFaith</span>
          <span className="footer-status">
            <i /> TX testnet · local demo
          </span>
          <span>Made with intention</span>
        </div>
      </footer>
      {modal && (
        <ModalLayer
          modal={modal}
          close={() => setModal(null)}
          onDonate={openDonate}
          ownerEmail={authUser}
        />
      )}
    </div>
  );
}

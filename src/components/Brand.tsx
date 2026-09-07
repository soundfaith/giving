import { Moon, Sun } from "lucide-react";

export function Brand() {
  return (
    <a className="wordmark" href="#/" aria-label="SoundFaith home">
      <span className="wordmark-mark">sf</span>
      <span>soundfaith</span>
    </a>
  );
}
export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: "light" | "dark";
  onToggle: () => void;
}) {
  return (
    <button
      className="icon-button theme-toggle"
      onClick={onToggle}
      aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
      title={`Use ${theme === "light" ? "dark" : "light"} theme`}
    >
      {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}

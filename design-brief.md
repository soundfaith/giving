# SoundFaith implementation brief

## Objective
Build the first usable SoundFaith web app surface: a minimalist church project discovery homepage with a featured project, searchable/filterable project list, project cards, and a donation flow entry point. This is a real Vite + React + TypeScript application, not a static mockup.

## Audience
People who want to fund church projects, especially sound enhancements; church teams requesting funding.

## Aesthetic direction
Editorial civic fundraising: warm off-white paper background, near-black ink, coral-red action color, muted sage support color, subtle hairline borders, lots of breathing room, restrained motion. The layout should feel premium and human, not like a generic SaaS dashboard. Use a distinctive serif display face paired with a clean sans UI face via Google Fonts imports or robust fallbacks.

## Content structure
- Header: SoundFaith wordmark, Projects / How it works / For churches links, Connect wallet CTA.
- Hero: concise trust-oriented title about funding better spaces for worship, supporting copy, coral browse projects button, numeric stats and a compact chain status signal.
- Featured project: large photographic project visual with an offset white detail panel; church name, location, title, progress amount, progress bar, donor count, donate button.
- Project list: filter tabs (All projects, Sound & AV, Spaces, Access), search field, responsive grid of project cards with real imagery, progress, category, church, amount.
- Footer: small platform promise and social/wallet hints.

## Typography
Use an expressive serif display face for headlines (DM Serif Display or Fraunces) and a clean geometric sans for UI (Manrope or Plus Jakarta Sans). Avoid default system-only typography.

## Color palette
--paper: #F5F2EC
--ink: #171916
--muted: #6F746C
--line: #D9D7D0
--coral: #E45C45
--coral-deep: #B84232
--sage: #DCE6D7
--white: #FFFDF9
--yellow: #F3C969

## Interaction requirements
- Project category tabs filter visible cards.
- Search filters projects by name, church, location, or category.
- Connect wallet opens a small accessible modal with social login choices and Coreum testnet status.
- Donate buttons open a donation sheet/modal with selectable TX amounts and a simulated wallet confirmation state.
- Mobile navigation collapses to a menu button.
- Use tasteful reveal and hover transitions without making content hard to use.

## Blockchain / backend boundary
Create a small src/lib/coreum.ts adapter with typed placeholders for Coreum testnet donation transactions and smart-token metadata. Create src/lib/supabase.ts with typed repository boundaries for projects and identity. Do not include real secrets; use environment variable names and mock data for the first local experience.

## Output
Implement in the workspace root using Vite, React, TypeScript, Tailwind CSS, and lucide-react. Ensure `npm run build` succeeds. Keep the app responsive at desktop and mobile widths.

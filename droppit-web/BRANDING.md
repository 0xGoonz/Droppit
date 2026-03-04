# 💧 Droppit — Brand Guide

## Logo: Glowing Drop

The Droppit logo is a **glowing water droplet** with a blue-to-cyan gradient, glass refraction highlight, and subtle outer glow. It represents the core "drop" action — launching an NFT drop.

### Logo Usage

| Variant | File | Usage |
|---|---|---|
| **SVG Component** | `src/components/brand/BrandMark.tsx` | In-app logo mark (nav, cards) |
| **Wordmark** | `src/components/brand/Wordmark.tsx` | "Droppit" gradient text |
| **Lockup** | `src/components/brand/BrandLockup.tsx` | Mark + Wordmark together |
| **Favicon** | `public/favicon.png` | Browser tab icon |
| **Apple Touch** | `public/apple-touch-icon.png` | Mobile "Add to Home Screen" |
| **OG Image** | `public/og-image.png` | Social media preview (1200×630) |

---

## Color Palette

| Name | Hex | Usage |
|---|---|---|
| **Background** | `#05070F` | Page backgrounds |
| **Surface** | `#0B1020` | Cards, inputs, elevated surfaces |
| **Base Blue** | `#0052FF` | Primary brand, CTAs, links |
| **Cyan** | `#22D3EE` | Accents, highlights, drop gradient end |
| **Violet** | `#7C3AED` | Locked content, secondary accent |
| **Pink** | `#FF4D8D` | Warm accents, gradients |
| **Text Primary** | `#F8FAFC` | Headings, body text |
| **Text Secondary** | `#CBD5E1` | Descriptions, muted text |

### Key Gradients

- **Logo / CTA:** `#0052FF → #22D3EE` (blue → cyan)
- **Premium CTA:** `#0052FF → #7C3AED → #FF4D8D` (blue → violet → pink)
- **Locked Content:** violet-tinted cards/borders

---

## Typography

| Role | Font | CSS Variable |
|---|---|---|
| **Display / Headings** | Space Grotesk | `--font-space-grotesk` |
| **Body** | Plus Jakarta Sans | `--font-plus-jakarta` |
| **Mono / Data** | IBM Plex Mono | `--font-ibm-plex-mono` |

---

## UI Principles

1. **Dark-first** — All pages use `#05070F` base with radial gradient orbs
2. **Glassmorphism** — Cards use `bg-white/[0.02]`, `border-white/[0.06]`, subtle gradients
3. **Glow effects** — CTAs and interactive elements have soft colored shadows
4. **Transparent navs** — No dark header bars; navs float over the gradient
5. **Responsive** — Stack layouts vertically on mobile, side-by-side on `sm:` and up

---

## Brand Constants

All brand text is centralized in `src/lib/brand.ts`:

```ts
BRAND.name        // "Droppit"
BRAND.shortName   // "Droppit"
BRAND.tagline     // "Launch drops at feed speed."
BRAND.description // "Create ERC-1155 drops on Base..."
```

---

## Checklist

- [x] Logo mark (SVG component — glowing drop)
- [x] Wordmark (gradient text component)
- [x] Brand lockup (mark + wordmark)
- [x] Favicon (`public/favicon.png`)
- [x] Apple Touch Icon (`public/apple-touch-icon.png`)
- [x] OG Image for social sharing (`public/og-image.png`)
- [x] Meta tags in `layout.tsx` (title, description, icons, OG)
- [x] Color palette defined in `brand.ts`
- [x] Typography system (3 fonts via Google Fonts)
- [x] Footer brand icon matches logo
- [ ] PWA manifest (optional, for installable app)
- [ ] Animated logo variant (optional, for loading screens)
- [ ] Brand kit export (PNG/SVG files for external use — docs, socials, merch)

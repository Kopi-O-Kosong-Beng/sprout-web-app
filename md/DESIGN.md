# DESIGN.md

## 1. Reference Overview
- Reference URL / image / source: User-provided screenshot of a dark ornamental plant ecommerce hero page branded "Cactius".
- Date inspected: 2026-07-11
- Pages or views inspected: Single desktop landing-page screenshot, Approx: 1536 x 1024 source image showing the first viewport only.
- Access limitations: Screenshot-only reference. No live URL, DOM, CSS, font files, image assets, animation timelines, or responsive screenshots were available. DOM structure, JavaScript behaviour, exact fonts, and exact measurements are inferred from visual evidence.
- Overall design summary: A premium playful plant-shop landing page with a dark charcoal hero canvas, soft olive outer background, oversized 3D cactus character imagery, high-contrast slab-serif headline typography, pill-shaped commerce CTAs, outlined category chips, and carousel/product-card cues.
- Intended replication goal: Recreate the screenshot's visual style as a frontend design system for a polished plant/nature product landing page: dark botanical retail, tactile 3D mascot assets, rounded product controls, strong display type, and responsive ecommerce hero composition.

## 2. Visual Identity Summary
The reference combines ornamental plant retail with toy-like 3D character art. The brand mood is friendly, sculptural, slightly whimsical, and premium. The page avoids a generic bright garden palette; instead it uses a dark gallery-like stage so the cactus greens and clay pots read as product spotlights.

Visual hierarchy is dominated by three anchors: the illustrated logo at top left, the large 3D cactus hero on the left, and the oversized uppercase headline on the right. Density is medium: the top navigation is sparse, the hero has large whitespace pockets, and the lower viewport introduces product/category browsing without becoming a dense catalog.

Key motifs:
- 3D cactus mascots with expressive faces and soft studio lighting.
- Dark charcoal panel with olive-green atmospheric glows.
- Heavy western/editorial slab-serif headline with one green emphasized word.
- Rounded pill controls, white outlines, and small icon-first interaction affordances.
- Product cards that crop upward from the bottom edge, implying a carousel or product rail.

## 3. Colour System
### 3.1 Core Palette
| Token | Approx / Exact Value | Usage |
| --- | --- | --- |
| `--color-page-sage` | Approx: `#C8D09A` | Outer browser/page background surrounding the central dark composition. |
| `--color-hero-bg` | Approx: `#24262A` | Main dark hero canvas. |
| `--color-hero-bg-deep` | Approx: `#1C1F22` | Darker vertical center and lower section gradients. |
| `--color-olive-glow` | Approx: `#44553B` | Soft botanical glow behind logo and hero art. |
| `--color-moss` | Approx: `#94AF57` | Product-card border, lower card background, plant accent surfaces. |
| `--color-lime-word` | Approx: `#A5E66D` | Highlighted "PLANTS" headline word. |
| `--color-cactus-bright` | Approx: `#77D957` | Bright cactus ribs and product highlight tones. |
| `--color-cactus-deep` | Approx: `#1E8A5A` | Deep cactus shadow tones. |
| `--color-clay-pot` | Approx: `#C86932` | Terracotta pot surfaces. |
| `--color-clay-shadow` | Approx: `#8C3E1F` | Pot shadows and lower rim depth. |
| `--color-cream` | Approx: `#F4F5E8` | Logo icon, brand text, nav text, headline white, cart chip. |
| `--color-white` | Exact: `#FFFFFF` | CTA fill, outlines, high-contrast text. |
| `--color-black` | Approx: `#0B0D0F` | Button text, icon strokes, deepest shadows. |
| `--color-purple-accent` | Approx: `#D852F0` | Circular arrow accent inside primary CTA and cart notification dot. |

### 3.2 Semantic Colours
| Token | Value | Usage |
| --- | --- | --- |
| `--surface-page` | Approx: `#C8D09A` | Page background. |
| `--surface-stage` | Approx: `#24262A` | Main content stage. |
| `--surface-card` | Approx: `linear-gradient(#28302B 0%, #94AF57 100%)` | Product preview card background. |
| `--text-primary` | Approx: `#F4F5E8` | Headline, nav, brand. |
| `--text-muted` | Approx: `#D1D1C9` | Supporting paragraph. |
| `--text-inverse` | Approx: `#101114` | Text inside white CTA. |
| `--border-light` | Approx: `rgba(255,255,255,0.9)` | Category chips, carousel oval, dividers. |
| `--border-olive` | Approx: `#9DAF63` | Product-card outlines. |
| `--accent-primary` | Approx: `#D852F0` | Primary action icon background. |
| `--accent-success-botanical` | Approx: `#A5E66D` | Botanical emphasis and active states. |

### 3.3 Gradients / Overlays / Backgrounds
- Stage background: Inferred: dark radial/linear blend with `#24262A` base, smoky olive patches at top left and top right, and a darker center behind the headline for contrast.
- Product cards: Approx: vertical gradient from `#2A312B` at top to `#9DB560` near the bottom, clipped in rounded top-corner containers.
- CTA accent circle: Approx: radial or flat fill `#D852F0` with white/cream arrow icon and subtle inner highlight.
- Cactus images: Inferred: rendered PNG/WebP assets with transparent backgrounds, not CSS-generated illustrations.

## 4. Typography System
### 4.1 Font Families
- Display headline: Inferred: a high-contrast slab-serif or decorative western serif similar to Cooper Black, Clarendon, Alfa Slab One, or a custom display face. Use a bold uppercase serif with chunky bracketed serifs and strong horizontal weight.
- Brand wordmark and nav/body: Inferred: rounded humanist sans with playful terminals, similar to Nunito, Baloo 2, or a custom rounded sans. The wordmark appears softer and more hand-lettered than the nav.
- Supporting paragraph: Inferred: bold serif or slab-serif body style, matching the headline family at smaller scale.

### 4.2 Type Scale
| Element | Font Size | Weight | Line Height | Letter Spacing | Notes |
| --- | --- | --- | --- | --- | --- |
| Brand wordmark | Approx: 38-42px | 600 | 1 | 0 | Rounded, friendly, cream color. |
| Nav links | Approx: 16-18px | 500 | 1.2 | 0 | White/cream, centered in header. |
| Login link | Approx: 20-22px | 600 | 1.2 | 0 | Right aligned, stronger than nav. |
| Hero headline | Approx: 64-76px desktop | 900 | 1.12 | Approx: 1px | Uppercase, slab serif, three lines. |
| Highlight word | Approx: same as headline | 900 | 1.12 | Approx: 1px | Green fill with dark outline/shadow. |
| Hero paragraph | Approx: 20-23px | 800 | 1.35 | 0 | Serif/slab support text, muted cream. |
| Primary CTA | Approx: 19-21px | 800 | 1 | Approx: 0.5px | Uppercase, black text in white pill. |
| Secondary link | Approx: 18-20px | 800 | 1 | Approx: 0.5px | Uppercase, underlined. |
| Category chips | Approx: 20-22px | 500 | 1 | Approx: 0.5px | Uppercase, white outline pill. |

### 4.3 Text Styling Rules
- Use uppercase for hero headline, CTA labels, secondary links, and category chips.
- Keep nav labels title case or sentence case: "Shop", "Features", "Delivery", "Contacts".
- Add subtle dark text-shadow to the cream headline to sharpen against the dark background. Approx: `0 2px 0 rgba(0,0,0,0.45)`.
- Avoid negative letter spacing. The screenshot relies on heavy font weight and scale, not compressed tracking.
- Keep paragraph line length short. Approx: 480-560px maximum.

## 5. Spacing, Layout, and Grid
### 5.1 Spacing Scale
| Token | Value | Common Use |
| --- | --- | --- |
| `--space-2xs` | Approx: 6px | Icon badge offsets, tiny notification dot spacing. |
| `--space-xs` | Approx: 10px | Small button internal gaps. |
| `--space-sm` | Approx: 16px | Nav item gaps on compressed layouts, chip vertical padding. |
| `--space-md` | Approx: 24px | Header alignment gaps, product card gap. |
| `--space-lg` | Approx: 36px | CTA row gap, hero paragraph to CTA spacing. |
| `--space-xl` | Approx: 56px | Header bottom to hero content. |
| `--space-2xl` | Approx: 72px | Stage inner horizontal padding. |
| `--space-3xl` | Approx: 96px | Desktop hero column separation. |

### 5.2 Containers
- Page background fills viewport with sage green.
- Main stage is centered with a wide fixed-ratio composition. Approx desktop size in screenshot: 1392px wide x 990px high, with Approx: 72px margin from image left/right and 70px top.
- Stage uses no visible border radius in the screenshot. Inferred: keep radius `0` or max `2px`.
- Inner content padding: Approx: 64px left/right, 48px top.
- Desktop content grid: Approx: 46% left visual column and 54% right copy/product column.

### 5.3 Grid and Flex Patterns
- Header: three-zone grid: brand left, nav center, account/cart right.
- Hero: two-column layout. Left column holds oversized cactus and category chips; right column holds headline, paragraph, CTAs, and bottom product rail.
- Bottom product previews: two card columns aligned under the right text column, each card Approx: 300px wide x 160px visible height, anchored to bottom edge.
- Category chips: flex-wrap group in two rows, left aligned, Approx: 24px horizontal gap and 18px vertical gap.

## 6. Page Structure
### 6.1 Header / Navigation
Header sits inside the dark stage, Approx: 48px from top and 68px from left/right. It uses a horizontal layout:
- Left: sprout icon plus "Cactius" wordmark. Icon is Approx: 78px wide with pale cream leaves/stem and a subtle ground shadow.
- Center: four nav links with Approx: 64px gaps.
- Right: "Log in", a vertical divider, and a circular cart icon badge with a small purple notification dot.

Implementation notes:
- Inferred DOM: `<header class="site-header">`, `<a class="brand">`, `<nav aria-label="Primary">`, account/actions group.
- Use semantic links for nav and cart. Use `aria-label="Cart"` on the cart button.
- Header remains visually light; no filled nav bar, no border line, no backdrop blur.

### 6.2 Hero Section
Hero content begins below the header. The left side features a large cactus character in a terracotta pot, occupying Approx: 440px x 610px. The cactus overlaps a thin white horizontal oval carousel ring near its pot, with a small white pill containing left/right arrow controls centered on the ring.

Right hero copy:
- Top begins around the vertical midpoint of the main cactus top.
- Headline has three lines: "ORNAMENTAL", "PLANTS FOR", "YOUR HOME"; the word "PLANTS" is green.
- Supporting copy sits below with two lines and bold slab styling.
- CTA row contains a large white pill button and an underlined secondary text link.

### 6.3 Main Content Sections
Only first viewport content is visible. The lower left category filters and lower right product cards imply shop discovery:
- Left category filters: "INDOOR", "OUTDOOR", "SALE", "NEW ARRIVAL", "FLOWERS", "TOP".
- Right product previews: two cactus cards, partially cropped by bottom of stage, each with rounded top corners and botanical gradient backing.

### 6.4 Footer
No footer is visible in the screenshot. Inferred: if implementing a full page, keep footer dark-stage compatible with cream text, small nav groups, newsletter/contact controls, and restrained borders. Do not introduce a bright footer that breaks the dark botanical atmosphere.

## 7. Component System
Header brand:
- Purpose: Establish playful plant-shop identity.
- DOM structure: Inferred: anchor containing image/SVG logo and text span.
- Visual styling: cream sprout icon, cream wordmark, horizontal gap Approx: 16px.
- States: hover can raise wordmark opacity from 0.9 to 1 or add subtle sage underline. Focus needs 2px lime outline offset 4px.
- Responsive behaviour: On mobile, brand remains left, nav collapses to menu button.
- Implementation notes: Use SVG for sprout icon if recreating; keep stroke/fill cream and organic curves.

Primary navigation:
- Purpose: Main site sections.
- DOM structure: `<nav><ul><li><a>`.
- Visual styling: cream text, no underline by default.
- States: hover changes to `--accent-success-botanical`; active can use a small 2px bottom indicator.
- Responsive behaviour: Collapse into drawer below 768px.
- Implementation notes: Maintain generous gaps on desktop; do not put links in boxes.

Account/cart group:
- Purpose: Login and cart access.
- DOM structure: link, separator, icon button.
- Visual styling: vertical cream divider Approx: 2px x 26px; circular cart background Approx: 44px, cream fill; small purple dot Approx: 9px.
- States: cart hover scales to `1.04`; focus ring lime.
- Responsive behaviour: Hide "Log in" text below 480px or move into drawer; keep cart visible.
- Implementation notes: Cart icon should be simple line art, black/dark on cream circle.

Hero cactus visual:
- Purpose: Emotional product mascot and main visual anchor.
- DOM structure: Inferred: absolutely positioned `<img>` or `<picture>` with transparent PNG/WebP.
- Visual styling: large 3D render, soft shadow below pot, no rectangular frame.
- States: carousel arrows suggest image can rotate/advance.
- Responsive behaviour: On mobile, image should move below headline or become centered above headline at reduced size.
- Implementation notes: Use high-resolution transparent WebP/PNG and lazy/preload hero depending on LCP strategy.

Carousel oval controls:
- Purpose: Product/hero image browsing.
- DOM structure: decorative ellipse plus two icon buttons in a white pill.
- Visual styling: thin white ellipse Approx: 2px stroke, width Approx: 400px, height Approx: 90px, crossing behind/around pot; arrow pill Approx: 86px x 36px.
- States: arrows hover with light gray fill and slight translation.
- Responsive behaviour: Hide ellipse on small screens if it causes overlap; keep arrows accessible.
- Implementation notes: Ellipse can be CSS border-radius oval with absolute positioning and `pointer-events: none`.

Primary CTA:
- Purpose: Start shopping.
- DOM structure: `<a class="btn btn-primary"><span class="btn-icon">...</span><span>GO TO SHOP</span></a>`.
- Visual styling: white pill Approx: 290px x 62px; black uppercase text; purple circular icon Approx: 52px; subtle dark outline/shadow.
- States: hover moves arrow icon right by 3px and changes purple to brighter `#E669F6`; focus ring lime; active compresses scale to 0.98; disabled lowers opacity.
- Responsive behaviour: Full width max 320px on mobile.
- Implementation notes: Preserve icon-first layout and left padding; do not use a plain rectangular button.

Secondary CTA:
- Purpose: Lower-commitment details link.
- DOM structure: anchor.
- Visual styling: cream uppercase text, underline, bold.
- States: hover color lime and underline-thickness increases.
- Responsive behaviour: Stack below primary CTA on mobile.
- Implementation notes: Align baseline with primary button text on desktop.

Category chips:
- Purpose: Shop filters/category shortcuts.
- DOM structure: list of button or anchor chips.
- Visual styling: transparent fill, 1px white border, pill radius Approx: 10px, uppercase cream text, Approx: 128-180px width depending label.
- States: hover fill `rgba(255,255,255,0.08)`; active fill cream and dark text; focus ring lime.
- Responsive behaviour: Scroll horizontally or wrap into two columns below 480px.
- Implementation notes: Keep stable heights Approx: 48px.

Product preview cards:
- Purpose: Showcase additional cactus products.
- DOM structure: article/link card with image.
- Visual styling: top-rounded rectangle with 2px olive border, gradient background, cactus image rising above card top.
- States: hover image translates up Approx: 6px and card border brightens; focus ring outside card.
- Responsive behaviour: Convert to horizontal scroll rail on tablet/mobile.
- Implementation notes: Product images intentionally overflow card bounds; set card `overflow: visible` if top protrusion is needed, but clip background separately.

## 8. Interaction and Motion System
| Interaction | Trigger | Behaviour | Duration | Easing | Notes |
| --- | --- | --- | --- | --- | --- |
| Primary CTA arrow | Hover/focus | Purple circle brightens; arrow translates right Approx: 3px | Approx: 180ms | Inferred: `cubic-bezier(.2,.8,.2,1)` | Keep motion small and responsive. |
| Product cards | Hover/focus | Image lifts Approx: 6px; border changes to lime | Approx: 220ms | Inferred: ease-out | Avoid heavy shadows. |
| Nav links | Hover | Text changes from cream to lime | Approx: 150ms | Inferred: ease | No large underline animation needed. |
| Carousel arrows | Click | Hero image/product selection changes | Approx: 300ms | Inferred: ease-in-out | Screenshot shows controls but no live behavior available. |
| Mobile menu | Tap menu button | Drawer or full-screen panel opens from right/top | Approx: 240ms | Inferred: ease-out | Must trap focus while open. |
| Cart badge | Cart count changes | Purple dot can pulse once | Approx: 250ms | Inferred: ease-out | Keep subtle. |

## 9. JavaScript Behaviour
Observed from screenshot: no executable JavaScript could be inspected.

Inferred behaviours to implement:
- Header navigation links route to shop, features, delivery, and contact sections/pages.
- Hero carousel arrows cycle between featured cactus/plant products.
- Category chips filter or link to product listing categories.
- Primary CTA routes to shop/product catalog.
- Secondary CTA scrolls to details/features section.
- Cart icon opens cart page or mini-cart drawer.
- Mobile nav opens a drawer below tablet widths.

Implementation requirements:
- Use semantic buttons for carousel/category controls when they change state; use anchors when they navigate.
- Manage carousel state with React component state.
- Add `aria-live="polite"` for carousel product title changes if visible labels are added.
- Respect `prefers-reduced-motion` by disabling lift/slide animations and using opacity/color-only transitions.

## 10. Responsive Design Rules
| Breakpoint | Layout Behaviour | Typography Behaviour | Navigation Behaviour | Notes |
| --- | --- | --- | --- | --- |
| 320px | Single column; stage fills width; hero image reduced to Approx: 240px; product cards become horizontal scroll or stack. | Hero headline Approx: 38-44px, 3-4 lines; paragraph Approx: 16px. | Hide center nav; show menu icon; keep cart visible. | Avoid fixed desktop canvas height; allow content to scroll. |
| 480px | Single column with larger hero image Approx: 300px; chips wrap in two columns. | Headline Approx: 44-52px. | Drawer nav with login link included. | CTA stack: primary then secondary. |
| 768px | Two-column can begin if space allows, or stacked hero with image left/copy right in compressed proportions. | Headline Approx: 56px. | Header may still use collapsed nav if labels crowd. | Product rail can show two cards. |
| 1024px | Desktop layout: brand/nav/actions header, two-column hero, bottom chips/cards. | Headline Approx: 64px. | Full nav visible. | Use max-width stage and inner padding. |
| 1440px | Full reference composition: Approx: 1390px stage, 64-72px inner horizontal padding. | Headline Approx: 72-76px. | Full nav with generous gaps. | Preserve large dark negative space around headline. |

## 11. Accessibility Guidelines
- Use one `h1` for the hero headline. Keep the green "PLANTS" word inside the same heading, styled with a span.
- Ensure cream text on dark background meets WCAG AA. Approx contrast for `#F4F5E8` on `#24262A` is strong.
- Check green headline word contrast. If `#A5E66D` on dark is used, contrast should pass for large text; verify for smaller text before reuse.
- Category chips and carousel arrows must be reachable by keyboard and show visible focus states.
- Add accessible labels: `aria-label="Previous featured plant"`, `aria-label="Next featured plant"`, `aria-label="Cart"`, `aria-label="Open menu"`.
- Do not rely only on the purple cart dot to communicate cart state; include an accessible cart count label if count exists.
- Product cactus images need descriptive alt text when informative, e.g. "Smiling potted cactus product"; use empty alt only for decorative duplicates.
- Maintain touch targets at least 44px high/wide.
- Respect reduced motion preferences.

## 12. Asset Guidelines
- Hero and product cactus assets should be transparent WebP or PNG renders with soft edge antialiasing. Use 2x resolution for retina.
- Inferred image sizes: hero cactus asset Approx: 600-800px wide source; product card assets Approx: 360-480px wide source.
- Use `<picture>` with WebP/AVIF first and PNG fallback if available.
- Preload the main hero cactus if it is the LCP image.
- Use SVG for sprout logo, cart icon, arrows, and decorative ellipse where possible.
- Keep image lighting consistent: upper-left/front light, soft rim highlights, muted shadows, no photorealistic background.
- Avoid stock plant photos; the reference depends on stylized 3D mascot/product renders.

## 13. Implementation Blueprint
Framework recommendation: Use the existing React + Vite frontend. Convert the current backend smoke-test surface into a componentized landing page only if that is the desired product direction; otherwise keep this design as a separate route or prototype component.

Suggested file structure:
- `client/src/pages/CactiusLanding.tsx` or `client/src/components/landing/CactiusLanding.tsx`
- `client/src/components/landing/Header.tsx`
- `client/src/components/landing/Hero.tsx`
- `client/src/components/landing/CategoryChips.tsx`
- `client/src/components/landing/ProductRail.tsx`
- `client/src/styles/design-tokens.css`
- `client/src/styles/cactius-landing.css`
- `client/src/assets/cactius/` for logo and plant renders

CSS architecture:
- Define global tokens in `:root`.
- Use component classes with domain naming: `.plant-stage`, `.sprout-brand`, `.hero-cactus`, `.category-chip`, `.plant-card`.
- Keep one depth strategy: thin borders and soft image shadows, not heavy card shadows.
- Use CSS Grid for desktop stage layout and Flexbox for nav/chips.
- Use media queries at 480px, 768px, 1024px, and 1440px.

Component breakdown:
- `PlantLandingPage`: owns carousel/category state and page layout.
- `SiteHeader`: brand, nav, login, cart.
- `HeroShowcase`: headline, copy, CTA row, hero image, carousel controls.
- `CategoryChips`: category links/buttons.
- `ProductPreviewRail`: two or more product cards.

## 14. CSS Tokens Draft
```css
:root {
  --color-bg: #c8d09a;
  --color-text: #f4f5e8;
  --color-primary: #a5e66d;
  --color-stage: #24262a;
  --color-stage-deep: #1c1f22;
  --color-olive-glow: #44553b;
  --color-moss: #94af57;
  --color-cream: #f4f5e8;
  --color-ink: #0b0d0f;
  --color-purple-accent: #d852f0;
  --color-clay: #c86932;
  --color-clay-shadow: #8c3e1f;
  --font-body: "Nunito", "Baloo 2", system-ui, sans-serif;
  --font-heading: "Cooper Black", "Alfa Slab One", "Clarendon", Georgia, serif;
  --space-xs: 0.625rem;
  --space-sm: 1rem;
  --space-md: 1.5rem;
  --space-lg: 2.25rem;
  --space-xl: 3.5rem;
  --space-2xl: 4.5rem;
  --radius-sm: 0.625rem;
  --radius-md: 1.25rem;
  --radius-pill: 999px;
  --shadow-md: 0 18px 45px rgba(0, 0, 0, 0.28);
  --stage-max-width: 87rem;
}
```

## 15. HTML Structure Blueprint
```html
<header class="site-header">
  <a class="brand" href="/">
    <span class="brand-mark" aria-hidden="true"></span>
    <span class="brand-name">Cactius</span>
  </a>
  <nav class="primary-nav" aria-label="Primary">
    <a href="/shop">Shop</a>
    <a href="/features">Features</a>
    <a href="/delivery">Delivery</a>
    <a href="/contacts">Contacts</a>
  </nav>
  <div class="header-actions">
    <a href="/login">Log in</a>
    <span class="header-divider" aria-hidden="true"></span>
    <a class="cart-button" href="/cart" aria-label="Cart"></a>
  </div>
</header>

<main class="plant-stage">
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero-visual">
      <img class="hero-cactus" src="/assets/cactus-hero.webp" alt="Happy potted cactus plant" />
      <div class="carousel-orbit" aria-hidden="true"></div>
      <div class="carousel-controls" aria-label="Featured plant carousel">
        <button type="button" aria-label="Previous featured plant"></button>
        <button type="button" aria-label="Next featured plant"></button>
      </div>
    </div>

    <div class="hero-copy">
      <h1 id="hero-title">Ornamental <span>Plants</span> For Your Home</h1>
      <p>We design 95% of our products in-house for original style and quality you won't find anywhere else</p>
      <div class="hero-actions">
        <a class="primary-cta" href="/shop"><span aria-hidden="true"></span>Go to shop</a>
        <a class="details-link" href="#details">More details</a>
      </div>
    </div>

    <ul class="category-chips" aria-label="Plant categories">
      <li><a href="/shop?category=indoor">Indoor</a></li>
      <li><a href="/shop?category=outdoor">Outdoor</a></li>
      <li><a href="/shop?category=sale">Sale</a></li>
      <li><a href="/shop?category=new">New Arrival</a></li>
      <li><a href="/shop?category=flowers">Flowers</a></li>
      <li><a href="/shop?category=top">Top</a></li>
    </ul>

    <section class="product-rail" aria-label="Featured products">
      <article class="plant-card"></article>
      <article class="plant-card"></article>
    </section>
  </section>
</main>

<footer></footer>
```

## 16. Replication Checklist
- [ ] Colours matched
- [ ] Typography matched
- [ ] Header replicated
- [ ] Hero replicated
- [ ] Components replicated
- [ ] Responsive states tested
- [ ] Interactions implemented
- [ ] Accessibility checked
- [ ] Performance checked

## 17. Open Questions / Assumptions
- Inferred: The final app should replicate the Cactius plant-shop visual direction even though the current repository is named Sprout and currently contains a backend smoke-test UI.
- Inferred: No live reference exists for DOM/CSS inspection; all measurements are screenshot-derived estimates.
- Inferred: 3D cactus assets will need to be generated, licensed, or replaced with project-owned artwork.
- Inferred: The exact display font is not available from the screenshot; select and test a close slab-serif replacement.
- Open question: Should the production brand remain "Sprout" while borrowing this style, or should the visible landing-page brand become "Cactius"?
- Open question: Should this design replace the current test page or live as a separate marketing/prototype route?

## 18. Summary for Developer
Build a dark botanical ecommerce hero with a sage outer page, charcoal stage, cream typography, large 3D cactus mascot art, and a bold slab-serif uppercase headline. Preserve the composition: brand/nav/actions across the top, hero art left, headline and CTAs right, category chips at lower left, and rounded product preview cards along the lower right. Use React components, CSS tokens, accessible semantic controls, and responsive breakpoints that collapse the desktop two-column layout into a single-column mobile page without losing the playful cactus/product focus.

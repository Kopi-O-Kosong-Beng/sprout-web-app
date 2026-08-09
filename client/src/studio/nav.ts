import {
  Activity,
  Bug,
  Code,
  Key,
  FlaskConical,
  ScanLine,
  ShieldAlert,
  Timer,
  Stamp,
  type LucideIcon,
} from 'lucide-react';

/**
 * Every destination in the app, flat. Previously these were split across three
 * stacked tab bars (App → PipelineStudio → AdminDashboard), so reaching the log
 * viewer meant two clicks through unrelated chrome and cost ~150px of vertical
 * space on every screen. One list, one sidebar, one click.
 */
export type RouteId =
  | 'scanner'
  | 'unittests'
  | 'fuzz'
  | 'health'
  | 'keys'
  | 'topology'
  | 'logs'
  | 'observability'
  | 'gate'
  | 'bench'
;

export interface RouteDef {
  id: RouteId;
  /** Sidebar label — kept to 1–2 words so the rail stays scannable. */
  label: string;
  icon: LucideIcon;
  /** Pixel-font kicker above the page title. */
  kicker: string;
  /** Page <h1>. */
  title: string;
  /** One-line explanation under the title. */
  sub: string;
  /** True for routes that need Firebase auth. */
  requiresAuth?: boolean;
}

export interface NavGroup {
  label: string;
  routes: RouteDef[];
}

export const NAV: NavGroup[] = [
  {
    label: 'Studio',
    routes: [
      {
        id: 'scanner',
        label: 'Live Scanner',
        icon: ScanLine,
        kicker: 'Studio',
        title: 'Live Scanner',
        sub: 'Drop a plant photo to run the full sprite pipeline and watch each stage resolve in real time.',
      },
      {
        id: 'unittests',
        label: 'Unit Tests',
        icon: FlaskConical,
        kicker: 'Studio',
        title: 'Unit Tests',
        sub: 'Runs the real Vitest suite. Each case shows what it asserts, the terminal output it produced, and its result.',
      },
      {
        id: 'fuzz',
        label: 'Fuzzy Testing',
        icon: Bug,
        kicker: 'Studio',
        title: 'Fuzzy Testing',
        /* The old subtitle described only the image suite, which was accurate
           when there was only one. Three suites run from here now. */
        sub: 'Throws thousands of deliberately broken inputs at the code that guards real uploads and forms, then checks it never crashes, stalls, or gives a wrong answer. Free and offline — no provider is called and nothing is billed.',
      },
    ],
  },
  {
    label: 'Operations',
    routes: [
      {
        id: 'health',
        label: 'API Health',
        icon: Activity,
        kicker: 'Operations',
        title: 'API Health',
        sub: 'Reachability, latency and credit balance across all five external providers.',
      },
      {
        id: 'keys',
        label: 'Keys & Secrets',
        icon: Key,
        kicker: 'Operations',
        title: 'Keys & Secrets',
        sub: 'Server environment audit. Secret values are masked to a short preview.',
      },
      {
        id: 'topology',
        label: 'Topology',
        icon: Timer,
        kicker: 'Operations',
        title: 'Topology & Budgets',
        sub: 'Simulate per-hop latency to verify which optional stages get shed under the route deadline.',
      },
      {
        id: 'logs',
        label: 'Logs',
        icon: ShieldAlert,
        kicker: 'Operations',
        title: 'Failure Signatures',
        sub: 'Error codes, safety blocks and fallback events from the in-memory log buffer.',
      },
      {
        id: 'observability',
        label: 'Observability',
        icon: Activity,
        kicker: 'Operations',
        title: 'API Observability',
        sub: 'Latency, request and failure metrics for every external API the pipeline calls, from real scans.',
      },
      {
        id: 'gate',
        label: 'Dex Gate',
        icon: Stamp,
        kicker: 'Operations',
        title: 'Dex Approval Gate',
        sub: 'Review generated species before they are published to the global Dex.',
      },
      {
        id: 'bench',
        label: 'Prompt Bench',
        icon: Code,
        kicker: 'Operations',
        title: 'Prompt Cleaner Bench',
        sub: 'Test cleanVlmPromptText() against real VLM output containing preambles and refusals.',
      },
    ],
  },
];

export const ROUTES: Record<RouteId, RouteDef> = Object.fromEntries(
  NAV.flatMap((g) => g.routes).map((r) => [r.id, r]),
) as Record<RouteId, RouteDef>;

/** Routes owned by each feature component. */
export const STUDIO_ROUTES: RouteId[] = ['scanner'];
export const TEST_ROUTE: RouteId = 'unittests';
export const FUZZ_ROUTE: RouteId = 'fuzz';
export const ADMIN_ROUTES: RouteId[] = ['health', 'keys', 'topology', 'logs', 'observability', 'gate', 'bench'];

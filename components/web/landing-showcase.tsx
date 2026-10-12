import { Icon, type IconName } from "@/components/icon";
import { Animated } from "@/components/motion";
import { DeviceFrame, useDeviceKind } from "@/components/web/device-frame";
import { SectionHeading } from "@/components/web/landing-section";
import { type AppColors } from "@/lib/app-theme";
import { radius, space } from "@/lib/spacing";
import { useResolvedColorScheme } from "@/lib/theme-context";
import { text } from "@/lib/ui";
import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  FadeIn,
  FadeInDown,
  ReduceMotion,
  useReducedMotion,
} from "react-native-reanimated";

type Clip = {
  key: string;
  icon: IconName;
  title: string;
  body: string;
  points: string[];
  label: string;
};

const CLIPS: Clip[] = [
  {
    key: "live-session",
    icon: "poker-chip",
    title: "Run the game",
    body: "Buy-ins and re-buys go in with a tap. The ledger updates for everyone.",
    points: [
      "One tap per buy-in or re-buy",
      "A running total for every player",
      "Cash-outs recorded as players leave",
    ],
    label: "Screen recording: adding a re-buy to a live session.",
  },
  {
    key: "settle-up",
    icon: "pays",
    title: "Settle up",
    body: "Enter final stacks and get the shortest list of payments.",
    points: [
      "Each player’s result, worked out",
      "The fewest payments to square the table",
      "Pay each other however you like",
    ],
    label:
      "Screen recording: entering final stacks and viewing the settle-up payments.",
  },
  {
    key: "history",
    icon: "chart-line-up",
    title: "See your history",
    body: "Every session on one chart. Drag across it to find any night.",
    points: [
      "Every session you played, in one place",
      "Profit and loss over time",
      "Drag the chart to find any night",
    ],
    label: "Screen recording: scrubbing the profit chart in the History tab.",
  },
  {
    key: "friends",
    icon: "groups",
    title: "Play with friends",
    body: "Your regulars, your groups and the leaderboard in one place.",
    points: [
      "Your regulars, one tap away",
      "Groups for each table you run",
      "A leaderboard for your table",
    ],
    label: "Screen recording: the friends list, groups and leaderboard.",
  },
];

const VIDEO_STYLE = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
} as const;

// Each clip mounts a fresh <video> (keyed by file), so a CSS entrance gives a soft handoff between steps.
const VIDEO_STYLE_ANIMATED = {
  ...VIDEO_STYLE,
  animation: "clip-in 450ms cubic-bezier(0.23, 1, 0.32, 1) both",
} as const;

/** Web-only style keys (gradients, shadows, blur) that RN's types don't know about. */
export function webStyle(style: Record<string, string | number>): object {
  return style;
}

/** Adds an alpha channel to a 6-digit hex token so glows can be built from theme colors. */
export function withAlpha(hex: string, alpha: number): string {
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex.slice(0, 7);
  const a = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${full}${a}`;
}

const REVEAL_THRESHOLD = 0.15;

/**
 * Scroll reveal: holds content invisible until it enters the viewport, then mounts it with a
 * reanimated entering animation. Reduced motion (or no IntersectionObserver) shows it at once.
 */
export function Reveal({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: object;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<View | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen || reduceMotion) return;
    const node = ref.current as unknown as Element | null;
    if (!node || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSeen(true);
      },
      { threshold: REVEAL_THRESHOLD },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen, reduceMotion]);

  if (reduceMotion || seen) {
    return (
      <Animated.View
        entering={FadeInDown.duration(640)
          .delay(delay)
          .reduceMotion(ReduceMotion.System)}
        style={style}
      >
        {children}
      </Animated.View>
    );
  }
  return (
    <View ref={ref} style={[style, styles.unrevealed]}>
      {children}
    </View>
  );
}

function PhoneVideo({
  clip,
  c,
  dark,
  paused,
  onProgress,
  onEnded,
}: {
  clip: Clip;
  c: AppColors;
  dark: boolean;
  paused: boolean;
  onProgress: (fraction: number) => void;
  onEnded: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const device = useDeviceKind();
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const handleTime = () =>
      onProgress(video.duration ? video.currentTime / video.duration : 0);
    video.addEventListener("timeupdate", handleTime);
    video.addEventListener("ended", onEnded);
    if (paused) video.pause();
    if (paused || reduceMotion || typeof IntersectionObserver === "undefined") {
      return () => {
        video.removeEventListener("timeupdate", handleTime);
        video.removeEventListener("ended", onEnded);
      };
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => {
      observer.disconnect();
      video.removeEventListener("timeupdate", handleTime);
      video.removeEventListener("ended", onEnded);
    };
  }, [clip.key, dark, paused, reduceMotion, onProgress, onEnded]);

  // Recordings exist per theme: `<key>.webm` (dark) and `<key>-light.webm`.
  const file = dark ? clip.key : `${clip.key}-light`;
  const halo = webStyle({
    boxShadow: (dark
      ? [
          `0 40px 90px -30px ${withAlpha(c.accent, 0.5)}`,
          `0 0 140px -10px ${withAlpha(c.borderBlue, 0.35)}`,
        ]
      : [
          `0 2px 6px ${withAlpha(c.text, 0.08)}`,
          `0 36px 72px -32px ${withAlpha(c.text, 0.32)}`,
          `0 24px 60px -36px ${withAlpha(c.borderAccent, 0.35)}`,
        ]
    ).join(", "),
  });

  return (
    <DeviceFrame kind={device} c={c} dark={dark} style={halo}>
      {createElement("video", {
        key: file,
        ref,
        src: `/media/${file}.webm`,
        poster: `/media/${file}.jpg`,
        muted: true,
        playsInline: true,
        preload: "metadata",
        controls: reduceMotion,
        "aria-label": clip.label,
        style: reduceMotion ? VIDEO_STYLE : VIDEO_STYLE_ANIMATED,
      })}
    </DeviceFrame>
  );
}

function FeatureTab({
  clip,
  index,
  selected,
  progress,
  showProgress,
  c,
  onSelect,
  onKey,
  tabRef,
  isWide,
  dark,
}: {
  isWide: boolean;
  dark: boolean;
  clip: Clip;
  index: number;
  selected: boolean;
  progress: number;
  showProgress: boolean;
  c: AppColors;
  onSelect: (i: number) => void;
  onKey: (event: { key: string; preventDefault: () => void }) => void;
  tabRef: (node: View | null) => void;
}) {
  const keyProps = { onKeyDown: onKey } as object;
  const selectedGlow = webStyle(
    dark
      ? {
          backgroundImage: `linear-gradient(100deg, ${withAlpha(c.accent, 0.16)} 0%, ${withAlpha(c.accent, 0)} 75%)`,
          boxShadow: `inset 0 1px 0 ${withAlpha(c.accent, 0.25)}`,
        }
      : {
          backgroundColor: c.card,
          boxShadow: `0 1px 2px ${withAlpha(c.text, 0.04)}, 0 10px 24px -14px ${withAlpha(c.text, 0.18)}`,
        },
  );
  const idleIconBg = dark ? withAlpha(c.cardAlt, 0.6) : c.card;
  const accentFill = c.accent;

  return (
    <Pressable
      ref={tabRef}
      role="tab"
      nativeID={`showcase-tab-${clip.key}`}
      aria-selected={selected}
      aria-controls="showcase-panel"
      tabIndex={selected ? 0 : -1}
      onPress={() => onSelect(index)}
      {...keyProps}
      style={[
        styles.tab,
        isWide && styles.tabWide,
        { borderColor: selected ? c.accentBorder : "transparent" },
        selected && selectedGlow,
      ]}
    >
      <View
        style={[
          styles.tabIcon,
          {
            backgroundColor: selected ? c.accentBg : idleIconBg,
            borderColor: selected ? c.accentBorder : c.border,
          },
        ]}
      >
        <Icon
          name={clip.icon}
          size={18}
          color={selected ? c.accentText : c.textMuted}
          weight="duotone"
          duotoneOpacity={selected ? 0.3 : 0.15}
          importantForAccessibility="no"
        />
      </View>
      <Text
        style={[
          styles.tabTitle,
          { color: selected ? c.text : c.textSecondary },
        ]}
      >
        {clip.title}
      </Text>
      {selected && showProgress && (
        <View
          style={[styles.track, { backgroundColor: withAlpha(accentFill, 0.18) }]}
          aria-hidden
        >
          <View
            style={[
              styles.fill,
              { backgroundColor: accentFill, transform: [{ scaleX: progress }] },
              webStyle({
                transformOrigin: "left center",
                transition: "transform 260ms linear",
              }),
            ]}
          />
        </View>
      )}
    </Pressable>
  );
}

function ClipDetail({
  clip,
  c,
  dark,
  isWide,
  cta,
}: {
  clip: Clip;
  c: AppColors;
  dark: boolean;
  isWide: boolean;
  cta: ReactNode;
}) {
  const surface = dark
    ? webStyle({
        backgroundColor: withAlpha(c.card, 0.72),
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow: `inset 0 1px 0 ${withAlpha(c.accent, 0.22)}`,
      })
    : webStyle({
        backgroundColor: c.card,
        boxShadow: `0 1px 2px ${withAlpha(c.text, 0.04)}, 0 24px 48px -28px ${withAlpha(c.text, 0.18)}`,
      });

  return (
    <View
      style={[
        styles.detail,
        isWide && styles.detailWide,
        { borderColor: c.border },
        surface,
      ]}
    >
      <Animated.View
        key={clip.key}
        entering={FadeIn.duration(360).reduceMotion(ReduceMotion.System)}
        style={styles.detailBody}
      >
        <Text style={[styles.detailTitle, { color: c.text }]}>
          {clip.title}
        </Text>
        <Text style={[text.body, { color: c.textMuted }]}>{clip.body}</Text>
        <View style={[styles.points, { borderTopColor: c.border }]}>
          {clip.points.map((point) => (
            <View key={point} style={styles.point}>
              <Icon
                name="check-circle"
                size={18}
                color={c.profit}
                weight="duotone"
                duotoneOpacity={0.3}
                importantForAccessibility="no"
              />
              <Text style={[styles.pointText, { color: c.textSecondary }]}>
                {point}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>
      <View style={styles.ctaRow}>{cta}</View>
    </View>
  );
}

export function LandingShowcase({
  c,
  isWide,
  cta,
}: {
  c: AppColors;
  isWide: boolean;
  cta: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const reduceMotion = useReducedMotion();
  const dark = useResolvedColorScheme() === "dark";
  const tabRefs = useRef<(View | null)[]>([]);
  const clip = CLIPS[active];

  const select = useCallback((i: number) => {
    setProgress(0);
    setActive(i);
  }, []);
  const handleProgress = useCallback(
    (fraction: number) => setProgress(fraction),
    [],
  );
  const [paused, setPaused] = useState(false);
  const handleEnded = useCallback(() => {
    if (reduceMotion || paused) return;
    setProgress(0);
    setActive((i) => (i + 1) % CLIPS.length);
  }, [reduceMotion, paused]);

  const handleKey = useCallback(
    (event: { key: string; preventDefault: () => void }) => {
      const last = CLIPS.length - 1;
      const target =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? active === last
            ? 0
            : active + 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? active === 0
              ? last
              : active - 1
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? last
                : null;
      if (target === null) return;
      event.preventDefault();
      select(target);
      tabRefs.current[target]?.focus();
    },
    [active, select],
  );

  const field = webStyle({
    backgroundImage: [
      // Light mode: the phone and card are opaque, so the glows move out to the open space beside them.
      `radial-gradient(closest-side at ${isWide ? (dark ? "55%" : "28%") : "50%"} ${dark ? "50%" : "45%"}, ${withAlpha(c.accent, dark ? 0.16 : 0.36)} 0%, ${withAlpha(c.accent, 0)} 100%)`,
      `radial-gradient(closest-side at ${isWide ? (dark ? "78%" : "82%") : "50%"} ${isWide ? (dark ? "60%" : "50%") : "75%"}, ${withAlpha(c.borderBlue, dark ? 0.12 : 0.2)} 0%, ${withAlpha(c.borderBlue, 0)} 100%)`,
    ].join(", "),
  });

  return (
    <View style={[styles.stage, isWide && styles.stageWide]}>
      <View
        style={[StyleSheet.absoluteFill, styles.field, field]}
        aria-hidden
      />

      <Reveal style={[styles.lead, isWide && styles.leadWide]}>
        <SectionHeading
          c={c}
          icon="play"
          hue={c.accentText}
          label="Product tour"
          title={
            <>
              See it at <Text style={{ color: c.accentText }}>the table.</Text>
            </>
          }
          intro="Real screens from a game night. Pick a step, or let it play through."
          isWide={isWide}
        />
        <View
          role="tablist"
          aria-label="App features"
          style={[styles.tabs, isWide && styles.tabsWide]}
        >
          {CLIPS.map((item, i) => (
            <FeatureTab
              isWide={isWide}
              dark={dark}
              key={item.key}
              clip={item}
              index={i}
              selected={i === active}
              progress={progress}
              showProgress={!reduceMotion}
              c={c}
              onSelect={select}
              onKey={handleKey}
              tabRef={(node) => {
                tabRefs.current[i] = node;
              }}
            />
          ))}
        </View>
      </Reveal>

      <View
        role="tabpanel"
        nativeID="showcase-panel"
        aria-labelledby={`showcase-tab-${clip.key}`}
        style={[styles.panel, isWide && styles.panelWide]}
      >
        <Reveal
          delay={120}
          style={[styles.phoneSlot, isWide && styles.phoneSlotWide]}
        >
          {/* No visible play/pause button: tapping the phone pauses and resumes (WCAG 2.2.2 for moving content). */}
          <Pressable
            role="button"
            aria-label={paused ? "Play demo" : "Pause demo"}
            aria-pressed={paused}
            disabled={reduceMotion}
            onPress={() => setPaused((p) => !p)}
            // The phone has its own rounded shape and glow; the generic grey button hover would box it in.
            {...({ dataSet: { hoverNone: "true" } } as object)}
            style={styles.phoneSlotInner}
          >
            <PhoneVideo
              clip={clip}
              c={c}
              dark={dark}
              paused={paused}
              onProgress={handleProgress}
              onEnded={handleEnded}
            />
          </Pressable>
        </Reveal>
        <Reveal
          delay={240}
          style={[styles.detailSlot, isWide && styles.detailSlotWide]}
        >
          <ClipDetail clip={clip} c={c} dark={dark} isWide={isWide} cta={cta} />
        </Reveal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  unrevealed: { opacity: 0 },
  stage: { position: "relative", gap: space.xxl, paddingVertical: space.lg },
  stageWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxl,
    paddingVertical: 72,
  },
  field: { pointerEvents: "none" },
  lead: { gap: space.xl },
  leadWide: { flexBasis: 340, flexShrink: 1, minWidth: 280 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tabsWide: { flexDirection: "column", flexWrap: "nowrap", gap: space.xs },
  tab: {
    position: "relative",
    flexGrow: 1,
    flexBasis: 150,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md + space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  tabWide: { flexGrow: 0, flexBasis: "auto" },
  tabIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  track: {
    position: "absolute",
    left: space.md,
    right: space.md,
    bottom: space.sm,
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
  },
  fill: { height: 2, width: "100%", borderRadius: 1 },
  panel: { gap: space.xl, alignItems: "center" },
  panelWide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxl,
  },
  phoneSlot: {
    alignItems: "center",
    gap: space.lg,
    width: "100%",
    maxWidth: 340,
  },
  phoneSlotWide: { flexBasis: 340, flexShrink: 1, minWidth: 260 },
  // Only the phone itself is clickable, not the empty space beside it.
  phoneSlotInner: { width: "100%", maxWidth: 340, alignSelf: "center" },
  detailSlot: { width: "100%" },
  detailSlotWide: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 280,
    minWidth: 240,
    width: "auto",
  },
  detail: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.xl,
    gap: space.xl,
  },
  detailWide: { padding: space.xxl },
  detailBody: { gap: space.md },
  detailTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  points: {
    gap: space.md,
    marginTop: space.sm,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  point: { flexDirection: "row", alignItems: "center", gap: space.md },
  pointText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: "500" },
  ctaRow: { flexDirection: "row" },
});

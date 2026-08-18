/** Couleurs alignées sur :root dans globals.css (primary, brand). */
export const SOLINE_MARK_COLORS = {
  primary: "#243447",
  primaryForeground: "#faf9f7",
  brand: "#c96b2e",
} as const;

/** Graphisme partagé pour favicon, apple-icon et icônes PWA (ImageResponse). */
export function SolineMarkImage(props: {
  size: number;
  variant?: "default" | "maskable";
  letter?: string;
}) {
  const { size, variant = "default", letter = "O" } = props;
  const isMaskable = variant === "maskable";
  const inset = isMaskable ? Math.round(size * 0.12) : 0;
  const markSize = size - inset * 2;
  const borderRadius = Math.round(markSize * 0.36);
  const barHeight = Math.max(2, Math.round(markSize * 0.1));
  const fontSize = Math.round(markSize * 0.45);

  const mark = (
    <div
      style={{
        position: "relative",
        width: markSize,
        height: markSize,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: SOLINE_MARK_COLORS.primary,
        borderRadius,
        color: SOLINE_MARK_COLORS.primaryForeground,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          fontSize,
          fontWeight: 600,
          fontFamily: 'Georgia, "Times New Roman", serif',
          letterSpacing: "-0.02em",
        }}
      >
        {letter}
      </span>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: barHeight,
          background: SOLINE_MARK_COLORS.brand,
        }}
      />
    </div>
  );

  if (!isMaskable) {
    return mark;
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: SOLINE_MARK_COLORS.primary,
      }}
    >
      {mark}
    </div>
  );
}

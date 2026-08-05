/** Graphisme partagé pour les PNG PWA (ImageResponse). */
export function PwaInstallIconImage(props: {
  size: number;
  variant: "default" | "maskable";
}) {
  const { size, variant } = props;
  const isMaskable = variant === "maskable";
  const outerBg = "#171717";
  const innerBg = isMaskable ? "#262626" : "#171717";
  const inset = isMaskable ? Math.round(size * 0.12) : Math.round(size * 0.06);
  const inner = size - inset * 2;
  const fontSize = Math.round(inner * (isMaskable ? 0.38 : 0.42));
  const radius = Math.round(inner * (isMaskable ? 0.18 : 0.2));

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: outerBg,
      }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: innerBg,
          borderRadius: radius,
        }}
      >
        <span
          style={{
            color: "#fafafa",
            fontSize,
            fontWeight: 700,
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          }}
        >
          A
        </span>
      </div>
    </div>
  );
}

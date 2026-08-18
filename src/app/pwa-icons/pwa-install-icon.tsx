import { SolineMarkImage } from "@/lib/brand/soline-mark-image";

/** Graphisme partagé pour les PNG PWA (ImageResponse). */
export function PwaInstallIconImage(props: {
  size: number;
  variant: "default" | "maskable";
}) {
  const { size, variant } = props;
  return <SolineMarkImage size={size} variant={variant} />;
}

import { ImageResponse } from "next/og";

import { SolineMarkImage } from "@/lib/brand/soline-mark-image";

export const contentType = "image/png";

export function generateImageMetadata() {
  return [
    { contentType: "image/png", size: { width: 32, height: 32 }, id: "32" },
    { contentType: "image/png", size: { width: 192, height: 192 }, id: "192" },
  ];
}

export default function Icon({ id }: { id: string }) {
  const size = id === "192" ? 192 : 32;
  return new ImageResponse(<SolineMarkImage size={size} />, { width: size, height: size });
}

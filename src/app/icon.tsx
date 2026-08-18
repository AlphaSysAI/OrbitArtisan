import { ImageResponse } from "next/og";

import { SolineMarkImage } from "@/lib/brand/soline-mark-image";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<SolineMarkImage size={32} />, { ...size });
}

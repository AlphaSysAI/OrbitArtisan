import { ImageResponse } from "next/og";

import { SolineMarkImage } from "@/lib/brand/soline-mark-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<SolineMarkImage size={180} />, { ...size });
}

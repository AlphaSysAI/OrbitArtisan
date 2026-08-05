import { ImageResponse } from "next/og";

import { PwaInstallIconImage } from "../pwa-install-icon";

export const runtime = "edge";

export async function GET() {
  const size = 192;
  return new ImageResponse(
    <PwaInstallIconImage size={size} variant="default" />,
    { width: size, height: size },
  );
}

"use client";

import { useMobileLayout } from "@/lib/use-mobile-layout";
import LiveScanner from "./live-scanner";

export default function Scanner(props: {
  onScan: (text: string) => void;
  autoStart?: boolean;
}) {
  const mobile = useMobileLayout();
  // Kamera hanya dipasang pada viewport HP; desktop memakai pemilihan barang manual.
  return mobile ? <LiveScanner {...props} /> : null;
}

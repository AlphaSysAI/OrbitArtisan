import { AdminTabs } from "@/components/admin/ui/admin-tabs";

export function TelecomTabs({ current }: { current: "pool" | "registre" }) {
  return (
    <AdminTabs
      tabs={[
        { href: "/admin/telecom/pool", label: "Stock et attribution", active: current === "pool" },
        { href: "/admin/telecom", label: "Registre (réquisitions)", active: current === "registre" },
      ]}
    />
  );
}

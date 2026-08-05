import { redirect } from "next/navigation";

export default function ServicesRedirectPage() {
  redirect("/app/reglages?tab=prestations");
}

import { redirect } from "next/navigation";

/** Les contacts sont désormais les fiches clients (tous clients, avec ou sans compte). */
export default function ContactsRedirectPage() {
  redirect("/app/clients");
}

import { redirect } from "next/navigation";

/** Root route redirects to /login. */
export default function RootPage() {
  redirect("/login");
}

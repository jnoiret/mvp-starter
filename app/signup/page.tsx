import { redirect } from "next/navigation";

/** Signup is unified with magic-link login at /login */
export default function SignupPage() {
  redirect("/login");
}

import { redirect } from "next/navigation";
import { getPublicSupabaseServerClient } from "@/lib/supabase/public-server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

/** Misma experiencia que /jobs con vista dividida y `?job=`. */
export default async function PublicJobDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = getPublicSupabaseServerClient();
  const { data, error } = await supabase
    .from("job_listings")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    redirect("/jobs");
  }

  redirect(`/jobs?job=${encodeURIComponent(id)}`);
}

import { NextResponse } from "next/server";
import { requireCandidateFeatureApi } from "@/lib/auth/apiRbac";

export const runtime = "nodejs";

type SaveCandidateProfilePayload = {
  full_name: string;
  email: string;
  whatsapp: string;
  city: string;
  target_role: string;
  years_experience: number;
  skills: string;
  expected_salary: number;
  work_mode: string;
  cv_url: string;
  summary: string;
  industries: string;
};

type SaveProfileInput = Omit<SaveCandidateProfilePayload, "cv_url">;

function parseNumberField(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseStringField(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildInputFromFormData(formData: FormData): SaveProfileInput | null {
  const yearsExperience = parseNumberField(formData.get("years_experience"));
  const expectedSalary = parseNumberField(formData.get("expected_salary"));
  if (yearsExperience === null || expectedSalary === null) return null;

  const input: SaveProfileInput = {
    full_name: parseStringField(formData.get("full_name")),
    email: parseStringField(formData.get("email")),
    whatsapp: parseStringField(formData.get("whatsapp")),
    city: parseStringField(formData.get("city")),
    target_role: parseStringField(formData.get("target_role")),
    years_experience: yearsExperience,
    skills: parseStringField(formData.get("skills")),
    expected_salary: expectedSalary,
    work_mode: parseStringField(formData.get("work_mode")),
    summary: parseStringField(formData.get("summary")),
    industries: parseStringField(formData.get("industries")),
  };

  if (
    !input.full_name ||
    !input.email ||
    !input.whatsapp ||
    !input.city ||
    !input.target_role ||
    !input.skills ||
    !input.work_mode
  ) {
    return null;
  }

  return input;
}

export async function POST(request: Request) {
  try {
    const auth = await requireCandidateFeatureApi();
    if (auth instanceof NextResponse) return auth;
    const supabase = auth.supabase;

    const formData = await request.formData();
    const existingCvUrl = parseStringField(formData.get("cv_url"));

    const input = buildInputFromFormData(formData);
    if (!input) {
      return NextResponse.json(
        { success: false, error: "Payload de perfil inválido." },
        { status: 400 }
      );
    }
    const cvUrl = existingCvUrl;

    // Insert strictly and only table fields.
    const profileInsertPayload: SaveCandidateProfilePayload = {
      ...input,
      cv_url: cvUrl || "",
    };

    // Log exact payload as requested for save diagnostics.
    console.log(
      "[api/save-profile] candidate_profiles payload",
      profileInsertPayload
    );

    const insertResult = await supabase
      .from("candidate_profiles")
      .insert(profileInsertPayload)
      .select("id")
      .single();
    console.log(
      "[api/save-profile] candidate_profiles insert response",
      insertResult
    );

    const { error } = insertResult;

    if (error) {
      // Log exact Supabase error object as requested.
      console.error("[api/save-profile] candidate_profiles insert error", error);
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo guardar el perfil en este momento.",
          reason: error.message,
        },
        { status: 500 }
      );
    }

    console.log(
      "[api/save-profile] candidate_profiles insert success",
      "Perfil guardado correctamente."
    );
    return NextResponse.json(
      { success: true, data: { id: insertResult.data?.id ?? null } },
      { status: 200 }
    );
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[api/save-profile] unexpected error", err);
    return NextResponse.json(
      { success: false, error: "Error inesperado al guardar el perfil.", reason },
      { status: 500 }
    );
  }
}


import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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
    const formData = await request.formData();
    const file = formData.get("cv");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No se recibió el CV para guardar el perfil." },
        { status: 400 }
      );
    }

    const input = buildInputFromFormData(formData);
    if (!input) {
      return NextResponse.json(
        { success: false, error: "Payload de perfil inválido." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const objectPath = `candidate-cv/${Date.now()}_${safeName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const uploadResult = await supabase.storage
      .from("candidate-cvs")
      .upload(objectPath, fileBuffer, {
        upsert: false,
        contentType: file.type || "application/pdf",
      });
    console.log("[api/save-profile] storage upload response", uploadResult);

    if (uploadResult.error) {
      console.error("[api/save-profile] storage upload error", uploadResult.error);
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo subir el CV en este momento.",
          reason: uploadResult.error.message,
        },
        { status: 500 }
      );
    }

    const publicUrlRes = supabase.storage
      .from("candidate-cvs")
      .getPublicUrl(uploadResult.data.path);
    const cvUrl = publicUrlRes.data.publicUrl;

    // Insert strictly and only table fields.
    const profileInsertPayload: SaveCandidateProfilePayload = {
      ...input,
      cv_url: cvUrl,
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


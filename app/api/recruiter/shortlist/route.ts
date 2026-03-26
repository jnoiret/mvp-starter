import { NextResponse } from "next/server";
import { requireRecruiterFeatureApi } from "@/lib/auth/apiRbac";

export const runtime = "nodejs";

type ShortlistStatus = "saved" | "reviewing" | "interview" | "rejected";

type ShortlistRecord = {
  candidate_id: string;
  job_id: string;
  notes: string;
  status: ShortlistStatus;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStatus(value: unknown): ShortlistStatus | null {
  if (
    value === "saved" ||
    value === "reviewing" ||
    value === "interview" ||
    value === "rejected"
  ) {
    return value;
  }
  return null;
}

export async function GET() {
  try {
    const auth = await requireRecruiterFeatureApi();
    if (auth instanceof NextResponse) return auth;
    const supabase = auth.supabase;
    const shortlistTable = "recruiter_shortlist";
    console.info("[api/recruiter/shortlist][GET] fetch start", {
      target_table: shortlistTable,
    });
    const { data: shortlistRows, error: shortlistError } = await supabase
      .from(shortlistTable)
      .select("candidate_id, job_id, notes, status");

    if (shortlistError) {
      console.error("[api/recruiter/shortlist][GET] fetch shortlist failed", {
        target_table: shortlistTable,
        message: shortlistError.message,
        details: shortlistError.details,
        hint: shortlistError.hint,
        code: shortlistError.code,
      });
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo cargar el shortlist.",
          reason: shortlistError.message,
        },
        { status: 500 }
      );
    }

    const candidateIds = Array.from(
      new Set(
        (shortlistRows ?? [])
          .map((row) => String(row.candidate_id ?? ""))
          .filter(Boolean)
      )
    );
    const jobIds = Array.from(
      new Set(
        (shortlistRows ?? [])
          .map((row) => String(row.job_id ?? ""))
          .filter(Boolean)
      )
    );
    console.info("[api/recruiter/shortlist][GET] ids collected", {
      target_table: shortlistTable,
      candidate_ids_count: candidateIds.length,
      job_ids_count: jobIds.length,
    });

    const candidateTable = "candidate_profiles";
    const jobTable = "recruiter_jobs";

    const [{ data: candidatesData, error: candidatesError }, { data: jobsData, error: jobsError }] =
      await Promise.all([
        candidateIds.length > 0
          ? supabase
              .from(candidateTable)
              .select(
                "id, full_name, email, target_role, city, work_mode, years_experience, skills"
              )
              .in("id", candidateIds)
          : Promise.resolve({ data: [], error: null }),
        jobIds.length > 0
          ? supabase
              .from(jobTable)
              .select("id, job_title, company, description, seniority, industry")
              .in("id", jobIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (candidatesError) {
      console.error("[api/recruiter/shortlist][GET] fetch candidates failed", {
        target_table: candidateTable,
        message: candidatesError.message,
        details: candidatesError.details,
        hint: candidatesError.hint,
        code: candidatesError.code,
      });
      return NextResponse.json(
        {
          success: false,
          error: "No se pudieron cargar candidatos del shortlist.",
          reason: candidatesError.message,
        },
        { status: 500 }
      );
    }

    if (jobsError) {
      console.error("[api/recruiter/shortlist][GET] fetch jobs failed", {
        target_table: jobTable,
        message: jobsError.message,
        details: jobsError.details,
        hint: jobsError.hint,
        code: jobsError.code,
      });
      return NextResponse.json(
        {
          success: false,
          error: "No se pudieron cargar vacantes del shortlist.",
          reason: jobsError.message,
        },
        { status: 500 }
      );
    }

    const candidatesById = new Map(
      (candidatesData ?? []).map((candidate) => [String(candidate.id), candidate])
    );
    const jobsById = new Map((jobsData ?? []).map((job) => [String(job.id), job]));

    const items = (shortlistRows ?? []).map((row) => {
      const candidateId = String(row.candidate_id ?? "");
      const jobId = String(row.job_id ?? "");
      return {
        candidate_id: candidateId,
        job_id: jobId,
        notes: asString(row.notes),
        status: asStatus(row.status) ?? "saved",
        candidate: candidatesById.get(candidateId) ?? null,
        job: jobsById.get(jobId) ?? null,
      };
    });

    console.info("[api/recruiter/shortlist][GET] fetch success", {
      target_table: shortlistTable,
      items_count: items.length,
    });
    return NextResponse.json({ success: true, items });
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[api/recruiter/shortlist][GET] unexpected error", { reason });
    return NextResponse.json(
      {
        success: false,
        error: "Error inesperado cargando shortlist.",
        reason,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRecruiterFeatureApi();
    if (auth instanceof NextResponse) return auth;
    const supabase = auth.supabase;

    const payload = (await request.json()) as Partial<ShortlistRecord>;

    const candidate_id = asString(payload.candidate_id);
    const job_id = asString(payload.job_id);
    const notes = asString(payload.notes);
    const status = asStatus(payload.status) ?? "saved";

    if (!candidate_id || !job_id) {
      return NextResponse.json(
        {
          success: false,
          error: "candidate_id y job_id son obligatorios.",
        },
        { status: 400 }
      );
    }

    const targetTable = "recruiter_shortlist";
    const upsertPayload = {
      candidate_id,
      job_id,
      notes,
      status,
    };
    console.info("[api/recruiter/shortlist][POST] upsert start", {
      target_table: targetTable,
      payload: upsertPayload,
    });
    const { error } = await supabase.from(targetTable).upsert(
      upsertPayload,
      {
        onConflict: "candidate_id,job_id",
      }
    );

    if (error) {
      console.error("[api/recruiter/shortlist][POST] upsert failed", {
        target_table: targetTable,
        payload: upsertPayload,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo guardar en shortlist.",
          reason: error.message,
        },
        { status: 500 }
      );
    }

    console.info("[api/recruiter/shortlist][POST] upsert success", {
      target_table: targetTable,
      payload: upsertPayload,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[api/recruiter/shortlist][POST] unexpected error", { reason });
    return NextResponse.json(
      {
        success: false,
        error: "Error inesperado guardando shortlist.",
        reason,
      },
      { status: 500 }
    );
  }
}

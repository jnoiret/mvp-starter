"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  countMeaningfulParsedFields,
  parseCandidateProfileFromCv,
  parseCandidateProfileFromPastedText,
} from "@/components/candidate/onboarding/cvParser";
import type { CandidateOnboardingData } from "@/components/candidate/onboarding/types";
import type { WorkMode } from "@/components/candidate/onboarding/types";
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingDraftV1,
} from "@/lib/auth/onboardingDraftStorage";
import {
  COPY_CV_PARTIAL,
  type CvParseFeedback,
} from "@/lib/cv/parseDiagnostics";
import { markShowFirstJobsAfterOnboarding } from "@/lib/onboardingFirstJobs";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { AiFirstProfileReview } from "./AiFirstProfileReview";
import { CvParsingProgressCard } from "./CvParsingProgress";
import { OnboardingProgress } from "./OnboardingProgress";
import { ParseRecoveryPanel } from "./ParseRecoveryPanel";
import { ManualEntryStep } from "./ManualEntryStep";

type Phase =
  | "cv"
  | "paste"
  | "parsing"
  | "parse_recovery"
  | "manual_minimal"
  | "ai_review"
  | "gate";

type CvEntryMode = "none" | "file" | "paste";

type FormState = {
  full_name: string;
  email: string;
  whatsapp: string;
  city: string;
  target_role: string;
  years_experience: string;
  skills: string;
  summary: string;
  expected_salary: string;
  work_mode: WorkMode | "";
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeMoney(value: string) {
  return value.replace(/\D/g, "");
}

function buildSkipDefaults(email: string, nameHint: string): FormState {
  const local = email.split("@")[0] ?? "candidato";
  const title =
    nameHint.trim() ||
    local
      .replace(/[._-]/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");

  return {
    full_name: title || "Candidato",
    email: email.trim(),
    whatsapp: "0000000000",
    city: "Por definir",
    target_role: "Por definir",
    years_experience: "0",
    skills: "Por completar en tu perfil",
    summary: "",
    expected_salary: "1",
    work_mode: "indiferente",
  };
}

function parsedToForm(
  emailFallback: string,
  parsed: Awaited<ReturnType<typeof parseCandidateProfileFromCv>>["data"],
  options: { omitEmail: boolean },
): FormState {
  const years = onlyDigits(parsed.years_experience) || "0";
  const salaryRaw = normalizeMoney(parsed.expected_salary) || "1";
  const wm =
    parsed.work_mode === "remoto" ||
    parsed.work_mode === "hibrido" ||
    parsed.work_mode === "presencial" ||
    parsed.work_mode === "indiferente"
      ? parsed.work_mode
      : "indiferente";

  const resolvedEmail = options.omitEmail
    ? ""
    : (parsed.email.trim() || emailFallback).trim();

  const skillsCombined = [parsed.skills, parsed.tools]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");

  const phoneDigits = onlyDigits(parsed.whatsapp || parsed.phone);

  return {
    full_name: parsed.full_name.trim() || buildSkipDefaults(emailFallback, "").full_name,
    email: resolvedEmail,
    whatsapp: phoneDigits.length >= 8 ? phoneDigits : phoneDigits || "0000000000",
    city: (parsed.city || parsed.location || "Por definir").trim(),
    target_role: (parsed.target_role || parsed.current_title || "Por definir").trim(),
    years_experience: years,
    skills: skillsCombined || "Por completar en tu perfil",
    summary: (parsed.summary ?? "").trim(),
    expected_salary: salaryRaw && salaryRaw !== "0" ? salaryRaw : "1",
    work_mode: wm,
  };
}

const DEBUG_PREFIX = "[cv-parse-debug]";
const ONBOARDING_DEBUG_PREFIX = "[onboarding:gate]";
const IS_DEV = process.env.NODE_ENV !== "production";

/** Minimum filled parser fields to treat CV parse as “we got real data” (honest UX). */
const MIN_MEANINGFUL_FOR_SUCCESS = 3;
/** Show “gran parte” only when we have several real fields but may still be incomplete. */
const MIN_MEANINGFUL_FOR_PARTIAL = 3;
/** Map saved draft → same shape as parser output for meaningful-field counting. */
function onboardingDraftToParsedShape(draft: OnboardingDraftV1): Omit<CandidateOnboardingData, "cv_file"> {
  return {
    full_name: draft.full_name,
    email: draft.email,
    phone: "",
    whatsapp: draft.whatsapp,
    location: draft.city,
    city: draft.city,
    current_title: draft.target_role,
    target_role: draft.target_role,
    seniority: "",
    years_experience: String(draft.years_experience),
    skills: draft.skills,
    tools: "",
    industries: "",
    specializations: "",
    languages: "",
    education: "",
    summary: draft.summary ?? "",
    expected_salary: String(draft.expected_salary),
    work_mode: (draft.work_mode as WorkMode) || "",
  };
}

/** Perfil listo para revisar (sin correo en flujo público hasta el paso final). */
function validateProfileOnly(f: FormState): string | null {
  if (!f.full_name.trim()) return "Indica tu nombre.";
  if (onlyDigits(f.whatsapp).length < 8) return "Teléfono o WhatsApp no válido.";
  if (!f.city.trim()) return "Indica tu ciudad.";
  if (!f.target_role.trim()) return "Indica el rol que buscas.";
  if (!f.skills.trim()) return "Añade habilidades.";
  const y = Number(onlyDigits(f.years_experience));
  if (!Number.isFinite(y) || y < 0 || y > 60) return "Años de experiencia no válidos.";
  const s = Number(normalizeMoney(f.expected_salary));
  if (!Number.isFinite(s) || s <= 0) return "Expectativa salarial no válida.";
  if (!f.work_mode) return "Elige modalidad de trabajo.";
  return null;
}

function validateFullForm(f: FormState): string | null {
  const profileErr = validateProfileOnly(f);
  if (profileErr) return profileErr;
  if (!f.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))
    return "Correo no válido.";
  return null;
}

function formToDraftPayload(
  f: FormState,
  lastPhase: OnboardingDraftV1["lastPhase"],
): OnboardingDraftV1 {
  return {
    v: 1,
    lastPhase,
    full_name: f.full_name.trim(),
    email: f.email.trim(),
    whatsapp: f.whatsapp.trim(),
    city: f.city.trim(),
    target_role: f.target_role.trim(),
    years_experience: Number(onlyDigits(f.years_experience)),
    skills: f.skills.trim(),
    expected_salary: Number(normalizeMoney(f.expected_salary)) || 1,
    work_mode: f.work_mode as string,
    cv_url: "",
    summary: f.summary.trim(),
  };
}

type Props = {
  variant: "public" | "authenticated";
  defaultEmail: string;
  defaultName: string;
};

type GateUiState =
  | "unauthenticated_email_step"
  | "authenticated_saving"
  | "authenticated_save_error"
  | "completed";

export function CandidateQuickOnboarding({
  variant,
  defaultEmail,
  defaultName,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);
  const gateAutoAttemptedForUserRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("cv");
  /** Saved draft detected on load; user must choose resume — we never auto-open the profile step. */
  const [resumeDraft, setResumeDraft] = useState<OnboardingDraftV1 | null>(null);
  const [form, setForm] = useState<FormState>(() =>
    buildSkipDefaults(defaultEmail, defaultName),
  );
  const [gateEmail, setGateEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [parseHint, setParseHint] = useState<string | null>(null);
  const [partialProfileNotice, setPartialProfileNotice] = useState<string | null>(null);
  const [skippedCv, setSkippedCv] = useState(false);
  /** True after a CV file was chosen and parsing ran (success or handled error still sets false on catch). */
  const [cvUploaded, setCvUploaded] = useState(false);
  /** True only when parse API returned without throw. */
  const [parseSucceeded, setParseSucceeded] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [gateUiState, setGateUiState] = useState<GateUiState>(
    "unauthenticated_email_step",
  );
  const [cvEntryMode, setCvEntryMode] = useState<CvEntryMode>("none");
  const [pasteDraft, setPasteDraft] = useState("");
  const [parseRecoveryKind, setParseRecoveryKind] = useState<
    "extraction_failed" | "weak" | null
  >(null);
  const [lastParseFeedback, setLastParseFeedback] = useState<CvParseFeedback>("ok");

  const isPublic = variant === "public";

  const progressStep =
    phase === "cv" || phase === "paste"
      ? 1
      : phase === "parsing" || phase === "parse_recovery" || phase === "manual_minimal"
        ? 2
        : phase === "ai_review"
          ? 3
          : 4;

  const saveDraftToStorage = useCallback(
    (f: FormState, lastPhase: OnboardingDraftV1["lastPhase"]) => {
      if (!isPublic) return;
      saveOnboardingDraft(formToDraftPayload(f, lastPhase));
    },
    [isPublic],
  );

  useEffect(() => {
    if (!isPublic || hydratedRef.current) return;
    hydratedRef.current = true;
    const draft = loadOnboardingDraft();
    if (draft) {
      setResumeDraft(draft);
    }
  }, [isPublic]);

  useEffect(() => {
    console.log("[onboarding:quick] step", phase, {
      cvUploaded,
      parseSucceeded,
      skippedCv,
      resumeDraftPending: Boolean(resumeDraft),
    });
  }, [phase, cvUploaded, parseSucceeded, skippedCv, resumeDraft]);

  function applyResumeDraft(draft: OnboardingDraftV1) {
    setForm({
      full_name: draft.full_name,
      email: variant === "public" && draft.lastPhase === "preview" ? "" : draft.email,
      whatsapp: draft.whatsapp,
      city: draft.city,
      target_role: draft.target_role,
      years_experience: String(draft.years_experience),
      skills: draft.skills,
      summary: draft.summary ?? "",
      expected_salary: String(draft.expected_salary),
      work_mode: (draft.work_mode as WorkMode) || "indiferente",
    });
    setGateEmail(draft.email);
    setPhase(draft.lastPhase === "gate" ? "gate" : "ai_review");
    setCvUploaded(false);
    const manualLikely =
      draft.skills.includes("Por completar") &&
      !(draft.summary ?? "").trim();
    setSkippedCv(manualLikely);
    setParseSucceeded(!manualLikely);
    setParseHint(null);
    if (manualLikely) {
      setPartialProfileNotice(null);
    } else {
      const draftMeaningful = countMeaningfulParsedFields(onboardingDraftToParsedShape(draft));
      const showPartialResume =
        draftMeaningful >= MIN_MEANINGFUL_FOR_PARTIAL && draftMeaningful < 6;
      setPartialProfileNotice(showPartialResume ? COPY_CV_PARTIAL : null);
    }
    setCvEntryMode("none");
    setResumeDraft(null);
  }

  function discardDraftAndStartFresh() {
    clearOnboardingDraft();
    setResumeDraft(null);
    setForm(buildSkipDefaults(defaultEmail, defaultName));
    setGateEmail("");
    setPhase("cv");
    setSkippedCv(false);
    setCvUploaded(false);
    setParseSucceeded(false);
    setParseHint(null);
    setPartialProfileNotice(null);
    setError(null);
    setCvEntryMode("none");
    setPasteDraft("");
    setParseRecoveryKind(null);
    setLastParseFeedback("ok");
  }

  useEffect(() => {
    if (!isPublic) return;
    if (phase !== "ai_review" && phase !== "gate" && phase !== "manual_minimal") return;
    const payloadForm =
      phase === "gate"
        ? { ...form, email: gateEmail.trim() || form.email.trim() }
        : form;
    saveDraftToStorage(
      payloadForm,
      phase === "gate" ? "gate" : "preview",
    );
  }, [form, gateEmail, phase, isPublic, saveDraftToStorage]);

  useEffect(() => {
    const errQ = searchParams.get("error");
    if (errQ === "guardar") {
      const reason = searchParams.get("reason")?.trim();
      setError(
        IS_DEV && reason
          ? `No pudimos guardar tu perfil tras iniciar sesión: ${decodeURIComponent(reason)}`
          : "No pudimos guardar tu perfil tras iniciar sesión. Revisa los datos y vuelve a enviarte el enlace.",
      );
    }
  }, [searchParams]);

  useEffect(() => {
    if (variant !== "authenticated" || !defaultEmail.trim()) return;
    setForm((prev) => ({ ...prev, email: defaultEmail.trim() }));
  }, [variant, defaultEmail]);

  const goManualEntry = useCallback(() => {
    setResumeDraft(null);
    setForm(buildSkipDefaults(defaultEmail, defaultName));
    setParseHint(null);
    setPartialProfileNotice(null);
    setError(null);
    setSkippedCv(true);
    setCvUploaded(false);
    setCvEntryMode("none");
    setParseSucceeded(false);
    setParseRecoveryKind(null);
    setLastParseFeedback("ok");
    setPhase("manual_minimal");
  }, [defaultEmail, defaultName]);

  type ParseResult = Awaited<ReturnType<typeof parseCandidateProfileFromCv>>;

  const applyServerParseResult = useCallback(
    async (loadParse: () => Promise<ParseResult>) => {
      setResumeDraft(null);
      setError(null);
      setParseHint(null);
      setPartialProfileNotice(null);
      setCvUploaded(true);
      setParseSucceeded(false);
      setSkippedCv(false);
      setPhase("parsing");
      try {
        const result = await loadParse();
        const meaningful = countMeaningfulParsedFields(result.data);
        const next = parsedToForm(defaultEmail || form.email, result.data, {
          omitEmail: isPublic,
        });
        console.info(DEBUG_PREFIX, "quick onboarding: final form state", {
          meaningfulFieldCount: meaningful,
          formState: next,
          apiWarning: result.warning,
          parsed_profile_empty: result.parsed_profile_empty,
          parse_feedback: result.parse_feedback,
          parse_tier: result.parse_tier,
          diagnostics: result.diagnostics,
        });
        setForm(next);
        setGateEmail((e) => e || next.email);
        setSkippedCv(false);
        setParseRecoveryKind(null);
        setParseHint(null);

        const tier = result.parse_tier;
        const unusableInput = result.parse_feedback === "no_selectable_text";
        const weakProfile =
          result.parse_feedback === "weak_profile_data" ||
          meaningful < MIN_MEANINGFUL_FOR_SUCCESS;

        if (unusableInput || tier === "extraction_failed") {
          setParseSucceeded(false);
          setPartialProfileNotice(null);
          setParseRecoveryKind("extraction_failed");
          setPhase("parse_recovery");
          return;
        }

        if (weakProfile || tier === "weak") {
          setParseSucceeded(false);
          setPartialProfileNotice(null);
          setParseRecoveryKind("weak");
          setPhase("parse_recovery");
          return;
        }

        setLastParseFeedback(result.parse_feedback ?? "ok");
        setParseSucceeded(true);
        const showPartial =
          meaningful >= MIN_MEANINGFUL_FOR_PARTIAL &&
          (meaningful < 6 || Boolean(result.warning));
        setPartialProfileNotice(showPartial ? COPY_CV_PARTIAL : null);
        setPhase("ai_review");
      } catch {
        setCvEntryMode("none");
        setForm(buildSkipDefaults(defaultEmail, defaultName));
        setSkippedCv(true);
        setParseSucceeded(false);
        setPartialProfileNotice(null);
        setError(null);
        setParseRecoveryKind("weak");
        setPhase("parse_recovery");
      }
    },
    [defaultEmail, form.email, isPublic],
  );

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setCvEntryMode("file");
    await applyServerParseResult(() => parseCandidateProfileFromCv(file));
  };

  const submitPastedCvText = async () => {
    const trimmed = pasteDraft.trim();
    if (trimmed.length < 40) {
      setError("Pega al menos unas líneas de tu CV (mínimo ~40 caracteres) para que podamos analizarlo.");
      return;
    }
    setError(null);
    setCvEntryMode("paste");
    await applyServerParseResult(() => parseCandidateProfileFromPastedText(trimmed));
  };

  const continueFromAiReview = () => {
    setError(null);
    const v = validateProfileOnly(form);
    if (v) {
      setError(v);
      return;
    }
    goGateOrSave();
  };

  const continueFromManualMinimal = () => {
    setError(null);
    const v = validateProfileOnly(form);
    if (v) {
      setError(v);
      return;
    }
    setLastParseFeedback("ok");
    setParseSucceeded(true);
    setPhase("ai_review");
  };

  const goGateOrSave = () => {
    const v = validateProfileOnly(form);
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    if (variant === "authenticated") {
      void saveAndGoJobs();
      return;
    }
    setGateEmail((e) => e || form.email);
    setPhase("gate");
    setOtpSent(false);
  };

  const saveAndGoJobs = async () => {
    const merged: FormState = {
      ...form,
      email: form.email.trim() || defaultEmail.trim(),
    };
    const v = validateFullForm(merged);
    if (v) {
      setError(v);
      setPhase("ai_review");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/candidate/onboarding-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: merged.full_name.trim(),
          email: merged.email.trim(),
          whatsapp: merged.whatsapp.trim(),
          city: merged.city.trim(),
          target_role: merged.target_role.trim(),
          years_experience: Number(onlyDigits(merged.years_experience)),
          skills: merged.skills.trim(),
          expected_salary: Number(normalizeMoney(merged.expected_salary)) || 1,
          work_mode: merged.work_mode,
          cv_url: "",
          summary: merged.summary.trim(),
          industries: "",
        }),
      });
      let payload: {
        success?: boolean;
        error?: string;
        reason?: string;
        code?: string;
      } = {};
      try {
        payload = (await res.json()) as typeof payload;
      } catch {
        setError(
          `Respuesta inválida del servidor (${res.status}). Si el problema continúa, revisa que la base de datos y las políticas RLS permitan guardar candidate_profiles.`,
        );
        setSaving(false);
        return;
      }
      if (!res.ok || !payload.success) {
        const detail = payload.reason ? ` ${payload.reason}` : "";
        setError(
          `${payload.error ?? "No se pudo guardar."}${detail}`.trim(),
        );
        setSaving(false);
        return;
      }
      if (isPublic) clearOnboardingDraft();
      markShowFirstJobsAfterOnboarding();
      router.refresh();
      router.push("/candidate/first-jobs");
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const persistAuthenticatedPendingOnboarding = useCallback(
    async (sessionEmail: string | null | undefined) => {
      const merged: FormState = {
        ...form,
        email: (sessionEmail?.trim() || gateEmail.trim() || form.email.trim()),
      };
      setForm(merged);
      saveOnboardingDraft(formToDraftPayload(merged, "gate"));

      const completionPayload = {
        full_name: merged.full_name.trim(),
        whatsapp: merged.whatsapp.trim(),
        city: merged.city.trim(),
        target_role: merged.target_role.trim(),
        years_experience: Number(onlyDigits(merged.years_experience)),
        skills: merged.skills.trim(),
        expected_salary: Number(normalizeMoney(merged.expected_salary)) || 1,
        work_mode: merged.work_mode,
        cv_url: "",
        summary: merged.summary.trim(),
        industries: "",
      };

      if (IS_DEV) {
        console.info(
          ONBOARDING_DEBUG_PREFIX,
          "authenticated persistence attempt",
          {
            hasDraft: Boolean(loadOnboardingDraft()),
            completionPayload,
            sessionEmail: sessionEmail ?? null,
          },
        );
      }

      const completionRes = await fetch("/api/candidate/complete-pending-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(completionPayload),
      });

      let completionJson: {
        success?: boolean;
        error?: string;
        reason?: string;
        code?: string;
      } = {};
      try {
        completionJson = (await completionRes.json()) as typeof completionJson;
      } catch {
        // ignore parse error and rely on status fallback
      }

      if (IS_DEV) {
        console.info(ONBOARDING_DEBUG_PREFIX, "authenticated persistence response", {
          status: completionRes.status,
          ok: completionRes.ok,
          completionJson,
        });
      }

      if (!completionRes.ok || !completionJson.success) {
        const reason =
          completionJson.error ||
          completionJson.reason ||
          completionJson.code ||
          `status_${completionRes.status}`;
        setError(
          IS_DEV
            ? `No se pudo guardar el perfil: ${reason}`
            : "No pudimos guardar tu perfil. Intenta nuevamente.",
        );
        setGateUiState("authenticated_save_error");
        return;
      }

      clearOnboardingDraft();
      markShowFirstJobsAfterOnboarding();
      setGateUiState("completed");
      router.replace("/candidate/first-jobs");
    },
    [form, gateEmail, router],
  );

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateProfileOnly(form);
    if (v) {
      setError(v);
      setPhase("ai_review");
      return;
    }
    if (!gateEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gateEmail)) {
      setError("Introduce un correo válido.");
      return;
    }
    setOtpLoading(true);
    setError(null);

    const merged: FormState = { ...form, email: gateEmail.trim() };
    setForm(merged);
    saveOnboardingDraft(formToDraftPayload(merged, "gate"));

    if (IS_DEV) {
      console.info(ONBOARDING_DEBUG_PREFIX, "draft saved before auth flow", {
        hasDraft: Boolean(loadOnboardingDraft()),
        draftPayload: formToDraftPayload(merged, "gate"),
      });
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        if (IS_DEV) {
          console.info(
            ONBOARDING_DEBUG_PREFIX,
            "session already exists, retry persistence without resending magic link",
            {
              userId: session.user.id,
              email: session.user.email ?? null,
              payload: completionPayload,
            },
          );
        }

        setGateUiState("authenticated_saving");
        await persistAuthenticatedPendingOnboarding(session.user.email ?? null);
        return;
      }

      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: gateEmail.trim(),
        options: {
          emailRedirectTo: `${origin}/auth/redirect`,
        },
      });
      if (otpError) {
        setError(
          "No pudimos enviar el enlace. Comprueba el correo o inténtalo más tarde.",
        );
        return;
      }
      if (IS_DEV) {
        console.info(ONBOARDING_DEBUG_PREFIX, "magic link sent", {
          email: gateEmail.trim(),
          redirectTo: `${origin}/auth/redirect`,
        });
      }
      setOtpSent(true);
    } catch {
      setError("Algo salió mal. Inténtalo de nuevo en un momento.");
    } finally {
      setOtpLoading(false);
    }
  };

  useEffect(() => {
    if (!isPublic || phase !== "gate") return;
    let cancelled = false;

    async function checkSessionAndMaybePersist() {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      const draft = loadOnboardingDraft();
      if (IS_DEV) {
        console.info(ONBOARDING_DEBUG_PREFIX, "gate session check", {
          hasSession: Boolean(session?.user),
          sessionUserId: session?.user?.id ?? null,
          sessionEmail: session?.user?.email ?? null,
          hasDraft: Boolean(draft),
          gateUiState,
        });
      }

      if (!session?.user) {
        setGateUiState("unauthenticated_email_step");
        gateAutoAttemptedForUserRef.current = null;
        return;
      }

      if (gateAutoAttemptedForUserRef.current === session.user.id) return;
      gateAutoAttemptedForUserRef.current = session.user.id;
      setGateUiState("authenticated_saving");
      setOtpSent(false);
      setOtpLoading(false);
      setError(null);
      await persistAuthenticatedPendingOnboarding(session.user.email ?? null);
    }

    void checkSessionAndMaybePersist();
    return () => {
      cancelled = true;
    };
  }, [gateUiState, isPublic, persistAuthenticatedPendingOnboarding, phase]);

  function handleParseRecoveryRetry() {
    setParseRecoveryKind(null);
    setParseHint(null);
    setPhase("cv");
  }

  function handleParseRecoveryPaste() {
    setParseRecoveryKind(null);
    setParseHint(null);
    setPhase("paste");
  }

  function handleParseRecoveryManual() {
    setParseRecoveryKind(null);
    setParseHint(null);
    goManualEntry();
  }

  function handleBackFromAiReview() {
    setError(null);
    if (skippedCv && !cvUploaded && cvEntryMode === "none") {
      setPhase("manual_minimal");
      return;
    }
    if (cvEntryMode === "paste") {
      setPhase("paste");
      return;
    }
    setPhase("cv");
    setCvUploaded(false);
    setParseSucceeded(false);
    setSkippedCv(false);
    setParseHint(null);
    setPartialProfileNotice(null);
    setCvEntryMode("none");
  }

  return (
    <main>
      <OnboardingProgress
        step={progressStep}
        totalSteps={4}
        label={
          phase === "cv" || phase === "paste"
            ? "CV"
            : phase === "parsing" || phase === "parse_recovery" || phase === "manual_minimal"
              ? "Análisis"
              : phase === "ai_review"
                ? "Perfil"
                : "Correo"
        }
      />

      {phase !== "ai_review" ? (
        <>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-3xl">
            {phase === "cv" && "Crea tu perfil con IA"}
            {phase === "paste" && "Pega el texto de tu CV"}
            {phase === "parsing" && "Estamos generando tu perfil"}
            {phase === "parse_recovery" && "Siguiente paso"}
            {phase === "manual_minimal" && "Entrada manual"}
            {phase === "gate" && "Último paso: tu correo"}
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-zinc-600">
            {phase === "cv" && (
              <>
                Prioriza subir tu CV o pegar el texto; la entrada manual es el último recurso.{" "}
                <span className="text-zinc-500">No necesitas cuenta aún.</span>
              </>
            )}
            {phase === "paste" && (
              <>
                Si no tienes tu CV a la mano, puedes copiar y pegar el contenido aquí y
                generaremos tu perfil automáticamente.
              </>
            )}
            {phase === "parsing" &&
              "Analizamos tu experiencia, habilidades y trayectoria para ahorrarte tiempo."}
            {phase === "parse_recovery" && "Elige cómo quieres continuar."}
            {phase === "manual_minimal" && (
              <>
                Solo lo imprescindible. Luego verás tu perfil por secciones para completar rol,
                resumen y habilidades con guías claras.
              </>
            )}
            {phase === "gate" &&
              "Introduce el correo donde quieres recibir el enlace para guardar tu perfil y seguir."}
          </p>
        </>
      ) : (
        <div className="mb-2" aria-hidden />
      )}

      {phase === "cv" ? (
        <>
          {resumeDraft ? (
            <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-4 text-sm text-indigo-950">
              <p className="font-medium text-indigo-950">Tienes un borrador guardado</p>
              <p className="mt-1 text-xs leading-relaxed text-indigo-900/90">
                Puedes continuar donde lo dejaste o empezar de nuevo desde la subida del CV.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => applyResumeDraft(resumeDraft)}
                  className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800"
                >
                  Continuar borrador
                </button>
                <button
                  type="button"
                  onClick={discardDraftAndStartFresh}
                  className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-50/80"
                >
                  Empezar de nuevo
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl bg-[#0F172A] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-900 sm:w-auto sm:min-w-[12rem]"
          >
            Subir CV
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPhase("paste");
            }}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-sm font-semibold text-[#334155] shadow-sm transition hover:bg-zinc-50 sm:w-auto sm:min-w-[12rem]"
          >
            Pegar texto de tu CV
          </button>
          <button
            type="button"
            onClick={goManualEntry}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-sm font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 sm:w-auto sm:min-w-[12rem]"
          >
            Entrada manual
          </button>
        </div>
        </>
      ) : null}

      {phase === "paste" ? (
        <div className="space-y-4">
          <textarea
            value={pasteDraft}
            onChange={(e) => {
              setPasteDraft(e.target.value);
              if (error) setError(null);
            }}
            rows={16}
            className="min-h-[220px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-relaxed text-zinc-800 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            placeholder="Pega aquí el contenido completo de tu CV (texto plano)…"
            aria-label="Texto del CV"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setPhase("cv");
              }}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={() => void submitPastedCvText()}
              className="rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-900"
            >
              Generar perfil desde texto
            </button>
          </div>
        </div>
      ) : null}

      {phase === "parsing" ? <CvParsingProgressCard className="mt-6" /> : null}

      {phase === "parse_recovery" && parseRecoveryKind ? (
        <ParseRecoveryPanel
          kind={parseRecoveryKind}
          onRetryUpload={handleParseRecoveryRetry}
          onGoPaste={handleParseRecoveryPaste}
          onGoManual={handleParseRecoveryManual}
        />
      ) : null}

      {phase === "manual_minimal" ? (
        <ManualEntryStep
          form={form}
          setForm={setForm}
          error={error}
          variant={variant}
          onBack={() => {
            setError(null);
            setPhase("cv");
          }}
          onContinue={continueFromManualMinimal}
        />
      ) : null}

      {phase === "ai_review" ? (
        <div className="space-y-4">
          {partialProfileNotice ? (
            <p className="rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
              {partialProfileNotice}
            </p>
          ) : null}
          <AiFirstProfileReview
            form={form}
            setForm={setForm}
            isPublic={isPublic}
            error={error}
            onContinue={continueFromAiReview}
            onBack={handleBackFromAiReview}
            cvEntryMode={
              skippedCv && !cvUploaded && cvEntryMode === "none"
                ? "none"
                : cvEntryMode === "paste"
                  ? "paste"
                  : "file"
            }
          />
        </div>
      ) : null}

      {phase === "gate" && isPublic ? (
        <div className="space-y-6">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {gateUiState === "authenticated_saving" ? (
            <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 px-4 py-4">
              <p className="text-sm font-medium text-zinc-900">Guardando tu perfil...</p>
              <p className="text-xs text-zinc-600">
                Ya detectamos tu sesión. Estamos completando tu onboarding automáticamente.
              </p>
            </div>
          ) : gateUiState === "authenticated_save_error" ? (
            <div className="space-y-4 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-4">
              <p className="text-sm font-medium text-rose-900">
                No pudimos guardar tu perfil. Intenta nuevamente.
              </p>
              <button
                type="button"
                onClick={() => {
                  setGateUiState("authenticated_saving");
                  void (async () => {
                    const supabase = getSupabaseBrowserClient();
                    const {
                      data: { session },
                    } = await supabase.auth.getSession();
                    await persistAuthenticatedPendingOnboarding(
                      session?.user?.email ?? gateEmail ?? null,
                    );
                  })();
                }}
                className="rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-900"
              >
                Reintentar guardar
              </button>
            </div>
          ) : otpSent ? (
            <div className="space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4">
              <p className="text-sm font-medium text-emerald-900">
                Te enviaremos un enlace para iniciar sesión. Revisa tu correo (y
                spam si no lo ves).
              </p>
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setPhase("ai_review");
                }}
                className="text-sm font-medium text-emerald-800 underline"
              >
                Volver y editar perfil
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void sendMagicLink(e)} className="space-y-5">
              <div>
                <label
                  htmlFor="onboarding-gate-email"
                  className="mb-1.5 block text-xs font-medium text-zinc-600"
                >
                  Correo para guardar tu perfil
                </label>
                <input
                  id="onboarding-gate-email"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
                  value={gateEmail}
                  onChange={(e) => setGateEmail(e.target.value)}
                  placeholder="tu@correo.com"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  Este es el único paso en el que pedimos tu correo: lo usamos para el
                  enlace seguro y para asociar tu perfil.
                </p>
              </div>
              <button
                type="submit"
                disabled={otpLoading}
                className="w-full rounded-xl bg-[#0F172A] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-900 disabled:opacity-60"
              >
                {otpLoading ? "Enviando…" : "Enviar enlace y guardar perfil"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPhase("ai_review");
                }}
                className="w-full text-sm font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-[#0F172A]"
              >
                Volver al perfil
              </button>
            </form>
          )}
        </div>
      ) : null}
    </main>
  );
}

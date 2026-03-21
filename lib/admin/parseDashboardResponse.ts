import type { AdminDashboardLoadResult } from "@/lib/admin/dashboardMetrics";

export type DashboardApiSuccess = {
  success: true;
  result: AdminDashboardLoadResult;
};

export type DashboardApiErrorBody = {
  success: false;
  error: string;
  code?: string;
};

type Parsed =
  | { kind: "success"; payload: DashboardApiSuccess }
  | {
      kind: "failure";
      status: number;
      userMessage: string;
      authRelated: boolean;
    };

const LOG_PREFIX = "[admin/dashboard]";

/** Accept application/json, application/*+json, etc. */
function isJsonContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes("application/json")) return true;
  // e.g. application/vnd.api+json, application/problem+json
  if (/\+\s*json\b/i.test(ct)) return true;
  return false;
}

function stripBom(s: string) {
  return s.replace(/^\uFEFF/, "").trim();
}

function logResponseMeta(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  const redirected = res.redirected;
  console.info(`${LOG_PREFIX} response`, {
    status: res.status,
    ok: res.ok,
    type: res.type,
    contentType,
    redirected,
    url: res.url,
  });
}

/**
 * Reads fetch response safely: never uses res.json() blindly.
 * Handles empty body, HTML, redirects, wrong content-type, and invalid JSON.
 */
export async function parseDashboardApiResponse(res: Response): Promise<Parsed> {
  try {
    logResponseMeta(res);

    const rawContentType = res.headers.get("content-type") ?? "";
    const contentType = rawContentType.toLowerCase();
    const redirected = res.redirected;
    const status = res.status;

    if (status === 0) {
      console.warn(`${LOG_PREFIX} status 0 (opaque / network)`, { type: res.type });
      return {
        kind: "failure",
        status: 0,
        userMessage: "No pudimos cargar el dashboard.",
        authRelated: false,
      };
    }

    const isRedirectStatus = status >= 300 && status < 400 && status !== 304;
    const treatAsAuthWall =
      status === 401 || status === 403 || redirected || isRedirectStatus;

    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to read body`, { status, err });
      return {
        kind: "failure",
        status,
        userMessage: "No pudimos cargar el dashboard.",
        authRelated: treatAsAuthWall,
      };
    }

    const trimmed = stripBom(text);
    if (!trimmed) {
      console.warn(`${LOG_PREFIX} empty body`, {
        status,
        contentType,
        redirected,
        isRedirectStatus,
      });
      return {
        kind: "failure",
        status,
        userMessage: "No pudimos cargar el dashboard.",
        authRelated: treatAsAuthWall,
      };
    }

    if (!isJsonContentType(contentType)) {
      console.warn(`${LOG_PREFIX} non-JSON content-type`, {
        status,
        contentType,
        redirected,
        isRedirectStatus,
        preview: trimmed.slice(0, 160),
      });
      return {
        kind: "failure",
        status,
        userMessage: "No pudimos cargar el dashboard.",
        authRelated: treatAsAuthWall,
      };
    }

    let body: unknown;
    try {
      body = JSON.parse(trimmed) as unknown;
    } catch (err) {
      console.warn(`${LOG_PREFIX} JSON.parse failed`, {
        status,
        contentType,
        redirected,
        preview: trimmed.slice(0, 160),
        err,
      });
      return {
        kind: "failure",
        status,
        userMessage: "No pudimos cargar el dashboard.",
        authRelated: treatAsAuthWall,
      };
    }

    if (
      typeof body === "object" &&
      body !== null &&
      (body as DashboardApiErrorBody).success === false
    ) {
      const errBody = body as DashboardApiErrorBody;
      const authRelated =
        status === 401 || status === 403 || errBody.code === "forbidden";
      return {
        kind: "failure",
        status,
        userMessage: errBody.error || "No pudimos cargar el dashboard.",
        authRelated,
      };
    }

    if (!res.ok) {
      return {
        kind: "failure",
        status,
        userMessage: treatAsAuthWall
          ? "No autorizado"
          : "No pudimos cargar el dashboard.",
        authRelated: treatAsAuthWall,
      };
    }

    const payload = body as Partial<DashboardApiSuccess>;
    if (
      payload.success === true &&
      payload.result !== undefined &&
      typeof payload.result === "object" &&
      payload.result !== null
    ) {
      return { kind: "success", payload: payload as DashboardApiSuccess };
    }

    return {
      kind: "failure",
      status,
      userMessage: "No pudimos cargar el dashboard.",
      authRelated: false,
    };
  } catch (err) {
    console.warn(`${LOG_PREFIX} unexpected parse error`, err);
    return {
      kind: "failure",
      status: typeof res.status === "number" ? res.status : 0,
      userMessage: "No pudimos cargar el dashboard.",
      authRelated: false,
    };
  }
}

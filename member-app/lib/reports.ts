import { entry, type Provider } from "./flow";
import { adminAccess, uuid } from "./admin";
import { findCircle } from "./circles";
export const reportCategories = {
  safety: "Safety concern",
  privacy: "Privacy concern",
  harassment: "Harassment or disrespect",
  other: "Something else",
} as const;
export const reportStatuses = {
  open: "Received",
  in_review: "In review",
  closed: "Closed",
} as const;
export const reportResolutions = {
  review_complete: "Review completed",
  duplicate: "Duplicate report",
  outside_scope: "Outside this review process",
} as const;
export type Report = {
  id: string;
  category: keyof typeof reportCategories;
  circle: string | null;
  status: keyof typeof reportStatuses;
  resolution: keyof typeof reportResolutions | null;
  createdAt: string;
};
export type ReportDetail = Report & {
  details: string;
  version: number;
  events: {
    from: string | null;
    to: string;
    resolution: string | null;
    createdAt: string;
  }[];
};
const date = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const has = (obj: object, value: unknown): value is string =>
  typeof value === "string" && Object.hasOwn(obj, value);
export function validReportInput(
  key: string,
  circle: string,
  category: string,
  details: string,
) {
  return (
    uuid.test(key) &&
    (!circle || !!findCircle(circle)) &&
    has(reportCategories, category) &&
    [...details.trim()].length >= 10 &&
    [...details.trim()].length <= 1000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(
      details,
    )
  );
}
function parseReport(value: unknown): Report | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    !uuid.test(r.id) ||
    !has(reportCategories, r.category) ||
    !has(reportStatuses, r.status) ||
    !(
      r.circle === null ||
      (typeof r.circle === "string" && !!findCircle(r.circle))
    ) ||
    !date(r.createdAt) ||
    !(r.resolution === null || has(reportResolutions, r.resolution)) ||
    (r.status === "closed") !== (r.resolution !== null)
  )
    return null;
  return r as Report;
}
function parseList(data: unknown, limit: number): Report[] | null {
  if (!data || typeof data !== "object") return null;
  const reports = (data as { reports?: unknown }).reports;
  if (!Array.isArray(reports) || reports.length > limit) return null;
  const parsed = reports.map(parseReport);
  return parsed.some((r) => !r) ? null : (parsed as Report[]);
}
export async function myReports(client: Provider) {
  const access = await entry(client);
  if (access.state !== "member") return { state: access.state } as const;
  try {
    const { data, error } = await client.rpc("haven_my_reports");
    const reports = parseList(data, 10);
    return !error && data?.memberId === access.member.id && reports
      ? { state: "ready" as const, reports, member: access.member }
      : { state: "unavailable" as const };
  } catch {
    return { state: "unavailable" as const };
  }
}
export async function submitReport(client: Provider, form: URLSearchParams) {
  const access = await entry(client);
  if (access.state !== "member") return access.state;
  const key = form.get("submissionKey") || "",
    circle = form.get("circle") || "",
    category = form.get("category") || "",
    details = (form.get("details") || "").trim();
  if (
    !validReportInput(key, circle, category, details) ||
    form.get("acknowledge") !== "yes"
  )
    return "invalid";
  try {
    const { data, error } = await client.rpc("haven_submit_report", {
      p_submission_key: key,
      p_circle_slug: circle || null,
      p_category: category,
      p_details: details,
    });
    if (error)
      return error.code === "P0003"
        ? "limited"
        : error.code === "42501"
          ? "unavailable"
          : error.code === "22023"
            ? "invalid"
            : "unavailable";
    return data &&
      typeof data.id === "string" &&
      uuid.test(data.id) &&
      has(reportStatuses, data.status)
      ? "received"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}
export async function reportQueue(client: Provider) {
  const access = await adminAccess(client);
  if (access !== "admin") return { state: access } as const;
  try {
    const { data, error } = await client.rpc("haven_report_queue");
    const reports = parseList(data, 25);
    return !error && reports
      ? { state: "ready" as const, reports }
      : { state: "unavailable" as const };
  } catch {
    return { state: "unavailable" as const };
  }
}
export async function reportDetail(client: Provider, id: string) {
  const access = await adminAccess(client);
  if (access !== "admin") return { state: access } as const;
  if (!uuid.test(id)) return { state: "missing" as const };
  try {
    const { data, error } = await client.rpc("haven_report_detail", {
      p_report_id: id,
    });
    if (error) return { state: "unavailable" as const };
    if (data === null) return { state: "missing" as const };
    const report = parseReport(data);
    if (
      !report ||
      report.id !== id ||
      typeof data.details !== "string" ||
      [...data.details].length > 1000 ||
      !Number.isSafeInteger(data.version) ||
      data.version < 1 ||
      !Array.isArray(data.events) ||
      data.events.length > 3 ||
      data.events.some(
        (e: Record<string, unknown>) =>
          !(e.from === null || has(reportStatuses, e.from)) ||
          !has(reportStatuses, e.to) ||
          !(e.resolution === null || has(reportResolutions, e.resolution)) ||
          !date(e.createdAt),
      )
    )
      return { state: "unavailable" as const };
    return {
      state: "ready" as const,
      report: {
        ...report,
        details: data.details,
        version: data.version,
        events: data.events,
      } as ReportDetail,
    };
  } catch {
    return { state: "unavailable" as const };
  }
}
export async function reviewReport(client: Provider, form: URLSearchParams) {
  const access = await adminAccess(client);
  if (access !== "admin") return access;
  const id = form.get("reportId") || "",
    version = form.get("version") || "",
    status = form.get("status") || "",
    resolution = form.get("resolution") || "";
  if (
    !uuid.test(id) ||
    !/^[1-3]$/.test(version) ||
    !["in_review", "closed"].includes(status) ||
    (status === "closed" ? !has(reportResolutions, resolution) : !!resolution)
  )
    return "invalid";
  try {
    const { data, error } = await client.rpc("haven_review_report", {
      p_report_id: id,
      p_version: Number(version),
      p_status: status,
      p_resolution: resolution || null,
    });
    if (error) return error.code === "P0002" ? "stale" : "unavailable";
    return data?.updated === true ? "updated" : "unavailable";
  } catch {
    return "unavailable";
  }
}

"use client";
import { packageOptions, salePackages } from "@/lib/package-options";
import { rememberVerificationEmail } from "@/lib/email-verification";
import { LanguageSelect, useLanguage } from "@/components/language-provider";

import { useStudioNavigation } from "@/lib/studio-navigation";
import { MemberDashboard } from "@/components/member-dashboard";
import { changeReminder, attendanceReminder } from "@/lib/course-policy";
import { Payments } from "@/components/payments";
import { Paginated } from "@/components/paginated";
import {
  kgToLb,
  poundsToStoredKg,
  measurementFields,
  readMeasurements,
  type Measurements,
} from "@/lib/measurements";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Ticket,
  Users,
  Wallet,
  X,
  FileText,
  Send,
  RefreshCw,
  UserRound,
  Link2,
  Mail,
  CircleHelp,
} from "lucide-react";
import { configured, supabase } from "@/lib/supabase";
import { demoData } from "@/lib/demo";
import {
  availableBookingSlots,
  compareBookings,
  slotsOverlap,
} from "@/lib/booking";
import { bookingMatches, memberNeeds } from "@/lib/workflows";
import { SessionAccounts } from "@/components/session-accounts";
import {
  memberSessionStats,
  balanceAfterLesson,
  membershipForDate,
  validateCredit,
  defaultMonthlyEnd,
} from "@/lib/session-accounts";
import {
  fieldLimits,
  initialMember,
  LatestRead,
  saveThenRefresh,
} from "@/lib/forms";
import type {
  Data,
  Profile,
  Slot,
  Appointment,
  Plan,
  RecordEntry,
  MonthlyMembership,
} from "@/lib/types";
import { localToISO, csvCell, scheduleDays } from "@/lib/time";
import type { Session } from "@supabase/supabase-js";

type Field = {
  name: string;
  label: string;
  type?: string;
  value?: string | number | boolean;
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
};
type Dialog = {
  optionalFields?: Field[];
  alternate?: { label: string; action: (member?: string) => void };
  title: string;
  description?: string;
  fields: Field[];
  submit?: string;
  publication?: boolean;
  readOnly?: boolean;
  success?: string;
  action: (values: Record<string, string>) => Promise<void>;
};
const tabs = [
  ["overview", "训练概览", LayoutDashboard],
  ["schedule", "教练时间表", CalendarDays],
  ["bookings", "课程预约", Clock3],
  ["credits", "课时与统计", Activity],
  ["members", "学员管理", Users],
  ["plans", "训练计划", Dumbbell],
  ["records", "训练档案", FileText],
  ["referrals", "邀请与推荐", Ticket],
  ["packages", "购买课程", Wallet],
  ["settings", "个人与设置", Settings2],
] as const;
const zones = [
  "America/Los_Angeles",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Europe/London",
  "Australia/Sydney",
  "UTC",
];
const statusNames: Record<string, string> = {
  booked: "已预约",
  cancelled: "已取消",
  completed: "已完成",
  no_show: "未到场 · No show",
  draft: "草稿",
  published: "当前计划",
  archived: "历史计划",
  confirmed: "推荐成功",
  pending: "等待处理",
  processing: "发送中",
  sent: "已发送",
  synced: "已同步",
  skipped: "已跳过",
  failed: "发送失败",
};
const actionNames: Record<string, string> = {
  book: "预约",
  reschedule: "改期",
  cancel: "取消",
  complete: "完成",
  no_show: "未到场（No show）",
};
const emptyData = (): Data => ({
  ...demoData(),
  profiles: [],
  slots: [],
  appointments: [],
  plans: [],
  records: [],
  invites: [],
  referrals: [],
  events: [],
  email_jobs: [],
  packages: [],
  member_prices: [],
  contact_sync: [],
  session_entries: [],
  monthly_memberships: [],
  credits_ready: false,
});
function Badge({ value, label }: { value: string; label?: string }) {
  const { t } = useLanguage();
  return (
    <span className={`badge ${value}`}>
      {t(label || statusNames[value] || value)}
    </span>
  );
}
function Empty({
  text = "暂时还没有记录",
  action,
}: {
  text?: string;
  action?: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="empty">
      <Activity size={28} />
      <p>{t(text)}</p>
      {action}
    </div>
  );
}
function Avatar({ name }: { name: string }) {
  return <span className="avatar">{name.slice(0, 1)}</span>;
}
function DialogView({
  dialog,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  dialog: Dialog;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    if (error)
      ref.current
        ?.querySelector(".inline-error")
        ?.scrollIntoView({ block: "nearest" });
  }, [error]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <span className="eyebrow">YVONNE FITNESS</span>
          <h2 id="dialog-title">{dialog.title}</h2>
        </div>
        <button
          className="icon-btn"
          aria-label={t("关闭")}
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {dialog.description && (
        <p className="muted pre-wrap">{dialog.description}</p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {t(error)}
        </p>
      )}
      <form onSubmit={onSubmit}>
        {dialog.fields.map((f) =>
          f.type === "members" ? (
            <fieldset className="slot-choices member-choices" key={f.name}>
              <legend>{t(f.label)} *</legend>
              <div className="slot-choice-list">
                {f.options?.map((o) => (
                  <label className="slot-choice" key={o.value}>
                    <input
                      type="checkbox"
                      name={f.name}
                      value={o.value}
                      defaultChecked={String(f.value || "")
                        .split(",")
                        .includes(o.value)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
              <small>{t(f.hint)}</small>
            </fieldset>
          ) : f.type === "slots" ? (
            <fieldset className="slot-choices" key={f.name}>
              <legend>
                {t(f.label)}
                {f.required && " *"}
              </legend>
              {dialog.alternate && (
                <button
                  type="button"
                  className="slot-create-option"
                  disabled={busy}
                  onClick={() => {
                    const form = ref.current?.querySelector("form");
                    dialog.alternate?.action(
                      form
                        ? new FormData(form)
                            .getAll("p_members")
                            .map(String)
                            .join(",") ||
                            String(new FormData(form).get("p_member") || "")
                        : undefined,
                    );
                  }}
                >
                  {dialog.alternate.label}
                </button>
              )}
              {f.options?.length ? (
                <div className="slot-choice-list">
                  {f.options.map((o) => (
                    <label className="slot-choice" key={o.value}>
                      <input
                        type="radio"
                        name={f.name}
                        value={o.value}
                        required={f.required}
                        defaultChecked={f.value === o.value}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p role="status" className="empty-slots">
                  {t(f.hint)}
                </p>
              )}
              {!!f.options?.length && (
                <small>{t("请选择一个时段，再确认保存。")}</small>
              )}
            </fieldset>
          ) : (
            <label
              className={`field ${f.type === "checkbox" ? "check-field" : ""}`}
              key={f.name}
            >
              {f.type === "checkbox" ? (
                <>
                  <input
                    name={f.name}
                    type="checkbox"
                    defaultChecked={Boolean(f.value)}
                  />
                  <span>{t(f.label)}</span>
                </>
              ) : (
                <>
                  <span>
                    {t(f.label)}
                    {f.required && " *"}
                  </span>
                  {f.type === "textarea" ? (
                    <textarea
                      name={f.name}
                      defaultValue={String(f.value ?? "")}
                      required={f.required}
                      rows={7}
                      maxLength={fieldLimits[f.name] || 30000}
                    />
                  ) : f.type === "select" ? (
                    <select
                      name={f.name}
                      defaultValue={String(f.value ?? "")}
                      required={f.required}
                    >
                      <option value="" disabled>
                        {t("请选择")}
                      </option>
                      {f.options?.map((o) => (
                        <option value={o.value} key={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name={f.name}
                      type={f.type || "text"}
                      defaultValue={String(f.value ?? "")}
                      required={f.required}
                      min={f.min}
                      max={f.max}
                      step={f.type === "number" ? f.step || "any" : undefined}
                      minLength={f.minLength}
                      maxLength={fieldLimits[f.name] || 2000}
                    />
                  )}
                </>
              )}
              {f.hint && <small>{t(f.hint)}</small>}
            </label>
          ),
        )}
        {dialog.optionalFields && (
          <details
            className="extra-measurements"
            open={
              dialog.optionalFields.some(
                (f) => f.value != null && f.value !== "",
              ) || undefined
            }
          >
            <summary>{t("围度与身体状态（选填）")}</summary>
            <p className="muted">
              {t("身高和围度用英寸（in）；只填写本次测量的数据。")}
            </p>
            <div className="measurement-fields">
              {dialog.optionalFields.map((f) => (
                <label className="field" key={f.name}>
                  <span>{t(f.label)}</span>
                  <input
                    name={f.name}
                    type="number"
                    defaultValue={String(f.value ?? "")}
                    min={f.min}
                    max={f.max}
                    step={f.step || "any"}
                  />
                </label>
              ))}
            </div>
          </details>
        )}
        <div className="modal-footer">
          {!dialog.readOnly && (
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={onClose}
            >
              {t("返回")}
            </button>
          )}
          {dialog.publication && (
            <button
              type="submit"
              name="intent"
              value="draft"
              className="btn secondary"
              disabled={busy}
            >
              {t("保存草稿（仅教练）")}
            </button>
          )}
          <button
            name={dialog.publication ? "intent" : undefined}
            value={dialog.publication ? "publish" : undefined}
            className="btn"
            disabled={
              busy ||
              dialog.fields.some(
                (f) =>
                  (f.type === "slots" || (f.type === "select" && f.required)) &&
                  !f.options?.length,
              )
            }
          >
            {busy ? t("正在保存…") : dialog.submit || t("保存")}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function Studio() {
  const { t, displayTime, language, preference, setPreference, setCoach } =
    useLanguage();
  const [languageBusy, setLanguageBusy] = useState(false);
  const [demo, setDemo] = useState(!configured);
  const [demoRole, setDemoRole] = useState<"coach" | "member">("coach");
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<Data>(() =>
    configured ? emptyData() : demoData(),
  );
  const [loading, setLoading] = useState(configured);
  const {
    tab,
    setTab,
    filter,
    setFilter,
    query,
    setQuery,
    memberFilter,
    setMemberFilter,
    week,
    setWeek,
    go,
  } = useStudioNavigation();
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [authMode, setAuthMode] = useState<
    "login" | "register" | "reset" | "password"
  >("login");
  const [showAuth, setShowAuth] = useState(false);
  const [authHint, setAuthHint] = useState("");
  const authSubmitting = useRef(false);
  const [loadError, setLoadError] = useState("");
  const latestRead = useRef(new LatestRead());
  const sessionOwner = useRef<string | null>(null);
  const sessionId = session?.user.id;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const current = data.profiles.find(
    (p) =>
      p.id ===
      (demo ? (demoRole === "coach" ? "coach" : "member-0") : session?.user.id),
  );
  useEffect(() => {
    if (current && new URLSearchParams(window.location.search).has("payment"))
      setTab("packages");
  }, [current]);
  const coach = current?.role === "coach";
  useEffect(() => {
    setCoach(!!coach && !showAuth);
    return () => setCoach(false);
  }, [coach, showAuth, setCoach]);
  useEffect(() => {
    if (current?.role === "member" && current.language)
      setPreference(current.language);
  }, [current?.id, current?.language, setPreference]);
  async function changeLanguage(next: "zh" | "en") {
    if (languageBusy) return;
    setLanguageBusy(true);
    try {
      if (current?.role === "member") {
        if (!demo && supabase) {
          const { error } = await supabase.rpc("set_member_language", {
            p_language: next,
          });
          if (error) throw error;
        }
        setData((old) => ({
          ...old,
          profiles: old.profiles.map((p) =>
            p.id === current.id ? { ...p, language: next } : p,
          ),
        }));
      }
      setPreference(next);
    } catch {
      setError(t("语言偏好未保存，请重试。"));
    } finally {
      setLanguageBusy(false);
    }
  }
  const initialLanguageSaved = useRef<string | null>(null);
  useEffect(() => {
    if (
      !loading &&
      current?.role === "member" &&
      current.language == null &&
      initialLanguageSaved.current !== current.id
    ) {
      initialLanguageSaved.current = current.id;
      void changeLanguage(preference);
    }
  }, [loading, current?.id, current?.language, preference]);
  const zone = data.settings.timezone;
  const members = data.profiles.filter((p) => p.role === "member");
  const notify = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  const load = useCallback(async () => {
    if (!supabase) return;
    const isLatest = latestRead.current.begin();
    const read = async (table: string, columns = "*") => {
      const rows: unknown[] = [];
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase!
          .from(table)
          .select(columns)
          .order("id")
          .range(from, from + 499);
        if (error) throw error;
        rows.push(...(page || []));
        if (!page || page.length < 500) return rows;
        from += 500;
      }
    };
    const readAccounts = async () => {
      try {
        const [session_entries, monthly_memberships, online_memberships] =
          await Promise.all([
            read("session_entries"),
            read("monthly_memberships"),
            read("online_memberships"),
          ]);
        return {
          session_entries,
          monthly_memberships,
          online_memberships,
          credits_ready: true,
        };
      } catch (e) {
        if (["42P01", "PGRST205"].includes((e as { code?: string }).code || ""))
          return {
            session_entries: [],
            monthly_memberships: [],
            credits_ready: false,
          };
        throw e;
      }
    };
    const [
      profiles,
      slots,
      appointments,
      plans,
      records,
      invites,
      referrals,
      events,
      email_jobs,
      packages,
      member_prices,
      contact_sync,
      settings,
      accounts,
    ] = await Promise.all([
      read("profiles"),
      supabase.rpc("get_schedule"),
      read("appointments", "*, slots(starts_at,ends_at)"),
      read("plans"),
      read("records"),
      read("invites"),
      read("referrals"),
      read("appointment_events"),
      read("email_jobs"),
      read("packages"),
      read("member_prices"),
      read("contact_sync"),
      read("settings"),
      readAccounts(),
    ]);
    if (slots.error) throw slots.error;
    if (!isLatest()) return;
    setLoadError("");
    setData({
      ...accounts,
      profiles,
      slots: slots.data || [],
      appointments,
      plans,
      records,
      invites,
      referrals,
      events,
      email_jobs,
      packages,
      member_prices,
      contact_sync,
      settings: settings[0] || emptyData().settings,
    } as Data);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (sessionOwner.current !== (s?.user.id || null)) {
        latestRead.current.invalidate();
        sessionOwner.current = s?.user.id || null;
        setData(emptyData());
        setDialog(null);
        if (event !== "INITIAL_SESSION") {
          setTab("overview");
          setFilter("all");
          setQuery("");
          setMemberFilter("all");
        }
        setError("");
        setLoadError("");
        setLoading(!!s);
      }
      setSession(s);
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("password");
        setShowAuth(true);
      }
      if (!s) setLoading(false);
    });
    // onAuthStateChange delivers INITIAL_SESSION; avoid a competing stale getSession.
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (sessionId && !demo) {
      let active = true;
      setLoading(true);
      load()
        .catch(() => {
          if (active) setLoadError(t("暂时无法读取数据，请检查网络后重试。"));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
        latestRead.current.invalidate();
      };
    }
  }, [sessionId, demo, load]);
  useEffect(() => {
    setError("");
  }, [dialog]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const close = () => {
      setDialog(null);
      setMenu(false);
      setError("");
    };
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("ref") || params.has("invite")) {
      setAuthMode("register");
      setShowAuth(true);
    }
    if (params.has("recovery")) {
      setAuthMode("password");
      setShowAuth(true);
    }
  }, []);
  useEffect(() => {
    if (!sessionId || demo) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState === "visible")
        load().catch(() => {
          if (active)
            setLoadError(t("自动刷新未成功，当前显示上次读取的数据。"));
        });
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [sessionId, demo, load]);
  async function retryLoad() {
    setBusy(true);
    try {
      await load();
    } catch {
      setLoadError(t("暂时无法读取数据，请检查网络后重试。"));
    } finally {
      setBusy(false);
    }
  }
  function changeAuthMode(mode: typeof authMode) {
    setAuthMode(mode);
    setError("");
    setAuthHint("");
  }
  const formatPrice = (value: number | null | undefined, currency = "USD") =>
    value == null
      ? t("待教练设置")
      : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
          value,
        );
  const name = (id: string) =>
    data.profiles.find((p) => p.id === id)?.full_name || t("学员");
  const navigate = (next: string) => {
    window.scrollTo({ top: 0, behavior: "instant" });
    go(
      next,
      next === "plans" && !coach
        ? "published"
        : next === "bookings"
          ? "upcoming"
          : "all",
    );
    setMenu(false);
  };
  const memberOptions = members
    .filter((m) => m.active)
    .map((m) => ({ value: m.id, label: m.full_name }));
  const memberField = (id?: string): Field => ({
    name: "p_member",
    label: t("指定学员"),
    type: "select",
    value: initialMember(
      id,
      memberFilter,
      memberOptions.map((m) => m.value),
    ),
    required: true,
    options: memberOptions,
    hint: memberOptions.length
      ? t("请确认内容归属的学员。")
      : t("暂无可用学员，请先邀请学员注册或恢复学员账号。"),
  });
  const bookingMembersField = (ids?: string): Field => ({
    name: "p_members",
    label: "学员（可多选）",
    type: "members",
    value:
      ids ||
      (memberOptions.some((m) => m.value === memberFilter) ? memberFilter : ""),
    required: true,
    options: memberOptions,
    hint: memberOptions.length
      ? "勾选一起上课的学员；每位学员独立记录、通知和扣课。"
      : "暂无可用学员，请先邀请学员注册或恢复学员账号。",
  });
  async function mutate(fn: string, args: Record<string, unknown>) {
    if (demo) {
      demoMutate(fn, args);
      return;
    }
    if (!supabase) throw new Error(t("请先连接 Supabase"));
    const refreshed = await saveThenRefresh(async () => {
      const { error } = await supabase!.rpc(fn, args);
      if (error) throw error;
    }, load);
    if (!refreshed)
      setLoadError(
        t("操作已保存，但页面刷新失败。请点击重新加载，不要重复提交。"),
      );
  }
  function demoMutate(fn: string, a: Record<string, unknown>) {
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    setData((d) => {
      const n = structuredClone(d);
      if (fn === "reschedule_new_slot") {
        const aId = String(a.p_appointment),
          previous = n.appointments.find((b) => b.id === aId);
        if (previous) {
          const slotId = crypto.randomUUID();
          const overlap = slotsOverlap(
            previous.slots,
            String(a.p_start),
            String(a.p_end),
          );
          n.slots = n.slots
            .filter((s) => !overlap || s.id !== previous.slot_id)
            .map((s) =>
              s.id === previous.slot_id ? { ...s, available: true } : s,
            );
          n.slots.push({
            id: slotId,
            starts_at: String(a.p_start),
            ends_at: String(a.p_end),
            available: false,
          });
          previous.slot_id = slotId;
          previous.slots = {
            starts_at: String(a.p_start),
            ends_at: String(a.p_end),
          };
          previous.reason = String(a.p_message || "");
        }
      }
      if (fn === "book_members") {
        let slot = n.slots.find((s) => s.id === a.p_slot);
        if (!slot) {
          slot = {
            id: crypto.randomUUID(),
            starts_at: String(a.p_start),
            ends_at: String(a.p_end),
            available: false,
          };
          n.slots.push(slot);
        }
        for (const member of new Set(a.p_members as string[])) {
          if (
            n.appointments.some(
              (b) =>
                b.slot_id === slot!.id &&
                b.member_id === member &&
                b.status !== "cancelled",
            )
          )
            continue;
          n.appointments.push({
            id: crypto.randomUUID(),
            member_id: member,
            slot_id: slot.id,
            status: "booked",
            message: String(a.p_message || ""),
            reason: "",
            created_at: now,
            slots: { starts_at: slot.starts_at, ends_at: slot.ends_at },
          });
        }
      }
      if (fn === "book_new_slot") {
        const slotId = crypto.randomUUID();
        n.slots.push({
          id: slotId,
          starts_at: String(a.p_start),
          ends_at: String(a.p_end),
          available: false,
        });
        n.appointments.push({
          id,
          slot_id: slotId,
          member_id: String(a.p_member),
          status: "booked",
          message: String(a.p_message || ""),
          reason: "",
          created_at: now,
          slots: { starts_at: String(a.p_start), ends_at: String(a.p_end) },
        });
      }
      if (
        (fn === "record_session_credit" ||
          fn === "record_session_credit_with_expiry") &&
        !n.session_entries.some((e) => e.id === a.p_id)
      )
        n.session_entries.push({
          id: String(a.p_id),
          member_id: String(a.p_member),
          kind: a.p_kind as "purchase" | "adjustment",
          quantity: Number(a.p_quantity),
          expires_on: a.p_expiry ? String(a.p_expiry) : null,
          note: String(a.p_note),
          amount: a.p_amount == null ? null : Number(a.p_amount),
          currency: String(a.p_currency),
          appointment_id: null,
          membership_id: null,
          created_at: now,
        });
      if (
        fn === "record_monthly_membership" &&
        !n.monthly_memberships.some((m) => m.id === a.p_id)
      )
        n.monthly_memberships.push({
          id: String(a.p_id),
          member_id: String(a.p_member),
          starts_on: String(a.p_start),
          ends_on: String(a.p_end),
          note: String(a.p_note),
          amount: a.p_amount == null ? null : Number(a.p_amount),
          currency: String(a.p_currency),
          created_at: now,
          cancelled_at: null,
          cancel_reason: null,
        });
      if (fn === "cancel_monthly_membership")
        n.monthly_memberships = n.monthly_memberships.map((m) =>
          m.id === a.p_id
            ? { ...m, cancelled_at: now, cancel_reason: String(a.p_reason) }
            : m,
        );
      if (fn === "save_profile")
        Object.assign(
          n.profiles.find((p) => p.id === current!.id)!,
          {
            full_name: a.p_name,
            phone: a.p_phone,
            goals: a.p_goals,
            timezone: a.p_timezone,
            email_notifications: a.p_notifications,
          },
        );
      if (fn === "save_settings")
        Object.assign(n.settings, {
          studio_name: a.p_name,
          timezone: a.p_timezone,
          allow_referral_signup: a.p_referrals,
          location: a.p_location,
        });
      if (fn === "create_invite")
        n.invites.unshift({
          id,
          code: `DEMO-${id.slice(0, 8).toUpperCase()}`,
          email: String(a.p_email || ""),
          max_uses: Number(a.p_max_uses),
          uses: 0,
          active: true,
          expires_at: new Date(
            Date.now() + Number(a.p_days) * 86400000,
          ).toISOString(),
          created_at: now,
        });
      if (fn === "revoke_invite")
        n.invites = n.invites.map((i) =>
          i.id === a.p_id ? { ...i, active: false } : i,
        );
      if (fn === "set_member_active")
        n.profiles = n.profiles.map((p) =>
          p.id === a.p_id ? { ...p, active: Boolean(a.p_active) } : p,
        );
      if (fn === "save_slot") {
        if (a.p_id) n.slots = n.slots.filter((s) => s.id !== a.p_id);
        else
          n.slots.push({
            id,
            starts_at: String(a.p_start),
            ends_at: String(a.p_end),
            available: true,
          });
      }
      if (fn === "manage_booking") {
        const slot = n.slots.find((s) => s.id === a.p_slot);
        let booking = n.appointments.find((b) => b.id === a.p_appointment);
        if (a.p_action === "book" && slot) {
          booking = {
            id,
            member_id: String(a.p_member || current!.id),
            slot_id: slot.id,
            status: "booked",
            message: String(a.p_message || ""),
            reason: "",
            created_at: now,
            slots: { starts_at: slot.starts_at, ends_at: slot.ends_at },
          };
          n.appointments.unshift(booking);
          slot.available = false;
        } else if (booking) {
          const oldId = booking.slot_id;
          const old = n.slots.find((s) => s.id === oldId);
          if (a.p_action === "cancel") {
            booking.status = "cancelled";
            if (old) old.available = true;
          }
          if (
            (a.p_action === "complete" || a.p_action === "no_show") &&
            booking.status === "booked"
          ) {
            const absent = a.p_action === "no_show";
            booking.status = absent ? "no_show" : "completed";
            const monthly = membershipForDate(
              n.monthly_memberships,
              booking.member_id,
              displayTime(booking.slots.starts_at, zone, "yyyy-MM-dd"),
            );
            if (
              !n.session_entries.some((e) => e.appointment_id === booking!.id)
            )
              n.session_entries.push({
                id,
                member_id: booking.member_id,
                kind: absent
                  ? monthly
                    ? "monthly_no_show"
                    : "no_show"
                  : monthly
                    ? "monthly_lesson"
                    : "lesson",
                quantity: monthly ? 0 : -1,
                note: absent
                  ? monthly
                    ? t("包月内未到场，只记缺席，不扣按次课时")
                    : t("未到场，扣除 1 节")
                  : monthly
                    ? t("包月内完成课程，不扣按次课时")
                    : t("完成课程，扣除 1 节"),
                amount: null,
                currency: "USD",
                appointment_id: booking.id,
                membership_id: monthly?.id || null,
                created_at: now,
              });
          }
          if (a.p_action === "reschedule" && slot) {
            if (old) old.available = true;
            slot.available = false;
            booking.slot_id = slot.id;
            booking.slots = {
              starts_at: slot.starts_at,
              ends_at: slot.ends_at,
            };
          }
          booking.reason = String(a.p_message || "");
        }
        if (booking)
          n.events.unshift({
            id,
            appointment_id: booking.id,
            actor_id: current!.id,
            action: String(a.p_action),
            message: String(a.p_message || ""),
            details: {},
            created_at: now,
          });
      }
      if (fn === "save_plan") {
        if (a.p_publish)
          n.plans = n.plans.map((p) =>
            p.member_id === a.p_member && p.status === "published"
              ? { ...p, status: "archived" }
              : p,
          );
        n.plans = n.plans.filter((p) => p.id !== a.p_id);
        n.plans.unshift({
          id: String(a.p_id || id),
          member_id: String(a.p_member),
          title: String(a.p_title),
          content: String(a.p_content),
          status: a.p_publish ? "published" : "draft",
          created_at: now,
        });
      }
      if (fn === "save_record" || fn === "save_record_us") {
        const previousWeight = n.records.find((r) => r.id === a.p_id)?.weight;
        n.records = n.records.filter((r) => r.id !== a.p_id);
        n.records.unshift({
          id: String(a.p_id || id),
          member_id: String(a.p_member),
          recorded_on: String(a.p_date),
          weight:
            fn === "save_record_us"
              ? poundsToStoredKg(
                  a.p_weight_lbs == null ? null : Number(a.p_weight_lbs),
                  previousWeight,
                )
              : a.p_weight === null
                ? null
                : Number(a.p_weight),
          measurements: (a.p_measurements || {}) as Measurements,
          body_fat: a.p_fat === null ? null : Number(a.p_fat),
          notes: String(a.p_notes),
          shared: Boolean(a.p_shared),
        });
      }
      if (fn === "set_training_deleted") {
        if (a.p_kind === "plan")
          n.plans = n.plans.map((p) =>
            p.id === a.p_id
              ? { ...p, deleted_at: a.p_deleted ? now : null, status: "draft" }
              : p,
          );
        else
          n.records = n.records.map((r) =>
            r.id === a.p_id
              ? { ...r, deleted_at: a.p_deleted ? now : null, shared: false }
              : r,
          );
      }
      if (fn === "save_member_catalog_prices") {
        const previous = n.member_prices.find(
          (p) => p.member_id === a.p_member,
        );
        n.member_prices = n.member_prices.filter(
          (p) => p.member_id !== a.p_member,
        );
        n.member_prices.push({
          ...previous,
          id,
          member_id: String(a.p_member),
          single_price: null,
          monthly_price: null,
          ...Object.fromEntries(
            salePackages.map((k) => [
              packageOptions[k].priceKey,
              (a.p_prices as Record<string, number | null>)[k] ?? null,
            ]),
          ),
          currency: String(a.p_currency),
          updated_at: now,
        });
      }
      if (
        fn === "record_online_membership" &&
        !(n.online_memberships || []).some((m) => m.id === a.p_id)
      )
        n.online_memberships = [
          ...(n.online_memberships || []),
          {
            id: String(a.p_id),
            member_id: String(a.p_member),
            starts_on: String(a.p_start),
            ends_on: String(a.p_end),
            note: String(a.p_note),
            amount: a.p_amount == null ? null : Number(a.p_amount),
            currency: String(a.p_currency),
            created_at: now,
            cancelled_at: null,
            cancel_reason: null,
          },
        ];
      if (fn === "cancel_online_membership")
        n.online_memberships = (n.online_memberships || []).map((m) =>
          m.id === a.p_id
            ? { ...m, cancelled_at: now, cancel_reason: String(a.p_reason) }
            : m,
        );

      n.slots = n.slots.map((s) => ({
        ...s,
        available: !n.appointments.some(
          (b) => b.slot_id === s.id && b.status !== "cancelled",
        ),
      }));
      return n;
    });
  }
  const commit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!dialog || busy) return;
    const formData = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.name)
      formData.set(submitter.name, submitter.value);
    const values = Object.fromEntries(formData) as Record<string, string>;
    if (dialog.fields.some((f) => f.type === "members"))
      values.p_members = formData.getAll("p_members").map(String).join(",");
    setBusy(true);
    setError("");
    try {
      if (dialog.readOnly) {
        setDialog(null);
        return;
      }
      for (const f of dialog.fields) {
        if (f.required && f.type !== "checkbox" && !values[f.name]?.trim())
          throw new Error(t("请填写{0}", [f.label]));
      }
      await dialog.action(values);
      setDialog(null);
      notify(
        demo
          ? t("已更新演示数据（刷新后恢复）")
          : dialog.success ||
              (dialog.publication
                ? values.intent === "publish"
                  ? t("已发布给指定学员")
                  : t("已保存草稿，仅教练可见")
                : t("保存成功")),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  async function book(slot?: Slot, existing?: Appointment, member?: string) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      let latestSlots = data.slots;
      if (!demo && supabase) {
        const { data: schedule, error } = await supabase.rpc("get_schedule");
        if (error) throw error;
        latestSlots = schedule || [];
        setData((previous) => ({ ...previous, slots: latestSlots }));
      }
      const available = availableBookingSlots(
        coach
          ? latestSlots.map((s) => ({ ...s, available: true }))
          : latestSlots,
        existing?.slot_id,
      );
      setDialog({
        alternate: coach
          ? {
              label: existing
                ? t("＋ 新增时间并改期")
                : t("＋ 新增时间并直接预约"),
              action: (selected) => bookNewTime(selected || member, existing),
            }
          : undefined,
        title: existing
          ? t("调整预约时间")
          : coach
            ? t("为学员预约")
            : t("预约下一次训练"),
        description: t("{0} 所有课程时间均为 {1}。{2}", [
          existing
            ? t("当前预约：{0} – {1}。请选择新的训练时间。", [
                displayTime(
                  existing.slots.starts_at,
                  zone,
                  t("yyyy年MM月dd日 EEE HH:mm"),
                ),
                displayTime(existing.slots.ends_at, zone, "HH:mm"),
              ])
            : t("请选择训练时间。"),
          zone,
          !coach
            ? `\n${t(changeReminder)}${existing ? "" : `\n${t(attendanceReminder)}`}`
            : "",
        ]),
        fields: [
          ...(coach && !existing ? [bookingMembersField(member)] : []),
          {
            name: "p_slot",
            label: t("训练时间"),
            type: "slots",
            required: true,
            value: existing ? "" : slot?.id || "",
            hint: coach
              ? existing
                ? t("暂无其他可预约时段，请先在教练时间表添加时间。")
                : t("暂无已开放时段，可点击上方选项直接新增时间并预约。")
              : t(
                  "教练暂未开放其他可预约时段。请联系教练增加时间后重试；当前预约保持不变。",
                ),
            options: available.map((s) => ({
              value: s.id,
              label: `${displayTime(s.starts_at, zone, t("yyyy年MM月dd日 EEE HH:mm"))} – ${displayTime(s.ends_at, zone, "HH:mm")}${coach && latestSlots.find((item) => item.id === s.id)?.available === false ? " · 已有预约，可添加同行学员" : ""}`,
            })),
          },
          {
            name: "p_message",
            label: existing
              ? t("改期原因（选填）")
              : coach
                ? t("预约备注（学员可见，选填）")
                : t("给教练的留言（选填）"),
            type: "textarea",
          },
        ],
        submit: existing ? t("确认改期") : t("确认预约"),
        action: async (v) => {
          if (!available.some((s) => s.id === v.p_slot))
            throw new Error(t("请选择一个可预约的训练时间。"));
          if (coach && !existing) {
            await mutate("book_members", {
              p_members: v.p_members.split(","),
              p_slot: v.p_slot,
              p_message: v.p_message,
            });
            return;
          }
          await mutate("manage_booking", {
            p_action: existing ? "reschedule" : "book",
            p_slot: v.p_slot,
            p_appointment: existing?.id || null,
            p_member: existing?.member_id || v.p_member || current!.id,
            p_message: v.p_message,
          });
        },
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("暂时无法获取可预约时段，请重试。"),
      );
    } finally {
      setBusy(false);
    }
  }
  function cancelBooking(b: Appointment) {
    setDialog({
      title: t("取消这次预约"),
      description: t(
        "{0} · {1}。仅取消这位学员的预约；该时段没有其他预约时才会重新开放。{2}",
        [
          name(b.member_id),
          displayTime(b.slots.starts_at, zone),
          !coach ? `\n${t(changeReminder)}` : "",
        ],
      ),
      fields: [
        { name: "p_message", label: t("取消原因（选填）"), type: "textarea" },
      ],
      submit: t("确认取消"),
      action: (v) =>
        mutate("manage_booking", {
          p_action: "cancel",
          p_appointment: b.id,
          p_message: v.p_message,
        }),
    });
  }
  function markNoShow(b: Appointment) {
    const monthly = membershipForDate(
      data.monthly_memberships,
      b.member_id,
      displayTime(b.slots.starts_at, zone, "yyyy-MM-dd"),
    );
    setDialog({
      title: t("确认未到场（No show）"),
      description: t(
        "{0} · {1}。{2}不计入已完成次数和训练时长。保存后不可重复结算；如扣课有误，可在课时账户中调整并保留原因。",
        [
          name(b.member_id),
          displayTime(b.slots.starts_at, zone),
          monthly
            ? t("此课程在包月有效期内，只记录缺席，不扣按次课时。")
            : t(
                "确认后扣除 1 节按次课时，预计余额 {0} 节。余额不足也会扣课，请核对是否遗漏购课。",
                [balanceAfterLesson(data, b)],
              ),
        ],
      ),
      fields: [
        {
          name: "p_message",
          label: t("缺席备注（选填，学员可见）"),
          type: "textarea",
        },
      ],
      submit: monthly ? t("确认缺席 · 不扣课") : t("确认缺席并扣 1 节"),
      action: (v) =>
        mutate("manage_booking", {
          p_action: "no_show",
          p_appointment: b.id,
          p_message: v.p_message,
        }),
    });
  }
  function bookNewTime(member?: string, existing?: Appointment) {
    setDialog({
      title: existing ? t("新增时间并改期") : t("新增时间并预约"),
      description: t("按 {0} 输入时间。{1}", [
        zone,
        existing
          ? t("为 {0} 改期，保留原预约记录和历史。", [name(existing.member_id)])
          : t("保存后同时新增时段并为学员预约。"),
      ]),
      fields: [
        ...(!existing ? [bookingMembersField(member)] : []),
        {
          name: "start",
          label: t("开始时间"),
          type: "datetime-local",
          required: true,
        },
        {
          name: "end",
          label: t("结束时间"),
          type: "datetime-local",
          required: true,
        },
        {
          name: "p_message",
          label: existing
            ? t("改期原因（选填）")
            : t("预约备注（学员可见，选填）"),
          type: "textarea",
        },
      ],
      submit: existing ? t("新增并改期") : t("新增并预约"),
      action: async (v) => {
        const start = localToISO(v.start, zone),
          end = localToISO(v.end, zone);
        if (
          new Date(start) <= new Date() ||
          end <= start ||
          Date.parse(end) - Date.parse(start) > 14400000
        )
          throw new Error(t("请选择未来的有效时段（最长 4 小时）"));
        if (
          data.slots.some(
            (s) => s.id !== existing?.slot_id && slotsOverlap(s, start, end),
          )
        )
          throw new Error(t("时间段与现有安排重叠，请选择已有时段或调整时间"));
        await mutate(existing ? "reschedule_new_slot" : "book_members", {
          ...(existing
            ? { p_appointment: existing.id }
            : { p_members: v.p_members.split(",") }),
          p_start: start,
          p_end: end,
          p_message: v.p_message,
        });
      },
    });
  }
  function addSlot() {
    setDialog({
      title: t("开放可预约时间"),
      description: t(
        "按 {0} 输入时间，无需按先后顺序添加。学员自行预约为单人，教练可安排多人同行。",
        [zone],
      ),
      fields: [
        {
          name: "start",
          label: t("开始时间"),
          type: "datetime-local",
          required: true,
        },
        {
          name: "end",
          label: t("结束时间"),
          type: "datetime-local",
          required: true,
        },
      ],
      submit: t("开放时段"),
      action: async (v) => {
        const start = localToISO(v.start, zone),
          end = localToISO(v.end, zone);
        if (
          new Date(start) <= new Date() ||
          end <= start ||
          new Date(end).getTime() - new Date(start).getTime() > 14400000
        )
          throw new Error(t("请选择未来的有效时段（最长 4 小时）"));
        if (
          data.slots.some(
            (s) => s.active !== false && slotsOverlap(s, start, end),
          )
        )
          throw new Error(t("时间段与现有安排重叠"));
        await mutate("save_slot", { p_start: start, p_end: end });
      },
    });
  }
  function editPlan(plan?: Plan, member?: string) {
    setDialog({
      title: plan ? t("编辑训练计划") : t("制定专属训练计划"),
      publication: true,
      submit: plan?.status === "published" ? t("更新并发布") : t("发布给学员"),
      description: plan
        ? t(
            "归属学员：{0}。保存草稿仅教练可见；发布后学员可见并收到通知。已发布内容保存为草稿后将对学员隐藏。",
            [name(plan.member_id)],
          )
        : t("每份计划仅对指定学员开放。发布新计划后，旧计划自动归档。"),
      fields: [
        ...(!plan ? [memberField(member)] : []),
        {
          name: "p_title",
          label: t("计划名称"),
          value: plan?.title,
          required: true,
        },
        {
          name: "p_content",
          label: t("训练内容"),
          type: "textarea",
          value: plan?.content,
          required: true,
          hint: t("可按训练日填写动作、组数、次数、休息时间和注意事项。"),
        },
      ],
      action: (v) =>
        mutate("save_plan", {
          p_member: plan?.member_id || v.p_member,
          p_id: plan?.id || null,
          p_title: v.p_title,
          p_content: v.p_content,
          p_publish: v.intent === "publish",
        }),
    });
  }
  function editRecord(record?: RecordEntry, member?: string, date?: string) {
    setDialog({
      title: record ? t("编辑训练档案") : t("添加训练档案"),
      publication: true,
      submit: record?.shared ? t("更新并发布") : t("发布给学员"),
      description: record
        ? t(
            "归属学员：{0}。保存草稿仅教练可见，发布后只有这位学员可见。已发布内容保存为草稿后将对学员隐藏。",
            [name(record.member_id)],
          )
        : t("保存草稿仅教练可见；发布后只有指定学员可见。"),
      fields: [
        ...(!record ? [memberField(member)] : []),
        {
          name: "p_date",
          label: t("记录日期"),
          type: "date",
          value:
            record?.recorded_on ||
            date ||
            displayTime(new Date().toISOString(), zone, "yyyy-MM-dd"),
          required: true,
        },
        {
          name: "p_weight",
          label: t("体重 / lb（磅，选填）"),
          type: "number",
          value: kgToLb(record?.weight) ?? "",
          min: 1,
          max: 1100,
          step: 0.1,
        },
        {
          name: "p_fat",
          label: t("体脂率 / %（选填）"),
          type: "number",
          value: record?.body_fat ?? "",
          min: 0,
          max: 100,
        },
        {
          name: "p_notes",
          label: t("训练内容、表现、身体不适及下次重点"),
          type: "textarea",
          value: record?.notes,
        },
      ],
      optionalFields: measurementFields.map((f) => ({
        name: f.key,
        label: `${t(f.label)} / ${t(f.unit)}`,
        type: "number",
        value: record?.measurements?.[f.key] ?? "",
        min: f.min,
        max: f.max,
        step: f.key === "resting_hr" ? 1 : 0.1,
      })),
      action: (v) =>
        mutate("save_record_us", {
          p_id: record?.id || null,
          p_member: record?.member_id || v.p_member,
          p_date: v.p_date,
          p_weight_lbs: v.p_weight ? Number(v.p_weight) : null,
          p_measurements: readMeasurements(v),
          p_fat: v.p_fat ? Number(v.p_fat) : null,
          p_notes: v.p_notes,
          p_shared: v.intent === "publish",
        }),
    });
  }
  function setTrainingDeleted(
    kind: "plan" | "record",
    id: string,
    deleted: boolean,
  ) {
    setDialog({
      title: deleted ? t("删除这份内容") : t("恢复为草稿"),
      description: deleted
        ? t("删除后学员将无法查看，可在「已删除」中恢复为草稿。")
        : t("恢复后只有教练可见，需要再次发布才会对学员显示。"),
      fields: [],
      submit: deleted ? t("确认删除") : t("恢复为草稿"),
      action: () =>
        mutate("set_training_deleted", {
          p_kind: kind,
          p_id: id,
          p_deleted: deleted,
        }),
    });
  }
  function creditFields(memberId: string): Field[] {
    return [
      {
        name: "p_amount",
        label: t("本次金额记录（选填，不会发起扣款）"),
        type: "number",
        min: 0,
        max: 999999.99,
        step: 0.01,
      },
      {
        name: "p_currency",
        label: t("币种"),
        type: "select",
        required: true,
        value:
          data.member_prices.find((p) => p.member_id === memberId)?.currency ||
          "USD",
        options: ["USD", "CNY", "CAD", "AUD", "EUR", "GBP"].map((v) => ({
          value: v,
          label: v,
        })),
      },
    ];
  }
  function recordCredit(memberId: string, adjustment = false) {
    const request = crypto.randomUUID();
    setDialog({
      title: `${adjustment ? t("调整课时") : t("录入购课")} · ${name(memberId)}`,
      description: adjustment
        ? t(
            "期初余课、补课、退课或纠错请在这里录入。正数增加，负数扣减；必须说明原因，学员可以查看。不改动历史上课次数。",
          )
        : t(
            "录入本次购买的课次数量，例如 3 节。只做课时与金额记录，不会发起支付；旧课程不会补扣。",
          ),
      fields: [
        {
          name: "p_quantity",
          label: adjustment ? t("课时增减（如 +2 或 -1）") : t("购买课次数"),
          type: "number",
          required: true,
          min: adjustment ? -10000 : 1,
          max: 10000,
          step: 1,
          value: adjustment ? "" : 1,
        },
        ...(!adjustment
          ? [
              ...creditFields(memberId),
              {
                name: "p_expiry",
                label: t(
                  "有效截止日期（课次套餐请填购买日起 3 个月；单次可留空）",
                ),
                type: "date" as const,
              },
            ]
          : []),
        {
          name: "p_note",
          label: t("说明 / 原因（学员可见）"),
          type: "textarea",
          required: true,
        },
      ],
      submit: adjustment ? t("确认调整") : t("确认入账"),
      success: t("课时已入账，可在流水中查看"),
      action: async (v) => {
        validateCredit(
          Number(v.p_quantity),
          adjustment ? "adjustment" : "purchase",
          v.p_note,
        );
        await mutate("record_session_credit_with_expiry", {
          p_id: request,
          p_member: memberId,
          p_kind: adjustment ? "adjustment" : "purchase",
          p_expiry: adjustment ? null : v.p_expiry || null,
          p_quantity: Number(v.p_quantity),
          p_note: v.p_note,
          p_amount: v.p_amount ? Number(v.p_amount) : null,
          p_currency: v.p_currency || "USD",
        });
      },
    });
  }
  function recordMonthly(memberId: string, online = false) {
    const request = crypto.randomUUID();
    const start = displayTime(new Date().toISOString(), zone, "yyyy-MM-dd");
    setDialog({
      title: online ? t("录入线上服务") : t("录入包月 · {0}", [name(memberId)]),
      description: online
        ? t("录入线上指导的有效期和金额，不增加线下课时，不发起付款。")
        : t(
            "按 {0} 记录有效期，含开始和结束日。有效期内不限次数；以后确认完成的课程按上课日期判断是否属于包月。不会回改已经扣课的流水，如有误请另作课时调整。不会发起支付。",
            [zone],
          ),
      fields: [
        {
          name: "p_start",
          label: t("开始日期"),
          type: "date",
          required: true,
          value: start,
        },
        {
          name: "p_end",
          label: t("结束日期（含当天）"),
          type: "date",
          required: true,
          value: defaultMonthlyEnd(start),
        },
        ...creditFields(memberId),
        {
          name: "p_note",
          label: online
            ? t("说明 / 原因（学员可见）")
            : t("包月说明（学员可见）"),
          type: "textarea",
          required: true,
        },
      ],
      submit: online ? t("确认入账") : t("确认录入包月"),
      success: online ? t("线上服务已录入") : t("包月已录入"),
      action: async (v) => {
        if (
          !v.p_start ||
          !v.p_end ||
          v.p_end < v.p_start ||
          (Date.parse(v.p_end) - Date.parse(v.p_start)) / 86400000 > 366
        )
          throw new Error(t("请选择有效日期，最长 366 天"));
        if (
          (online
            ? data.online_memberships || []
            : data.monthly_memberships
          ).some(
            (m) =>
              m.member_id === memberId &&
              !m.cancelled_at &&
              m.starts_on <= v.p_end &&
              m.ends_on >= v.p_start,
          )
        )
          throw new Error(t("有效期与已有包月重叠，请核对日期"));
        await mutate(
          online ? "record_online_membership" : "record_monthly_membership",
          {
            p_id: request,
            p_member: memberId,
            p_start: v.p_start,
            p_end: v.p_end,
            p_note: v.p_note,
            p_amount: v.p_amount ? Number(v.p_amount) : null,
            p_currency: v.p_currency,
          },
        );
      },
    });
  }
  function cancelMonthly(m: MonthlyMembership, online = false) {
    setDialog({
      title: online
        ? t("作废线上服务")
        : t("作废包月 · {0}", [name(m.member_id)]),
      description: online
        ? t("作废后保留原记录并结束线上服务，不自动退款。")
        : t(
            "{0} 至 {1}。作废后保留原始记录，不再覆盖之后确认完成的课程，也不会重算已完成课程或自动退款。录错可作废后重新录入。",
            [m.starts_on, m.ends_on],
          ),
      fields: [
        {
          name: "p_reason",
          label: t("作废原因（学员可见）"),
          type: "textarea",
          required: true,
        },
      ],
      submit: t("确认作废"),
      action: (v) =>
        mutate(
          online ? "cancel_online_membership" : "cancel_monthly_membership",
          {
            p_id: m.id,
            p_reason: v.p_reason,
          },
        ),
    });
  }
  function editMemberPrice(memberId: string) {
    const price = data.member_prices.find((p) => p.member_id === memberId);
    setDialog({
      title: t("设置 {0} 的专属价格", [name(memberId)]),
      description: t(
        "填写每个方案的总金额；单次为每节金额。留空表示未开放购买。线上服务与线下课时分开，保存不会发起收款。",
      ),
      submit: t("保存专属价格"),
      fields: [
        ...salePackages.map((k) => ({
          name: k,
          label: t(packageOptions[k].label),
          type: "number" as const,
          value: price?.[packageOptions[k].priceKey] ?? "",
          min: 0,
          max: 999999.99,
          step: 0.01,
        })),
        {
          name: "currency",
          label: t("币种"),
          type: "select",
          value: price?.currency || "USD",
          required: true,
          options: ["USD", "CNY", "CAD", "AUD", "EUR", "GBP"].map((v) => ({
            value: v,
            label: v,
          })),
        },
      ],
      action: (v) =>
        mutate("save_member_catalog_prices", {
          p_member: memberId,
          p_prices: Object.fromEntries(
            salePackages.map((k) => [k, v[k] === "" ? null : Number(v[k])]),
          ),
          p_currency: v.currency,
        }),
    });
  }
  function createInvite() {
    setDialog({
      title: t("生成专属邀请码"),
      description: t("可以限定注册邮箱，或创建允许多人使用的邀请码。"),
      fields: [
        { name: "p_email", label: t("限定邮箱（选填）"), type: "email" },
        {
          name: "p_max_uses",
          label: t("最多使用次数"),
          type: "number",
          value: 1,
          min: 1,
          max: 10000,
          step: 1,
          required: true,
        },
        {
          name: "p_days",
          label: t("有效天数"),
          type: "number",
          value: 30,
          min: 1,
          max: 365,
          step: 1,
          required: true,
        },
      ],
      submit: t("生成邀请码"),
      action: (v) =>
        mutate("create_invite", {
          p_email: v.p_email || null,
          p_max_uses: Number(v.p_max_uses),
          p_days: Number(v.p_days),
        }),
    });
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify(t("已复制"));
    } catch {
      setError(t("复制失败，请手动选择并复制。"));
    }
  }
  function exportReferrals() {
    const rows = [
      [t("推荐人"), t("新学员"), t("状态"), t("注册时间"), t("成功时间")],
      ...data.referrals
        .filter(
          (r) =>
            (coach || r.referrer_id === current?.id) &&
            (memberFilter === "all" || r.referrer_id === memberFilter) &&
            (filter === "all" || r.status === filter),
        )
        .map((r) => [
          name(r.referrer_id),
          coach ? name(r.referred_id) : t("新学员"),
          statusNames[r.status],
          r.created_at,
          r.confirmed_at || "",
        ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8;" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = t("Yvonne-Fitness-推荐记录.csv");
    a.click();
    URL.revokeObjectURL(url);
  }
  async function signOut() {
    if (demo) {
      setShowAuth(true);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase!.auth.signOut();
      if (error) throw error;
      setData(emptyData());
      setSession(null);
      setShowAuth(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function authSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) {
      setError(t("请先按部署说明连接 Supabase。演示模式不创建真实账号。"));
      return;
    }
    if (authSubmitting.current) return;
    authSubmitting.current = true;
    let navigating = false;
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    setAuthHint("");
    try {
      const email = String(f.email || "").trim(),
        password = String(f.password || "");
      if (
        (authMode === "register" || authMode === "password") &&
        password !== String(f.confirm_password || "")
      )
        throw new Error(t("两次输入的密码不一致"));
      if (authMode === "register") {
        if (!String(f.full_name || "").trim()) throw new Error(t("请填写姓名"));
        const { data: signup, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              full_name: String(f.full_name || "").trim(),
              language: preference,
              invite_code: String(f.invite_code || "").trim(),
              referral_code: String(f.referral_code || "").trim(),
            },
          },
        });
        if (error) throw error;
        rememberVerificationEmail(email);
        try {
          sessionStorage.setItem(
            "yvonne-verification-sent-at",
            String(Date.now()),
          );
        } catch {}
        navigating = true;
        window.location.replace(
          signup.session ? "/" : "/auth/verify?type=signup&sent=1",
        );
        return;
      }
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setShowAuth(false);
      }
      if (authMode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=recovery`,
        });
        if (error) throw error;
        rememberVerificationEmail(email);
        setAuthHint(
          t(
            "如果该邮箱已注册，你会收到密码重置邮件。请在下方输入邮件验证码；旧版链接仍可在当前浏览器打开。",
          ),
        );
      }
      if (authMode === "password") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setShowAuth(false);
        setAuthMode("login");
        notify(t("密码已更新"));
        window.history.replaceState({}, "", "/");
      }
    } catch (e) {
      const message = (e as Error).message;
      setError(
        message.includes("Database error")
          ? t(
              "注册未完成：请检查邀请码、绑定邮箱、有效期及剩余次数；仍失败时请教练检查数据库日志。",
            )
          : message === "Invalid login credentials"
            ? t("邮箱或密码不正确")
            : message,
      );
    } finally {
      if (!navigating) {
        authSubmitting.current = false;
        setBusy(false);
      }
    }
  }
  const flash = (
    <>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {t(toast)}
        </div>
      )}
      {error && !dialog && !showAuth && (demo || session) && (
        <div className="error-toast" role="alert">
          <span>{t(error)}</span>
          <button onClick={() => setError("")} aria-label={t("关闭提示")}>
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
  if (loading)
    return (
      <div className="loading">
        <Dumbbell size={38} />
        <p>{t("正在打开你的训练空间…")}</p>
        {flash}
      </div>
    );
  if ((!demo && !session) || showAuth) {
    const ref =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    return (
      <div className="auth-layout">
        <section className="auth-brand">
          <div className="brand">
            <span className="brand-symbol">
              <Dumbbell />
            </span>
            <span>
              Yvonne Fitness<small>PERSONAL TRAINING</small>
            </span>
          </div>
          <div>
            <span className="eyebrow">YOUR SPACE TO GROW</span>
            <h1>
              {t("每一次训练，")}
              <br />
              {t("更靠近自己。")}
            </h1>
            <p>
              {t("预约你的专属时间，跟随自己的节奏。")}
              <br />
              {t("与教练一起，把进步变成日常。")}
            </p>
            <div className="auth-line" />
            <span className="auth-caption">
              {t("专属计划 · 一对一训练 · 持续进步")}
            </span>
          </div>
          <p className="auth-foot">YVONNE FITNESS / MEMBER STUDIO</p>
        </section>
        <section className="auth-form">
          <div className="auth-box">
            <div className="auth-language">
              <LanguageSelect
                onChange={changeLanguage}
                disabled={languageBusy || busy}
              />
            </div>
            <span className="eyebrow">WELCOME TO YOUR STUDIO</span>
            <h2>
              {
                {
                  login: t("欢迎回来"),
                  register: t("开启你的训练旅程"),
                  reset: t("找回密码"),
                  password: t("设置新密码"),
                }[authMode]
              }
            </h2>
            <p className="muted">
              {authMode === "register"
                ? t("仅接受邀请注册。请输入教练邀请码或学员推荐码。")
                : t("你的训练安排，都在这里。")}
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {t(error)}
              </p>
            )}
            <form key={authMode} onSubmit={authSubmit}>
              {authMode === "register" && (
                <label className="field">
                  {t("姓名")}
                  <input
                    name="full_name"
                    required
                    maxLength={80}
                    autoComplete="name"
                  />
                </label>
              )}
              {authMode !== "password" && (
                <label className="field">
                  {t("邮箱")}
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                  />
                </label>
              )}
              {authMode !== "reset" && (
                <label className="field">
                  {t("密码")}
                  <input
                    name="password"
                    type="password"
                    minLength={8}
                    required
                    autoComplete={
                      authMode === "login" ? "current-password" : "new-password"
                    }
                    placeholder={t("至少 8 位字符")}
                  />
                </label>
              )}
              {(authMode === "register" || authMode === "password") && (
                <label className="field">
                  {t("确认密码")}
                  <input
                    name="confirm_password"
                    type="password"
                    minLength={8}
                    required
                    autoComplete="new-password"
                  />
                </label>
              )}
              {authMode === "register" && (
                <>
                  <label className="field">
                    {t("邀请码 / 学员推荐码")}
                    <input
                      name="invite_code"
                      required
                      defaultValue={ref.get("invite") || ref.get("ref") || ""}
                      maxLength={128}
                    />
                  </label>
                  <label className="field">
                    {t("推荐码（选填）")}
                    <input
                      name="referral_code"
                      defaultValue={ref.get("ref") || ""}
                      maxLength={128}
                    />
                    <small>
                      {t(
                        "使用教练邀请码注册时，可在这里另外填写推荐人的代码。",
                      )}
                    </small>
                  </label>
                </>
              )}
              <button className="btn full" disabled={busy}>
                {busy
                  ? t("请稍候…")
                  : {
                      login: t("登录"),
                      register: t("创建账号"),
                      reset: t("发送重置邮件"),
                      password: t("保存新密码"),
                    }[authMode]}
                <ArrowRight size={18} />
              </button>
            </form>
            {authHint && <p className="success-box">{t(authHint)}</p>}
            {authMode !== "password" && (
              <a
                className="btn secondary full verification-entry"
                href={
                  authMode === "reset"
                    ? "/auth/verify?type=recovery"
                    : "/auth/verify?type=signup"
                }
              >
                {t("已有邮件验证码？前往验证")}
              </a>
            )}
            <div className="auth-links">
              <button
                disabled={busy}
                onClick={() => {
                  changeAuthMode(
                    authMode === "register" ? "login" : "register",
                  );
                }}
              >
                {authMode === "register"
                  ? t("已有账号？登录")
                  : t("有邀请码？注册")}
              </button>
              {authMode === "login" && (
                <button disabled={busy} onClick={() => changeAuthMode("reset")}>
                  {t("忘记密码")}
                </button>
              )}
              {authMode === "reset" && (
                <button disabled={busy} onClick={() => changeAuthMode("login")}>
                  {t("返回登录")}
                </button>
              )}
            </div>
            {!configured && (
              <div className="setup-note">
                <strong>{t("外部平台尚未连接")}</strong>
                <p>
                  {t(
                    "可以先预览页面。真实注册、预约和邮件将在连接 Supabase 和 Resend 后启用。",
                  )}
                </p>
                <button
                  className="btn secondary full"
                  onClick={() => {
                    setDemo(true);
                    setShowAuth(false);
                  }}
                >
                  {t("查看网站演示")}
                </button>
              </div>
            )}
          </div>
        </section>
        {flash}
      </div>
    );
  }
  if (!current || !current.active)
    return (
      <div className="loading">
        <ShieldCheck size={36} />
        <h2>{current ? t("账号已停用") : t("无法读取个人资料")}</h2>
        <p>
          {current
            ? t("请联系教练恢复账号。")
            : loadError ||
              t("个人资料暂时不可用，请重新加载；仍有问题时联系教练。")}
        </p>
        {!current && (
          <button className="btn" disabled={busy} onClick={retryLoad}>
            {t("重新加载")}
          </button>
        )}
        <button className="btn secondary" disabled={busy} onClick={signOut}>
          {t("退出登录")}
        </button>
        {flash}
      </div>
    );
  const ownAppointments = data.appointments.filter(
    (b) => coach || b.member_id === current.id,
  );
  const upcoming = ownAppointments
    .filter((b) => bookingMatches(b, "upcoming", zone))
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
  const ownPlans = data.plans.filter(
    (p) =>
      coach ||
      (!p.deleted_at && p.member_id === current.id && p.status !== "draft"),
  );
  const ownRecords = data.records.filter(
    (r) => coach || (!r.deleted_at && r.member_id === current.id && r.shared),
  );
  const recordMatchesFilter = (r: RecordEntry) =>
    filter === "deleted"
      ? !!r.deleted_at
      : !r.deleted_at &&
        (filter === "all" || (filter === "published" ? r.shared : !r.shared));
  const visibleReferrals = data.referrals.filter(
    (r) => coach || r.referrer_id === current.id,
  );
  const next = upcoming[0];
  const todayBookings = ownAppointments
    .filter((b) => bookingMatches(b, "today", zone))
    .sort((a, b) => compareBookings(a, b));
  const pendingBookings = ownAppointments.filter((b) =>
    bookingMatches(b, "pending", zone),
  );
  const needsPlan = members.filter(
    (m) => m.active && memberNeeds(data, m.id).plan,
  );
  const needsPrice = members.filter(
    (m) => m.active && memberNeeds(data, m.id).price,
  );
  const visibleMembers = members.filter(
    (m) =>
      (filter === "needs-plan"
        ? needsPlan.some((p) => p.id === m.id)
        : filter === "needs-price"
          ? needsPrice.some((p) => p.id === m.id)
          : true) &&
      `${m.full_name} ${m.email}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const openBookings = (view: string) => {
    navigate("bookings");
    setFilter(view);
  };
  const openMembers = (view: string) => {
    navigate("members");
    setFilter(view);
  };
  const bookingCards = (
    items: Appointment[],
    emptyText = t("还没有课程安排"),
    showBookingAction = true,
  ) =>
    items.length ? (
      <div className="booking-list">
        <Paginated
          items={items}
          resetKey={[tab, filter, memberFilter, query, current.id]}
          label={t("预约")}
        >
          {(pageItems, pageOffset) =>
            pageItems.map((b) => (
              <article className="booking-row" key={b.id}>
                <div className="date-block">
                  <strong>{displayTime(b.slots.starts_at, zone, "dd")}</strong>
                  <span>
                    {displayTime(b.slots.starts_at, zone, "yyyy.MM EEE")}
                  </span>
                </div>
                <div className="booking-main">
                  <div className="row gap">
                    <h3>{coach ? name(b.member_id) : t("一对一私教训练")}</h3>
                    <Badge
                      value={
                        b.status === "booked" &&
                        Date.parse(b.slots.ends_at) <= Date.now()
                          ? t("待确认结果")
                          : b.status === "booked" &&
                              Date.parse(b.slots.starts_at) <= Date.now()
                            ? t("进行中")
                            : b.status
                      }
                    />
                  </div>
                  <p>
                    <Clock3 size={14} />
                    {displayTime(b.slots.starts_at, zone, "HH:mm")} –{" "}
                    {displayTime(b.slots.ends_at, zone, "HH:mm")}
                    <span className="separator">·</span>
                    {data.settings.location}
                  </p>
                  {b.message && (
                    <small>
                      {t("预约留言：")}
                      {b.message}
                    </small>
                  )}
                  {b.reason && (
                    <small>
                      {b.status === "no_show"
                        ? t("缺席备注：")
                        : t("最近变更原因：")}
                      {b.reason}
                    </small>
                  )}
                  {b.status === "no_show" && (
                    <small>
                      {data.session_entries.find(
                        (e) => e.appointment_id === b.id,
                      )?.note || t("已记录缺席")}{" "}
                      {t("· 不计入完成训练")}
                    </small>
                  )}
                </div>
                <div className="booking-actions">
                  {coach &&
                    members.some((m) => m.id === b.member_id && m.active) &&
                    b.status !== "cancelled" &&
                    b.status !== "no_show" &&
                    Date.parse(b.slots.starts_at) <= Date.now() && (
                      <button
                        className="btn secondary small"
                        onClick={() =>
                          editRecord(
                            undefined,
                            b.member_id,
                            displayTime(b.slots.starts_at, zone, "yyyy-MM-dd"),
                          )
                        }
                      >
                        {t("写记录")}
                      </button>
                    )}
                  {b.status === "booked" &&
                    (coach || new Date(b.slots.starts_at) > new Date()) && (
                      <>
                        <button
                          className="btn secondary small"
                          onClick={() => book(undefined, b)}
                        >
                          {t("改期")}
                        </button>
                        <button
                          className="text-btn muted"
                          onClick={() => cancelBooking(b)}
                        >
                          {t("取消")}
                        </button>
                      </>
                    )}
                  {coach &&
                    b.status === "booked" &&
                    new Date(b.slots.ends_at) <= new Date() && (
                      <button
                        className="btn small"
                        onClick={() =>
                          setDialog({
                            title: t("确认课程完成"),
                            description: `${name(b.member_id)} · ${displayTime(b.slots.starts_at, zone)}。${data.credits_ready ? (membershipForDate(data.monthly_memberships, b.member_id, displayTime(b.slots.starts_at, zone, "yyyy-MM-dd")) ? t("此课程在包月有效期内，确认后记录上课次数，不扣按次课时。") : t("确认后扣除 1 节按次课时，预计余额 {0} 节。余额不足也会记录完成，请核对是否遗漏购课。", [balanceAfterLesson(data, b)])) : t("课时账户尚未启用，本次仅记录课程完成。")}`,
                            fields: [],
                            submit: t("标记完成"),
                            action: () =>
                              mutate("manage_booking", {
                                p_action: "complete",
                                p_appointment: b.id,
                              }),
                          })
                        }
                      >
                        {t("标记完成")}
                      </button>
                    )}
                  {coach &&
                    data.credits_ready &&
                    b.status === "booked" &&
                    Date.parse(b.slots.ends_at) <= Date.now() && (
                      <button
                        className="btn secondary small"
                        onClick={() => markNoShow(b)}
                      >
                        {t("No show · 未到场")}
                      </button>
                    )}
                  <button
                    className="text-btn muted"
                    onClick={() => {
                      setDialog({
                        title: t("预约变更记录"),
                        readOnly: true,
                        description:
                          data.events
                            .filter((e) => e.appointment_id === b.id)
                            .sort((a, b) =>
                              a.created_at.localeCompare(b.created_at),
                            )
                            .map(
                              (e) =>
                                `${displayTime(e.created_at, zone)} · ${t(actionNames[e.action])} · ${e.actor_id === current.id ? t("我") : data.profiles.some((p) => p.id === e.actor_id) ? name(e.actor_id) : t("教练")}${e.details.old_start ? t(" · 原时间 ") + displayTime(e.details.old_start, zone) : ""}${e.details.new_start ? " → " + displayTime(e.details.new_start, zone) : ""}${e.message ? "\n" + e.message : ""}`,
                            )
                            .join("\n\n") || t("暂无变更记录"),
                        fields: [],
                        submit: t("关闭"),
                        action: async () => {},
                      });
                    }}
                  >
                    {t("详情")}
                  </button>
                </div>
              </article>
            ))
          }
        </Paginated>
      </div>
    ) : (
      <Empty
        text={emptyText}
        action={
          showBookingAction && (
            <button
              className="btn secondary"
              onClick={() => navigate("schedule")}
            >
              {t("查看可预约时间")}
              <ArrowRight size={16} />
            </button>
          )
        }
      />
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-symbol">
            <Dumbbell size={25} />
          </span>
          <span>
            {data.settings.studio_name}
            <small>PERSONAL TRAINING</small>
          </span>
        </a>
        <div className="workspace-label">
          {coach ? "COACH WORKSPACE" : "MEMBER WORKSPACE"}
        </div>
        <nav>
          {tabs
            .filter((t) => coach || t[0] !== "members")
            .map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => navigate(id)}
                className={tab === id ? "active" : ""}
              >
                <Icon size={19} />
                <span>{t(label)}</span>
                {id === "bookings" && upcoming.length > 0 && (
                  <b>{upcoming.length}</b>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={20} />
            <p>
              {t("专属的训练空间")}
              <small>
                {coach
                  ? t("每一位学员，都值得被认真对待。")
                  : t("你的计划与档案，仅你和教练可见。")}
              </small>
            </p>
          </div>
          <button className="user-button" onClick={() => navigate("settings")}>
            <Avatar name={current.full_name} />
            <span>
              {current.full_name}
              <small>{coach ? t("主教练 / 管理员") : t("会员")}</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="backdrop"
          aria-label={t("收起菜单")}
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="row gap">
            <button
              className="icon-btn mobile-menu"
              aria-label={menu ? t("关闭菜单") : t("打开菜单")}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              {t("我的工作室")}
              <ChevronRight size={14} />
              <strong>
                {tab === "member"
                  ? t("学员看板")
                  : t(tabs.find((item) => item[0] === tab)?.[1])}
              </strong>
            </span>
          </div>
          <div className="row gap">
            {!coach && (
              <LanguageSelect
                onChange={changeLanguage}
                disabled={languageBusy || busy}
              />
            )}
            <span className="time-zone">
              {zone === "America/Los_Angeles" ? t("美西时间") : zone}
            </span>
            <button
              className="icon-btn"
              aria-label={t("通知设置")}
              onClick={() => navigate("settings")}
            >
              <Bell size={19} />
            </button>
            <button
              className="icon-btn"
              aria-label={t("退出登录")}
              disabled={busy}
              onClick={signOut}
            >
              <LogOut size={19} />
            </button>
            <Avatar name={current.full_name} />
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <strong>{t("演示预览")}</strong>{" "}
              {t("· 示例数据，刷新后恢复；尚未连接真实账号和邮件。")}
            </span>
            <button
              onClick={() => {
                setDemoRole(demoRole === "coach" ? "member" : "coach");
                navigate("overview");
              }}
            >
              {t("切换到")}
              {coach ? t("学员") : t("教练")}
              {t("端")}
              <ArrowRight size={14} />
            </button>
          </div>
        )}
        <main>
          {loadError && (
            <div className="reload-notice" role="status">
              <p>{t(loadError)}</p>
              <button
                className="btn secondary small"
                disabled={busy}
                onClick={retryLoad}
              >
                {t("重新加载")}
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {displayTime(new Date().toISOString(), zone, "yyyy / MM / dd")}{" "}
                · {coach ? "COACH STUDIO" : "MY TRAINING"}
              </span>
              <h1>
                {tab === "overview"
                  ? t("{0}，今天也要向前一步。", [current.full_name])
                  : tab === "member"
                    ? t("学员看板")
                    : t(tabs.find((item) => item[0] === tab)?.[1])}
              </h1>
              <p>
                {
                  (
                    {
                      overview: coach
                        ? t("把时间留给训练，把日常安排交给这里。")
                        : t("你的下一次训练、专属计划和每一点进步。"),
                      schedule: t("找到合适的时间，为下一次进步留出位置。"),
                      bookings: t("查看课程安排，轻松处理预约与变更。"),
                      credits: coach
                        ? t("掌握每位学员的余课、包月期限和上课历史。")
                        : t("查看剩余课时、上课统计及每笔增减明细。"),
                      members: t("了解每一位学员，让训练更有针对性。"),
                      plans: t("有方向地练习，有节奏地进步。"),
                      records: t("记录身体变化，也记录每一步成长。"),
                      referrals: t("和信任的人一起，把训练变成生活的一部分。"),
                      packages: t("选择适合自己的训练节奏。"),
                      settings: t("让你的训练空间，更适合你。"),
                    } as Record<string, string>
                  )[tab]
                }
              </p>
            </div>
            <div className="heading-action">
              {["overview", "bookings"].includes(tab) && (
                <button className="btn" onClick={() => book()}>
                  <Plus size={18} />
                  {coach ? t("添加预约") : t("预约训练")}
                </button>
              )}
              {tab === "schedule" && coach && (
                <button className="btn" onClick={addSlot}>
                  <Plus size={18} />
                  {t("开放时段")}
                </button>
              )}
              {tab === "members" && (
                <button
                  className="btn"
                  onClick={() => {
                    navigate("referrals");
                    createInvite();
                  }}
                >
                  <Plus size={18} />
                  {t("邀请学员")}
                </button>
              )}
              {tab === "plans" && coach && (
                <button className="btn" onClick={() => editPlan()}>
                  <Plus size={18} />
                  {t("新建计划")}
                </button>
              )}
              {tab === "records" && coach && (
                <button className="btn" onClick={() => editRecord()}>
                  <Plus size={18} />
                  {t("添加记录")}
                </button>
              )}
              {tab === "referrals" && coach && (
                <button className="btn" onClick={createInvite}>
                  <Plus size={18} />
                  {t("生成邀请码")}
                </button>
              )}
            </div>
          </div>
          {tab === "overview" && (
            <>
              <div className="account-overview notice">
                <div>
                  <strong>
                    {coach
                      ? t("课时账户与上课统计")
                      : data.credits_ready
                        ? t("剩余按次课时：{0} 节", [
                            memberSessionStats(data, current.id).balance,
                          ])
                        : t("课时账户待启用")}
                  </strong>
                  <p>
                    {coach
                      ? t("录入购课、查看余课和历史；已预约与已扣课分开计算。")
                      : data.credits_ready &&
                          memberSessionStats(data, current.id).membership
                        ? t("包月有效至 {0}，有效期内不限次数。", [
                            memberSessionStats(data, current.id).membership!
                              .ends_on,
                          ])
                        : t("完成或未到场各扣 1 节，预约和改期不提前扣除。")}
                  </p>
                </div>
                <button
                  className="btn secondary small"
                  onClick={() => navigate("credits")}
                >
                  {coach ? t("管理课时") : t("查看课时明细")}
                </button>
              </div>
              {!coach && memberSessionStats(data, current.id).online && (
                <div className="notice">
                  <p>
                    {t("线上指导有效至 {0}，不包含线下课程。", [
                      memberSessionStats(data, current.id).online!.ends_on,
                    ])}
                  </p>
                  <button
                    className="text-btn"
                    onClick={() => navigate("credits")}
                  >
                    {t("查看明细")}
                  </button>
                </div>
              )}
              {coach && (
                <section className="work-queue" aria-label={t("待办事项")}>
                  <button onClick={() => openBookings("pending")}>
                    <strong>{pendingBookings.length}</strong>
                    <span>
                      {t("课程待确认结果")}
                      <small>{t("课后标记完成或未到场")}</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => openMembers("needs-plan")}>
                    <strong>{needsPlan.length}</strong>
                    <span>
                      {t("学员待制定计划")}
                      <small>{t("仅统计在训学员")}</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => openMembers("needs-price")}>
                    <strong>{needsPrice.length}</strong>
                    <span>
                      {t("学员待设置价格")}
                      <small>{t("金额仅对应学员可见")}</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                </section>
              )}
              <div className="dashboard-grid">
                <section className="panel schedule-panel">
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">UP NEXT</span>
                      <h2>
                        {coach
                          ? todayBookings.length
                            ? t("今天的训练")
                            : t("接下来的训练")
                          : next &&
                              Date.parse(next.slots.starts_at) <= Date.now()
                            ? t("正在进行的训练")
                            : t("你的下一次训练")}
                      </h2>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => openBookings("all")}
                    >
                      {t("全部预约")}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  {bookingCards(
                    coach
                      ? (todayBookings.length ? todayBookings : upcoming).slice(
                          0,
                          3,
                        )
                      : upcoming.slice(0, 1),
                    coach
                      ? t("暂无接下来的训练，可为学员添加预约")
                      : t("你还没有预约，选择时间即可安排下一次训练"),
                  )}
                  {coach && todayBookings.length > 3 && (
                    <button
                      className="text-btn agenda-more"
                      onClick={() => openBookings("today")}
                    >
                      {t("查看今天全部")}
                      {todayBookings.length} {t("节课程")}{" "}
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {!coach && next && (
                    <p className="session-guidance">
                      {displayTime(
                        next.slots.starts_at,
                        zone,
                        t("yyyy年MM月dd日 EEEE"),
                      )}{" "}
                      · {data.settings.location || t("训练地点请与教练确认")}
                      <br />
                      {Date.parse(next.slots.starts_at) > Date.now()
                        ? t("需要调整时，可直接使用上方的改期或取消按钮。")
                        : t("课程已开始，如需调整请联系教练。")}
                    </p>
                  )}
                  <div className="panel-bottom">
                    <span>
                      <Clock3 size={15} />
                      {t("所有时间均以")}
                      {zone === "America/Los_Angeles" ? t("美西时区") : zone}
                      {t("显示")}
                    </span>
                    <button
                      className="text-btn"
                      onClick={() => navigate("schedule")}
                    >
                      {t("查看时间表")}
                    </button>
                  </div>
                </section>
                <section className="focus-card">
                  <span className="eyebrow">
                    {coach ? "QUICK ACTIONS" : "YOUR CURRENT PLAN"}
                  </span>
                  <div className="focus-icon">
                    <Dumbbell size={42} />
                  </div>
                  <h2>
                    {coach
                      ? t("常用操作")
                      : ownPlans.find((p) => p.status === "published")?.title ||
                        t("训练计划准备中")}
                  </h2>
                  <p>
                    {coach
                      ? t("开放时间、记录训练，都可以从这里开始。")
                      : ownPlans.some((p) => p.status === "published")
                        ? t(
                            "这是教练当前为你安排的计划，点击查看完整训练内容。",
                          )
                        : t("教练发布后会显示在这里，你无需进行额外操作。")}
                  </p>
                  <button onClick={() => navigate("plans")}>
                    {coach ? t("管理训练计划") : t("查看训练计划")}{" "}
                    <ArrowRight size={18} />
                  </button>
                  {coach && (
                    <div className="quick-actions">
                      <button onClick={addSlot}>
                        {t("开放时间")}
                        <Plus size={17} />
                      </button>
                      <button onClick={() => editRecord()}>
                        {t("添加训练记录")}
                        <Plus size={17} />
                      </button>
                    </div>
                  )}
                </section>
              </div>
              <div className="stats-grid">
                {[
                  {
                    label: coach ? t("在训学员") : t("已完成训练"),
                    value: coach
                      ? members.filter((m) => m.active).length
                      : ownAppointments.filter((a) => a.status === "completed")
                          .length,
                    unit: coach ? t("位") : t("次"),
                    icon: Users,
                    note: coach
                      ? t("持续陪伴每一份改变")
                      : t("坚持，都有迹可循"),
                  },
                  {
                    label: t("接下来的训练"),
                    value: upcoming.length,
                    unit: t("节"),
                    icon: CalendarDays,
                    note: t("包含正在进行中的课程"),
                  },
                  {
                    label: coach ? t("已发布计划") : t("当前训练计划"),
                    value: ownPlans.filter(
                      (p) => !p.deleted_at && p.status === "published",
                    ).length,
                    unit: t("份"),
                    icon: Dumbbell,
                    note: t("专属安排，循序渐进"),
                  },
                  {
                    label: t("成功推荐"),
                    value: visibleReferrals.filter(
                      (r) => r.status === "confirmed",
                    ).length,
                    unit: t("人"),
                    icon: Ticket,
                    note: t("完成邮箱验证的新学员"),
                  },
                ].map((s, i) => (
                  <div className={`stat-card stat-${i}`} key={s.label}>
                    <div className="row between">
                      <span>{s.label}</span>
                      <s.icon size={20} />
                    </div>
                    <div className="stat-value">
                      {s.value}
                      <small>
                        {language === "en" && s.value === 1
                          ? s.unit
                              .replace("sessions", "session")
                              .replace("plans", "plan")
                              .replace("people", "person")
                          : s.unit}
                      </small>
                    </div>
                    <p>{s.note}</p>
                  </div>
                ))}
              </div>
              <div className="dashboard-lower">
                <section className="panel">
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">
                        {coach ? "MEMBER MOMENTS" : "YOUR NEXT SESSION"}
                      </span>
                      <h2>{coach ? t("学员近况") : t("训练准备")}</h2>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => navigate(coach ? "members" : "records")}
                    >
                      {coach ? t("学员管理") : t("查看档案")}{" "}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  {coach ? (
                    <div className="mini-members">
                      {members
                        .filter((m) => m.active)
                        .slice(0, 4)
                        .map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              navigate("member");
                              setMemberFilter(m.id);
                            }}
                          >
                            <Avatar name={m.full_name} />
                            <span>
                              <strong>{m.full_name}</strong>
                              <small>
                                {data.plans.find(
                                  (p) =>
                                    p.member_id === m.id &&
                                    !p.deleted_at &&
                                    p.status === "published",
                                )?.title || t("尚未指定训练计划")}
                              </small>
                            </span>
                            <ChevronRight size={17} />
                          </button>
                        ))}
                      {!members.length && (
                        <Empty text={t("生成邀请码，迎接第一位学员")} />
                      )}
                    </div>
                  ) : (
                    <div className="prep">
                      <p>
                        <CheckCircle2 size={18} />{" "}
                        {next
                          ? t("{0} · 记得预留出行时间", [
                              displayTime(next.slots.starts_at, zone),
                            ])
                          : t("选择一个适合自己的训练时间")}
                      </p>
                      <p>
                        <CheckCircle2 size={18} />{" "}
                        {t("穿着舒适的运动服，带好水杯")}
                      </p>
                      <p>
                        <CheckCircle2 size={18} />{" "}
                        {t("身体状态有变化时，提前告诉教练")}
                      </p>
                    </div>
                  )}
                </section>
                <section className="referral-mini">
                  <div className="row gap">
                    <span className="small-icon">
                      <Ticket />
                    </span>
                    <h3>{t("把好的改变，分享出去。")}</h3>
                  </div>
                  <p>
                    {coach
                      ? t("查看学员推荐记录，让每一份信任都被看见。")
                      : t("分享你的专属推荐码，邀请朋友一起开始训练。")}
                  </p>
                  <button
                    className="text-btn"
                    onClick={() => navigate("referrals")}
                  >
                    {coach ? t("查看推荐记录") : t("查看我的推荐码")}
                    <ArrowRight size={17} />
                  </button>
                </section>
              </div>
            </>
          )}
          {tab === "schedule" &&
            (() => {
              const days = scheduleDays(zone, week);
              const available = availableBookingSlots(data.slots).filter((s) =>
                days.includes(displayTime(s.starts_at, zone, "yyyy-MM-dd")),
              );
              return (
                <section className="panel calendar-panel">
                  <div className="section-head">
                    <div>
                      <h2>
                        {days[0].replaceAll("-", ".")} —{" "}
                        {days[6].slice(5).replace("-", ".")}
                      </h2>
                      <p className="muted">
                        {zone}{" "}
                        {coach
                          ? "· 可为同行学员安排同一时段"
                          : t("· 每个时段仅接受一位学员")}
                      </p>
                    </div>
                    <div className="row gap">
                      <button
                        className="icon-btn bordered"
                        aria-label={t("上一周")}
                        disabled={week === 0}
                        onClick={() => setWeek(Math.max(0, week - 1))}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        className="btn secondary small"
                        onClick={() => setWeek(0)}
                      >
                        {t("回到今天")}
                      </button>
                      <button
                        className="icon-btn bordered"
                        aria-label={t("下一周")}
                        onClick={() => setWeek(week + 1)}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                  {!coach ? (
                    <div className="available-agenda">
                      <p className="muted">
                        {t(
                          "只显示可以预约的时间。选择时段后，还可以给教练留言。",
                        )}
                      </p>
                      {days.map((day) => {
                        const slots = available.filter(
                          (s) =>
                            displayTime(s.starts_at, zone, "yyyy-MM-dd") ===
                            day,
                        );
                        if (!slots.length) return null;
                        return (
                          <section className="agenda-day" key={day}>
                            <h3>
                              {displayTime(
                                localToISO(day + "T12:00", zone),
                                zone,
                                t("MM月dd日 EEEE"),
                              )}
                              <small>
                                {day === scheduleDays(zone, 0)[0]
                                  ? t("今天 · ")
                                  : ""}
                                {slots.length} {t("个可选时段")}
                              </small>
                            </h3>
                            <div className="agenda-times">
                              {slots.map((s) => (
                                <button
                                  className="btn secondary"
                                  key={s.id}
                                  onClick={() => book(s)}
                                  aria-label={t("预约 {0} 至 {1}", [
                                    displayTime(s.starts_at, zone),
                                    displayTime(s.ends_at, zone, "HH:mm"),
                                  ])}
                                >
                                  <Clock3 size={16} />
                                  {displayTime(
                                    s.starts_at,
                                    zone,
                                    "HH:mm",
                                  )} – {displayTime(s.ends_at, zone, "HH:mm")}
                                </button>
                              ))}
                            </div>
                          </section>
                        );
                      })}
                      {!available.length && (
                        <Empty
                          text={t(
                            "这 7 天暂无可预约时段。可以查看下一周，或联系教练开放时间。",
                          )}
                          action={
                            <button
                              className="btn secondary"
                              onClick={() => setWeek(week + 1)}
                            >
                              {t("查看下一周")}
                              <ArrowRight size={16} />
                            </button>
                          }
                        />
                      )}
                    </div>
                  ) : (
                    <div className="calendar-grid coach-calendar">
                      {days.map((day) => (
                        <div className="calendar-day" key={day}>
                          <div className="day-heading">
                            <span>
                              {displayTime(
                                localToISO(day + "T12:00", zone),
                                zone,
                                "EEE",
                              )}
                            </span>
                            <strong>{day.slice(8)}</strong>
                          </div>
                          {data.slots
                            .filter(
                              (s) =>
                                displayTime(s.starts_at, zone, "yyyy-MM-dd") ===
                                day,
                            )
                            .sort(
                              (a, b) =>
                                Date.parse(a.starts_at) -
                                Date.parse(b.starts_at),
                            )
                            .map((s) => (
                              <div
                                className={`slot ${s.available ? "available" : "taken"}`}
                                key={s.id}
                              >
                                <span>
                                  {displayTime(s.starts_at, zone, "HH:mm")} –{" "}
                                  {displayTime(s.ends_at, zone, "HH:mm")}
                                </span>
                                <strong>
                                  {s.available ? t("可预约") : t("已预约")}
                                </strong>
                                {coach && !s.available && (
                                  <ul
                                    className="slot-members"
                                    aria-label="已预约学员"
                                  >
                                    {data.appointments
                                      .filter(
                                        (appointment) =>
                                          appointment.slot_id === s.id &&
                                          appointment.status !== "cancelled",
                                      )
                                      .map((appointment) => (
                                        <li key={appointment.id}>
                                          {name(appointment.member_id)}
                                        </li>
                                      ))}
                                  </ul>
                                )}
                                {(coach || s.available) && (
                                  <button onClick={() => book(s)}>
                                    {coach
                                      ? s.available
                                        ? t("代预约")
                                        : "添加同行学员"
                                      : t("预约")}{" "}
                                    <Plus size={13} />
                                  </button>
                                )}
                                {coach && s.available && (
                                  <button
                                    className="slot-remove"
                                    onClick={() =>
                                      setDialog({
                                        title: t("关闭此时段"),
                                        description: displayTime(
                                          s.starts_at,
                                          zone,
                                        ),
                                        fields: [],
                                        submit: t("关闭时段"),
                                        action: () =>
                                          mutate("save_slot", { p_id: s.id }),
                                      })
                                    }
                                  >
                                    {t("关闭时段")}
                                  </button>
                                )}
                              </div>
                            ))}
                          {!data.slots.some(
                            (s) =>
                              displayTime(s.starts_at, zone, "yyyy-MM-dd") ===
                              day,
                          ) && (
                            <span className="no-slot">{t("暂无开放时段")}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="panel-bottom">
                    <span>{t("预约后可在「课程预约」中改期或取消。")}</span>
                    {coach && (
                      <button className="text-btn" onClick={addSlot}>
                        <Plus size={15} />
                        {t("开放时间")}
                      </button>
                    )}
                  </div>
                </section>
              );
            })()}
          {tab === "bookings" && (
            <section className="panel">
              <div className="toolbar">
                <div className="segmented">
                  {[
                    ["upcoming", t("接下来")],
                    ["today", t("今天")],
                    ...(coach ? [["pending", t("待确认结果")]] : []),
                    ["all", t("全部")],
                    ["completed", t("已完成")],
                    ["no_show", t("未到场")],
                    ["cancelled", t("已取消")],
                  ].map(([id, label]) => (
                    <button
                      className={filter === id ? "active" : ""}
                      onClick={() => setFilter(id)}
                      key={id}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
                {coach && (
                  <label className="search">
                    <Search size={17} />
                    <input
                      placeholder={t("搜索学员")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                )}
              </div>
              {coach && (
                <p className="reload-notice">
                  {t(
                    "课程结束后，在「待确认结果」中标记完成或 No show。预约成功即已排课，无需额外确认；预约和改期不扣课。",
                  )}
                  <button
                    className="text-btn"
                    onClick={() => setFilter("pending")}
                  >
                    {t("去标记课程结果")}
                  </button>
                </p>
              )}
              {bookingCards(
                ownAppointments
                  .filter(
                    (b) =>
                      (memberFilter === "all" ||
                        b.member_id === memberFilter) &&
                      bookingMatches(b, filter, zone) &&
                      name(b.member_id)
                        .toLowerCase()
                        .includes(query.trim().toLowerCase()),
                  )
                  .sort((a, b) => compareBookings(a, b)),
                filter === "pending"
                  ? t("没有待确认结果的课程")
                  : filter === "today"
                    ? t("今天没有符合条件的课程")
                    : query
                      ? t("没有找到这位学员的预约")
                      : filter === "upcoming"
                        ? t("暂无接下来的训练")
                        : t("当前筛选下没有预约"),
                filter === "upcoming" && !query.trim(),
              )}
            </section>
          )}
          {tab === "member" && coach && (
            <MemberDashboard
              data={data}
              memberId={memberFilter}
              onOpen={(next) => {
                navigate(next);
                setMemberFilter(memberFilter);
              }}
              onBook={() => book(undefined, undefined, memberFilter)}
              onPlan={() => editPlan(undefined, memberFilter)}
              onRecord={() => editRecord(undefined, memberFilter)}
              bookings={(items) => bookingCards(items, t("暂无课程"), false)}
            />
          )}
          {tab === "members" && coach && (
            <section className="panel">
              <div className="toolbar">
                <h2>
                  {filter === "needs-plan"
                    ? t("待制定计划")
                    : filter === "needs-price"
                      ? t("待设置价格")
                      : t("学员列表")}{" "}
                  <span className="count">{visibleMembers.length}</span>
                </h2>
                <select
                  aria-label={t("筛选待办学员")}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">{t("全部学员")}</option>
                  <option value="needs-plan">
                    {t("待制定计划（")}
                    {needsPlan.length}）
                  </option>
                  <option value="needs-price">
                    {t("待设置价格（")}
                    {needsPrice.length}）
                  </option>
                </select>
                <label className="search">
                  <Search size={17} />
                  <input
                    placeholder={t("搜索姓名或邮箱")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("学员")}</th>
                      <th>{t("当前计划")}</th>
                      <th>{t("课程 / 完成")}</th>
                      <th>{t("成功推荐")}</th>
                      <th>{t("状态")}</th>
                      <th>{t("管理")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <Paginated
                      items={visibleMembers}
                      resetKey={[tab, filter, memberFilter, query, current.id]}
                      label={t("学员")}
                      tableColumns={6}
                    >
                      {(pageItems, pageOffset) =>
                        pageItems.map((m) => (
                          <tr key={m.id}>
                            <td>
                              <div className="row gap">
                                <Avatar name={m.full_name} />
                                <div>
                                  <button
                                    className="text-btn"
                                    onClick={() => {
                                      navigate("member");
                                      setMemberFilter(m.id);
                                    }}
                                  >
                                    {m.full_name}
                                  </button>
                                  <small>{m.email}</small>
                                  <small>{m.phone || t("未填写电话")}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              {data.plans.find(
                                (p) =>
                                  p.member_id === m.id &&
                                  !p.deleted_at &&
                                  p.status === "published",
                              )?.title || t("尚未指定")}
                              <small>{m.goals}</small>
                            </td>
                            <td>
                              {
                                data.appointments.filter(
                                  (a) =>
                                    a.member_id === m.id &&
                                    a.status === "booked",
                                ).length
                              }{" "}
                              /{" "}
                              {
                                data.appointments.filter(
                                  (a) =>
                                    a.member_id === m.id &&
                                    a.status === "completed",
                                ).length
                              }
                            </td>
                            <td>
                              {
                                data.referrals.filter(
                                  (r) =>
                                    r.referrer_id === m.id &&
                                    r.status === "confirmed",
                                ).length
                              }{" "}
                              {t("人")}
                            </td>
                            <td>
                              <span
                                className={`badge ${m.active ? "confirmed" : "cancelled"}`}
                              >
                                {m.active ? t("在训") : t("已停用")}
                              </span>
                            </td>
                            <td>
                              <div className="row wrap gap">
                                <button
                                  className="text-btn"
                                  onClick={() => {
                                    navigate("credits");
                                    setMemberFilter(m.id);
                                  }}
                                >
                                  {t("课时")}
                                </button>
                                {m.active && (
                                  <button
                                    className="text-btn"
                                    onClick={() =>
                                      book(undefined, undefined, m.id)
                                    }
                                  >
                                    {t("预约")}
                                  </button>
                                )}
                                <button
                                  className="text-btn"
                                  onClick={() => {
                                    navigate("records");
                                    setMemberFilter(m.id);
                                  }}
                                >
                                  {t("档案")}
                                </button>
                                <button
                                  className="text-btn"
                                  onClick={() => {
                                    if (memberNeeds(data, m.id).plan)
                                      editPlan(
                                        data.plans.find(
                                          (p) =>
                                            !p.deleted_at &&
                                            p.member_id === m.id &&
                                            p.status === "draft",
                                        ),
                                        m.id,
                                      );
                                    else {
                                      navigate("plans");
                                      setMemberFilter(m.id);
                                    }
                                  }}
                                >
                                  {memberNeeds(data, m.id).plan
                                    ? t("制定计划")
                                    : t("查看计划")}
                                </button>
                                <button
                                  className="text-btn"
                                  onClick={() => editMemberPrice(m.id)}
                                >
                                  {t("专属价格")}
                                </button>
                                <button
                                  className="text-btn muted"
                                  onClick={() =>
                                    setDialog({
                                      title: m.active
                                        ? t("停用学员账号")
                                        : t("恢复学员账号"),
                                      description: t(
                                        "{0}：停用后无法读取训练资料或操作预约。已有预约仍保留，可由教练处理。",
                                        [m.full_name],
                                      ),
                                      fields: [],
                                      submit: t("确认"),
                                      action: () =>
                                        mutate("set_member_active", {
                                          p_id: m.id,
                                          p_active: !m.active,
                                        }),
                                    })
                                  }
                                >
                                  {m.active ? t("停用") : t("恢复")}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      }
                    </Paginated>
                  </tbody>
                </table>
              </div>
              {!members.length && (
                <Empty text={t("还没有学员，先生成一个邀请码")} />
              )}
              {!!members.length && !visibleMembers.length && (
                <Empty
                  text={
                    query
                      ? t("没有符合搜索条件的学员")
                      : t("这项待办已全部处理完成")
                  }
                />
              )}
            </section>
          )}
          {tab === "plans" && (
            <>
              {coach && (
                <p className="reload-notice">
                  {t(
                    "发布同一学员的新计划后，原当前计划自动转为历史计划。不会因时间自动过期；草稿仅教练可见。",
                  )}
                </p>
              )}
              <div className="toolbar outside">
                <div className="segmented">
                  {[
                    ["all", t("全部计划")],
                    ["published", t("当前计划")],
                    ["archived", t("历史计划")],
                    ...(coach
                      ? [
                          ["draft", t("草稿")],
                          ["deleted", t("已删除")],
                        ]
                      : []),
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setFilter(id)}
                      className={filter === id ? "active" : ""}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
                {coach && (
                  <select
                    aria-label={t("按学员筛选计划")}
                    value={memberFilter}
                    onChange={(e) => setMemberFilter(e.target.value)}
                  >
                    <option value="all">{t("全部学员")}</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="plan-grid">
                <Paginated
                  items={ownPlans.filter(
                    (p) =>
                      (filter === "deleted"
                        ? !!p.deleted_at
                        : !p.deleted_at &&
                          (filter === "all" || p.status === filter)) &&
                      (memberFilter === "all" || p.member_id === memberFilter),
                  )}
                  resetKey={[tab, filter, memberFilter, query, current.id]}
                  label={t("训练计划")}
                >
                  {(pageItems, pageOffset) =>
                    pageItems.map((p) => (
                      <article className="panel plan-card" key={p.id}>
                        <div className="row between">
                          <span className="small-icon">
                            <Dumbbell />
                          </span>
                          <Badge
                            value={p.deleted_at ? t("已删除") : p.status}
                          />
                        </div>
                        <h2>{p.title}</h2>
                        <p className="muted">
                          {name(p.member_id)} ·{" "}
                          {displayTime(p.created_at, zone, "yyyy.MM.dd")}
                        </p>
                        <pre className="plan-content">{p.content}</pre>
                        <div className="plan-footer">
                          <span>
                            <ShieldCheck size={14} />
                            {p.deleted_at || p.status === "draft"
                              ? t("仅教练可见")
                              : t("专属计划 · 仅指定学员可见")}
                          </span>
                          {coach && (
                            <div className="row gap wrap">
                              {!p.deleted_at && (
                                <button
                                  className="text-btn"
                                  onClick={() => editPlan(p)}
                                >
                                  {t("编辑计划")}
                                </button>
                              )}
                              <button
                                className="text-btn"
                                onClick={() =>
                                  setTrainingDeleted(
                                    "plan",
                                    p.id,
                                    !p.deleted_at,
                                  )
                                }
                              >
                                {p.deleted_at ? t("恢复为草稿") : t("删除")}
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    ))
                  }
                </Paginated>
              </div>
              {!ownPlans.some(
                (p) =>
                  (filter === "deleted"
                    ? !!p.deleted_at
                    : !p.deleted_at &&
                      (filter === "all" || p.status === filter)) &&
                  (memberFilter === "all" || p.member_id === memberFilter),
              ) && (
                <div className="panel">
                  <Empty
                    text={
                      !coach && filter === "published"
                        ? t(
                            "教练尚未发布当前计划，发布后会自动显示在这里。之前的计划可在「历史计划」查看。",
                          )
                        : filter !== "all" || memberFilter !== "all"
                          ? t("当前筛选下没有训练计划")
                          : coach
                            ? t("还没有训练计划，为学员制定第一份计划吧")
                            : t("教练发布计划后，你会在这里看到")
                    }
                  />
                </div>
              )}
            </>
          )}
          {tab === "records" && (
            <>
              <div className="toolbar outside">
                <p className="muted">
                  {coach
                    ? t("草稿仅你可见；发布后只有对应学员可见。")
                    : t("以下为教练发布给你的训练记录。")}
                </p>
                {coach && (
                  <select
                    aria-label={t("按学员筛选档案")}
                    value={memberFilter}
                    onChange={(e) => setMemberFilter(e.target.value)}
                  >
                    <option value="all">{t("全部学员")}</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {coach && (
                <div className="segmented spaced">
                  {[
                    ["all", t("全部档案")],
                    ["draft", t("草稿")],
                    ["published", t("已发布")],
                    ["deleted", t("已删除")],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={filter === value ? "active" : ""}
                      onClick={() => setFilter(value)}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
              )}
              <div className="records-list">
                <Paginated
                  items={ownRecords
                    .filter(
                      (r) =>
                        (memberFilter === "all" ||
                          r.member_id === memberFilter) &&
                        recordMatchesFilter(r),
                    )
                    .sort((a, b) => b.recorded_on.localeCompare(a.recorded_on))}
                  resetKey={[tab, filter, memberFilter, query, current.id]}
                  label={t("训练档案")}
                >
                  {(pageItems, pageOffset) =>
                    pageItems.map((r) => (
                      <article className="panel record-card" key={r.id}>
                        <div className="record-side">
                          <span className="eyebrow">{r.recorded_on}</span>
                          <h2>{name(r.member_id)}</h2>
                          <span
                            className={`badge ${r.shared ? "confirmed" : "draft"}`}
                          >
                            {r.deleted_at
                              ? t("已删除")
                              : r.shared
                                ? t("已发布")
                                : t("草稿 · 仅教练")}
                          </span>
                        </div>
                        <div className="record-body">
                          <div className="record-metrics">
                            <div>
                              <span>{t("体重")}</span>
                              <strong>
                                {kgToLb(r.weight) ?? "—"}
                                <small>lb</small>
                              </strong>
                            </div>
                            <div>
                              <span>{t("体脂率")}</span>
                              <strong>
                                {r.body_fat ?? "—"}
                                <small>%</small>
                              </strong>
                            </div>
                            {measurementFields
                              .filter((f) => r.measurements?.[f.key] != null)
                              .map((f) => (
                                <div key={f.key}>
                                  <span>{t(f.label)}</span>
                                  <strong>
                                    {r.measurements![f.key]}
                                    <small>{t(f.unit)}</small>
                                  </strong>
                                </div>
                              ))}
                          </div>
                          <p className="pre-wrap">
                            {r.notes || t("本次未填写备注。")}
                          </p>
                        </div>
                        {coach && (
                          <div className="row gap wrap">
                            {!r.deleted_at && (
                              <button
                                className="text-btn"
                                onClick={() => editRecord(r)}
                              >
                                {t("编辑")}
                              </button>
                            )}
                            <button
                              className="text-btn"
                              onClick={() =>
                                setTrainingDeleted(
                                  "record",
                                  r.id,
                                  !r.deleted_at,
                                )
                              }
                            >
                              {r.deleted_at ? t("恢复为草稿") : t("删除")}
                            </button>
                          </div>
                        )}
                      </article>
                    ))
                  }
                </Paginated>
              </div>
              {!ownRecords.some(
                (r) =>
                  (memberFilter === "all" || r.member_id === memberFilter) &&
                  recordMatchesFilter(r),
              ) && (
                <div className="panel">
                  <Empty
                    text={
                      filter !== "all" || memberFilter !== "all"
                        ? t("当前筛选下没有训练记录")
                        : t("还没有训练记录")
                    }
                  />
                </div>
              )}
            </>
          )}
          {tab === "referrals" && (
            <>
              <div className="referral-top">
                <section className="invite-hero">
                  <Ticket size={32} />
                  <h2>
                    {coach
                      ? t("一起，把好的改变传递出去。")
                      : t("你的朋友，也是未来的训练伙伴。")}
                  </h2>
                  <p>
                    {coach
                      ? t("教练邀请码和学员推荐码的注册记录，都在这里。")
                      : data.settings.allow_referral_signup
                        ? t(
                            "朋友使用你的代码注册，验证邮箱后即可计为成功推荐。",
                          )
                        : t("分享推荐码给朋友，注册时还需教练邀请码。")}
                  </p>
                  {!coach && (
                    <div className="ref-code">
                      <code>{current.referral_code}</code>
                      <button
                        className="icon-btn"
                        aria-label={t("复制推荐码")}
                        onClick={() => copy(current.referral_code)}
                      >
                        <Copy size={18} />
                      </button>
                    </div>
                  )}
                  <button
                    className="btn light"
                    onClick={() =>
                      coach
                        ? createInvite()
                        : copy(
                            `${window.location.origin}/?ref=${current.referral_code}`,
                          )
                    }
                  >
                    {coach ? <Plus size={17} /> : <Link2 size={17} />}
                    {coach ? t("创建邀请码") : t("复制邀请链接")}
                  </button>
                </section>
                <section className="panel referral-total">
                  <span className="eyebrow">GROW TOGETHER</span>
                  <span>{t("成功推荐")}</span>
                  <strong>
                    {
                      visibleReferrals.filter((r) => r.status === "confirmed")
                        .length
                    }
                    <small> {t("人")}</small>
                  </strong>
                  <p>
                    {
                      visibleReferrals.filter((r) => r.status === "pending")
                        .length
                    }{" "}
                    {t("人等待邮箱验证")}
                  </p>
                </section>
              </div>
              {coach && (
                <section className="panel spaced">
                  <div className="section-head">
                    <h2>{t("邀请码管理")}</h2>
                    <button className="text-btn" onClick={createInvite}>
                      <Plus size={16} />
                      {t("创建邀请码")}
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("邀请码")}</th>
                          <th>{t("限定邮箱")}</th>
                          <th>{t("使用次数")}</th>
                          <th>{t("到期日")}</th>
                          <th>{t("状态")}</th>
                          <th>{t("操作")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <Paginated
                          items={[...data.invites].sort(
                            (a, b) =>
                              Date.parse(b.created_at) -
                              Date.parse(a.created_at),
                          )}
                          resetKey={[
                            data.invites.length,
                            tab,
                            filter,
                            memberFilter,
                            query,
                            current.id,
                          ]}
                          label={t("邀请码")}
                          tableColumns={6}
                        >
                          {(pageItems, pageOffset) =>
                            pageItems.map((i) => (
                              <tr key={i.id}>
                                <td>
                                  <button
                                    className="code-btn"
                                    onClick={() => copy(i.code)}
                                  >
                                    <code>{i.code}</code>
                                    <Copy size={13} />
                                  </button>
                                </td>
                                <td>{i.email || t("不限")}</td>
                                <td>
                                  {i.uses} / {i.max_uses}
                                </td>
                                <td>
                                  {i.expires_at
                                    ? displayTime(
                                        i.expires_at,
                                        zone,
                                        "yyyy.MM.dd",
                                      )
                                    : t("不限")}
                                </td>
                                <td>
                                  {!i.active
                                    ? t("已停用")
                                    : i.uses >= i.max_uses
                                      ? t("已用完")
                                      : i.expires_at &&
                                          new Date(i.expires_at) < new Date()
                                        ? t("已过期")
                                        : t("可使用")}
                                </td>
                                <td>
                                  <div className="row gap">
                                    <button
                                      className="text-btn"
                                      onClick={() =>
                                        copy(
                                          `${window.location.origin}/?invite=${i.code}`,
                                        )
                                      }
                                    >
                                      {t("复制链接")}
                                    </button>
                                    {i.active && (
                                      <button
                                        className="text-btn muted"
                                        onClick={() =>
                                          setDialog({
                                            title: t("停用邀请码"),
                                            description: t(
                                              "停用后，新用户无法再使用此邀请码注册。",
                                            ),
                                            fields: [],
                                            submit: t("停用"),
                                            action: () =>
                                              mutate("revoke_invite", {
                                                p_id: i.id,
                                              }),
                                          })
                                        }
                                      >
                                        {t("停用")}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          }
                        </Paginated>
                      </tbody>
                    </table>
                  </div>
                  {!data.invites.length && <Empty text={t("尚未创建邀请码")} />}
                </section>
              )}
              {coach && (
                <section className="panel spaced">
                  <div className="section-head">
                    <h2>{t("各学员推荐汇总")}</h2>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("学员")}</th>
                          <th>{t("固定推荐码")}</th>
                          <th>{t("总注册")}</th>
                          <th>{t("成功推荐")}</th>
                          <th>{t("待验证")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <Paginated
                          items={members}
                          resetKey={[
                            tab,
                            filter,
                            memberFilter,
                            query,
                            current.id,
                          ]}
                          label={t("推荐汇总")}
                          tableColumns={5}
                        >
                          {(pageItems, pageOffset) =>
                            pageItems.map((m) => {
                              const rows = data.referrals.filter(
                                (r) => r.referrer_id === m.id,
                              );
                              return (
                                <tr key={m.id}>
                                  <td>{m.full_name}</td>
                                  <td>
                                    <button
                                      className="code-btn"
                                      onClick={() => copy(m.referral_code)}
                                    >
                                      <code>{m.referral_code}</code>
                                      <Copy size={13} />
                                    </button>
                                  </td>
                                  <td>{rows.length}</td>
                                  <td>
                                    {
                                      rows.filter(
                                        (r) => r.status === "confirmed",
                                      ).length
                                    }
                                  </td>
                                  <td>
                                    {
                                      rows.filter((r) => r.status === "pending")
                                        .length
                                    }
                                  </td>
                                </tr>
                              );
                            })
                          }
                        </Paginated>
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              <section className="panel">
                <div className="section-head">
                  <h2>{t("推荐明细")}</h2>
                  <button
                    className="btn secondary small"
                    onClick={exportReferrals}
                  >
                    <ArrowDownToLine size={15} />
                    {t("导出 CSV")}
                  </button>
                </div>
                {coach && (
                  <div className="toolbar">
                    <select
                      aria-label={t("按推荐人筛选")}
                      value={memberFilter}
                      onChange={(e) => setMemberFilter(e.target.value)}
                    >
                      <option value="all">{t("全部推荐人")}</option>
                      {members.map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.full_name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={t("按推荐状态筛选")}
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">{t("全部状态")}</option>
                      <option value="confirmed">{t("推荐成功")}</option>
                      <option value="pending">{t("待验证")}</option>
                    </select>
                  </div>
                )}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {coach && <th>{t("推荐人")}</th>}
                        <th>{t("新学员")}</th>
                        <th>{t("注册时间")}</th>
                        <th>{t("状态")}</th>
                        <th>{t("成功时间")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <Paginated
                        items={visibleReferrals.filter(
                          (r) =>
                            (memberFilter === "all" ||
                              r.referrer_id === memberFilter) &&
                            (filter === "all" || r.status === filter),
                        )}
                        resetKey={[
                          tab,
                          filter,
                          memberFilter,
                          query,
                          current.id,
                        ]}
                        label={t("推荐明细")}
                        tableColumns={coach ? 5 : 4}
                      >
                        {(pageItems, pageOffset) =>
                          pageItems.map((r, i) => (
                            <tr key={r.id}>
                              {coach && <td>{name(r.referrer_id)}</td>}
                              <td>
                                {r.referred_name ||
                                  (coach
                                    ? name(r.referred_id)
                                    : t("注册姓名待更新"))}
                              </td>
                              <td>
                                {displayTime(
                                  r.created_at,
                                  zone,
                                  "yyyy.MM.dd HH:mm",
                                )}
                              </td>
                              <td>
                                <Badge
                                  value={
                                    r.status === "pending"
                                      ? t("待验证")
                                      : r.status
                                  }
                                />
                              </td>
                              <td>
                                {r.confirmed_at
                                  ? displayTime(
                                      r.confirmed_at,
                                      zone,
                                      "yyyy.MM.dd HH:mm",
                                    )
                                  : "—"}
                              </td>
                            </tr>
                          ))
                        }
                      </Paginated>
                    </tbody>
                  </table>
                </div>
                {!visibleReferrals.length && (
                  <Empty text={t("暂时还没有推荐记录")} />
                )}
              </section>
            </>
          )}
          {tab === "credits" && (
            <SessionAccounts
              data={data}
              coach={coach}
              memberId={coach ? memberFilter : current.id}
              onSelect={setMemberFilter}
              onCredit={recordCredit}
              onMonthly={recordMonthly}
              onCancelMonthly={cancelMonthly}
              onCancelOnline={(m) => cancelMonthly(m, true)}
              onOnline={(id) => recordMonthly(id, true)}
            />
          )}
          {tab === "packages" && (
            <>
              {coach && (
                <div className="notice">
                  <Wallet size={20} />
                  <div>
                    <strong>
                      {coach ? t("按学员设置专属价格") : t("你的专属课程方案")}
                    </strong>
                    <p>
                      {t(
                        "按学员设置线下单次、课次套餐、不限次包月及线上指导的价格。留空的方案不能购买；到期手动购买，不自动续费。",
                      )}
                    </p>
                  </div>
                </div>
              )}
              {coach ? (
                <section className="panel">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("学员")}</th>
                          <th>{t("已设置的方案与金额")}</th>
                          <th>{t("操作")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <Paginated
                          items={members}
                          resetKey={[
                            tab,
                            filter,
                            memberFilter,
                            query,
                            current.id,
                          ]}
                          label={t("专属价格")}
                          tableColumns={3}
                        >
                          {(pageItems, pageOffset) =>
                            pageItems.map((m) => {
                              const p = data.member_prices.find(
                                (p) => p.member_id === m.id,
                              );
                              return (
                                <tr key={m.id}>
                                  <td>{m.full_name}</td>
                                  <td>
                                    <div className="catalog-price-summary">
                                      {salePackages
                                        .filter(
                                          (k) =>
                                            p?.[packageOptions[k].priceKey] !=
                                            null,
                                        )
                                        .map((k) => (
                                          <span key={k}>
                                            {t(packageOptions[k].label)} ·{" "}
                                            {formatPrice(
                                              p?.[packageOptions[k].priceKey],
                                              p?.currency,
                                            )}
                                          </span>
                                        ))}
                                      {!salePackages.some(
                                        (k) =>
                                          p?.[packageOptions[k].priceKey] !=
                                          null,
                                      ) && t("待教练设置")}
                                    </div>
                                  </td>
                                  <td>
                                    <button
                                      className="text-btn"
                                      onClick={() => editMemberPrice(m.id)}
                                    >
                                      {t("设置价格")}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          }
                        </Paginated>
                      </tbody>
                    </table>
                  </div>
                  {!members.length && (
                    <Empty text={t("学员注册后，可在这里分别设置价格")} />
                  )}
                </section>
              ) : null}
              <Payments
                key={current.id}
                data={data}
                current={current}
                demo={demo}
                onRefresh={load}
              />
            </>
          )}
          {tab === "settings" && (
            <div className="settings-grid">
              <section className="panel settings-card">
                <div className="row gap">
                  <UserRound size={22} />
                  <h2>{t("个人资料")}</h2>
                </div>
                <dl>
                  <dt>{t("姓名")}</dt>
                  <dd>{current.full_name}</dd>
                  <dt>{t("登录邮箱")}</dt>
                  <dd>{current.email}</dd>
                  <dt>{t("联系电话")}</dt>
                  <dd>{current.phone || t("未填写")}</dd>
                  <dt>{t("训练目标")}</dt>
                  <dd>{current.goals || t("未填写")}</dd>
                  <dt>{t("个人时区")}</dt>
                  <dd>{current.timezone}</dd>
                </dl>
                <button
                  className="btn secondary"
                  onClick={() =>
                    setDialog({
                      title: t("编辑个人资料"),
                      fields: [
                        {
                          name: "p_name",
                          label: t("姓名"),
                          value: current.full_name,
                          required: true,
                        },
                        {
                          name: "p_phone",
                          label: t("电话"),
                          value: current.phone,
                        },
                        {
                          name: "p_goals",
                          label: t("训练目标"),
                          type: "textarea",
                          value: current.goals,
                        },
                        {
                          name: "p_timezone",
                          label: t("个人时区"),
                          type: "select",
                          value: current.timezone,
                          options: zones.map((z) => ({ value: z, label: z })),
                          required: true,
                        },
                        {
                          name: "p_notifications",
                          label: t("接收预约更新、训练计划和课前提醒邮件"),
                          type: "checkbox",
                          value: current.email_notifications,
                        },
                      ],
                      action: (v) =>
                        mutate("save_profile", {
                          ...v,
                          p_notifications: v.p_notifications === "on",
                        }),
                    })
                  }
                >
                  {t("编辑资料")}
                </button>
                <div className="setting-line">
                  <Bell size={18} />
                  <div>
                    <strong>
                      {t("邮件提醒")}
                      {current.email_notifications ? t("已开启") : t("已关闭")}
                    </strong>
                    <p>
                      {t(
                        "预约、改期、取消、训练计划及课前提醒。账号验证和密码重置邮件不受此开关影响。",
                      )}
                    </p>
                  </div>
                </div>
                <div className="row wrap gap">
                  <button
                    className="text-btn"
                    onClick={() =>
                      setDialog({
                        title: t("修改登录邮箱"),
                        description: t(
                          "新旧邮箱可能都需要验证；完成后才会更新登录邮箱。",
                        ),
                        fields: [
                          {
                            name: "email",
                            label: t("新邮箱"),
                            type: "email",
                            required: true,
                          },
                        ],
                        submit: t("发送验证邮件"),
                        success: t(
                          "请检查新旧邮箱中的邮件，并点击设置中的「输入邮箱验证码」完成验证。旧版邮件链接仍可使用。",
                        ),
                        action: async (v) => {
                          if (demo)
                            throw new Error(t("演示模式不发送真实验证邮件"));
                          const { error } = await supabase!.auth.updateUser(
                            { email: v.email },
                            {
                              emailRedirectTo: `${window.location.origin}/auth/callback`,
                            },
                          );
                          if (error) throw error;
                          rememberVerificationEmail(v.email);
                        },
                      })
                    }
                  >
                    {t("修改邮箱")}
                  </button>
                  <a className="text-btn" href="/auth/verify?type=email_change">
                    {t("输入邮箱验证码")}
                  </a>
                  <button
                    className="text-btn"
                    onClick={() =>
                      setDialog({
                        title: t("修改密码"),
                        fields: [
                          {
                            name: "password",
                            label: t("新密码（至少 8 位）"),
                            type: "password",
                            minLength: 8,
                            required: true,
                          },
                          {
                            name: "confirm_password",
                            label: t("确认新密码"),
                            type: "password",
                            minLength: 8,
                            required: true,
                          },
                        ],
                        action: async (v) => {
                          if (v.password.length < 8)
                            throw new Error(t("密码至少需要 8 位"));
                          if (v.password !== v.confirm_password)
                            throw new Error(t("两次输入的密码不一致"));
                          if (demo)
                            throw new Error(t("演示模式不修改真实密码"));
                          const { error } = await supabase!.auth.updateUser({
                            password: v.password,
                          });
                          if (error) throw error;
                        },
                      })
                    }
                  >
                    {t("修改密码")}
                  </button>
                </div>
              </section>
              {coach && (
                <section className="panel settings-card">
                  <div className="row gap">
                    <Settings2 size={22} />
                    <h2>{t("工作室设置")}</h2>
                  </div>
                  <dl>
                    <dt>{t("网站名称")}</dt>
                    <dd>{data.settings.studio_name}</dd>
                    <dt>{t("预约时区")}</dt>
                    <dd>{zone}</dd>
                    <dt>{t("训练地点")}</dt>
                    <dd>{data.settings.location}</dd>
                    <dt>{t("推荐码注册")}</dt>
                    <dd>
                      {data.settings.allow_referral_signup
                        ? t("允许学员推荐码直接注册")
                        : t("需要教练邀请码")}
                    </dd>
                  </dl>
                  <button
                    className="btn secondary"
                    onClick={() =>
                      setDialog({
                        title: t("工作室设置"),
                        description: t(
                          "时区变更只改变显示方式，已预约课程的实际时刻不变。",
                        ),
                        fields: [
                          {
                            name: "p_name",
                            label: t("网站名称"),
                            value: data.settings.studio_name,
                            required: true,
                          },
                          {
                            name: "p_timezone",
                            label: t("预约时区"),
                            type: "select",
                            value: zone,
                            options: zones.map((z) => ({ value: z, label: z })),
                            required: true,
                          },
                          {
                            name: "p_location",
                            label: t("训练地点"),
                            value: data.settings.location,
                            required: true,
                          },
                          {
                            name: "p_referrals",
                            label: t("允许学员推荐码直接用于注册"),
                            type: "checkbox",
                            value: data.settings.allow_referral_signup,
                          },
                        ],
                        action: (v) =>
                          mutate("save_settings", {
                            ...v,
                            p_referrals: v.p_referrals === "on",
                          }),
                      })
                    }
                  >
                    {t("编辑工作室")}
                  </button>
                  <div className="setting-line">
                    <ShieldCheck size={18} />
                    <div>
                      <strong>{t("教练最高管理权限")}</strong>
                      <p>
                        {t(
                          "学员不能修改角色、邀请码额度或他人的训练计划。所有权限均由数据库验证。",
                        )}
                      </p>
                    </div>
                  </div>
                </section>
              )}
              {coach && (
                <section className="panel settings-card full-span">
                  <div className="section-head">
                    <div>
                      <h2>{t("Resend 联系人同步")}</h2>
                      <p className="muted">
                        {t(
                          "系统每分钟自动检查，无需手动同步。邮箱验证后加入专属分组；关闭通知或停用账号会移出。不会更改其他业务的全局退订设置。",
                        )}
                      </p>
                    </div>
                    <button
                      className="btn secondary small"
                      disabled={busy}
                      onClick={async () => {
                        if (demo) {
                          notify(t("演示模式不同步联系人"));
                          return;
                        }
                        setBusy(true);
                        setError("");
                        try {
                          await mutate("retry_contact_sync", {});
                          const {
                            data: { session: s },
                          } = await supabase!.auth.getSession();
                          const response = await fetch("/api/contacts", {
                            method: "POST",
                            headers: {
                              Authorization: `Bearer ${s?.access_token}`,
                            },
                          });
                          const result = await response.json();
                          if (!response.ok)
                            throw new Error(result.error || t("同步失败"));
                          if (!result.configured)
                            throw new Error(
                              t(
                                "请先在 Vercel 配置联系人管理 Key 和 Segment ID",
                              ),
                            );
                          notify(
                            t(
                              "本轮同步 {0} 位，失败 {1} 位。其余将自动继续。",
                              [result.synced, result.failed],
                            ),
                          );
                          await load();
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : t("同步失败"),
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {t("同步 / 重试")}
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("学员")}</th>
                          <th>{t("同步状态")}</th>
                          <th>{t("分组")}</th>
                          <th>{t("最近同步")}</th>
                          <th>{t("说明")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <Paginated
                          items={data.contact_sync}
                          resetKey={[
                            tab,
                            filter,
                            memberFilter,
                            query,
                            current.id,
                          ]}
                          label={t("联系人同步")}
                          tableColumns={5}
                        >
                          {(pageItems, pageOffset) =>
                            pageItems.map((c) => (
                              <tr key={c.id}>
                                <td>{name(c.member_id)}</td>
                                <td>
                                  <Badge
                                    value={c.state}
                                    label={
                                      (
                                        {
                                          pending: t("等待自动同步"),
                                          processing: t("同步中"),
                                          failed: t("同步失败"),
                                          synced: t("已同步"),
                                        } as Record<string, string>
                                      )[c.state]
                                    }
                                  />
                                </td>
                                <td>
                                  {c.in_segment
                                    ? t("已加入")
                                    : t("未加入 / 已移出")}
                                </td>
                                <td>
                                  {c.synced_at
                                    ? displayTime(
                                        c.synced_at,
                                        zone,
                                        "MM.dd HH:mm",
                                      )
                                    : "—"}
                                </td>
                                <td>{c.last_error || "—"}</td>
                              </tr>
                            ))
                          }
                        </Paginated>
                      </tbody>
                    </table>
                  </div>
                  {!data.contact_sync.length && (
                    <Empty text={t("学员验证邮箱后，会在这里显示同步进度")} />
                  )}
                </section>
              )}
              {coach && (
                <section className="panel settings-card full-span">
                  <div className="section-head">
                    <div>
                      <h2>{t("邮件投递记录")}</h2>
                      <p className="muted">
                        {t(
                          "预约通知自动入队，定时任务负责投递；提醒将在课程开始前 24 小时进入发送时间。",
                        )}
                      </p>
                    </div>
                    <button
                      className="btn secondary small"
                      disabled={busy}
                      onClick={async () => {
                        if (demo) {
                          notify(t("演示模式不发送邮件"));
                          return;
                        }
                        setBusy(true);
                        try {
                          const {
                            data: { session: s },
                          } = await supabase!.auth.getSession();
                          const r = await fetch("/api/notifications", {
                            method: "POST",
                            headers: {
                              Authorization: `Bearer ${s?.access_token}`,
                            },
                          });
                          const result = await r.json();
                          if (!r.ok)
                            throw new Error(result.error || t("处理失败"));
                          notify(
                            t("本轮已发送 {0} 封，跳过 {1} 封，失败 {2} 封", [
                              result.sent,
                              result.skipped,
                              result.failed,
                            ]),
                          );
                          await load();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <RefreshCw size={15} />
                      {t("处理待发邮件")}
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("收件人")}</th>
                          <th>{t("主题")}</th>
                          <th>{t("计划发送时间")}</th>
                          <th>{t("状态")}</th>
                          <th>{t("尝试次数")}</th>
                          <th>{t("失败说明")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <Paginated
                          items={[...data.email_jobs].sort((a, b) =>
                            b.created_at.localeCompare(a.created_at),
                          )}
                          resetKey={[
                            tab,
                            filter,
                            memberFilter,
                            query,
                            current.id,
                          ]}
                          label={t("邮件记录")}
                          tableColumns={6}
                        >
                          {(pageItems, pageOffset) =>
                            pageItems.map((j) => (
                              <tr key={j.id}>
                                <td>{name(j.recipient_id)}</td>
                                <td>{j.subject}</td>
                                <td>
                                  {displayTime(j.due_at, zone, "MM.dd HH:mm")}
                                </td>
                                <td>
                                  <Badge value={j.state} />
                                </td>
                                <td>{j.attempts}</td>
                                <td>{j.last_error || "—"}</td>
                              </tr>
                            ))
                          }
                        </Paginated>
                      </tbody>
                    </table>
                  </div>
                  {!data.email_jobs.length && (
                    <Empty text={t("还没有邮件投递记录")} />
                  )}
                </section>
              )}
            </div>
          )}
          <footer className="page-footer">
            <span>
              {data.settings.studio_name} <span className="separator">/</span>{" "}
              {t("每一次进步，都算数。")}
            </span>
            <span>
              <ShieldCheck size={13} /> {t("私密 · 专属 · 有序")}
            </span>
          </footer>
        </main>
      </div>
      {dialog && (
        <DialogView
          dialog={dialog}
          busy={busy}
          error={t(error)}
          onClose={() => {
            setDialog(null);
            setError("");
          }}
          onSubmit={commit}
        />
      )}{" "}
      {flash}
    </div>
  );
}

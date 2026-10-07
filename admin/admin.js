import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = "https://gqtbtldhjhnwloridxra.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdGJ0bGRoamhud2xvcmlkeHJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODQ4MzEsImV4cCI6MjEwNjM2MDgzMX0.2_DmIEVyrSQKlIw5VEif89-NWgy5kG9g5R0c2xZjipw";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storage: localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

const CATEGORY_LABELS = {
  doctor: "Doctor",
  druggist: "Druggist",
  hospital: "Hospital",
  other: "Other",
  unassigned: "Unassigned",
};

/** @type {{ overview: string, tickets: string, coupons: string }} */
const caps = {
  overview: "unavailable",
  tickets: "unavailable",
  coupons: "unavailable",
};

let replyTicket = null;
let couponsLive = false;

const $ = (id) => document.getElementById(id);

function showView(name) {
  $("view-login").hidden = name !== "login";
  $("view-denied").hidden = name !== "denied";
  $("view-console").hidden = name !== "console";
}

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}


/** Best-effort message from supabase.functions.invoke failure. */
function edgeErrorMessage(error, data, fallback) {
  if (data && typeof data === "object" && data.error) return String(data.error);
  if (error && error.context) {
    try {
      // FunctionsHttpError sometimes exposes Response as context
      const ctx = error.context;
      if (typeof ctx === "object" && typeof ctx.json === "function") {
        // can't await here; fall through
      }
    } catch (_) {}
  }
  const m = (error && (error.message || String(error))) || "";
  if (/Failed to send a request|FunctionsFetchError|Failed to fetch/i.test(m)) {
    return fallback;
  }
  if (/non-2xx|FunctionsHttpError/i.test(m)) {
    return fallback;
  }
  return m || fallback;
}


function setBadge(id, state) {
  const el = $(id);
  if (!el) return;
  el.className = "badge badge-" + state;
  el.textContent =
    state === "live" ? "Live" : state === "limited" ? "Limited" : "Unavailable";
}

function updateCapsUI() {
  setBadge("cap-overview", caps.overview);
  setBadge("cap-tickets", caps.tickets);
  setBadge("cap-coupons", caps.coupons);
  setBadge("cap-role", "live");
}

function plainAuthError(err) {
  const m =
    (err && (err.message || err.error_description || String(err))) ||
    "Sign-in failed.";
  if (/invalid login credentials/i.test(m))
    return "Incorrect email or password.";
  if (/email not confirmed/i.test(m))
    return "Please confirm your email before signing in.";
  if (/too many requests/i.test(m))
    return "Too many attempts. Please wait and try again.";
  if (/network/i.test(m))
    return "Network error. Check your connection and try again.";
  return m;
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

/**
 * Admin if profiles.role = admin OR legacy user_roles.role = admin.
 * Independent of subscription. No hardcoded emails.
 */
async function isCurrentUserAdmin(userId) {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "admin")
      .limit(1);
    if (!error && Array.isArray(data) && data.length > 0) return true;
  } catch (_) {
    /* continue */
  }
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("owner_user_id", userId)
      .limit(20);
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (row && String(row.role) === "admin") return true;
      }
    }
  } catch (_) {
    /* continue */
  }
  return false;
}

async function gateAndShow() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    showView("login");
    return;
  }
  const admin = await isCurrentUserAdmin(session.user.id);
  if (!admin) {
    showView("denied");
    return;
  }
  showView("console");
  await loadConsole();
}

async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function signOut() {
  await supabase.auth.signOut();
  caps.overview = "unavailable";
  caps.tickets = "unavailable";
  caps.coupons = "unavailable";
  couponsLive = false;
  updateCapsUI();
  showView("login");
}

/* ---------- Overview (admin-overview edge) ---------- */
async function loadOverview() {
  $("metric-users").textContent = "0";
  $("metric-subscribers").textContent = "0";
  $("metric-plans").textContent = "0";
  $("users-list").innerHTML = "";
  $("users-empty").hidden = true;
  const note = $("overview-note");
  note.hidden = true;

  try {
    const { data, error } = await supabase.functions.invoke("admin-overview", {
      body: { page: 1 },
    });
    if (error || !data || typeof data !== "object" || data.error) {
      caps.overview = "unavailable";
      note.textContent =
        "Could not load account overview. " +
        edgeErrorMessage(error, data, "Sign in as admin and try Refresh.");
      note.hidden = false;
      $("users-empty").hidden = false;
      $("users-empty").textContent = "No accounts to show.";
      updateCapsUI();
      return;
    }
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const totalUsers =
      typeof data.totalUsers === "number" ? data.totalUsers : accounts.length;
    const subscriberAccounts =
      typeof data.subscriberAccounts === "number" ? data.subscriberAccounts : 0;
    const activeSubscriptions =
      typeof data.activeSubscriptions === "number"
        ? data.activeSubscriptions
        : 0;

    $("metric-users").textContent = String(totalUsers);
    $("metric-subscribers").textContent = String(subscriberAccounts);
    $("metric-plans").textContent = String(activeSubscriptions);

    if (accounts.length === 0) {
      $("users-empty").hidden = false;
      $("users-empty").textContent = "No accounts to show.";
    } else {
      const frag = document.createDocumentFragment();
      for (const a of accounts) {
        const row = document.createElement("div");
        row.className = "user-row";
        const name = a.name || a.email || a.phone || "Account";
        const email = a.email || "";
        const plans = a.activeSubscriptions ?? a.active_subscriptions ?? 0;
        const left = document.createElement("div");
        const nameEl = document.createElement("p");
        nameEl.className = "user-name";
        nameEl.textContent = name;
        const subEl = document.createElement("p");
        subEl.className = "user-sub";
        subEl.textContent = email ? email + " · plans " + plans : "plans " + plans;
        left.appendChild(nameEl);
        left.appendChild(subEl);
        const chip = document.createElement("span");
        chip.className = "plan-chip" + (plans ? " active" : "");
        chip.textContent = plans
          ? plans + " active " + (plans === 1 ? "plan" : "plans")
          : "No active plan";
        row.appendChild(left);
        row.appendChild(chip);
        frag.appendChild(row);
      }
      $("users-list").appendChild(frag);
    }
    caps.overview = "live";
  } catch (e) {
    caps.overview = "unavailable";
    note.textContent =
      "Could not load account overview. " +
      edgeErrorMessage(e, null, "Sign in as admin and try Refresh.");
    note.hidden = false;
    $("users-empty").hidden = false;
    $("users-empty").textContent = "No accounts to show.";
  }
  updateCapsUI();
}

/* ---------- Tickets (support_tickets + admin_reply_support_ticket) ---------- */
async function loadTickets() {
  const list = $("tickets-list");
  list.innerHTML = "";
  $("tickets-loading").hidden = false;
  $("tickets-error").hidden = true;
  $("tickets-empty").hidden = true;

  try {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    $("tickets-loading").hidden = true;

    if (error) {
      caps.tickets = "unavailable";
      $("tickets-error").textContent =
        "Could not load tickets. " +
        (error.message || "Check RLS / table access.");
      $("tickets-error").hidden = false;
      updateCapsUI();
      return;
    }

    const tickets = Array.isArray(data) ? data : [];
    if (tickets.length === 0) {
      caps.tickets = "live";
      $("tickets-empty").hidden = false;
      updateCapsUI();
      return;
    }

    caps.tickets = "live";
    const frag = document.createDocumentFragment();
    for (const t of tickets) {
      const card = document.createElement("article");
      card.className = "ticket-card";
      const status = (t.status || "open").toLowerCase();
      const statusClass =
        status === "open" ? "status-open" : "status-answered";
      const metaParts = [
        t.name || "",
        t.email || "",
        t.category || "general",
        fmtDate(t.created_at),
      ].filter(Boolean);

      const top = document.createElement("div");
      top.className = "ticket-top";
      const subj = document.createElement("h3");
      subj.className = "ticket-subject";
      subj.textContent = t.subject || "(no subject)";
      const chip = document.createElement("span");
      chip.className = "status-chip " + statusClass;
      chip.textContent = status;
      top.appendChild(subj);
      top.appendChild(chip);

      const meta = document.createElement("p");
      meta.className = "ticket-meta";
      meta.textContent = metaParts.join(" · ");

      const msg = document.createElement("p");
      msg.className = "ticket-msg";
      msg.textContent = t.message || "";

      const actions = document.createElement("div");
      actions.className = "ticket-actions";
      const replyBtn = document.createElement("button");
      replyBtn.type = "button";
      replyBtn.className = "btn btn-ghost btn-sm reply-btn";
      replyBtn.textContent = "Reply In-App";
      replyBtn.addEventListener("click", () => openReply(t));
      actions.appendChild(replyBtn);

      card.appendChild(top);
      card.appendChild(meta);
      card.appendChild(msg);
      card.appendChild(actions);
      frag.appendChild(card);
    }
    list.appendChild(frag);
  } catch (e) {
    $("tickets-loading").hidden = true;
    caps.tickets = "unavailable";
    $("tickets-error").textContent =
      "Could not load tickets. " + (e.message || "Unknown error.");
    $("tickets-error").hidden = false;
  }
  updateCapsUI();
}

function openReply(ticket) {
  replyTicket = ticket;
  $("reply-title").textContent = "Reply · " + (ticket.subject || "Ticket");
  $("reply-original").textContent = ticket.message || "";
  $("reply-body").value = "";
  $("reply-error").hidden = true;
  const dlg = $("reply-dialog");
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
}

function closeReply() {
  replyTicket = null;
  const dlg = $("reply-dialog");
  if (typeof dlg.close === "function") dlg.close();
  else dlg.removeAttribute("open");
}

async function sendReply(body) {
  if (!replyTicket) return;
  const trimmed = body.trim();
  if (trimmed.length < 2) {
    $("reply-error").textContent = "Reply is too short.";
    $("reply-error").hidden = false;
    return;
  }
  $("reply-send").disabled = true;
  $("reply-error").hidden = true;
  try {
    const { error } = await supabase.rpc("admin_reply_support_ticket", {
      _ticket_id: replyTicket.id,
      _body: trimmed,
    });
    if (error) throw error;
    closeReply();
    toast(
      "Reply sent. The user will see it via Help & Support → View Messages."
    );
    await loadTickets();
  } catch (e) {
    const detail =
      (e && (e.message || e.details || e.hint)) ||
      "Could not send reply.";
    $("reply-error").textContent = String(detail);
    $("reply-error").hidden = false;
  } finally {
    $("reply-send").disabled = false;
  }
}

/* ---------- Coupons (edge only — no fake CRUD) ---------- */
function renderCoupons(coupons) {
  const list = $("coupons-list");
  list.innerHTML = "";
  $("coupons-empty").hidden = coupons.length > 0;
  if (coupons.length === 0) {
    $("coupons-empty").textContent = "No coupons yet.";
    return;
  }
  const frag = document.createDocumentFragment();
  for (const c of coupons) {
    const row = document.createElement("div");
    row.className = "coupon-row";
    const cat =
      CATEGORY_LABELS[c.partner_category] || c.partner_category || "";
    const parts = [
      c.partner_name || "",
      c.discount_percent != null ? c.discount_percent + "%" : "",
      cat,
      c.is_active ? "active" : "inactive",
    ].filter(Boolean);

    const left = document.createElement("div");
    const codeEl = document.createElement("p");
    codeEl.className = "coupon-code";
    codeEl.textContent = c.code || "";
    const subEl = document.createElement("p");
    subEl.className = "coupon-sub";
    subEl.textContent = parts.join(" · ");
    left.appendChild(codeEl);
    left.appendChild(subEl);

    const actions = document.createElement("div");
    actions.className = "coupon-actions";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn-ghost btn-sm copy-btn";
    copyBtn.title = "Copy code";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(c.code || "").then(
        () => toast("Code copied"),
        () => toast("Could not copy")
      );
    });
    actions.appendChild(copyBtn);

    if (couponsLive) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "toggle" + (c.is_active ? " on" : "");
      toggle.title = "Toggle active";
      toggle.setAttribute("aria-pressed", String(!!c.is_active));
      toggle.addEventListener("click", async () => {
        const next = !c.is_active;
        toggle.disabled = true;
        try {
          const { data, error } = await supabase.functions.invoke(
            "admin-set-coupon-active",
            { body: { id: c.id, active: next } }
          );
          if (error) throw error;
          if (data && data.error) throw new Error(data.error);
          c.is_active = next;
          toggle.classList.toggle("on", next);
          toggle.setAttribute("aria-pressed", String(next));
          const parts2 = [
            c.partner_name || "",
            c.discount_percent != null ? c.discount_percent + "%" : "",
            cat,
            next ? "active" : "inactive",
          ].filter(Boolean);
          subEl.textContent = parts2.join(" · ");
        } catch (e) {
          toast(e.message || "Could not update coupon.");
        } finally {
          toggle.disabled = false;
        }
      });
      actions.appendChild(toggle);
    }

    row.appendChild(left);
    row.appendChild(actions);
    frag.appendChild(row);
  }
  list.appendChild(frag);
}

async function loadCoupons() {
  $("coupons-loading").hidden = false;
  $("coupons-empty").hidden = true;
  $("coupons-list").innerHTML = "";
  $("coupon-form").hidden = true;
  $("coupons-note").hidden = true;
  couponsLive = false;

  try {
    const { data, error } = await supabase.functions.invoke("admin-coupons");
    $("coupons-loading").hidden = true;

    if (error || data == null || (data && data.error)) {
      caps.coupons = "unavailable";
      couponsLive = false;
      $("coupon-form").hidden = true;
      $("coupons-note").textContent =
        "Could not load partner coupons. " +
        edgeErrorMessage(error, data, "Sign in as admin and try Refresh.");
      $("coupons-note").hidden = false;
      updateCapsUI();
      return;
    }

    let list = [];
    if (Array.isArray(data)) list = data;
    else if (data && Array.isArray(data.coupons)) list = data.coupons;
    else {
      caps.coupons = "unavailable";
      $("coupons-note").textContent = "Partner coupons aren't available yet.";
      $("coupons-note").hidden = false;
      updateCapsUI();
      return;
    }

    couponsLive = true;
    caps.coupons = "live";
    $("coupon-form").hidden = false;
    renderCoupons(
      list.map((e) => ({
        id: String(e.id ?? ""),
        code: String(e.code ?? ""),
        discount_percent: Number(e.discount_percent ?? 0),
        is_active: e.is_active === true,
        partner_name: e.partner_name != null ? String(e.partner_name) : "",
        partner_category:
          e.partner_category != null ? String(e.partner_category) : "",
        redemptions: Number(e.redemptions ?? 0),
      }))
    );
  } catch (e) {
    $("coupons-loading").hidden = true;
    caps.coupons = "unavailable";
    couponsLive = false;
    $("coupon-form").hidden = true;
    $("coupons-note").textContent =
      "Could not load partner coupons. " +
      edgeErrorMessage(e, null, "Sign in as admin and try Refresh.");
    $("coupons-note").hidden = false;
  }
  updateCapsUI();
}

async function createCoupon(payload) {
  const { data, error } = await supabase.functions.invoke(
    "admin-create-coupon",
    { body: payload }
  );
  if (data && data.error) throw new Error(String(data.error));
  if (error) {
    throw new Error(
      edgeErrorMessage(error, data, error.message || "Could not create coupon.")
    );
  }
  return data;
}

async function loadConsole() {
  updateCapsUI();
  await Promise.all([loadOverview(), loadTickets(), loadCoupons()]);
}

/* ---------- Wire events ---------- */
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  const errEl = $("login-error");
  errEl.hidden = true;
  $("login-submit").disabled = true;
  try {
    await signIn(email, password);
    await gateAndShow();
  } catch (err) {
    errEl.textContent = plainAuthError(err);
    errEl.hidden = false;
  } finally {
    $("login-submit").disabled = false;
  }
});

$("btn-signout").addEventListener("click", () => signOut());
$("denied-signout").addEventListener("click", () => signOut());
$("btn-refresh").addEventListener("click", () => loadConsole());

$("coupon-code").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase();
});

$("coupon-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!couponsLive) return;
  const errEl = $("coupon-form-error");
  errEl.hidden = true;
  $("coupon-submit").disabled = true;
  try {
    await createCoupon({
      code: $("coupon-code").value.trim(),
      partnerName: $("coupon-partner").value.trim(),
      partnerCategory: $("coupon-category").value,
      discountPercent: Number($("coupon-discount").value) || 10,
    });
    $("coupon-code").value = "";
    $("coupon-partner").value = "";
    toast("Coupon created");
    await loadCoupons();
  } catch (err) {
    errEl.textContent = err.message || "Could not create coupon.";
    errEl.hidden = false;
  } finally {
    $("coupon-submit").disabled = false;
  }
});

$("reply-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await sendReply($("reply-body").value);
});
$("reply-cancel").addEventListener("click", () => closeReply());
$("reply-close").addEventListener("click", () => closeReply());

$("reply-dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeReply();
});

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") showView("login");
});

showView("login");
gateAndShow().catch(() => showView("login"));

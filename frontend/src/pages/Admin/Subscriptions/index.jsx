/**
 * /admin/subscriptions — subscription management page
 *
 * Shows: current plan card, renew/pay button, promo code field, invoice history.
 * Frozen subscription → red banner with pay button at top.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../api";
import "./Subscriptions.css";

// ── API hooks ─────────────────────────────────────────────────────────────────

function useCurrent() {
  return useQuery({
    queryKey: ["sub-current"],
    queryFn: () => api.get("/api/subscriptions/current").then(r => r.data),
    placeholderData: { status: "trial", plan_name: "Триал", is_frozen: false },
  });
}

function usePlans() {
  return useQuery({
    queryKey: ["sub-plans"],
    queryFn: () => api.get("/api/subscriptions/plans").then(r => r.data),
    placeholderData: [],
  });
}

function useInvoices() {
  return useQuery({
    queryKey: ["sub-invoices"],
    queryFn: () => api.get("/api/subscriptions/invoices").then(r => r.data),
    placeholderData: [],
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRub(kopecks) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 })
    .format(kopecks / 100);
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(iso));
}

const STATUS_MAP = {
  trial:   { label: "Триал",       color: "#6c8ebf" },
  active:  { label: "Активна",     color: "#50c878" },
  frozen:  { label: "Заморожена",  color: "#e05050" },
  expired: { label: "Истекла",     color: "#e05050" },
  no_subscription: { label: "Нет подписки", color: "var(--text-muted)" },
};

const STATUS_ICONS = { trial: "🕐", active: "✅", frozen: "🔒", expired: "⚠️" };

// ── Plan card ─────────────────────────────────────────────────────────────────

function PlanCard({ plan, userCount, selected, onSelect }) {
  const extra = Math.max(0, userCount - 10);
  const total = plan.base_price + extra * plan.per_user;

  return (
    <button
      className={`sub-plan-card ${selected ? "sub-plan-card--selected" : ""}`}
      onClick={() => onSelect(plan.id)}
    >
      <div className="sub-plan-name">{plan.name}</div>
      <div className="sub-plan-desc">{plan.description}</div>
      <div className="sub-plan-price">
        {fmtRub(plan.base_price)}
        <span className="sub-plan-period">/мес</span>
      </div>
      {plan.per_user > 0 && userCount > 10 && (
        <div className="sub-plan-extra">
          +{fmtRub(plan.per_user * extra)} за {extra} доп. чел.
          <br />
          <strong>Итого: {fmtRub(total)}</strong>
        </div>
      )}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Subscriptions() {
  const qc = useQueryClient();
  const { data: current }  = useCurrent();
  const { data: plans = [] } = usePlans();
  const { data: invoices = [] } = useInvoices();

  const [selectedPlan, setSelectedPlan] = useState("starter");
  const [promoCode,    setPromoCode]    = useState("");
  const [promoMsg,     setPromoMsg]     = useState(null);   // { ok, message, discount }
  const [payError,     setPayError]     = useState(null);

  const promoMut = useMutation({
    mutationFn: (code) => api.post("/api/subscriptions/promo", { code }).then(r => r.data),
    onSuccess: (data) => {
      setPromoMsg({ ok: true, message: data.message, discount: data.discount_percent });
    },
    onError: (err) => {
      setPromoMsg({ ok: false, message: err.response?.data?.detail || "Ошибка промокода" });
    },
  });

  const payMut = useMutation({
    mutationFn: (body) => api.post("/api/subscriptions/create-payment", body).then(r => r.data),
    onSuccess: (data) => {
      setPayError(null);
      window.location.href = data.confirmation_url;
    },
    onError: (err) => {
      setPayError(err.response?.data?.detail || "Ошибка создания платежа");
    },
  });

  function handlePay() {
    setPayError(null);
    payMut.mutate({
      plan_id:    selectedPlan,
      return_url: window.location.href,
      promo_code: promoCode || null,
    });
  }

  const st = STATUS_MAP[current?.status] ?? STATUS_MAP.trial;
  const isFrozen = current?.is_frozen;

  return (
    <div className="sub-page">
      <header className="sub-header">
        <Link to="/" className="sub-back">←</Link>
        <div className="sub-header-info">
          <span className="sub-header-title">Подписка</span>
          <span className="sub-header-sub">Управление тарифом и оплатой</span>
        </div>
      </header>

      {/* Frozen banner */}
      {isFrozen && (
        <div className="sub-frozen-banner">
          <div className="sub-frozen-text">
            🔒 Подписка заморожена — доступ к обучению закрыт
          </div>
          <button
            className="sub-frozen-btn"
            onClick={handlePay}
            disabled={payMut.isPending}
          >
            {payMut.isPending ? "..." : "Оплатить"}
          </button>
        </div>
      )}

      {/* Current subscription card */}
      <section className="sub-section">
        <div className="sub-current-card">
          <div className="sub-current-top">
            <div>
              <div className="sub-current-plan">{current?.plan_name ?? "Триал"}</div>
              <div className="sub-current-dates">
                {current?.ends_at ? `До ${fmtDate(current.ends_at)}` : "Бессрочно"}
              </div>
            </div>
            <span className="sub-status-badge" style={{ background: st.color + "22", color: st.color }}>
              {STATUS_ICONS[current?.status] ?? "🕐"} {st.label}
            </span>
          </div>
          <div className="sub-current-meta">
            <div className="sub-meta-item">
              <span className="sub-meta-label">Сотрудников</span>
              <span className="sub-meta-value">{current?.user_count ?? 0}</span>
            </div>
            {current?.days_left !== null && current?.days_left !== undefined && (
              <div className="sub-meta-item">
                <span className="sub-meta-label">Осталось дней</span>
                <span
                  className="sub-meta-value"
                  style={{ color: (current.days_left <= 7) ? "#e05050" : "inherit" }}
                >
                  {current.days_left}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Plan selection */}
      <section className="sub-section">
        <div className="sub-section-title">Выберите тариф</div>
        <div className="sub-plans-grid">
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              userCount={current?.user_count ?? 0}
              selected={selectedPlan === plan.id}
              onSelect={setSelectedPlan}
            />
          ))}
        </div>
      </section>

      {/* Promo code */}
      <section className="sub-section">
        <div className="sub-section-title">Промокод</div>
        <div className="sub-promo-row">
          <input
            className="sub-promo-input"
            placeholder="Введите промокод"
            value={promoCode}
            onChange={e => { setPromoCode(e.target.value); setPromoMsg(null); }}
          />
          <button
            className="sub-promo-btn"
            onClick={() => promoMut.mutate(promoCode)}
            disabled={!promoCode || promoMut.isPending}
          >
            {promoMut.isPending ? "..." : "Применить"}
          </button>
        </div>
        {promoMsg && (
          <div className={`sub-promo-msg ${promoMsg.ok ? "sub-promo-msg--ok" : "sub-promo-msg--err"}`}>
            {promoMsg.ok ? `✅ ${promoMsg.message}` : `❌ ${promoMsg.message}`}
          </div>
        )}
      </section>

      {/* Pay button */}
      <section className="sub-section">
        <button
          className="sub-pay-btn"
          onClick={handlePay}
          disabled={payMut.isPending}
        >
          {payMut.isPending
            ? "Создание платежа…"
            : `Оплатить через ЮКасса`}
        </button>
        {payError && <div className="sub-pay-error">{payError}</div>}
        <p className="sub-pay-note">
          После оплаты подписка активируется автоматически. Прогресс сотрудников сохраняется.
        </p>
      </section>

      {/* Invoice history */}
      <section className="sub-section">
        <div className="sub-section-title">История платежей</div>
        {invoices.length === 0 ? (
          <div className="sub-empty">Платежей пока нет</div>
        ) : (
          <div className="sub-invoices">
            {invoices.map(inv => {
              const statusColor = {
                succeeded: "#50c878",
                pending:   "var(--orange)",
                canceled:  "#e05050",
                refunded:  "#6c8ebf",
              }[inv.status] ?? "var(--text-muted)";
              return (
                <div key={inv.id} className="sub-invoice-row">
                  <div className="sub-invoice-left">
                    <div className="sub-invoice-plan">{inv.plan_name ?? "—"}</div>
                    <div className="sub-invoice-date">{fmtDate(inv.created_at)}</div>
                  </div>
                  <div className="sub-invoice-right">
                    <div className="sub-invoice-amount">{fmtRub(inv.amount_kopecks)}</div>
                    <div className="sub-invoice-status" style={{ color: statusColor }}>
                      {inv.status === "succeeded" ? "✅ Оплачен"
                        : inv.status === "pending"   ? "⏳ Ожидание"
                        : inv.status === "canceled"  ? "❌ Отменён"
                        : inv.status}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

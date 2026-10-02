import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEvent } from "./event";
import { useI18n } from "../i18n/provider";
import { LanguageButton } from "../features/auth";
import { Icon } from "../components/icon";
import { backend } from "../data/client";
import { ErrorState } from "../components/states";
const nav = [
  ["", "dashboard"],
  ["person", "people"],
  ["flight", "travel"],
  ["apartment", "stay"],
  ["task", "tasks"],
  ["apartment_issue", "issues"],
  ["payment", "finance"],
  ["schedule", "schedule"],
  ["alerts", "alerts"],
  ["activity", "activity"],
  ["settings", "settings"],
];
export function Shell() {
  const { event, sync } = useEvent();
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>();
  const location = useLocation();
  const root = "/e/" + event.id;
  return (
    <div className="app-shell">
      <a href="#main" className="skip">
        {t("skip")}
      </a>
      <aside className={"sidebar " + (open ? "open" : "")}>
        <Link to={root} className="wordmark">
          UMAN<span>EVENT MANAGER</span>
        </Link>
        <div className="event-context">
          <small>{t("currentEvent")}</small>
          <strong>
            {locale === "he" && event.hebrew_name
              ? event.hebrew_name
              : event.name}
          </strong>
          <Link to="/events">{t("selectEvent")}</Link>
        </div>
        <nav aria-label={t("more")}>
          {nav.map(([path, label]) => (
            <NavLink
              key={path}
              to={root + (path ? "/" + path : "")}
              end={path === ""}
              onClick={() => setOpen(false)}
            >
              <Icon name={label} />
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          {t("location")}
        </div>
      </aside>
      {open && (
        <button
          className="scrim"
          aria-label={t("dismiss")}
          onClick={() => setOpen(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="top-leading">
            <button
              className="icon-button mobile-menu"
              aria-label={t("more")}
              onClick={() => setOpen(!open)}
            >
              <Icon name="menu" />
            </button>
            <span className={"sync-status " + sync}>
              <span className="status-dot" />
              {t(sync)}
            </span>
          </div>
          <div className="top-actions">
            <Link
              className="icon-button"
              to={root + "/search"}
              aria-label={t("searchAll")}
            >
              <Icon name="search" />
            </Link>
            <LanguageButton />
            <button
              className="icon-button"
              aria-label={t("signOut")}
              onClick={() =>
                void backend()
                  .auth.signOut()
                  .then((r) => {
                    if (r.error) setError(r.error);
                  })
              }
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>
        <main id="main" key={event.id} tabIndex={-1}>
          {!!error && <ErrorState error={error} />}
          <Outlet key={location.pathname} />
        </main>
        <nav className="mobile-nav" aria-label={t("more")}>
          {nav.slice(0, 5).map(([path, label]) => (
            <NavLink
              to={root + (path ? "/" + path : "")}
              end={path === ""}
              key={path}
            >
              <Icon name={label} />
              <span>{t(label)}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

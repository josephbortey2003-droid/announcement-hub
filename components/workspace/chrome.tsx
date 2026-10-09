"use client";
/* Logos are signed storage URLs or local data URLs, so framework image optimization is not applicable. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, Building2, History, Inbox, LogOut, Menu, MessageSquareText, Monitor, Moon, Palette,
  Radio, Send, Settings, ShieldCheck, Sun, Users, WalletCards, X,
} from "lucide-react";
import { initials, portalLabel, type BrandData, type Portal, type ThemeMode, type Viewer } from "@/lib/workspace/model";

export const creatorNav = [
  ["overview", "Overview", Inbox],
  ["announcements", "Announcements", Send],
  ["people", "People", Users],
  ["authorities", "Authorities", ShieldCheck],
  ["groups", "Groups", Building2],
  ["delivery", "Delivery", MessageSquareText],
  ["billing", "Credits and billing", WalletCards],
  ["branding", "Branding", Palette],
] as const;
export const authorityNav = [["inbox", "Overview", Inbox], ["compose", "Create announcement", Send], ["history", "Sent history", History]] as const;
export const memberNav = [["inbox", "Inbox", Inbox], ["history", "History", History], ["preferences", "Preferences", Settings]] as const;

export function navFor(portal: Portal) {
  return portal === "creator" ? creatorNav : portal === "authority" ? authorityNav : memberNav;
}

export function OrgAvatar({ brand, large = false, decorative = false }: { brand: BrandData; large?: boolean; decorative?: boolean }) {
  return (
    <span className={`org-avatar${large ? " large" : ""}`}>
      {brand.logo ? <img src={brand.logo} alt={decorative ? "" : `${brand.name} logo`} /> : initials(brand.name)}
    </span>
  );
}

export function Brand({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <span className="mark-icon"><Radio size={compact ? 17 : 20} /></span>
      {!compact && <span className="mark-word">Announcement <b>Hub</b></span>}
    </>
  );
  return onClick
    ? <button className="brand-mark brand-button" onClick={onClick} aria-label="Go to Announcement Hub home">{inner}</button>
    : <Link href="/" className="brand-mark">{inner}</Link>;
}

export function ThemeSelect({ theme, setTheme, label = "Appearance" }: { theme: ThemeMode; setTheme: (theme: ThemeMode) => void; label?: string }) {
  const modes: [ThemeMode, string, LucideIcon][] = [["system", "Device", Monitor], ["light", "Light", Sun], ["dark", "Dark", Moon]];
  return (
    <div className="theme-select" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="theme-options">
        {modes.map(([mode, name, Icon]) => (
          <button type="button" key={mode} className={theme === mode ? "active" : ""} aria-pressed={theme === mode} title={`${name} mode`} onClick={() => setTheme(mode)}>
            <Icon size={15} /><span>{name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Header({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div><p>ORGANIZATION SPACE</p><h1>{title}</h1><span>{description}</span></div>
      {action && <div className="header-actions">{action}</div>}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <section className="empty-state">
      <span><Icon size={24} /></span>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </section>
  );
}

export function MobileWorkspaceChrome({ portal, view, setView, onMenu, brand }: { portal: Portal; view: string; setView: (view: string) => void; onMenu: () => void; brand: BrandData }) {
  const items = navFor(portal);
  const primaryItems = portal === "creator" ? items.slice(0, 3) : items;
  const home = items[0][0];
  return (
    <>
      <header className="mobile-app-bar">
        <button type="button" className="mobile-org-button" onClick={() => setView(home)} aria-label={`Open ${brand.name} ${items[0][1].toLowerCase()}`}>
          <OrgAvatar brand={brand} decorative />
          <span><strong>{brand.name}</strong><small>{portal === "creator" ? "Owner workspace" : portal === "authority" ? "Leader workspace" : "Organization inbox"}</small></span>
        </button>
      </header>
      <nav className="mobile-tab-bar" aria-label="Primary workspace navigation">
        {primaryItems.map(([id, label, Icon]) => {
          const selected = view === id || (portal === "creator" && view === "compose" && id === "announcements");
          return (
            <button type="button" key={id} className={selected ? "active" : ""} onClick={() => setView(id)} aria-current={selected ? "page" : undefined}>
              <Icon size={20} /><span>{label}</span>
            </button>
          );
        })}
        {portal === "creator" && <button type="button" onClick={onMenu}><Menu size={20} /><span>More</span></button>}
      </nav>
    </>
  );
}

type SidebarProps = {
  portal: Portal;
  view: string;
  setView: (view: string) => void;
  onExit: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  brand: BrandData;
  viewer: Viewer;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

export function Sidebar({ portal, view, setView, onExit, mobileOpen, setMobileOpen, brand, viewer, theme, setTheme }: SidebarProps) {
  const items = navFor(portal);
  return (
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-brand">
        <Brand compact onClick={() => setView(items[0][0])} />
        <span>Announcement Hub</span>
        <button type="button" className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={20} /></button>
      </div>
      <div className="org-identity">
        <OrgAvatar brand={brand} />
        <span><strong>{brand.name}</strong><small>{brand.code}</small></span>
      </div>
      <nav aria-label="Workspace navigation">
        <p>{portal.toUpperCase()} WORKSPACE</p>
        {items.map(([id, label, Icon]) => (
          <button type="button" key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => { setView(id); setMobileOpen(false); }} aria-current={view === id ? "page" : undefined}>
            <Icon size={18} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <ThemeSelect theme={theme} setTheme={setTheme} />
        <button type="button" className="switch-button" onClick={onExit}>
          {viewer.signedIn ? <><LogOut size={17} /> Sign out</> : <><ArrowLeft size={17} /> Switch role</>}
        </button>
        <div className="user-row">
          <span>{initials(viewer.name)}</span>
          <div><strong>{viewer.name}</strong><small>{portalLabel[portal]}</small></div>
          {portal === "member" && <button type="button" aria-label="Open preferences" onClick={() => setView("preferences")}><Settings size={17} /></button>}
        </div>
      </div>
    </aside>
  );
}

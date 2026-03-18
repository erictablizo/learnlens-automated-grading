"use client";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { authService } from "@/services/authService";
 
interface SidebarProps {
  children: React.ReactNode;
}
 
export default function DashboardLayout({ children }: SidebarProps) {
  const pathname = usePathname();
 
  const navItems = [
    {
      href: "/exams",
      label: "Manage Exams",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
    },
  ];
 
  return (
    <div style={styles.wrapper}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <nav style={styles.nav}>
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
                <div style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}>
                  <span style={{ ...styles.navIcon, color: active ? "#1e3a5f" : "#64748b" }}>
                    {item.icon}
                  </span>
                  <span style={{ ...styles.navLabel, color: active ? "#1e3a5f" : "#64748b" }}>
                    {item.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>
 
        {/* Sign out */}
        <button style={styles.signOutBtn} onClick={() => authService.logout()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span style={styles.navLabel}>Sign out</span>
        </button>
      </aside>
 
      {/* Main content */}
      <main style={styles.main}>{children}</main>
    </div>
  );
}
 
const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    minHeight: "100vh",
    background: "#b8dde8",
  },
  sidebar: {
    width: 200,
    minHeight: "100vh",
    background: "#fff",
    borderRight: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    paddingBottom: 24,
    flexShrink: 0,
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    paddingTop: 20,
    gap: 2,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 20px",
    borderRadius: 0,
    cursor: "pointer",
    transition: "background 0.15s",
  },
  navItemActive: {
    background: "#f0f4f8",
  },
  navIcon: { display: "flex", alignItems: "center", flexShrink: 0 },
  navLabel: { fontSize: 13, fontWeight: 500 },
  signOutBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 20px",
    background: "none",
    border: "none",
    cursor: "pointer",
    width: "100%",
    color: "#64748b",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
};

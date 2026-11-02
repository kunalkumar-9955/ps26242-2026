"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Role = "worker" | "assessor" | "auditor" | "admin";

export interface UserProfile {
  id: string;
  name: string;
  role: Role;
  phone?: string;
  email?: string;
  language: "hi" | "en";
  isSynthetic: boolean;
  assignedCandidateId?: string;
}

const DEMO_PROFILES: Record<Role, UserProfile> = {
  worker: {
    id: "usr-worker-001",
    name: "Ramesh Sharma (रमेश शर्मा)",
    role: "worker",
    phone: "+91 98765 43210",
    language: "hi",
    isSynthetic: true,
  },
  assessor: {
    id: "usr-assessor-001",
    name: "Er. Sunita Verma",
    role: "assessor",
    email: "sunita.verma@csdci-assessor.org.in",
    language: "en",
    isSynthetic: true,
  },
  auditor: {
    id: "usr-auditor-001",
    name: "Dr. Arvind Rao (SSC Quality Officer)",
    role: "auditor",
    email: "arvind.rao@ncvet-audit.gov.in",
    language: "en",
    isSynthetic: true,
  },
  admin: {
    id: "usr-admin-001",
    name: "Platform Governance Admin",
    role: "admin",
    email: "admin@satyarpl.gov.in",
    language: "en",
    isSynthetic: true,
  },
};

interface AuthContextType {
  currentUser: UserProfile;
  setRole: (role: Role) => void;
  setLanguage: (lang: "hi" | "en") => void;
  allRoles: Role[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentRole, setCurrentRole] = useState<Role>("worker");
  const [language, setLanguageState] = useState<"hi" | "en">("hi");

  // Load persisted demo role if present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedRole = localStorage.getItem("satya_rpl_active_role") as Role;
      if (savedRole && DEMO_PROFILES[savedRole]) {
        setCurrentRole(savedRole);
      }
      const savedLang = localStorage.getItem("satya_rpl_lang") as "hi" | "en";
      if (savedLang) {
        setLanguageState(savedLang);
      }
    }
  }, []);

  const setRole = (role: Role) => {
    setCurrentRole(role);
    if (typeof window !== "undefined") {
      localStorage.setItem("satya_rpl_active_role", role);
    }
  };

  const setLanguage = (lang: "hi" | "en") => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("satya_rpl_lang", lang);
    }
  };

  const currentUser: UserProfile = {
    ...DEMO_PROFILES[currentRole],
    language,
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setRole,
        setLanguage,
        allRoles: ["worker", "assessor", "auditor", "admin"],
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

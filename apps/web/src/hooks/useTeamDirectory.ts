'use client';

import { useCallback, useEffect, useState } from 'react';

export interface TeamDepartment {
  id: string;
  name: string;
  color: string;
  sla_first_response_minutes: number | null;
  active: boolean;
  sort_order: number;
}

export interface TeamMemberSummary {
  id: string;
  userId: string | null;
  fullName: string;
  role: 'atendente' | 'supervisor' | 'gestor' | 'admin';
  scope: 'all' | 'department' | 'assigned';
  departmentIds: string[];
}

export interface TeamMe {
  userId: string;
  memberId: string | null;
  fullName: string | null;
  role: TeamMemberSummary['role'];
  scope: TeamMemberSummary['scope'];
  departmentIds: string[];
  isManager: boolean;
}

interface Directory {
  me: TeamMe;
  departments: TeamDepartment[];
  members: TeamMemberSummary[];
}

/** Cache de módulo: o inbox inteiro usa o mesmo diretório, não faz sentido buscar por componente. */
let cache: Directory | null = null;
let inFlight: Promise<Directory | null> | null = null;
const listeners = new Set<(d: Directory | null) => void>();

async function fetchDirectory(): Promise<Directory | null> {
  try {
    const res = await fetch('/api/team/directory');
    if (!res.ok) return null;
    return (await res.json()) as Directory;
  } catch {
    return null;
  }
}

function load(force = false): Promise<Directory | null> {
  if (!force && cache) return Promise.resolve(cache);
  if (!force && inFlight) return inFlight;
  inFlight = fetchDirectory().then((data) => {
    inFlight = null;
    if (data) {
      cache = data;
      listeners.forEach((fn) => fn(data));
    }
    return data;
  });
  return inFlight;
}

/** Departamentos, colaboradores e o contexto do próprio usuário (papel e escopo). */
export function useTeamDirectory() {
  const [directory, setDirectory] = useState<Directory | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    listeners.add(setDirectory);
    load().finally(() => setLoading(false));
    return () => {
      listeners.delete(setDirectory);
    };
  }, []);

  const refresh = useCallback(() => load(true), []);

  const nameOfUser = useCallback(
    (userId?: string | null) => {
      if (!userId || !directory) return null;
      return directory.members.find((m) => m.userId === userId)?.fullName ?? null;
    },
    [directory]
  );

  const department = useCallback(
    (departmentId?: string | null) => {
      if (!departmentId || !directory) return null;
      return directory.departments.find((d) => d.id === departmentId) ?? null;
    },
    [directory]
  );

  return {
    me: directory?.me ?? null,
    departments: directory?.departments ?? [],
    members: directory?.members ?? [],
    loading,
    refresh,
    nameOfUser,
    department,
  };
}

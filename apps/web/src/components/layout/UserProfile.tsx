'use client';

import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { LogOut } from 'lucide-react';

function getInitials(email: string): string {
  const part = email.split('@')[0];
  if (!part) return '?';
  if (part.length >= 2) return part.slice(0, 2).toUpperCase();
  return part[0].toUpperCase();
}

export function UserProfile() {
  const { user, loading, signOut } = useUser();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  if (loading) {
    return (
      <div className="p-3 border-t border-white/5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const email = user.email ?? '';
  const displayName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? email.split('@')[0] ?? 'Usuário';

  return (
    <div className="p-3 border-t border-white/5 bg-[#0a0a18]">
      <div className="flex items-center gap-3">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          title={email}
        >
          {getInitials(email)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate" title={displayName}>
            {displayName}
          </p>
          <p className="text-xs text-gray-500 truncate" title={email}>
            {email}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Sair"
          aria-label="Sair do sistema"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

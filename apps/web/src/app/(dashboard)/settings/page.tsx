'use client';

import Link from 'next/link';
import { Settings, Megaphone, Bot, Mail, ChevronRight } from 'lucide-react';

const CONFIG_ITEMS = [
  { href: '/settings/channels', icon: Settings, title: 'Canais', description: 'WhatsApp, Instagram e canais conectados' },
  { href: '/settings/campanhas', icon: Megaphone, title: 'Campanhas', description: 'Campanhas e anúncios' },
  { href: '/settings/ia', icon: Bot, title: 'IA Atendimento', description: 'Piloto automático, sugestões e base de conhecimento' },
  { href: '/settings/resend', icon: Mail, title: 'E-mails (Resend)', description: 'Login e senha enviados aos alunos' },
];

export default function SettingsPage() {
  return (
    <div className="min-h-full bg-gray-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-2">
          <Settings className="w-7 h-7 text-[#7c3aed]" />
          Configurações
        </h1>
        <p className="text-gray-600 text-sm mb-6">
          Escolha uma seção para configurar canais, campanhas, IA e e-mails.
        </p>
        <nav className="space-y-2" aria-label="Seções de configuração">
          {CONFIG_ITEMS.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-[#7c3aed]/40 hover:bg-[#7c3aed]/5 transition-colors group"
            >
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#7c3aed]/10 text-[#7c3aed] shrink-0">
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 group-hover:text-[#7c3aed]">{title}</h2>
                <p className="text-sm text-gray-500 truncate">{description}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

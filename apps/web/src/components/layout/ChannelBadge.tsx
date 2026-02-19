import { MessageCircle, Instagram } from 'lucide-react';
import type { ChannelType } from '@/types';
import { cn } from '@/lib/utils';

interface ChannelBadgeProps {
  type: ChannelType;
  className?: string;
}

export function ChannelBadge({ type, className }: ChannelBadgeProps) {
  const isWhatsApp = type === 'whatsapp';

  return (
    <div
      className={cn(
        'flex items-center justify-center w-6 h-6 rounded-full',
        isWhatsApp
          ? 'bg-green-500 text-white'
          : 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-white',
        className
      )}
    >
      {isWhatsApp ? (
        <MessageCircle className="w-4 h-4" />
      ) : (
        <Instagram className="w-4 h-4" />
      )}
    </div>
  );
}

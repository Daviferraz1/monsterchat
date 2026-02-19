'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { ChannelBadge } from '../layout/ChannelBadge';
import type { Conversation } from '@/types';

interface ChatHeaderProps {
  conversationId: string;
}

export function ChatHeader({ conversationId }: ChatHeaderProps) {
  const supabase = useSupabase();
  const [conversation, setConversation] = useState<Conversation | null>(null);

  useEffect(() => {
    const loadConversation = async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          contact:contacts(*),
          channel:channels(*)
        `)
        .eq('id', conversationId)
        .single();

      if (error) {
        console.error('Error loading conversation:', error);
        return;
      }

      setConversation(data);
    };

    loadConversation();
  }, [conversationId, supabase]);

  if (!conversation) {
    return <div className="h-16 border-b" />;
  }

  const contact = conversation.contact;
  const channel = conversation.channel;
  const displayName = contact?.name || contact?.phone || 'Contato sem nome';

  return (
    <div className="h-16 border-b flex items-center gap-3 px-4">
      {channel && <ChannelBadge type={channel.type} />}
      <div className="flex-1">
        <h2 className="font-semibold">{displayName}</h2>
        <p className="text-sm text-muted-foreground">
          {channel?.name || 'Canal desconhecido'}
        </p>
      </div>
    </div>
  );
}

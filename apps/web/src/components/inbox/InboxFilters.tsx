'use client';

interface InboxFiltersProps {
  filters: {
    status?: string;
    assigned_to?: string;
    channel_id?: string;
  };
  onFiltersChange: (filters: InboxFiltersProps['filters']) => void;
}

export function InboxFilters({ filters, onFiltersChange }: InboxFiltersProps) {
  return (
    <div className="p-4 border-b space-y-2">
      <select
        value={filters.status || ''}
        onChange={(e) =>
          onFiltersChange({ ...filters, status: e.target.value || undefined })
        }
        className="w-full px-3 py-2 border rounded-md bg-background"
      >
        <option value="">Todos os status</option>
        <option value="open">Abertas</option>
        <option value="pending">Pendentes</option>
        <option value="closed">Fechadas</option>
        <option value="snoozed">Adiadas</option>
      </select>
    </div>
  );
}

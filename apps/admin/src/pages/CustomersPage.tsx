import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { formatDateIST, formatPhone, timeAgo } from '@gg/shared';

import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, Select, Spinner, Table, Tabs, Td, Th, toast, Tr } from '@/components/ui';
import { errorMessage, rpc } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AdminUserRow } from '@/lib/types';

type RoleFilter = 'customer' | 'shop_owner' | 'admin' | 'all';

export default function CustomersPage() {
  const { isSuper, profile } = useAuth();
  const qc = useQueryClient();
  const [role, setRole] = useState<RoleFilter>('customer');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(h);
  }, [query]);

  const q = useQuery({
    queryKey: ['users', role, debounced],
    queryFn: () => rpc<AdminUserRow[]>('admin_list_users', { p_query: debounced || null, p_role: role === 'all' ? null : role, p_limit: 200 }),
    placeholderData: (prev) => prev,
  });

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Customers" subtitle="Everyone who signed up. Block accounts that misuse the app (fake orders, abuse)." />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={role}
          onChange={setRole}
          options={[
            { value: 'customer', label: 'Customers' },
            { value: 'shop_owner', label: 'Shop owners' },
            { value: 'admin', label: 'Admins' },
            { value: 'all', label: 'All' },
          ]}
        />
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search by name or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      {q.isError ? <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} /> : null}
      <Card padded={false}>
        {q.isLoading ? (
          <Spinner />
        ) : q.data && !q.data.length ? (
          <Empty title="Nobody found" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Phone / email</Th>
                <Th>Area</Th>
                <Th>Orders</Th>
                <Th>Joined</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {q.data?.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <div className="font-semibold">{u.name ?? '—'}</div>
                    <div className="flex flex-wrap gap-1">
                      {u.role === 'shop_owner' ? <Badge tone="action">Shop owner</Badge> : null}
                      {u.admin_role ? <Badge tone="primary">{u.admin_role === 'super_admin' ? 'Super admin' : 'Support'}</Badge> : null}
                      {u.referral_code ? <span className="text-xs text-slate-400">{u.referral_code}</span> : null}
                    </div>
                  </Td>
                  <Td>
                    <div>{formatPhone(u.phone)}</div>
                    {u.email ? <div className="text-xs text-ink-muted">{u.email}</div> : null}
                  </Td>
                  <Td>{u.area ?? '—'}</Td>
                  <Td className="tabular">
                    {u.orders} <span className="text-xs text-ink-muted">({u.delivered} delivered)</span>
                    {u.last_order_at ? <div className="text-xs text-ink-muted">last {timeAgo(u.last_order_at)}</div> : null}
                  </Td>
                  <Td className="text-xs text-ink-muted">{formatDateIST(u.created_at)}</Td>
                  <Td>{u.deleted ? <Badge>Deleted</Badge> : u.is_blocked ? <Badge tone="error">Blocked</Badge> : <Badge tone="success">Active</Badge>}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {isSuper && u.id !== profile?.user.id && !u.deleted ? (
                        <Select
                          className="h-8 w-36 text-xs"
                          value={u.admin_role ?? ''}
                          disabled={busy === `role-${u.id}`}
                          onChange={(e) => {
                            const v = e.target.value || null;
                            act(`role-${u.id}`, () => rpc('admin_set_admin_role', { p_user_id: u.id, p_role: v }), 'Admin role updated');
                          }}
                          aria-label="Admin role"
                        >
                          <option value="">No admin access</option>
                          <option value="support">Support</option>
                          <option value="super_admin">Super admin</option>
                        </Select>
                      ) : null}
                      {u.id !== profile?.user.id && !u.deleted ? (
                        <Button
                          size="sm"
                          variant={u.is_blocked ? 'outline' : 'danger'}
                          loading={busy === `block-${u.id}`}
                          onClick={() => {
                            if (!u.is_blocked && !window.confirm(`Block ${u.name ?? 'this user'}? They will not be able to order or use the app.`)) return;
                            act(`block-${u.id}`, () => rpc('admin_block_user', { p_user_id: u.id, p_blocked: !u.is_blocked }), u.is_blocked ? 'Unblocked' : 'Blocked');
                          }}
                        >
                          {u.is_blocked ? 'Unblock' : 'Block'}
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { formatDateTimeIST, formatPhone, mapsUrl } from '@gg/shared';

import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, Td, Th, toast, Toggle, Tr } from '@/components/ui';
import { errorMessage, selectAll, upsertRow } from '@/lib/api';
import { useAreas, useZones } from '@/lib/reference';
import type { Area, NotifyMe, Zone } from '@/lib/types';

function AreaForm({ area, open, onClose }: { area: Area | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: zones = [] } = useZones();
  const [f, setF] = useState({ name: '', pincode: '', zone_id: '' as number | '', lat: '', lng: '', is_active: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({ name: area?.name ?? '', pincode: area?.pincode ?? '', zone_id: area?.zone_id ?? '', lat: area?.lat != null ? String(area.lat) : '', lng: area?.lng != null ? String(area.lng) : '', is_active: area?.is_active ?? true });
  }, [open, area]);
  const valid = f.name.trim() && /^[1-9][0-9]{5}$/.test(f.pincode) && f.zone_id;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={area ? `Edit ${area.name}` : 'New area'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!valid}
            onClick={async () => {
              setBusy(true);
              try {
                await upsertRow('areas', {
                  ...(area ? { id: area.id } : {}),
                  name: f.name.trim(),
                  pincode: f.pincode,
                  zone_id: f.zone_id,
                  lat: f.lat ? Number(f.lat) : null,
                  lng: f.lng ? Number(f.lng) : null,
                  is_active: f.is_active,
                });
                toast('Area saved');
                qc.invalidateQueries({ queryKey: ['ref', 'areas'] });
                qc.invalidateQueries({ queryKey: ['areas-admin'] });
                onClose();
              } catch (e) {
                toast(errorMessage(e), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Area name">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Kondapur" />
        </Field>
        <Field label="Pincode" error={f.pincode && !/^[1-9][0-9]{5}$/.test(f.pincode) ? 'Six digits' : null}>
          <Input value={f.pincode} inputMode="numeric" maxLength={6} onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, '') })} placeholder="500084" />
        </Field>
        <Field label="Zone">
          <Select value={f.zone_id} onChange={(e) => setF({ ...f, zone_id: e.target.value ? Number(e.target.value) : '' })}>
            <option value="">Choose…</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </Field>
        <div />
        <Field label="Latitude" hint="Centre of the area, used for distance">
          <Input value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} placeholder="17.4613" />
        </Field>
        <Field label="Longitude">
          <Input value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} placeholder="78.3617" />
        </Field>
      </div>
      <Toggle checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Active (customers can pick it)" />
    </Modal>
  );
}

function AreasTab() {
  const qc = useQueryClient();
  const { data: zones = [], isLoading: zl } = useZones();
  const { data: areas = [], isLoading: al } = useAreas();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Area | null>(null);
  const [creating, setCreating] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const filtered = useMemo(() => areas.filter((a) => !query || a.name.toLowerCase().includes(query.toLowerCase()) || a.pincode.includes(query)), [areas, query]);

  const saveZone = async (z: Partial<Zone>) => {
    try {
      await upsertRow('zones', z);
      qc.invalidateQueries({ queryKey: ['ref', 'zones'] });
      toast('Zone saved');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  if (zl || al) return <Spinner />;
  return (
    <div className="space-y-6">
      <Card title="Zones" actions={
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!zoneName.trim()) return;
            saveZone({ name: zoneName.trim(), sort: zones.length + 1, is_active: true });
            setZoneName('');
          }}
        >
          <Input className="h-8" placeholder="New zone" value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
          <Button size="sm" type="submit" icon={<Plus className="size-3.5" />}>
            Add
          </Button>
        </form>
      }>
        <div className="flex flex-wrap gap-3">
          {zones.map((z) => (
            <div key={z.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
              <span className="font-semibold">{z.name}</span>
              <span className="text-xs text-slate-500">{areas.filter((a) => a.zone_id === z.id).length} areas</span>
              <Toggle checked={z.is_active} onChange={(v) => saveZone({ ...z, is_active: v })} />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search area or pincode" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          New area
        </Button>
      </div>
      <Card padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Area</Th>
              <Th>Pincode</Th>
              <Th>Zone</Th>
              <Th>Location</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <Tr key={a.id}>
                <Td className="font-semibold">{a.name}</Td>
                <Td className="tabular">{a.pincode}</Td>
                <Td>{zones.find((z) => z.id === a.zone_id)?.name}</Td>
                <Td>
                  {a.lat != null ? (
                    <a href={mapsUrl(a.lat, a.lng, a.name)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">
                      <MapPin className="size-3.5" /> {a.lat.toFixed(4)}, {a.lng?.toFixed(4)}
                    </a>
                  ) : (
                    <Badge tone="warning">No location</Badge>
                  )}
                </Td>
                <Td>{a.is_active ? <Badge tone="success">Active</Badge> : <Badge>Hidden</Badge>}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <AreaForm open={creating || !!editing} area={editing} onClose={() => (setEditing(null), setCreating(false))} />
    </div>
  );
}

function WaitlistTab() {
  const q = useQuery({ queryKey: ['notify-me'], queryFn: () => selectAll<NotifyMe>('notify_me', 'created_at', false) });
  const byPlace = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of q.data ?? []) {
      const k = (r.place ?? 'Unknown').trim();
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [q.data]);
  if (q.isLoading) return <Spinner />;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Where people are asking from" className="h-fit">
        {!byPlace.length ? <p className="text-sm text-slate-500">No requests yet.</p> : null}
        <ul className="space-y-2 text-sm">
          {byPlace.slice(0, 20).map(([place, n]) => (
            <li key={place} className="flex justify-between gap-2">
              <span>{place}</span>
              <span className="tabular font-semibold">{n}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-500">These people opened the app outside our delivery area and asked to be told when we launch there. Use this to pick the next city or zone.</p>
      </Card>
      <Card title={`Notify-me requests (${q.data?.length ?? 0})`} padded={false} className="lg:col-span-2">
        {!q.data?.length ? (
          <Empty title="No requests yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Place</Th>
                <Th>Phone</Th>
                <Th>Location</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.place ?? '—'}</Td>
                  <Td>{formatPhone(r.phone)}</Td>
                  <Td>
                    {r.lat != null ? (
                      <a href={mapsUrl(r.lat, r.lng)} target="_blank" rel="noreferrer" className="text-xs text-primary">
                        Map
                      </a>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDateTimeIST(r.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export default function AreasPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'areas' | 'waitlist' | null) ?? 'areas';
  return (
    <div className="space-y-5">
      <PageHeader title="Areas" subtitle="Zones, areas and pincodes that shops can deliver to. Customers outside these areas see the waitlist screen." />
      <Tabs
        value={tab}
        onChange={(v) => setParams({ tab: v })}
        options={[
          { value: 'areas', label: 'Zones & areas' },
          { value: 'waitlist', label: 'Waitlist outside Hyderabad' },
        ]}
      />
      {tab === 'areas' ? <AreasTab /> : <WaitlistTab />}
    </div>
  );
}

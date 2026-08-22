import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Sun,
  Moon,
  CheckCircle2,
  Circle,
  X,
  Save,
  Trash2,
  Calendar,
  Minus,
  Plus,
  Search,
  User,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { api } from '../../utils/api';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

type Slot = 'morning' | 'evening';
type LogStatus = 'DELIVERED' | 'SKIPPED' | 'UNATTEMPTED' | 'FAILED' | 'SYSTEM_AUTO_CLOSED';

// Mirrors delivery.AdminDeliveryLog
type DeliveryLog = {
  id: string;
  customerId: string;
  customerName: string;
  phoneNumber: string;
  houseAddress: string;
  stopOrder: number;
  routeId: string | null;
  routeName: string | null;
  driverName: string | null;
  slot: Slot;
  deliveryDate: string;
  status: LogStatus;
  quantities: Record<string, number>;
  isFlagged: boolean;
  customerFeedback: string | null;
  capturedAt: string | null;
  updatedAt: string;
};

// Mirrors driver.SyncFailure
type SyncFailure = {
  id: string;
  driverId: string | null;
  driverName: string | null;
  payload: Record<string, any>;
  errorMessage: string;
  reason: 'REJECTED_400' | 'TIMED_OUT_48H' | 'OTHER';
  reportedAt: string;
  resolvedAt: string | null;
};

const PRODUCTS = ['milk', 'curd', 'butter', 'ghee', 'lassi', 'paneer', 'jaggery', 'khand', 'oil', 'atta', 'burfi'];

const LABELS: Record<string, string> = {
  milk: 'Milk', curd: 'Curd', butter: 'Butter', ghee: 'Ghee',
  lassi: 'Buttermilk', paneer: 'Paneer', jaggery: 'Jaggery',
  khand: 'Khand', oil: 'Oil', atta: 'Atta', burfi: 'Burfi',
};

const LITRE = new Set(['milk', 'curd', 'lassi', 'oil']);

// -------------------------------------------------------------------------
// Formatting
// -------------------------------------------------------------------------

function fmtQty(val: number, product: string): string {
  if (val === 0) return '—';
  const litre = LITRE.has(product);
  if (val < 1000) return `${val} ${litre ? 'ml' : 'g'}`;
  return `${parseFloat((val / 1000).toFixed(2))} ${litre ? 'L' : 'kg'}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yest.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// -------------------------------------------------------------------------
// Status chip
// -------------------------------------------------------------------------

const STATUS_META: Record<LogStatus, { label: string; cls: string; text: string }> = {
  DELIVERED: { label: 'Delivered', cls: 'bg-green-50 border-green-200', text: 'text-green-700' },
  SKIPPED: { label: 'Skipped', cls: 'bg-red-50 border-red-200', text: 'text-red-700' },
  UNATTEMPTED: { label: 'Unattempted', cls: 'bg-slate-100 border-slate-200', text: 'text-slate-600' },
  FAILED: { label: 'Failed', cls: 'bg-red-50 border-red-200', text: 'text-red-700' },
  SYSTEM_AUTO_CLOSED: { label: 'Auto-closed', cls: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
};

const StatusChip = ({ status }: { status: LogStatus }) => {
  const m = STATUS_META[status];
  return (
    <View className={`self-start px-2 py-0.5 rounded-md border ${m.cls}`}>
      <Text className={`text-[10px] font-black uppercase tracking-wider ${m.text}`}>{m.label}</Text>
    </View>
  );
};

// -------------------------------------------------------------------------
// Edit modal — for one delivery log
//
// Used for both editing an existing log and creating one from a sync
// failure. In the create case, the payload is pre-filled from the failed
// submission. Either way the same POST /delivery/admin handles it via
// upsert.
// -------------------------------------------------------------------------

type EditContext = {
  mode: 'edit' | 'create';
  log?: DeliveryLog;                 // present in edit mode
  fromFailure?: SyncFailure;         // present in create mode from failure
  preset?: { customerId: string; customerName: string; date: string; slot: Slot };  // create from scratch
};

const EditModal = ({ ctx, onClose, onSaved }: { ctx: EditContext | null; onClose: () => void; onSaved: () => void }) => {
  const [status, setStatus] = useState<LogStatus>('DELIVERED');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ctx) return;
    if (ctx.mode === 'edit' && ctx.log) {
      setStatus(ctx.log.status);
      setQuantities({ ...ctx.log.quantities });
      setFeedback(ctx.log.customerFeedback || '');
      return;
    }
    if (ctx.mode === 'create' && ctx.fromFailure) {
      const p = ctx.fromFailure.payload;
      setStatus((p.status || 'DELIVERED') as LogStatus);
      // The queue's payload uses actualOrder for delivered stops.
      setQuantities(p.actualOrder || {});
      setFeedback('');
      return;
    }
    // create-from-scratch
    setStatus('DELIVERED');
    setQuantities({});
    setFeedback('');
  }, [ctx]);

  if (!ctx) return null;

  const adjust = (key: string, delta: number) => {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) + delta) }));
  };

  const customerName = ctx.log?.customerName || ctx.preset?.customerName || 'Customer';
  const date = ctx.log?.deliveryDate || ctx.fromFailure?.payload?.date || ctx.preset?.date || todayISO();
  const slot: Slot = (ctx.log?.slot || ctx.fromFailure?.payload?.slot || ctx.preset?.slot || 'morning') as Slot;

  const save = async () => {
    setSaving(true);
    try {
      if (ctx.mode === 'edit' && ctx.log) {
        // Existing log — use PUT /delivery/:id (partial update).
        await api.put(`/delivery/${ctx.log.id}`, {
          status,
          quantities,
          customerFeedback: feedback || null,
        });
      } else {
        // Create — needs the customer + slot + date + qtys.
        const customerId = ctx.fromFailure?.payload?.customerId || ctx.preset?.customerId;
        if (!customerId) {
          Alert.alert('Missing customer', 'Cannot create a log without a customer.');
          setSaving(false);
          return;
        }
        await api.post('/delivery/admin', {
          customerId,
          slot,
          date,
          status,
          quantities,
          customerFeedback: feedback || null,
        });
        // If this came from a sync failure, mark it resolved so it drops
        // out of the top bucket.
        if (ctx.fromFailure) {
          await api.post(`/driver/sync-failures/${ctx.fromFailure.id}/resolve`, {});
        }
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      onClose();
    } catch (err: any) {
      Alert.alert('Save failed', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!ctx} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-slate-900/40">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="bg-white rounded-t-[32px] px-6 pt-6 pb-8 max-h-[85%]" style={Platform.OS === 'android' ? { elevation: 24 } : {}}>
          <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-5" />

          <View className="flex-row justify-between items-start mb-4">
            <View className="flex-1 pr-3">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {ctx.mode === 'edit' ? 'Edit delivery' : 'Create delivery log'}
              </Text>
              <Text className="text-xl font-black text-slate-900 mt-1">{customerName}</Text>
              <View className="flex-row items-center gap-2 mt-1">
                {slot === 'morning' ? <Sun size={12} color="#F59E0B" /> : <Moon size={12} color="#6366F1" />}
                <Text className="text-slate-500 text-xs font-bold capitalize">{slot}</Text>
                <Text className="text-slate-400 text-xs">·</Text>
                <Text className="text-slate-500 text-xs font-bold">{fmtDate(date)}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} className="h-9 w-9 bg-slate-50 rounded-full items-center justify-center border border-slate-100">
              <X size={16} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Status picker */}
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Status</Text>
            <View className="flex-row flex-wrap gap-2 mb-5">
              {(['DELIVERED', 'SKIPPED', 'UNATTEMPTED', 'FAILED'] as LogStatus[]).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setStatus(s)}
                  className={`px-3 py-2 rounded-xl border ${status === s ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
                >
                  <Text className={`text-xs font-black uppercase tracking-wider ${status === s ? 'text-white' : 'text-slate-600'}`}>
                    {STATUS_META[s].label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Quantities — only meaningful for DELIVERED */}
            {status === 'DELIVERED' && (
              <>
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Quantities</Text>
                <View className="bg-slate-50 rounded-2xl p-3 border border-slate-100 mb-5">
                  {PRODUCTS.map((p) => {
                    const qty = quantities[p] || 0;
                    // Step by 500 for litres (half-litre bumps), 100 for grams.
                    const step = LITRE.has(p) ? 500 : 100;
                    return (
                      <View key={p} className="flex-row items-center justify-between py-2">
                        <Text className="font-bold text-slate-700 flex-1">{LABELS[p]}</Text>
                        <View className="flex-row items-center gap-2">
                          <Pressable
                            onPress={() => adjust(p, -step)}
                            className="h-8 w-8 bg-white border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100"
                          >
                            <Minus size={14} color="#334155" />
                          </Pressable>
                          <View className="w-20 items-center">
                            <Text className="font-black text-slate-800 text-sm">{fmtQty(qty, p)}</Text>
                          </View>
                          <Pressable
                            onPress={() => adjust(p, step)}
                            className="h-8 w-8 bg-white border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100"
                          >
                            <Plus size={14} color="#334155" />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* Feedback */}
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notes (optional)</Text>
            <TextInput
              value={feedback}
              onChangeText={setFeedback}
              placeholder="Add a note about this correction…"
              multiline
              maxLength={500}
              className="bg-white border border-slate-200 rounded-2xl px-4 py-3 min-h-[80px] text-sm text-slate-700 mb-5"
              style={{ textAlignVertical: 'top' }}
            />
          </ScrollView>

          <Pressable
            onPress={save}
            disabled={saving}
            className="bg-slate-900 h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90"
          >
            {saving ? <ActivityIndicator color="white" /> : (
              <>
                <Save size={16} color="white" />
                <Text className="text-white font-black text-base tracking-wide">
                  {ctx.mode === 'edit' ? 'Save Changes' : 'Create Log'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

// -------------------------------------------------------------------------
// Sync failure card
//
// Sync failures are always at the top of the screen because they're the
// most urgent — a driver's phone couldn't reach the backend and the
// delivery may never have been recorded. Admin sees the failed payload,
// then either creates a proper log from it or dismisses it.
// -------------------------------------------------------------------------

const SyncFailureCard = ({ failure, onFix, onDismiss }: any) => {
  const p = failure.payload;
  const customerLine = p.customerId ? `Customer ${String(p.customerId).slice(0, 8)}…` : 'Unknown customer';
  const items = Object.entries(p.actualOrder || {})
    .filter(([, v]: any) => v > 0)
    .map(([k, v]: any) => `${LABELS[k] || k} ${fmtQty(v, k)}`)
    .join(' · ') || 'no quantities';

  return (
    <View className="bg-white rounded-3xl p-4 mb-3 border-2 border-amber-200">
      <View className="flex-row items-start gap-3 mb-3">
        <View className="w-9 h-9 rounded-full bg-amber-50 items-center justify-center">
          <AlertTriangle size={16} color="#D97706" />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-bold text-amber-800 uppercase tracking-wider">
            {failure.reason === 'REJECTED_400' ? 'Rejected by server' : failure.reason === 'TIMED_OUT_48H' ? 'Timed out after 48h' : 'Sync failed'}
          </Text>
          <Text className="text-slate-900 font-black text-base mt-0.5">{customerLine}</Text>
          <Text className="text-slate-500 text-xs mt-0.5">
            {failure.driverName || 'Unknown driver'} · {p.slot} · {fmtDate(p.date || todayISO())}
          </Text>
        </View>
      </View>

      <View className="bg-slate-50 rounded-xl px-3 py-2 mb-3">
        <Text className="text-slate-600 text-xs font-medium leading-4" numberOfLines={2}>{items}</Text>
      </View>

      <View className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">
        <Text className="text-red-800 text-xs font-medium leading-4" numberOfLines={3}>
          {failure.errorMessage}
        </Text>
      </View>

      <View className="flex-row gap-2">
        <Pressable
          onPress={() => onDismiss(failure.id)}
          className="flex-1 h-11 bg-white border border-slate-200 rounded-xl items-center justify-center active:bg-slate-50"
        >
          <Text className="text-slate-600 font-bold text-sm">Dismiss</Text>
        </Pressable>
        <Pressable
          onPress={() => onFix(failure)}
          className="flex-[2] h-11 bg-slate-900 rounded-xl items-center justify-center active:opacity-90"
        >
          <Text className="text-white font-black text-sm">Create Log from This</Text>
        </Pressable>
      </View>
    </View>
  );
};

// -------------------------------------------------------------------------
// Delivery log row
// -------------------------------------------------------------------------

const LogRow = ({ log, onPress }: any) => {
  const items = Object.entries(log.quantities || {})
    .filter(([, v]: any) => v > 0)
    .map(([k, v]: any) => `${LABELS[k] || k} ${fmtQty(v, k)}`)
    .join(' · ');

  return (
    <Pressable
      onPress={() => onPress(log)}
      className="bg-white border border-slate-200 rounded-2xl p-4 mb-2 active:bg-slate-50"
    >
      <View className="flex-row justify-between items-start mb-1">
        <View className="flex-row items-center gap-2 flex-1 pr-2">
          {log.slot === 'morning' ? <Sun size={12} color="#F59E0B" /> : <Moon size={12} color="#6366F1" />}
          <Text className="font-black text-slate-900 flex-1" numberOfLines={1}>{log.customerName}</Text>
        </View>
        <StatusChip status={log.status} />
      </View>
      <Text className="text-slate-500 text-xs font-medium mb-1" numberOfLines={1}>{log.houseAddress}</Text>
      {items ? (
        <Text className="text-slate-600 text-xs mt-1" numberOfLines={2}>{items}</Text>
      ) : (
        <Text className="text-slate-400 text-xs italic mt-1">Nothing recorded</Text>
      )}
      {log.isFlagged && (
        <View className="flex-row items-center gap-1 mt-2">
          <AlertTriangle size={12} color="#DC2626" />
          <Text className="text-red-700 text-xs font-bold">Flagged by customer</Text>
        </View>
      )}
    </Pressable>
  );
};

// -------------------------------------------------------------------------
// Screen
// -------------------------------------------------------------------------

export default function DeliveryLogsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();

  const [date, setDate] = useState<string>(params.date || todayISO());
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [failures, setFailures] = useState<SyncFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LogStatus | 'all'>('all');
  const [editCtx, setEditCtx] = useState<EditContext | null>(null);

  const load = useCallback(async () => {
    // allSettled — one endpoint failing shouldn't blank the other.
    const [logsRes, failRes] = await Promise.allSettled([
      api.get(`/delivery?date=${date}&limit=1000`),
      api.get('/driver/sync-failures'),
    ]);
    if (logsRes.status === 'fulfilled') setLogs(logsRes.value || []);
    else console.log('logs failed:', logsRes.reason?.message);
    if (failRes.status === 'fulfilled') setFailures(failRes.value || []);
    else console.log('failures failed:', failRes.reason?.message);
    setLoading(false);
    setRefreshing(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const handleFixFromFailure = (failure: SyncFailure) => {
    setEditCtx({ mode: 'create', fromFailure: failure });
  };

  const handleDismissFailure = (id: string) => {
    Alert.alert('Dismiss this failure?', 'It will be hidden from the list. Only do this if you\'re sure no delivery needs recording.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/driver/sync-failures/${id}/resolve`, {});
            load();
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to dismiss');
          }
        },
      },
    ]);
  };

  // Filter logs client-side. At 200 rows per day this is fine; if we ever
  // hit a route with 500+ stops we'd push the filters to the backend.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (q && !l.customerName.toLowerCase().includes(q) && !l.phoneNumber.includes(q) && !l.houseAddress.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [logs, search, statusFilter]);

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        {/* Header */}
        <View className="flex-row items-center gap-3 px-5 pt-2 pb-3">
          <Pressable
            onPress={() => router.back()}
            className="w-11 h-11 bg-white rounded-2xl items-center justify-center border border-slate-200 active:bg-slate-50"
          >
            <ChevronLeft size={20} color="#0F172A" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-xl font-black text-slate-900 tracking-tight">Delivery Logs</Text>
            <Text className="text-xs font-semibold text-slate-400">Correct or create any log</Text>
          </View>
        </View>

        {/* Date navigator */}
        <View className="flex-row items-center justify-center gap-2 px-5 pb-3">
          <Pressable
            onPress={() => setDate(shiftDate(date, -1))}
            className="w-9 h-9 bg-white rounded-lg items-center justify-center border border-slate-200 active:bg-slate-50"
          >
            <ChevronLeft size={16} color="#0F172A" />
          </Pressable>
          <View className="bg-white px-4 py-2 rounded-xl border border-slate-200 flex-row items-center gap-2">
            <Calendar size={14} color="#64748B" />
            <Text className="font-black text-slate-800 text-sm">{fmtDate(date)}</Text>
          </View>
          <Pressable
            onPress={() => setDate(shiftDate(date, 1))}
            disabled={date >= todayISO()}
            className={`w-9 h-9 rounded-lg items-center justify-center border ${date >= todayISO() ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200 active:bg-slate-50'}`}
          >
            <ChevronRight size={16} color={date >= todayISO() ? '#CBD5E1' : '#0F172A'} />
          </Pressable>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#0F172A" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 20 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#0F172A" />}
          >
            {/* Sync failures — top of screen if any */}
            {failures.length > 0 && (
              <>
                <View className="flex-row items-center gap-2 mb-2 mt-1">
                  <AlertTriangle size={14} color="#D97706" />
                  <Text className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                    Needs Attention · {failures.length}
                  </Text>
                </View>
                {failures.map((f) => (
                  <SyncFailureCard
                    key={f.id}
                    failure={f}
                    onFix={handleFixFromFailure}
                    onDismiss={handleDismissFailure}
                  />
                ))}
                <View className="h-4" />
              </>
            )}

            {/* Search + filter */}
            <View className="flex-row items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2 mb-3">
              <Search size={14} color="#94A3B8" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search customer, phone, address…"
                placeholderTextColor="#94A3B8"
                className="flex-1 text-sm text-slate-700"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} className="h-6 w-6 items-center justify-center">
                  <X size={14} color="#94A3B8" />
                </Pressable>
              )}
            </View>

            <View className="flex-row flex-wrap gap-2 mb-4">
              {(['all', 'DELIVERED', 'SKIPPED', 'UNATTEMPTED'] as const).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg border ${statusFilter === s ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
                >
                  <Text className={`text-xs font-black uppercase tracking-wider ${statusFilter === s ? 'text-white' : 'text-slate-500'}`}>
                    {s === 'all' ? 'All' : STATUS_META[s as LogStatus].label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Log list */}
            {filtered.length === 0 ? (
              <View className="items-center justify-center py-16">
                <Circle size={32} color="#CBD5E1" />
                <Text className="text-slate-500 font-bold mt-3">No logs match</Text>
                <Text className="text-slate-400 text-xs mt-1">
                  {logs.length === 0 ? 'No deliveries recorded for this date' : 'Try adjusting the filters'}
                </Text>
              </View>
            ) : (
              filtered.map((log) => (
                <LogRow key={log.id} log={log} onPress={() => setEditCtx({ mode: 'edit', log })} />
              ))
            )}
          </ScrollView>
        )}

        <EditModal
          ctx={editCtx}
          onClose={() => setEditCtx(null)}
          onSaved={load}
        />
      </SafeAreaView>
    </View>
  );
}

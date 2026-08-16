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
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Sun,
  Moon,
  Check,
  X,
  ArrowRight,
  Inbox,
  Clock,
  AlertTriangle,
  Route as RouteIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { api } from '../../utils/api';

// -------------------------------------------------------------------------
// Types — mirror update.PendingChange
// -------------------------------------------------------------------------

type Slot = 'morning' | 'evening';

type Order = Record<string, number>;

type SlotSubscription = {
  slot: Slot;
  subscribed: boolean;
  scheduleType: 'daily' | 'alternate' | 'custom';
  activeDays: number[];
  startDate: string;
  items: Order;
};

type PendingChange = {
  id: string;
  customerId: string;
  phoneNumber: string;
  addressChanged: boolean;
  submittedAt: string;
  reviewStatus: string;
  effectiveFrom: string | null;

  name: string;
  address: string;
  latitude: string;
  longitude: string;
  subscriptions: SlotSubscription[];

  currentName: string;
  currentAddress: string;
  currentSubscriptions: SlotSubscription[];
};

type RouteOption = { id: string; name: string };

const PRODUCTS = ['milk', 'curd', 'butter', 'ghee', 'lassi', 'paneer', 'jaggery', 'khand', 'oil', 'atta', 'burfi'];

const LABELS: Record<string, string> = {
  milk: 'Milk', curd: 'Curd', butter: 'Butter', ghee: 'Ghee',
  lassi: 'Buttermilk', paneer: 'Paneer', jaggery: 'Jaggery',
  khand: 'Khand', oil: 'Oil', atta: 'Atta', burfi: 'Burfi',
};

const LITRE = new Set(['milk', 'curd', 'lassi', 'oil']);
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The API returns items in customer.Order shape (milkQuantity, curdQuantity…).
function q(items: any, key: string): number {
  if (!items) return 0;
  return items[key + 'Quantity'] ?? items[key] ?? 0;
}

function fmtQty(val: number, product: string): string {
  if (!val) return '—';
  const litre = LITRE.has(product);
  if (val < 1000) return `${val} ${litre ? 'ml' : 'g'}`;
  return `${parseFloat((val / 1000).toFixed(2))} ${litre ? 'L' : 'kg'}`;
}

function scheduleText(s: SlotSubscription): string {
  if (!s) return '—';
  if (s.scheduleType === 'daily') return 'Every day';
  if (s.scheduleType === 'alternate') return 'Alternate days';
  const days = (s.activeDays || []).slice().sort();
  if (days.length === 7) return 'Every day';
  if (!days.length) return 'No days';
  return days.map((d) => DAY_SHORT[d]).join(', ');
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function bySlot(list: SlotSubscription[], slot: Slot): SlotSubscription | null {
  return (list || []).find((s) => s.slot === slot) || null;
}

// -------------------------------------------------------------------------
// Diff row — old value on the left, new on the right, arrow only when changed
//
// Showing unchanged fields greyed rather than hiding them keeps the two
// columns aligned, so the eye can scan for the arrow instead of reading
// every line.
// -------------------------------------------------------------------------

const DiffRow = ({ label, before, after }: { label: string; before: string; after: string }) => {
  const changed = before !== after;
  return (
    <View className={`flex-row items-center py-2.5 ${changed ? '' : 'opacity-45'}`}>
      <Text className="w-20 text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</Text>
      <Text className="flex-1 text-sm text-slate-500" numberOfLines={2}>{before || '—'}</Text>
      {changed ? (
        <>
          <ArrowRight size={13} color="#059669" style={{ marginHorizontal: 6 }} />
          <Text className="flex-1 text-sm font-bold text-emerald-700" numberOfLines={2}>{after || '—'}</Text>
        </>
      ) : (
        <View className="flex-1 ml-6">
          <Text className="text-sm text-slate-400">no change</Text>
        </View>
      )}
    </View>
  );
};

// -------------------------------------------------------------------------
// Slot comparison block
// -------------------------------------------------------------------------

const SlotDiff = ({ slot, before, after }: { slot: Slot; before: SlotSubscription | null; after: SlotSubscription | null }) => {
  const Icon = slot === 'morning' ? Sun : Moon;
  const color = slot === 'morning' ? '#F59E0B' : '#6366F1';

  const added = !before && !!after;
  const removed = !!before && !after;

  const changedProducts = PRODUCTS.filter((p) => q(before?.items, p) !== q(after?.items, p));
  const keptProducts = PRODUCTS.filter((p) => q(after?.items, p) > 0 && !changedProducts.includes(p));

  return (
    <View className={`rounded-2xl border p-4 mb-3 ${removed ? 'border-rose-200 bg-rose-50/40' : added ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
      <View className="flex-row items-center gap-2 mb-3">
        <Icon size={15} color={color} />
        <Text className="font-black text-slate-900 text-sm capitalize flex-1">{slot}</Text>
        {added && (
          <View className="bg-emerald-100 px-2 py-0.5 rounded-md">
            <Text className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">Added</Text>
          </View>
        )}
        {removed && (
          <View className="bg-rose-100 px-2 py-0.5 rounded-md">
            <Text className="text-[10px] font-black text-rose-800 uppercase tracking-wider">Cancelled</Text>
          </View>
        )}
      </View>

      {removed ? (
        <Text className="text-sm text-rose-800 font-medium">
          This delivery will stop. Any future overrides for it are removed too.
        </Text>
      ) : (
        <>
          <DiffRow label="Schedule" before={before ? scheduleText(before) : '—'} after={after ? scheduleText(after) : '—'} />

          {changedProducts.length > 0 && (
            <View className="mt-1 pt-2 border-t border-slate-100">
              {changedProducts.map((p) => (
                <DiffRow
                  key={p}
                  label={LABELS[p]}
                  before={fmtQty(q(before?.items, p), p)}
                  after={fmtQty(q(after?.items, p), p)}
                />
              ))}
            </View>
          )}

          {keptProducts.length > 0 && (
            <Text className="text-xs text-slate-400 mt-2 leading-4">
              Unchanged: {keptProducts.map((p) => `${LABELS[p]} ${fmtQty(q(after?.items, p), p)}`).join(' · ')}
            </Text>
          )}
        </>
      )}
    </View>
  );
};

// -------------------------------------------------------------------------
// Approve sheet — optional re-routing
// -------------------------------------------------------------------------

const ApproveSheet = ({ change, routes, onClose, onDone }: any) => {
  const [assigning, setAssigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picks, setPicks] = useState<Record<Slot, { routeId: string; stopOrder: string }>>({
    morning: { routeId: '', stopOrder: '' },
    evening: { routeId: '', stopOrder: '' },
  });

  useEffect(() => {
    // Default the toggle on when the address moved — that's the case where
    // the existing stop sequence is most likely wrong.
    if (change) setAssigning(!!change.addressChanged);
  }, [change]);

  if (!change) return null;

  const proposedSlots: Slot[] = (change.subscriptions || []).map((s: SlotSubscription) => s.slot);

  const submit = async () => {
    setSaving(true);
    try {
      const assignments = assigning
        ? proposedSlots
          .filter((s) => picks[s].routeId && picks[s].stopOrder)
          .map((s) => ({
            slot: s,
            routeId: picks[s].routeId,
            stopOrder: parseInt(picks[s].stopOrder, 10) || 0,
          }))
        : [];

      await api.post(`/update/changes/${change.id}/approve`, { assignments });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
      onClose();
    } catch (err: any) {
      Alert.alert('Could not approve', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!change} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-slate-900/40">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="bg-white rounded-t-[32px] px-6 pt-6 pb-8 max-h-[85%]" style={Platform.OS === 'android' ? { elevation: 24 } : {}}>
          <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-5" />

          <View className="flex-row justify-between items-start mb-2">
            <View className="flex-1 pr-3">
              <Text className="text-xl font-black text-slate-900">Approve change</Text>
              <Text className="text-slate-500 text-sm mt-0.5">{change.currentName}</Text>
            </View>
            <Pressable onPress={onClose} className="h-9 w-9 bg-slate-50 rounded-full items-center justify-center border border-slate-100">
              <X size={16} color="#64748B" />
            </Pressable>
          </View>

          <View className="bg-blue-50/60 border border-blue-100 rounded-2xl p-3.5 flex-row gap-2.5 mb-5">
            <Clock size={15} color="#2563EB" />
            <Text className="text-blue-900 text-xs font-medium flex-1 leading-5">
              This takes effect from tomorrow. Today's deliveries go ahead on the customer's existing order.
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {change.addressChanged && (
              <View className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex-row gap-2.5 mb-4">
                <MapPin size={15} color="#D97706" />
                <Text className="text-amber-900 text-xs font-medium flex-1 leading-5">
                  The address changed. Their current stop position may no longer make sense on the route.
                </Text>
              </View>
            )}

            <Pressable
              onPress={() => setAssigning(!assigning)}
              className={`flex-row items-center gap-3 p-4 rounded-2xl border mb-4 ${assigning ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'}`}
            >
              <View className={`w-5 h-5 rounded-md items-center justify-center border-2 ${assigning ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                {assigning && <Check size={12} color="white" strokeWidth={3} />}
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-800 text-sm">Also reassign route</Text>
                <Text className="text-slate-500 text-xs mt-0.5">Leave off to keep their current routing</Text>
              </View>
            </Pressable>

            {assigning && proposedSlots.map((slot) => (
              <View key={slot} className="mb-4">
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 capitalize">{slot} route</Text>
                <View className="flex-row flex-wrap gap-2 mb-2">
                  {routes.map((rt: RouteOption) => (
                    <Pressable
                      key={rt.id}
                      onPress={() => setPicks((p) => ({ ...p, [slot]: { ...p[slot], routeId: rt.id } }))}
                      className={`px-3 py-2 rounded-xl border ${picks[slot].routeId === rt.id ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
                    >
                      <Text className={`text-xs font-bold ${picks[slot].routeId === rt.id ? 'text-white' : 'text-slate-600'}`}>{rt.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={picks[slot].stopOrder}
                  onChangeText={(v) => setPicks((p) => ({ ...p, [slot]: { ...p[slot], stopOrder: v.replace(/[^0-9]/g, '') } }))}
                  placeholder="Stop number (e.g. 7)"
                  keyboardType="number-pad"
                  className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700"
                />
              </View>
            ))}
          </ScrollView>

          <Pressable
            onPress={submit}
            disabled={saving}
            className="bg-emerald-600 h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90 mt-2"
          >
            {saving ? <ActivityIndicator color="white" /> : (
              <>
                <Check size={17} color="white" strokeWidth={2.5} />
                <Text className="text-white font-black text-base">Approve — effective tomorrow</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

// -------------------------------------------------------------------------
// Reject sheet
// -------------------------------------------------------------------------

const PRESET_REASONS = [
  'Requested quantity is beyond our current supply',
  'New address is outside our delivery area',
  'Schedule requested is not available on this route',
  'We need to confirm some details with you first',
];

const RejectSheet = ({ change, onClose, onDone }: any) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (change) setReason(''); }, [change]);

  if (!change) return null;

  const submit = async () => {
    if (reason.trim().length < 5) return;
    setSaving(true);
    try {
      await api.post(`/update/changes/${change.id}/reject`, { reason: reason.trim() });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onDone();
      onClose();
    } catch (err: any) {
      Alert.alert('Could not reject', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!change} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-slate-900/40">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="bg-white rounded-t-[32px] px-6 pt-6 pb-8 max-h-[85%]" style={Platform.OS === 'android' ? { elevation: 24 } : {}}>
          <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-5" />

          <View className="flex-row justify-between items-start mb-2">
            <View className="flex-1 pr-3">
              <Text className="text-xl font-black text-slate-900">Decline change</Text>
              <Text className="text-slate-500 text-sm mt-0.5">{change.currentName}</Text>
            </View>
            <Pressable onPress={onClose} className="h-9 w-9 bg-slate-50 rounded-full items-center justify-center border border-slate-100">
              <X size={16} color="#64748B" />
            </Pressable>
          </View>

          <View className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-3.5 flex-row gap-2.5 mb-5">
            <Check size={15} color="#059669" />
            <Text className="text-emerald-900 text-xs font-medium flex-1 leading-5">
              Their existing deliveries continue unchanged. Declining costs them nothing — they stay active on their current order.
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Reason (sent to the customer)</Text>
            {PRESET_REASONS.map((preset) => (
              <Pressable
                key={preset}
                onPress={() => setReason(preset)}
                className={`p-3.5 rounded-xl border mb-2 ${reason === preset ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'}`}
              >
                <Text className={`text-sm ${reason === preset ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{preset}</Text>
              </Pressable>
            ))}

            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Or write your own…"
              multiline
              maxLength={300}
              className="bg-white border border-slate-200 rounded-2xl px-4 py-3 min-h-[80px] text-sm text-slate-700 mt-2"
              style={{ textAlignVertical: 'top' }}
            />
          </ScrollView>

          <Pressable
            onPress={submit}
            disabled={saving || reason.trim().length < 5}
            className={`h-14 rounded-2xl items-center justify-center flex-row gap-2 mt-4 ${reason.trim().length < 5 ? 'bg-slate-200' : 'bg-rose-600 active:opacity-90'}`}
          >
            {saving ? <ActivityIndicator color="white" /> : (
              <Text className={`font-black text-base ${reason.trim().length < 5 ? 'text-slate-400' : 'text-white'}`}>
                {reason.trim().length < 5 ? 'Pick or write a reason' : 'Decline and notify'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

// -------------------------------------------------------------------------
// Screen
// -------------------------------------------------------------------------

export default function ChangeRequestsScreen() {
  const router = useRouter();

  const [changes, setChanges] = useState<PendingChange[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approving, setApproving] = useState<PendingChange | null>(null);
  const [rejecting, setRejecting] = useState<PendingChange | null>(null);

  const load = useCallback(async () => {
    const [chRes, rtRes] = await Promise.allSettled([
      api.get('/update/changes'),
      api.get('/route?page=1&limit=100'),
    ]);
    if (chRes.status === 'fulfilled') setChanges(chRes.value || []);
    else console.log('changes failed:', chRes.reason?.message);
    if (rtRes.status === 'fulfilled') {
      setRoutes((rtRes.value || []).map((r: any) => ({ id: r.id, name: r.name })));
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <View className="flex-row items-center gap-3 px-5 pt-2 pb-4">
          <Pressable
            onPress={() => router.back()}
            className="w-11 h-11 bg-white rounded-2xl items-center justify-center border border-slate-200 active:bg-slate-50"
          >
            <ChevronLeft size={20} color="#0F172A" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-xl font-black text-slate-900 tracking-tight">Change Requests</Text>
            <Text className="text-xs font-semibold text-slate-400">
              {changes.length > 0 ? `${changes.length} awaiting review` : 'Customer profile & order edits'}
            </Text>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#0F172A" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#0F172A" />}
          >
            {changes.length === 0 ? (
              <View className="items-center justify-center py-20">
                <Inbox size={38} color="#CBD5E1" />
                <Text className="text-slate-700 font-bold mt-3 text-base">Nothing to review</Text>
                <Text className="text-slate-400 text-xs mt-1 text-center px-8 leading-5">
                  When a customer edits their profile or order, it appears here. Their deliveries continue unchanged until you approve.
                </Text>
              </View>
            ) : (
              changes.map((c) => {
                const isOpen = expanded === c.id;
                return (
                  <View key={c.id} className="bg-white rounded-3xl border border-slate-200 mb-3 overflow-hidden">
                    <Pressable
                      onPress={() => setExpanded(isOpen ? null : c.id)}
                      className="p-4 active:bg-slate-50"
                    >
                      <View className="flex-row items-start justify-between mb-1">
                        <View className="flex-1 pr-2">
                          <Text className="font-black text-slate-900 text-base">{c.currentName}</Text>
                          <Text className="text-slate-500 text-xs mt-0.5">{c.phoneNumber}</Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-slate-400 text-[11px] font-semibold">{timeAgo(c.submittedAt)}</Text>
                          <ChevronRight
                            size={15}
                            color="#CBD5E1"
                            style={{ marginTop: 4, transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
                          />
                        </View>
                      </View>

                      <View className="flex-row flex-wrap gap-1.5 mt-2">
                        {c.addressChanged && (
                          <View className="flex-row items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">
                            <MapPin size={10} color="#D97706" />
                            <Text className="text-[10px] font-black text-amber-800 uppercase tracking-wider">Address moved</Text>
                          </View>
                        )}
                        {(['morning', 'evening'] as Slot[]).map((slot) => {
                          const before = bySlot(c.currentSubscriptions, slot);
                          const after = bySlot(c.subscriptions, slot);
                          if (!before && !after) return null;
                          const added = !before && after;
                          const removed = before && !after;
                          if (!added && !removed) return null;
                          return (
                            <View
                              key={slot}
                              className={`px-2 py-1 rounded-md border ${added ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}
                            >
                              <Text className={`text-[10px] font-black uppercase tracking-wider ${added ? 'text-emerald-800' : 'text-rose-800'}`}>
                                {slot} {added ? 'added' : 'cancelled'}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </Pressable>

                    {isOpen && (
                      <View className="px-4 pb-4 border-t border-slate-100 pt-3">
                        <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Profile</Text>
                        <View className="bg-slate-50 rounded-2xl px-3.5 py-1 mb-4">
                          <DiffRow label="Name" before={c.currentName} after={c.name} />
                          <DiffRow label="Address" before={c.currentAddress} after={c.address} />
                        </View>

                        <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Deliveries</Text>
                        {(['morning', 'evening'] as Slot[]).map((slot) => {
                          const before = bySlot(c.currentSubscriptions, slot);
                          const after = bySlot(c.subscriptions, slot);
                          if (!before && !after) return null;
                          return <SlotDiff key={slot} slot={slot} before={before} after={after} />;
                        })}

                        <View className="flex-row gap-2.5 mt-2">
                          <Pressable
                            onPress={() => setRejecting(c)}
                            className="flex-1 h-12 bg-white border border-rose-200 rounded-2xl items-center justify-center active:bg-rose-50"
                          >
                            <Text className="text-rose-600 font-bold text-sm">Decline</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setApproving(c)}
                            className="flex-[1.6] h-12 bg-emerald-600 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90"
                          >
                            <Check size={16} color="white" strokeWidth={2.5} />
                            <Text className="text-white font-black text-sm">Approve</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        <ApproveSheet
          change={approving}
          routes={routes}
          onClose={() => setApproving(null)}
          onDone={load}
        />
        <RejectSheet
          change={rejecting}
          onClose={() => setRejecting(null)}
          onDone={load}
        />
      </SafeAreaView>
    </View>
  );
}

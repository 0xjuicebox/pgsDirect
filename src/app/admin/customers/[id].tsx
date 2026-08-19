import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft, Trash2, Phone, MessageCircle, CheckCircle2, XCircle,
  Sun, Moon, Route as RouteIcon, PlusCircle, Minus, Plus, X, Undo2,
  ReceiptText, Package, Wallet, User, AlertTriangle, ChevronLeft,
  ChevronRight, Flag, ExternalLink, Ban,
} from 'lucide-react-native';
import { Linking as RNLinking } from 'react-native';

import { api } from '../../../utils/api';

// -------------------------------------------------------------------------
// Types — mirror the rewritten backend exactly
// -------------------------------------------------------------------------

type CustomerDetail = {
  id: string;
  customer: string;
  phoneNumber: string;
  houseAddress: string;
  geoLatitude: string;
  geoLongitude: string;
  isActive: boolean;
  status: 'pending' | 'active' | 'disabled' | 'rejected' | 'suspended';
};

// One delivery log row, as returned by GET /billing/customer/{id}?month=
type BillDay = {
  logId: string;
  date: string;
  slot: 'morning' | 'evening';
  status: string;
  quantities: { [k: string]: number };
  dayTotal: number;
  isFlagged: boolean;
};

// One invoice, from GET /billing/customer/{id}/invoices
type CustomerInvoice = {
  invoiceId: string;
  billingMonth: string;
  totalAmount: number;
  status: string;
  paidAt: string | null;
  paymentReference: string | null;
  reminderCount: number;
  suspendedAt: string | null;
  payUrl: string;
  lineItems: string[];
};

type TabKey = 'overview' | 'deliveries' | 'billing';

type RouteItem = { id: string; name: string };

type OrderState = { [key: string]: number };

// A subscription row is one slot's entire delivery plan: schedule, items,
// and (once approved) routing. routeId/stopOrder are absent from the JSON
// entirely when unset — not null — because the Go side uses omitempty.
type Subscription = {
  id: string;
  customerId: string;
  slot: 'morning' | 'evening';
  scheduleType: 'daily' | 'alternate' | 'custom';
  activeDays: number[];
  anchorDate: string;
  defaultOrder: OrderState;
  routeId?: string;
  stopOrder?: number;
};

type RosterStop = { id: string; name: string; stopOrder: number };

const PRODUCTS = [
  { key: 'milkQuantity', label: 'Milk', icon: '🥛', unit: 'L', min: 0, max: 10000, step: 500 },
  { key: 'curdQuantity', label: 'Curd', icon: '🍶', unit: 'L', min: 0, max: 10000, step: 500 },
  { key: 'butterQuantity', label: 'Butter', icon: '🧈', unit: 'kg', min: 0, max: 20000, step: 250 },
  { key: 'gheeQuantity', label: 'Desi Ghee', icon: '🫙', unit: 'kg', min: 0, max: 20000, step: 250 },
  { key: 'lassiQuantity', label: 'Buttermilk', icon: '🥤', unit: 'L', min: 0, max: 10000, step: 500 },
  { key: 'paneerQuantity', label: 'Paneer', icon: '🧀', unit: 'kg', min: 0, max: 10000, step: 250 },
  { key: 'jaggeryQuantity', label: 'Jaggery', icon: '🍯', unit: 'kg', min: 0, max: 20000, step: 250 },
  { key: 'khandQuantity', label: 'Desi Khand', icon: '🍚', unit: 'kg', min: 0, max: 20000, step: 250 },
  { key: 'oilQuantity', label: 'Mustard Oil', icon: '🫗', unit: 'L', min: 0, max: 20000, step: 500 },
  { key: 'attaQuantity', label: 'Atta', icon: '🌾', unit: 'kg', min: 0, max: 20000, step: 250 },
  { key: 'burfiQuantity', label: 'Milk Burfi', icon: '🍬', unit: 'kg', min: 0, max: 20000, step: 250 },
];

const DAYS_OF_WEEK = [
  { index: 0, label: 'S' }, { index: 1, label: 'M' }, { index: 2, label: 'T' },
  { index: 3, label: 'W' }, { index: 4, label: 'T' }, { index: 5, label: 'F' },
  { index: 6, label: 'S' },
];

const EMPTY_ORDER: OrderState = PRODUCTS.reduce((acc, p) => ({ ...acc, [p.key]: 0 }), {});

const REJECTION_REASONS = [
  'Outside current delivery zone',
  'No available delivery slots on this route',
  'Incomplete address or unverified location',
  'Duplicate request',
];

// -------------------------------------------------------------------------
// Small shared bits
// -------------------------------------------------------------------------

const ProductStepper = ({ value, onChange, min, max, step, unit }: any) => (
  <View className="flex-row items-center gap-2">
    <Pressable
      onPress={() => onChange(Math.max(min, value - step))}
      className="h-9 w-9 bg-white border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100"
    >
      <Minus size={16} color="#334155" />
    </Pressable>
    <View className="items-center w-14">
      <Text className="text-base font-black text-slate-800">{value}</Text>
      <Text className="text-[10px] text-slate-400 font-semibold">{unit}</Text>
    </View>
    <Pressable
      onPress={() => onChange(Math.min(max, value + step))}
      className="h-9 w-9 bg-white border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100"
    >
      <Plus size={16} color="#334155" />
    </Pressable>
  </View>
);

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-100 border-green-200 text-green-800',
  rejected: 'bg-red-100 border-red-200 text-red-800',
  disabled: 'bg-slate-100 border-slate-200 text-slate-600',
  pending: 'bg-amber-100 border-amber-200 text-amber-800',
};

// -------------------------------------------------------------------------
// SlotPanel — everything about ONE slot (morning or evening) lives here.
// It's intentionally self-contained: its own edit state, its own save call,
// its own route-approval call. A customer's two slots never interfere with
// each other because neither this component nor the backend lets them.
// -------------------------------------------------------------------------

function SlotPanel({
  customerId,
  slot,
  subscription,
  routes,
  onChanged,
}: {
  customerId: string;
  slot: 'morning' | 'evening';
  subscription: Subscription | null;
  routes: RouteItem[];
  onChanged: () => void;
}) {
  const exists = !!subscription;
  const isRouted = !!subscription?.routeId;

  const [scheduleType, setScheduleType] = useState<'daily' | 'alternate' | 'custom'>(
    subscription?.scheduleType || 'daily',
  );
  const [activeDays, setActiveDays] = useState<number[]>(subscription?.activeDays || [0, 1, 2, 3, 4, 5, 6]);
  const [order, setOrder] = useState<OrderState>(subscription?.defaultOrder || EMPTY_ORDER);
  const [saving, setSaving] = useState(false);

  const [routeId, setRouteId] = useState<string>(subscription?.routeId || '');
  const [stopOrder, setStopOrder] = useState<string>(String(subscription?.stopOrder || 1));
  const [rosterStops, setRosterStops] = useState<RosterStop[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);

  useEffect(() => {
    setScheduleType(subscription?.scheduleType || 'daily');
    setActiveDays(subscription?.activeDays || [0, 1, 2, 3, 4, 5, 6]);
    setOrder(subscription?.defaultOrder || EMPTY_ORDER);
    setRouteId(subscription?.routeId || '');
    setStopOrder(String(subscription?.stopOrder || 1));
  }, [subscription]);

  useEffect(() => {
    if (!routeId) {
      setRosterStops([]);
      return;
    }
    let isMounted = true;
    setLoadingRoster(true);
    api
      .get(`/route/${routeId}/roster?slot=${slot}`)
      .then((res: any) => {
        if (isMounted) setRosterStops(res.stops || []);
      })
      .catch(() => {
        if (isMounted) setRosterStops([]);
      })
      .finally(() => {
        if (isMounted) setLoadingRoster(false);
      });
    return () => {
      isMounted = false;
    };
  }, [routeId, slot]);

  const toggleDay = (dayIndex: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveDays((prev) => (prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex].sort()));
  };

  // Save schedule + items only. routeId/stopOrder deliberately omitted —
  // the backend keeps whatever routing already exists when they're absent.
  const handleSaveSchedule = async () => {
    setSaving(true);
    try {
      await api.post('/subscription', {
        customerId,
        slot,
        scheduleType,
        activeDays: scheduleType === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : activeDays,
        anchorDate: new Date().toISOString().split('T')[0],
        defaultOrder: order,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onChanged();
    } catch (err: any) {
      Alert.alert('Save Error', err.message || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  // Assigns/updates routing for THIS slot and flips the customer to active.
  // Calling this again later (route already set) is how you move someone
  // to a different route — it's the same endpoint either way.
  const handleApprove = async () => {
    if (!routeId) return Alert.alert('Route required', 'Please select a route first.');
    setApproving(true);
    try {
      await api.post(`/customer/${customerId}/approve`, {
        assignments: [{ slot, routeId, stopOrder: parseInt(stopOrder, 10) || 1 }],
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', `${slot === 'morning' ? 'Morning' : 'Evening'} slot routed.`);
      onChanged();
    } catch (err: any) {
      Alert.alert('Approval Error', err.message || 'Failed to assign route');
    } finally {
      setApproving(false);
    }
  };

  const handleCreateSlot = async () => {
    setSaving(true);
    try {
      await api.post('/subscription', {
        customerId,
        slot,
        scheduleType: 'daily',
        activeDays: [0, 1, 2, 3, 4, 5, 6],
        anchorDate: new Date().toISOString().split('T')[0],
        defaultOrder: EMPTY_ORDER,
      });
      onChanged();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create slot');
    } finally {
      setSaving(false);
    }
  };

  const Icon = slot === 'morning' ? Sun : Moon;
  const label = slot === 'morning' ? 'Morning' : 'Evening';
  const selectedRouteName = routes.find((r) => r.id === routeId)?.name;

  if (!exists) {
    return (
      <View className="bg-white rounded-[28px] p-6 border border-dashed border-slate-300 mb-4 items-center">
        <Icon size={28} color="#94A3B8" />
        <Text className="font-black text-slate-700 mt-2">No {label} Delivery</Text>
        <Text className="text-xs text-slate-400 text-center mt-1 mb-4 px-4">
          This customer doesn't have a {label.toLowerCase()} order set up yet.
        </Text>
        <Pressable
          onPress={handleCreateSlot}
          disabled={saving}
          className="bg-slate-900 px-5 py-3 rounded-2xl flex-row items-center gap-2 active:opacity-90"
        >
          {saving ? <ActivityIndicator color="white" /> : (
            <>
              <PlusCircle size={16} color="white" />
              <Text className="text-white font-bold text-sm">Add {label} Slot</Text>
            </>
          )}
        </Pressable>
      </View>
    );
  }

  const activeProducts = PRODUCTS.filter((p) => (order[p.key] || 0) > 0);
  const inactiveProducts = PRODUCTS.filter((p) => (order[p.key] || 0) === 0);

  return (
    <View className="bg-white rounded-[28px] p-5 border border-slate-200 mb-4 shadow-sm">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center gap-2">
          <Icon size={18} color="#0F172A" />
          <Text className="text-lg font-black text-slate-800">{label}</Text>
        </View>
        <View className={`px-2.5 py-1 rounded-lg border ${isRouted ? 'bg-green-100 border-green-200' : 'bg-amber-100 border-amber-200'}`}>
          <Text className={`text-[10px] font-bold uppercase tracking-wider ${isRouted ? 'text-green-800' : 'text-amber-800'}`}>
            {isRouted ? 'Routed' : 'Not Routed'}
          </Text>
        </View>
      </View>

      {/* An unrouted slot on an otherwise active customer is the quiet failure
          mode: they look approved everywhere, but no manifest ever includes
          this slot, so the delivery silently never happens. */}
      {!isRouted && (
        <View className="bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-3 mb-4 flex-row gap-2.5">
          <RouteIcon size={14} color="#D97706" />
          <Text className="text-amber-900 text-xs font-medium flex-1 leading-5">
            This slot has no route. It won't appear on any driver's manifest until you assign one below.
          </Text>
        </View>
      )}

      {/* Routing */}
      <View className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-5">
        <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Route Assignment</Text>

        {isRouted && (
          <Text className="text-sm font-semibold text-slate-600 mb-3">
            Currently on <Text className="font-black text-slate-900">{selectedRouteName || '...'}</Text>, stop #{subscription?.stopOrder}
          </Text>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
          {routes.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setRouteId(r.id)}
              className={`px-4 py-2.5 rounded-xl border mr-2 ${routeId === r.id ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
            >
              <Text className={`font-bold text-sm ${routeId === r.id ? 'text-white' : 'text-slate-600'}`}>{r.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {routeId && (
          <>
            {loadingRoster ? (
              <ActivityIndicator size="small" color="#0F172A" className="my-2" />
            ) : rosterStops.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                {rosterStops.map((s) => (
                  <View key={s.id} className="w-28 p-2.5 rounded-xl border border-slate-200 bg-white mr-2">
                    <Text className="text-[10px] font-black text-slate-400 uppercase">Stop #{s.stopOrder}</Text>
                    <Text className="font-bold text-xs text-slate-800 mt-0.5" numberOfLines={1}>{s.name}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text className="text-xs text-slate-400 italic mb-3">No other stops on this route+slot yet.</Text>
            )}

            <View className="flex-row items-center gap-3">
              <Text className="text-sm font-bold text-slate-600">Stop Order</Text>
              <TextInput
                value={stopOrder}
                onChangeText={setStopOrder}
                keyboardType="numeric"
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 w-20"
              />
            </View>
          </>
        )}

        <Pressable
          onPress={handleApprove}
          disabled={approving || !routeId}
          className={`mt-3 h-12 rounded-2xl items-center justify-center flex-row gap-2 ${!routeId ? 'bg-slate-200' : 'bg-green-500 active:opacity-90'}`}
        >
          {approving ? <ActivityIndicator color="white" /> : (
            <>
              <CheckCircle2 size={18} color="white" />
              <Text className="text-white font-black text-sm">{isRouted ? 'Update Route Assignment' : 'Approve & Assign Route'}</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Schedule */}
      <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Schedule</Text>
      <View className="flex-row bg-slate-100 p-1.5 rounded-2xl mb-4">
        {[{ id: 'daily', label: 'Daily' }, { id: 'alternate', label: 'Alternate' }, { id: 'custom', label: 'Custom' }].map((opt) => (
          <Pressable
            key={opt.id}
            onPress={() => setScheduleType(opt.id as any)}
            className={`flex-1 py-2.5 items-center rounded-xl ${scheduleType === opt.id ? 'bg-slate-900' : ''}`}
          >
            <Text className={`text-xs font-black ${scheduleType === opt.id ? 'text-white' : 'text-slate-500'}`}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      {scheduleType === 'custom' && (
        <View className="flex-row justify-between mb-4 px-1">
          {DAYS_OF_WEEK.map((day) => {
            const isSelected = activeDays.includes(day.index);
            return (
              <Pressable
                key={day.index}
                onPress={() => toggleDay(day.index)}
                className={`w-9 h-9 rounded-full items-center justify-center border ${isSelected ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-slate-200'}`}
              >
                <Text className={`text-xs font-black ${isSelected ? 'text-white' : 'text-slate-400'}`}>{day.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Items */}
      <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Order Items</Text>
      <View className="gap-3 mb-2">
        {activeProducts.length === 0 && (
          <View className="bg-slate-50 border border-slate-200 rounded-2xl p-5 items-center">
            <Text className="text-xs text-slate-400 text-center">No items yet — tap below to add.</Text>
          </View>
        )}
        {activeProducts.map((p) => (
          <View key={p.key} className="flex-row items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <View className="flex-row items-center gap-2.5">
              <Text className="text-lg">{p.icon}</Text>
              <Text className="font-bold text-slate-800 text-sm">{p.label}</Text>
            </View>
            <ProductStepper
              value={order[p.key] || 0}
              onChange={(v: number) => setOrder({ ...order, [p.key]: v })}
              min={0}
              max={p.max}
              step={p.step}
              unit={p.unit}
            />
          </View>
        ))}

        <Pressable
          onPress={() => setShowAddItem(true)}
          className="flex-row items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-2xl active:bg-slate-50"
        >
          <PlusCircle size={16} color="#64748B" />
          <Text className="font-bold text-slate-500 text-xs">Add Item</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={handleSaveSchedule}
        disabled={saving}
        className="bg-slate-900 h-14 rounded-2xl items-center justify-center flex-row gap-2 mt-4 active:opacity-90"
      >
        {saving ? <ActivityIndicator color="white" /> : (
          <Text className="text-white font-black text-sm">Save {label} Schedule & Items</Text>
        )}
      </Pressable>

      {/* Add item modal */}
      <Modal visible={showAddItem} transparent animationType="fade" onRequestClose={() => setShowAddItem(false)}>
        <Pressable className="flex-1 bg-slate-900/40 items-center justify-center" onPress={() => setShowAddItem(false)}>
          <Pressable className="bg-white rounded-[28px] p-5 w-[85%] max-h-[70%]" onPress={(e) => e.stopPropagation()}>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-black text-slate-800">Add Item</Text>
              <Pressable onPress={() => setShowAddItem(false)}><X size={20} color="#64748B" /></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {inactiveProducts.map((p) => (
                <Pressable
                  key={p.key}
                  onPress={() => {
                    setOrder({ ...order, [p.key]: p.step });
                    setShowAddItem(false);
                  }}
                  className="flex-row items-center gap-3 py-3 border-b border-slate-100"
                >
                  <Text className="text-xl">{p.icon}</Text>
                  <Text className="font-bold text-slate-700">{p.label}</Text>
                </Pressable>
              ))}
              {inactiveProducts.length === 0 && (
                <Text className="text-center text-slate-400 py-6 text-sm">All items already added.</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// -------------------------------------------------------------------------
// Reject modal
// -------------------------------------------------------------------------

function RejectModal({ visible, onClose, onConfirm, loading }: any) {
  const [reason, setReason] = useState(REJECTION_REASONS[0]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-slate-900/40">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="bg-white rounded-t-[32px] p-6 pb-10">
          <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-6" />
          <Text className="text-2xl font-black text-slate-800 mb-2">Reject Application</Text>
          <Text className="text-slate-500 font-medium mb-6">Select a reason to include in the WhatsApp alert.</Text>
          {REJECTION_REASONS.map((r) => (
            <Pressable
              key={r}
              onPress={() => setReason(r)}
              className={`flex-row items-center gap-3 p-4 rounded-2xl border mb-3 ${reason === r ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}
            >
              <Text className={`flex-1 font-semibold ${reason === r ? 'text-red-700' : 'text-slate-600'}`}>{r}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => onConfirm(reason)}
            disabled={loading}
            className="bg-red-500 h-14 rounded-2xl items-center justify-center mt-2"
          >
            {loading ? <ActivityIndicator color="white" /> : <Text className="font-black text-white text-base">Confirm Rejection</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// -------------------------------------------------------------------------
// Main screen
// -------------------------------------------------------------------------


// -------------------------------------------------------------------------
// Shared helpers for the deliveries and billing tabs
// -------------------------------------------------------------------------

const PRODUCT_LABELS: Record<string, string> = {
  milk: 'Milk', curd: 'Curd', butter: 'Butter', ghee: 'Ghee',
  lassi: 'Buttermilk', paneer: 'Paneer', jaggery: 'Jaggery',
  khand: 'Desi Khand', oil: 'Mustard Oil', atta: 'Atta', burfi: 'Burfi',
};
const LITRE_PRODUCTS = new Set(['milk', 'curd', 'lassi', 'oil']);

// Quantities are stored in base units (ml / g). Showing the raw number is
// how customers ended up being told "Milk: 2000", so every display path
// converts.
function formatQty(v: number, product: string): string {
  const litre = LITRE_PRODUCTS.has(product);
  if (v < 1000) return `${v} ${litre ? 'ml' : 'g'}`;
  const val = v / 1000;
  const s = val.toFixed(2).replace(/\.00$/, '');
  return `${s} ${litre ? 'L' : 'kg'}`;
}

// Indian digit grouping — 1,23,456 not 123,456.
function formatRupees(v: number): string {
  const n = Math.round(v);
  const s = String(Math.abs(n));
  if (s.length <= 3) return (n < 0 ? '-' : '') + s;
  const last3 = s.slice(-3);
  let rest = s.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return (n < 0 ? '-' : '') + parts.join(',') + ',' + last3;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const DELIVERY_STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  DELIVERED: { bg: 'bg-green-100', text: 'text-green-800', label: 'Delivered' },
  UNATTEMPTED: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Not attempted' },
  SKIPPED: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Skipped' },
  FAILED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Failed' },
};

// -------------------------------------------------------------------------
// Deliveries tab
// -------------------------------------------------------------------------

function DeliveriesTab({ customerId }: { customerId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [days, setDays] = useState<BillDay[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/billing/customer/${customerId}?month=${month}`);
      setDays(res?.days || []);
    } catch {
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, [customerId, month]);

  useEffect(() => { load(); }, [load]);

  const delivered = days.filter((d) => d.status === 'DELIVERED');
  const monthTotal = delivered.reduce((a, d) => a + d.dayTotal, 0);
  const flagged = days.filter((d) => d.isFlagged).length;

  // Don't let an admin page into the future — there's nothing there, and an
  // empty screen looks like a bug rather than an empty month.
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const canGoForward = month < thisMonth;

  return (
    <View>
      {/* Month stepper */}
      <View className="flex-row items-center justify-between bg-white rounded-2xl border border-slate-200 p-2 mb-4">
        <Pressable
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
          className="w-10 h-10 rounded-xl bg-slate-100 items-center justify-center active:bg-slate-200"
        >
          <ChevronLeft size={18} color="#0F172A" />
        </Pressable>
        <Text className="font-black text-slate-800 text-base">{monthLabel(month)}</Text>
        <Pressable
          onPress={() => canGoForward && setMonth((m) => shiftMonth(m, 1))}
          disabled={!canGoForward}
          className={`w-10 h-10 rounded-xl items-center justify-center ${canGoForward ? 'bg-slate-100 active:bg-slate-200' : 'bg-slate-50'
            }`}
        >
          <ChevronRight size={18} color={canGoForward ? '#0F172A' : '#CBD5E1'} />
        </Pressable>
      </View>

      {/* Month summary */}
      <View className="flex-row gap-3 mb-4">
        <View className="flex-1 bg-white rounded-2xl border border-slate-200 p-4">
          <Text className="text-2xl font-black text-slate-900">{delivered.length}</Text>
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">
            Delivered
          </Text>
        </View>
        <View className="flex-1 bg-white rounded-2xl border border-slate-200 p-4">
          <Text className="text-2xl font-black text-slate-900">₹{formatRupees(monthTotal)}</Text>
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">
            Value
          </Text>
        </View>
      </View>

      {flagged > 0 && (
        <View className="flex-row items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
          <Flag size={15} color="#B45309" />
          <Text className="text-amber-800 font-bold text-sm flex-1">
            {flagged} {flagged === 1 ? 'delivery has' : 'deliveries have'} an open complaint
          </Text>
        </View>
      )}

      {loading ? (
        <View className="py-12 items-center">
          <ActivityIndicator color="#10B981" />
        </View>
      ) : days.length === 0 ? (
        <View className="bg-white rounded-[28px] border border-slate-200 p-8 items-center">
          <Package size={36} color="#CBD5E1" />
          <Text className="font-bold text-slate-700 mt-3">No deliveries logged</Text>
          <Text className="text-slate-400 text-sm text-center mt-1 font-medium">
            Nothing was recorded for {monthLabel(month)}.
          </Text>
        </View>
      ) : (
        <View className="gap-2.5">
          {days.map((d) => {
            const st = DELIVERY_STATUS_STYLE[d.status] || DELIVERY_STATUS_STYLE.UNATTEMPTED;
            const items = Object.entries(d.quantities || {}).filter(([, q]) => q > 0);
            return (
              <View
                key={d.logId}
                className="bg-white rounded-2xl border border-slate-200 p-4"
              >
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-2">
                    {d.slot === 'morning'
                      ? <Sun size={15} color="#F59E0B" />
                      : <Moon size={15} color="#6366F1" />}
                    <Text className="font-black text-slate-800 text-sm">
                      {new Date(d.date).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', weekday: 'short',
                      })}
                    </Text>
                    {d.isFlagged && <Flag size={13} color="#B45309" />}
                  </View>
                  <View className="flex-row items-center gap-2">
                    {d.status === 'DELIVERED' && (
                      <Text className="font-black text-slate-900 text-sm">
                        ₹{formatRupees(d.dayTotal)}
                      </Text>
                    )}
                    <View className={`px-2 py-0.5 rounded-md ${st.bg}`}>
                      <Text className={`text-[10px] font-bold uppercase ${st.text}`}>
                        {st.label}
                      </Text>
                    </View>
                  </View>
                </View>
                {items.length > 0 ? (
                  <Text className="text-slate-500 text-xs font-semibold leading-5">
                    {items.map(([k, q]) => `${PRODUCT_LABELS[k] || k} ${formatQty(q, k)}`).join('  ·  ')}
                  </Text>
                ) : (
                  <Text className="text-slate-400 text-xs font-medium italic">Nothing recorded</Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// -------------------------------------------------------------------------
// Billing tab
// -------------------------------------------------------------------------

const INVOICE_STATUS_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  PENDING: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', label: 'Unpaid' },
  PAID_ONLINE: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', label: 'Paid online' },
  PAID_CASH: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', label: 'Paid cash' },
};

function BillingTab({ customerId, onChanged }: { customerId: string; onChanged: () => void }) {
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInvoices((await api.get(`/billing/customer/${customerId}/invoices`)) || []);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (invoiceId: string, status: string) => {
    setBusyId(invoiceId);
    try {
      await api.put(`/billing/invoices/${invoiceId}/status`, { status });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
      // A payment can lift a suspension, so the header status may have
      // changed too.
      onChanged();
    } catch (err: any) {
      Alert.alert('Could not update', err.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const outstanding = invoices
    .filter((i) => !i.status.startsWith('PAID'))
    .reduce((a, i) => a + i.totalAmount, 0);

  if (loading) {
    return (
      <View className="py-12 items-center">
        <ActivityIndicator color="#10B981" />
      </View>
    );
  }

  return (
    <View>
      {outstanding > 0 && (
        <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 mb-4 flex-row items-center gap-2.5">
          <AlertTriangle size={17} color="#B45309" />
          <View className="flex-1">
            <Text className="text-amber-900 font-black text-base">
              ₹{formatRupees(outstanding)} outstanding
            </Text>
            <Text className="text-amber-700 text-xs font-semibold">
              Across {invoices.filter((i) => !i.status.startsWith('PAID')).length} unpaid{' '}
              {invoices.filter((i) => !i.status.startsWith('PAID')).length === 1 ? 'bill' : 'bills'}
            </Text>
          </View>
        </View>
      )}

      {invoices.length === 0 ? (
        <View className="bg-white rounded-[28px] border border-slate-200 p-8 items-center">
          <Wallet size={36} color="#CBD5E1" />
          <Text className="font-bold text-slate-700 mt-3">No bills yet</Text>
          <Text className="text-slate-400 text-sm text-center mt-1 font-medium">
            Invoices appear here once a month has been billed.
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          {invoices.map((inv) => {
            const st = INVOICE_STATUS_STYLE[inv.status] || INVOICE_STATUS_STYLE.PENDING;
            const paid = inv.status.startsWith('PAID');
            const busy = busyId === inv.invoiceId;
            return (
              <View
                key={inv.invoiceId}
                className={`rounded-[28px] border p-5 ${paid ? 'bg-white border-slate-200' : `${st.bg} ${st.border}`}`}
              >
                <View className="flex-row items-start justify-between mb-3">
                  <View>
                    <Text className="text-lg font-black text-slate-900 tracking-tight">
                      {monthLabel(inv.billingMonth)}
                    </Text>
                    {inv.paidAt && (
                      <Text className="text-xs font-semibold text-slate-500 mt-0.5">
                        Paid {new Date(inv.paidAt).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </Text>
                    )}
                  </View>
                  <View className="items-end">
                    <Text className="text-xl font-black text-slate-900">
                      ₹{formatRupees(inv.totalAmount)}
                    </Text>
                    <View className={`px-2 py-0.5 rounded-md mt-1 ${st.bg}`}>
                      <Text className={`text-[10px] font-bold uppercase ${st.text}`}>{st.label}</Text>
                    </View>
                  </View>
                </View>

                {inv.lineItems?.length > 0 && (
                  <Text className="text-slate-500 text-xs font-semibold leading-5 mb-3">
                    {inv.lineItems.join('  ·  ')}
                  </Text>
                )}

                {/* Dunning state. Only shown when it happened — a clean
                    invoice shouldn't carry chase metadata. */}
                {(inv.reminderCount > 0 || inv.suspendedAt) && !paid && (
                  <View className="flex-row items-center gap-1.5 mb-3">
                    {inv.suspendedAt ? <Ban size={12} color="#B91C1C" /> : <AlertTriangle size={12} color="#B45309" />}
                    <Text className="text-xs font-bold text-slate-600">
                      {inv.suspendedAt
                        ? `Account suspended ${new Date(inv.suspendedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                        : `${inv.reminderCount} reminder${inv.reminderCount === 1 ? '' : 's'} sent`}
                    </Text>
                  </View>
                )}

                {!paid && (
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => setStatus(inv.invoiceId, 'PAID_CASH')}
                      disabled={busy}
                      className="flex-1 bg-slate-900 h-11 rounded-xl items-center justify-center active:opacity-90"
                    >
                      {busy
                        ? <ActivityIndicator size="small" color="white" />
                        : <Text className="text-white font-bold text-sm">Mark paid (cash)</Text>}
                    </Pressable>
                    {!!inv.payUrl && (
                      <Pressable
                        onPress={() => RNLinking.openURL(inv.payUrl)}
                        className="w-11 h-11 rounded-xl bg-white border border-slate-200 items-center justify-center active:bg-slate-50"
                      >
                        <ExternalLink size={16} color="#0F172A" />
                      </Pressable>
                    )}
                  </View>
                )}

                {paid && (
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        'Mark as unpaid?',
                        'This reopens the bill. Only do this if it was marked paid by mistake — the customer may be chased again.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Reopen', style: 'destructive', onPress: () => setStatus(inv.invoiceId, 'PENDING') },
                        ]
                      )
                    }
                    className="self-start"
                  >
                    <Text className="text-xs font-bold text-slate-400">Reopen bill</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}


export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [raisingInvoice, setRaisingInvoice] = useState(false);
  const [tab, setTab] = useState<TabKey>('overview');

  const fetchDetails = useCallback(async () => {
    try {
      const [custData, routeData] = await Promise.all([
        api.get(`/customer/${id}`),
        api.get('/route'),
      ]);
      setCustomer(custData);
      setRoutes((routeData || []).map((r: any) => ({ id: r.id, name: r.name })));
      setName(custData.customer || '');
      setPhone(custData.phoneNumber || '');
      setAddress(custData.houseAddress || '');

      try {
        const subs = await api.get(`/subscription/customer/${id}`);
        setSubscriptions(subs || []);
      } catch {
        setSubscriptions([]);
      }
    } catch (err: any) {
      Alert.alert('Load Error', err.message || 'Failed to load customer profile');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const morningSub = subscriptions.find((s) => s.slot === 'morning') || null;
  const eveningSub = subscriptions.find((s) => s.slot === 'evening') || null;

  const handleSaveIdentity = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      await api.put(`/customer/${id}`, {
        customer: name,
        phoneNumber: phone,
        houseAddress: address,
        geoLatitude: customer.geoLatitude || '0',
        geoLongitude: customer.geoLongitude || '0',
        isActive: customer.isActive,
        status: customer.status,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Identity details updated.');
      fetchDetails();
    } catch (err: any) {
      Alert.alert('Save Error', err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (reason: string) => {
    setRejecting(true);
    try {
      await api.post(`/customer/${id}/reject`, { reason });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRejectModal(false);
      Alert.alert('Rejected', 'Customer registration declined and notified via WhatsApp.');
      fetchDetails();
    } catch (err: any) {
      Alert.alert('Rejection Error', err.message || 'Failed to reject customer');
    } finally {
      setRejecting(false);
    }
  };

  const handleToggleDisable = async () => {
    if (!customer) return;
    const nextActive = !customer.isActive;
    try {
      await api.put(`/customer/${id}`, {
        customer: customer.customer,
        phoneNumber: customer.phoneNumber,
        houseAddress: customer.houseAddress,
        geoLatitude: customer.geoLatitude || '0',
        geoLongitude: customer.geoLongitude || '0',
        isActive: nextActive,
        status: nextActive ? 'active' : 'disabled',
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchDetails();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update status');
    }
  };

  // Closes out this customer's current month early.
  //
  // Needed because the regular Generate refuses the current month (more
  // deliveries are still coming) while Delete refuses to run while unbilled
  // deliveries exist — together they'd trap a mid-month leaver for up to 30
  // days. This freezes what they owe and drops them off every manifest, but
  // deliberately leaves status alone: admin deactivates once payment lands.
  const handleFinalInvoice = () => {
    Alert.alert(
      'Raise final invoice?',
      "This bills everything delivered so far this month and stops further deliveries immediately.\n\nThe customer stays active until you deactivate them — do that once payment is settled.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Raise invoice',
          onPress: async () => {
            setRaisingInvoice(true);
            try {
              const res = await api.post(`/billing/final/${id}`, {});
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                'Final invoice raised',
                `₹${Math.round(res.totalAmount)} billed for ${res.month}. Deliveries have stopped. The customer has been sent their bill on WhatsApp.`
              );
              fetchDetails();
            } catch (err: any) {
              Alert.alert('Could not raise invoice', err.message || 'Please try again.');
            } finally {
              setRaisingInvoice(false);
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert('Delete Customer', 'This permanently removes their identity, subscriptions, and delivery history. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Permanently',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/customer/${id}`);
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch (err: any) {
            Alert.alert('Delete Error', err.message || 'Failed to delete customer');
          }
        },
      },
    ]);
  };

  if (loading || !customer) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  const statusStyle = STATUS_STYLE[customer.status] || STATUS_STYLE.pending;

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
          <Pressable onPress={() => router.back()} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center active:bg-slate-200">
            <ArrowLeft size={20} color="#0F172A" />
          </Pressable>
          <Text className="text-lg font-black text-slate-900 tracking-tight">Control Center</Text>
          <View className="flex-row gap-2">
            <Pressable onPress={() => phone && Linking.openURL(`tel:${phone}`)} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center">
              <Phone size={16} color="#0F172A" />
            </Pressable>
            <Pressable onPress={() => phone && Linking.openURL(`https://wa.me/${phone.replace(/[^0-9]/g, '')}`)} className="w-10 h-10 bg-emerald-50 rounded-full items-center justify-center">
              <MessageCircle size={16} color="#16A34A" />
            </Pressable>
            <Pressable onPress={handleDelete} className="w-10 h-10 bg-rose-50 rounded-full items-center justify-center">
              <Trash2 size={16} color="#E11D48" />
            </Pressable>
          </View>
        </View>

        <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {/* Status banner */}
          <View className="flex-row items-center justify-between mb-5">
            <View className={`px-3 py-1.5 rounded-xl border ${statusStyle}`}>
              <Text className={`text-xs font-black uppercase tracking-wider ${statusStyle.split(' ')[2]}`}>{customer.status}</Text>
            </View>

            {customer.status === 'pending' && (
              <Pressable
                onPress={() => setShowRejectModal(true)}
                className="flex-row items-center gap-1.5 bg-red-50 border border-red-100 px-3 py-1.5 rounded-xl active:bg-red-100"
              >
                <XCircle size={14} color="#EF4444" />
                <Text className="text-red-600 font-bold text-xs">Reject</Text>
              </Pressable>
            )}

            {customer.status === 'suspended' && (
              <View className="flex-row items-center gap-1.5 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl">
                <Ban size={14} color="#B91C1C" />
                <Text className="text-red-700 font-bold text-xs">Unpaid bill — resumes on payment</Text>
              </View>
            )}

            {(customer.status === 'active' || customer.status === 'disabled') && (
              <Pressable
                onPress={handleToggleDisable}
                className="flex-row items-center gap-1.5 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl active:bg-slate-200"
              >
                <Undo2 size={14} color="#475569" />
                <Text className="text-slate-600 font-bold text-xs">
                  {customer.isActive ? 'Pause Account' : 'Reactivate'}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Tabs. Delivery history and billing were previously only
              reachable from separate top-level screens, which meant an admin
              answering "what did this person get, and did they pay?" had to
              leave the customer and find them again twice. */}
          <View className="flex-row bg-slate-200/50 p-1.5 rounded-2xl mb-5">
            {([
              { key: 'overview', label: 'Overview', Icon: User },
              { key: 'deliveries', label: 'Deliveries', Icon: Package },
              { key: 'billing', label: 'Billing', Icon: Wallet },
            ] as const).map(({ key, label, Icon }) => {
              const on = tab === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTab(key);
                  }}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl ${on ? 'bg-white shadow-sm' : ''}`}
                >
                  <Icon size={14} color={on ? '#0F172A' : '#64748B'} />
                  <Text className={`text-sm font-bold ${on ? 'text-slate-900' : 'text-slate-500'}`}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {tab === 'deliveries' && <DeliveriesTab customerId={id!} />}
          {tab === 'billing' && <BillingTab customerId={id!} onChanged={fetchDetails} />}

          {tab === 'overview' && (
            <>
              {/* Unrouted slot warning.
              A partial approval leaves a subscription with no route_id. The
              slot exists and the customer believes it is running, but they
              appear on no manifest and no driver will ever see them. The
              dashboard has a worklist for this; it needs to be visible here
              too, on the screen where the omission actually happened. */}
              {(() => {
                const unrouted = subscriptions.filter((sub) => !sub.routeId);
                if (unrouted.length === 0) return null;
                return (
                  <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 mb-5 flex-row items-start gap-2.5">
                    <AlertTriangle size={17} color="#B45309" />
                    <View className="flex-1">
                      <Text className="text-amber-900 font-black text-sm">
                        {unrouted.map((u) => u.slot).join(' and ')} not assigned to a route
                      </Text>
                      <Text className="text-amber-700 text-xs font-semibold mt-0.5 leading-4">
                        This slot won't appear on any manifest and no driver will see it. Assign a route below.
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {/* Identity card */}
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Identity</Text>
              <View className="bg-white rounded-[28px] p-5 border border-slate-200 mb-6 gap-4">
                <View>
                  <Text className="text-xs font-bold text-slate-500 mb-1.5">Full Name</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-semibold text-slate-800"
                  />
                </View>
                <View>
                  <Text className="text-xs font-bold text-slate-500 mb-1.5">Phone Number</Text>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-semibold text-slate-800"
                  />
                </View>
                <View>
                  <Text className="text-xs font-bold text-slate-500 mb-1.5">Address</Text>
                  <TextInput
                    value={address}
                    onChangeText={setAddress}
                    multiline
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-semibold text-slate-800 min-h-[70px]"
                  />
                </View>
                <Pressable
                  onPress={handleSaveIdentity}
                  disabled={saving}
                  className="bg-slate-900 h-12 rounded-xl items-center justify-center flex-row gap-2 active:opacity-90"
                >
                  {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-sm">Save Identity</Text>}
                </Pressable>
              </View>

              {/* Slot panels */}
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Delivery Slots</Text>
              <SlotPanel customerId={id!} slot="morning" subscription={morningSub} routes={routes} onChanged={fetchDetails} />
              <SlotPanel customerId={id!} slot="evening" subscription={eveningSub} routes={routes} onChanged={fetchDetails} />

              {/* Account lifecycle. Kept at the bottom, away from the everyday
              editing controls — these are the "customer is leaving" actions. */}
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 mt-2">Account</Text>
              <Pressable
                onPress={handleFinalInvoice}
                disabled={raisingInvoice}
                className="bg-white border border-slate-200 rounded-[28px] p-4 flex-row items-center gap-3 mb-4 active:bg-slate-50"
              >
                <View className="w-11 h-11 rounded-2xl bg-amber-50 items-center justify-center">
                  {raisingInvoice
                    ? <ActivityIndicator size="small" color="#D97706" />
                    : <ReceiptText size={19} color="#D97706" strokeWidth={2.2} />}
                </View>
                <View className="flex-1">
                  <Text className="font-black text-slate-900 text-sm">Raise final invoice</Text>
                  <Text className="text-xs text-slate-500 font-medium mt-0.5 leading-4">
                    For a customer leaving mid-month. Bills what's owed and stops deliveries immediately.
                  </Text>
                </View>
              </Pressable>
            </>
          )}
        </ScrollView>

        <RejectModal
          visible={showRejectModal}
          onClose={() => setShowRejectModal(false)}
          onConfirm={handleReject}
          loading={rejecting}
        />
      </SafeAreaView>
    </View>
  );
}

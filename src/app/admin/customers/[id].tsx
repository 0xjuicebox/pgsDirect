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
  ReceiptText,
} from 'lucide-react-native';

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
  status: 'pending' | 'active' | 'disabled' | 'rejected';
};

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

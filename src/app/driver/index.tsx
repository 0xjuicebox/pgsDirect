import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Phone,
  Navigation,
  Plus,
  Minus,
  X,
  Check,
  CheckCircle2,
  Package,
  Camera,
  Droplets,
  Coffee,
  Box,
  Layers,
  Circle,
  AlertCircle,
  Sun,
  Moon,
  CloudOff,
  Clock,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../utils/api';
import { supabase } from '../../utils/supabase';
import {
  submitDelivery,
  startQueueWorker,
  subscribe as subscribeQueue,
  drain as drainQueue,
  DeliveryPayload,
} from '../../utils/deliveryQueue';

// ==========================================
// TYPES
// ==========================================

type Slot = 'morning' | 'evening';

type OrderData = { [key: string]: number };
type Stop = {
  id: string;              // customer_id, since one manifest row = one customer for this slot
  customer: string;
  address: string;
  phone: string;
  status: 'PENDING' | 'DELIVERED' | 'SKIPPED' | 'UNATTEMPTED' | 'SYSTEM_AUTO_CLOSED';
  expectedOrder: OrderData;
  actualOrder?: OrderData;
};

type ShiftRow = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: 'ACTIVE' | 'ENDED' | 'AUTO_ENDED';
};

type ShiftState = {
  date: string;
  morning: ShiftRow | null;
  evening: ShiftRow | null;
  cutoffs: { morningCutoff: string; eveningCutoff: string };
};

const UNIT_MAP: Record<string, string> = {
  curd: 'kg', paneer: 'kg', butter: 'pkt', lassi: 'pkt', burfi: 'kg',
  ghee: 'L', bread: 'pkt', eggs: 'dz', cheese: 'pkt', yogurt: 'cup',
};

const getIconForItem = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('curd') || n.includes('yogurt') || n.includes('lassi')) return Coffee;
  if (n.includes('ghee') || n.includes('oil')) return Droplets;
  if (n.includes('paneer') || n.includes('cheese')) return Box;
  if (n.includes('butter') || n.includes('burfi') || n.includes('bread')) return Layers;
  if (n.includes('egg')) return Circle;
  return Package;
};

// ==========================================
// SLOT PICKER
//
// v1 driver assumption: one driver = one slot per day (usually). The
// picker sits at the top and drives which manifest we're looking at.
// If both slots have data, both buttons are enabled — driver can flip
// between them freely; the ACTIVE shift and its Start/End state stay
// tied to whichever slot is selected.
// ==========================================

const SlotPicker = ({ current, onChange, morningActive, eveningActive }: any) => (
  <View className="flex-row bg-slate-100 rounded-2xl p-1 mb-4">
    <Pressable
      onPress={() => onChange('morning')}
      className={`flex-1 py-3 rounded-xl flex-row justify-center items-center gap-2 ${current === 'morning' ? 'bg-white' : ''}`}
      style={current === 'morning' && Platform.OS === 'android' ? { elevation: 2 } : {}}
    >
      <Sun size={16} color={current === 'morning' ? '#F59E0B' : '#94A3B8'} />
      <Text className={`text-sm font-black tracking-tight ${current === 'morning' ? 'text-slate-800' : 'text-slate-400'}`}>
        Morning
      </Text>
      {morningActive && <View className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1" />}
    </Pressable>
    <Pressable
      onPress={() => onChange('evening')}
      className={`flex-1 py-3 rounded-xl flex-row justify-center items-center gap-2 ${current === 'evening' ? 'bg-white' : ''}`}
      style={current === 'evening' && Platform.OS === 'android' ? { elevation: 2 } : {}}
    >
      <Moon size={16} color={current === 'evening' ? '#6366F1' : '#94A3B8'} />
      <Text className={`text-sm font-black tracking-tight ${current === 'evening' ? 'text-slate-800' : 'text-slate-400'}`}>
        Evening
      </Text>
      {eveningActive && <View className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1" />}
    </Pressable>
  </View>
);

// ==========================================
// SHIFT CONTROL — Start / End button for the current slot
//
// Rendered at the top of the screen. Three states:
//   - No row: "Start Shift" (green)
//   - ACTIVE: "End Shift" (red outline)
//   - ENDED / AUTO_ENDED: passive "Shift Ended" chip with the end time
//
// Auto-ended shifts show a softer amber tone since the driver didn't
// actually end them — the sweeper did. Deliveries after cutoff still
// work; the label is informational only.
// ==========================================

const ShiftControl = ({ shift, slot, busy, onStart, onEnd }: any) => {
  if (!shift) {
    return (
      <Pressable
        onPress={onStart}
        disabled={busy}
        className="bg-green-500 h-14 rounded-2xl items-center justify-center flex-row gap-2 mb-4 active:opacity-90"
        style={Platform.OS === 'android' ? { elevation: 3 } : { shadowColor: '#22C55E', shadowOpacity: 0.25, shadowRadius: 6 }}
      >
        {busy ? <ActivityIndicator color="white" /> : (
          <>
            <Text className="text-white text-base font-black tracking-wide">Start {slot === 'morning' ? 'Morning' : 'Evening'} Shift</Text>
          </>
        )}
      </Pressable>
    );
  }

  if (shift.status === 'ACTIVE') {
    return (
      <Pressable
        onPress={onEnd}
        disabled={busy}
        className="bg-white border-2 border-red-200 h-14 rounded-2xl items-center justify-center flex-row gap-2 mb-4 active:bg-red-50"
      >
        {busy ? <ActivityIndicator color="#EF4444" /> : (
          <Text className="text-red-600 text-base font-black tracking-wide">End Shift</Text>
        )}
      </Pressable>
    );
  }

  // ENDED or AUTO_ENDED
  const auto = shift.status === 'AUTO_ENDED';
  return (
    <View className={`h-14 rounded-2xl items-center justify-center flex-row gap-2 mb-4 border ${auto ? 'bg-amber-50 border-amber-200' : 'bg-slate-100 border-slate-200'}`}>
      <Clock size={16} color={auto ? '#D97706' : '#64748B'} />
      <Text className={`text-sm font-bold ${auto ? 'text-amber-800' : 'text-slate-600'}`}>
        {auto ? 'Shift auto-ended past cutoff' : 'Shift ended'}
        {shift.endedAt && ` · ${new Date(shift.endedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`}
      </Text>
    </View>
  );
};

// ==========================================
// PRESERVED COMPONENTS — CustomAlert, MilkStatCard, SecondaryInventoryBadges,
// ProgressBar, ItemPill, StopCard, DeliveryModal
// (unchanged from previous version, just moved for organization)
// ==========================================

const CustomAlert = ({ visible, title, message, cancelText = 'Cancel', confirmText = 'Confirm', isDestructive = false, showCancel = true, onCancel, onConfirm }: any) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View className="flex-1 justify-center items-center bg-slate-900/40 px-5">
      <Pressable className="absolute inset-0" onPress={showCancel ? onCancel : onConfirm} />
      <View className="bg-white w-full max-w-sm rounded-[24px] p-6" style={Platform.OS === 'android' ? { elevation: 10 } : { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15 }}>
        <View className="items-center mb-4">
          <View className={`w-12 h-12 rounded-full items-center justify-center mb-3 ${isDestructive ? 'bg-red-50' : 'bg-slate-50'}`}>
            <AlertCircle size={24} color={isDestructive ? '#EF4444' : '#64748B'} />
          </View>
          <Text className="text-xl font-black text-slate-800 tracking-tight text-center">{title}</Text>
        </View>
        <Text className="text-slate-500 text-sm font-medium text-center mb-6 leading-5">{message}</Text>
        <View className="flex-row gap-3">
          {showCancel && (
            <Pressable onPress={onCancel} className="flex-1 bg-slate-100 h-12 rounded-xl items-center justify-center active:bg-slate-200">
              <Text className="text-slate-700 font-bold text-base">{cancelText}</Text>
            </Pressable>
          )}
          <Pressable onPress={onConfirm} className={`flex-1 h-12 rounded-xl items-center justify-center active:opacity-80 ${isDestructive ? 'bg-red-500' : 'bg-slate-800'}`}>
            <Text className="text-white font-bold text-base">{confirmText}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

const MilkStatCard = ({ expected, delivered }: { expected: number; delivered: number }) => (
  <View className="bg-white rounded-3xl p-5 border border-slate-200 mb-4" style={Platform.OS === 'android' ? { elevation: 3 } : { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 }}>
    <View className="flex-row items-center gap-2 mb-4">
      <Droplets size={20} color="#16A34A" />
      <Text className="text-slate-800 font-black text-sm uppercase tracking-widest">Primary Load: Milk</Text>
    </View>
    <View className="flex-row justify-between items-center">
      <View className="flex-1">
        <Text className="text-slate-500 font-semibold text-xs uppercase tracking-wider mb-1">To Load</Text>
        <View className="flex-row items-baseline">
          <Text className="text-4xl font-black text-slate-800 tracking-tighter">{expected}</Text>
          <Text className="text-xl font-bold text-slate-400 ml-1">L</Text>
        </View>
      </View>
      <View className="w-[2px] h-12 bg-slate-100 mx-4" />
      <View className="flex-1">
        <Text className="text-green-600 font-semibold text-xs uppercase tracking-wider mb-1">Delivered</Text>
        <View className="flex-row items-baseline">
          <Text className="text-4xl font-black text-green-600 tracking-tighter">{delivered}</Text>
          <Text className="text-xl font-bold text-green-400 ml-1">L</Text>
        </View>
      </View>
    </View>
  </View>
);

const SecondaryInventoryBadges = ({ items }: { items: { name: string; expected: number; delivered: number }[] }) => {
  if (items.length === 0) return null;
  return (
    <View className="mb-2">
      <Text className="text-slate-800 text-sm font-bold tracking-tight mb-2 px-1">Inventory Load</Text>
      <View className="flex-row flex-wrap justify-start">
        {items.map((item, index) => {
          const isComplete = item.delivered === item.expected && item.expected > 0;
          const Icon = getIconForItem(item.name);
          return (
            <View key={index} className="w-1/5 p-1">
              <View className={`items-center justify-center border rounded-[14px] py-2.5 px-0.5 h-full ${isComplete ? 'bg-green-50/50 border-green-200' : 'bg-white border-slate-200'}`}>
                <Icon size={20} color={isComplete ? '#15803D' : '#64748B'} strokeWidth={2.5} />
                <Text className={`text-[9px] font-bold uppercase tracking-wider mt-1.5 mb-1 text-center w-full ${isComplete ? 'text-green-700' : 'text-slate-500'}`} numberOfLines={1} adjustsFontSizeToFit>
                  {item.name}
                </Text>
                <Text className={`font-black text-[12px] text-center tracking-tighter ${isComplete ? 'text-green-800' : 'text-slate-800'}`} numberOfLines={1} adjustsFontSizeToFit>
                  {item.delivered}/{item.expected}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const ProgressBar = ({ completed, total }: { completed: number; total: number }) => {
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <View className="mt-4 mb-4 px-1">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-slate-800 text-base font-black tracking-tight">Route Progress</Text>
        <Text className="text-green-600 font-bold text-sm">{completed} / {total} Stops Done</Text>
      </View>
      <View className="h-3 bg-slate-200 rounded-full w-full overflow-hidden flex-row">
        <View className="h-full bg-green-500 rounded-full" style={{ width: `${percentage}%` }} />
      </View>
    </View>
  );
};

const ItemPill = ({ name, qty }: { name: string; qty: number }) => {
  const unit = UNIT_MAP[name.toLowerCase()] || '';
  return (
    <View className="flex-row items-center bg-slate-50 px-2.5 py-1.5 rounded-lg mr-2 mb-2 border border-slate-100">
      <Text className="text-slate-900 font-black mr-1 text-xs">{qty}{unit}</Text>
      <Text className="text-slate-500 font-semibold capitalize text-xs">{name}</Text>
    </View>
  );
};

const StopCard = ({ stop, index, onDeliver, onSkip, onCall, onNavigate }: any) => {
  const isDone = stop.status !== 'PENDING';
  const isSkipped = stop.status === 'SKIPPED' || stop.status === 'UNATTEMPTED' || stop.status === 'SYSTEM_AUTO_CLOSED';
  const displayOrder = isDone && stop.status === 'DELIVERED' ? (stop.actualOrder || {}) : stop.expectedOrder;

  return (
    <View className={`bg-white rounded-[24px] p-5 mb-4 border border-slate-100 ${isDone ? 'opacity-60 bg-slate-50/50' : ''}`} style={Platform.OS === 'android' && !isDone ? { elevation: 2 } : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }}>
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-1 pr-2">
          <Text className="text-green-600 font-bold text-[10px] uppercase tracking-wider mb-0.5">Stop {index + 1}</Text>
          <Text className={`text-xl font-black text-slate-800 tracking-tight ${isDone ? 'line-through text-slate-400' : ''}`}>{stop.customer}</Text>
          <Text className="text-slate-400 text-sm font-medium mt-0.5">{stop.address}</Text>
        </View>
        {!isDone ? (
          <View className="flex-row gap-2">
            <Pressable onPress={() => onCall(stop.phone)} className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100 active:bg-slate-200">
              <Phone size={16} color="#475569" />
            </Pressable>
            <Pressable onPress={() => onNavigate(stop.address)} className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100 active:bg-slate-200">
              <Navigation size={16} color="#475569" />
            </Pressable>
          </View>
        ) : (
          <View>
            {isSkipped ? (
              <View className="bg-red-50 px-2.5 py-1 rounded-full border border-red-100">
                <Text className="text-red-500 font-bold text-xs">{stop.status === 'SKIPPED' ? 'Skipped' : 'Missed'}</Text>
              </View>
            ) : (
              <CheckCircle2 color="#10B981" size={28} />
            )}
          </View>
        )}
      </View>

      <View className="flex-row flex-wrap mb-4">
        {Object.entries(displayOrder).map(([item, qty]: any) => (
          <ItemPill key={item} name={item} qty={qty} />
        ))}
      </View>

      {!isDone && (
        <View className="flex-row justify-end gap-3 mt-1">
          <Pressable onPress={() => onSkip(stop)} className="h-12 w-12 bg-white border border-slate-200 rounded-full items-center justify-center active:bg-slate-100">
            <X size={20} color="#EF4444" strokeWidth={2.5} />
          </Pressable>
          <Pressable onPress={() => onDeliver(stop)} className="h-12 w-12 bg-green-500 rounded-full items-center justify-center active:opacity-85" style={Platform.OS === 'android' ? { elevation: 4 } : { shadowColor: '#22C55E', shadowOpacity: 0.3, shadowRadius: 6 }}>
            <Check size={20} color="white" strokeWidth={3} />
          </Pressable>
        </View>
      )}
    </View>
  );
};

const DeliveryModal = ({ visible, stop, editedOrder, onClose, onAdjust, onConfirm }: any) => {
  if (!stop) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-slate-900/40">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="bg-white rounded-t-[32px] p-6 pb-10" style={Platform.OS === 'android' ? { elevation: 24 } : {}}>
          <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-6" />
          <View className="flex-row justify-between items-center mb-5">
            <View>
              <Text className="text-2xl font-black text-slate-800 tracking-tight">Modify Quantities</Text>
              <Text className="text-slate-400 font-medium mt-0.5">{stop.customer}</Text>
            </View>
            <Pressable onPress={onClose} className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100">
              <X size={18} color="#64748B" />
            </Pressable>
          </View>
          <ScrollView className="max-h-[300px] mb-6" showsVerticalScrollIndicator={false}>
            <View className="bg-slate-50 rounded-3xl p-4 border border-slate-100 space-y-3">
              {Object.keys(stop.expectedOrder).map((itemKey) => {
                const unit = UNIT_MAP[itemKey.toLowerCase()] || '';
                const Icon = getIconForItem(itemKey);
                return (
                  <View key={itemKey} className="flex-row justify-between items-center py-2.5 border-b border-slate-100 last:border-0">
                    <View className="flex-row items-center gap-3">
                      <Icon size={20} color="#94A3B8" />
                      <Text className="text-base font-bold text-slate-700 capitalize">{itemKey}</Text>
                    </View>
                    <View className="flex-row items-center gap-3">
                      <Pressable onPress={() => onAdjust(itemKey, -1)} className="h-9 w-9 bg-white border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100">
                        <Minus size={16} color="#334155" />
                      </Pressable>
                      <View className="items-center w-12">
                        <Text className="text-xl font-black text-slate-800">{editedOrder[itemKey] || 0}</Text>
                        {unit ? <Text className="text-[10px] font-bold text-slate-400 uppercase">{unit}</Text> : null}
                      </View>
                      <Pressable onPress={() => onAdjust(itemKey, 1)} className="h-9 w-9 bg-white border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100">
                        <Plus size={16} color="#334155" />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
          <Pressable onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} className="flex-row items-center justify-center bg-green-50/50 h-14 rounded-2xl border border-green-200/50 border-dashed gap-2 mb-4 active:bg-green-50">
            <Camera size={18} color="#15803D" />
            <Text className="text-green-800 font-bold text-sm">Add Delivery Proof Photo</Text>
          </Pressable>
          <Pressable onPress={onConfirm} className="bg-green-500 h-[56px] rounded-2xl items-center justify-center active:opacity-90" style={Platform.OS === 'android' ? { elevation: 3 } : { shadowColor: '#22C55E', shadowOpacity: 0.2, shadowRadius: 5 }}>
            <Text className="text-white text-base font-black tracking-wide">Confirm Delivery</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

// ==========================================
// MAIN SCREEN
// ==========================================

// Helpers for slot-scoped state — we keep manifests per slot in memory so
// switching morning ↔ evening is instant, and refetching one doesn't wipe
// the other's work-in-progress.
type SlotBucket = { stops: Stop[]; routeId: string };

export default function DriverManifestScreen() {
  const [driverName, setDriverName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busy, setBusy] = useState(false); // shift Start/End button spinner

  const [currentSlot, setCurrentSlot] = useState<Slot>(guessSlot());
  const [shiftState, setShiftState] = useState<ShiftState | null>(null);
  const [buckets, setBuckets] = useState<Record<Slot, SlotBucket>>({
    morning: { stops: [], routeId: '' },
    evening: { stops: [], routeId: '' },
  });

  const [activeStop, setActiveStop] = useState<Stop | null>(null);
  const [deliveryModalVisible, setDeliveryModalVisible] = useState(false);
  const [editedOrder, setEditedOrder] = useState<OrderData>({});
  const [alertConfig, setAlertConfig] = useState<any>(null);
  const [queueCount, setQueueCount] = useState(0);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // ------------------------------------------------------------------
  // Data loading — shift state + both manifests
  //
  // Both slots are fetched even if the driver only works one. The cost
  // is one extra HTTP call at load time; the benefit is that switching
  // slots feels instant and load aggregation shows the true full-day
  // picture from the start.
  // ------------------------------------------------------------------

  const loadEverything = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const name = user?.user_metadata?.full_name || 'Driver';
      setDriverName(name);
      await api.post('/driver/sync', { name });

      const todayStr = new Date().toISOString().split('T')[0];

      const [shift, mMan, eMan] = await Promise.allSettled([
        api.get('/driver/shift/today'),
        api.get(`/driver/manifest?date=${todayStr}&slot=morning`),
        api.get(`/driver/manifest?date=${todayStr}&slot=evening`),
      ]);

      if (shift.status === 'fulfilled') setShiftState(shift.value);

      setBuckets({
        morning: manifestToBucket(mMan),
        evening: manifestToBucket(eMan),
      });

      // Any queued rows may now sync since we clearly have network.
      drainQueue();
    } catch (err: any) {
      setAlertConfig({
        title: 'Network Error',
        message: 'Could not connect to the backend. Pull down to try again.',
        confirmText: 'Okay',
        showCancel: false,
        onConfirm: () => setAlertConfig(null),
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    startQueueWorker();
    const unsub = subscribeQueue((items) => setQueueCount(items.length));
    loadEverything();
    return unsub;
  }, [loadEverything]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadEverything();
  }, [loadEverything]);

  // ------------------------------------------------------------------
  // Shift actions
  // ------------------------------------------------------------------

  const startShift = async () => {
    setBusy(true);
    try {
      const row = await api.post('/driver/shift/start', { slot: currentSlot });
      setShiftState((prev) => prev ? { ...prev, [currentSlot]: row } : prev);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setAlertConfig({ title: 'Could not start shift', message: err?.message || 'Try again.', confirmText: 'OK', showCancel: false, onConfirm: () => setAlertConfig(null) });
    } finally {
      setBusy(false);
    }
  };

  const endShift = () => {
    setAlertConfig({
      title: `End ${currentSlot === 'morning' ? 'Morning' : 'Evening'} Shift?`,
      message: `You'll close out this slot for today. You can still deliver stops if needed — this is a marker for the admin.`,
      confirmText: 'End Shift',
      cancelText: 'Not yet',
      isDestructive: true,
      onCancel: () => setAlertConfig(null),
      onConfirm: async () => {
        setAlertConfig(null);
        setBusy(true);
        try {
          const row = await api.post('/driver/shift/end', { slot: currentSlot });
          setShiftState((prev) => prev ? { ...prev, [currentSlot]: row } : prev);
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (err: any) {
          setAlertConfig({ title: 'Could not end shift', message: err?.message || 'Try again.', confirmText: 'OK', showCancel: false, onConfirm: () => setAlertConfig(null) });
        } finally {
          setBusy(false);
        }
      },
    });
  };

  // ------------------------------------------------------------------
  // Delivery actions — all go through the offline queue
  // ------------------------------------------------------------------

  const currentBucket = buckets[currentSlot];
  const currentShift = shiftState?.[currentSlot] ?? null;

  const handleDeliver = (stop: Stop) => {
    setActiveStop(stop);
    setEditedOrder({ ...stop.expectedOrder });
    setDeliveryModalVisible(true);
  };

  const handleAdjust = (key: string, delta: number) => {
    setEditedOrder((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) + delta) }));
  };

  const confirmDelivery = () => {
    if (!activeStop) return;
    optimisticUpdateStop(activeStop.id, 'DELIVERED', editedOrder);
    submitStop(activeStop, 'DELIVERED', editedOrder);
    setDeliveryModalVisible(false);
    setActiveStop(null);
  };

  const handleSkip = (stop: Stop) => {
    setAlertConfig({
      title: 'Skip this stop?',
      message: `${stop.customer} will be marked as skipped.`,
      confirmText: 'Skip',
      cancelText: 'Cancel',
      isDestructive: true,
      onCancel: () => setAlertConfig(null),
      onConfirm: () => {
        setAlertConfig(null);
        optimisticUpdateStop(stop.id, 'SKIPPED');
        submitStop(stop, 'SKIPPED');
      },
    });
  };

  const optimisticUpdateStop = (stopId: string, status: Stop['status'], order?: OrderData) => {
    setBuckets((prev) => ({
      ...prev,
      [currentSlot]: {
        ...prev[currentSlot],
        stops: prev[currentSlot].stops.map((s) =>
          s.id === stopId ? { ...s, status, actualOrder: order } : s
        ),
      },
    }));
  };

  const submitStop = async (stop: Stop, status: Stop['status'], order?: OrderData) => {
    // Convert our compact {milk: 2000} shape back to the backend's
    // {milkQuantity: 2000} shape. The manifest parser strips the "Quantity"
    // suffix for display; customer.Order on the Go side still expects it,
    // and unknown JSON keys are silently dropped — so skipping this
    // conversion writes zeros for every product.
    const actualOrder: Record<string, number> = {};
    if (status === 'DELIVERED' && order) {
      Object.entries(order).forEach(([k, v]) => {
        if (v > 0) actualOrder[`${k}Quantity`] = v;
      });
    }

    const payload: DeliveryPayload = {
      customerId: stop.id,
      routeId: currentBucket.routeId,
      slot: currentSlot,
      date: new Date().toISOString().split('T')[0],
      status: status as any,
      actualOrder: status === 'DELIVERED' ? actualOrder : undefined,
      driverLatitude: 0,
      driverLongitude: 0,
    };

    const { synced } = await submitDelivery(payload);
    if (!synced) {
      // The delivery is queued but the first attempt didn't succeed. UI is
      // already showing it as delivered/skipped (optimistic) — no scary
      // banner, just a small hint that "N pending" via the header badge.
      console.log('Delivery queued for retry:', stop.customer);
    }
  };

  // ------------------------------------------------------------------
  // Load aggregation
  //
  // Sum expected quantities across ALL stops (both slots), converted to
  // sensible display units for the driver packing the cart. Milk gets its
  // own big card since it's the primary cargo; everything else lives in
  // the inventory badges.
  //
  // Storage note: backend stores milk as ml (2000ml = 2L), curd/paneer as
  // grams, etc. We keep the raw sum in base units internally and only
  // format to L/kg at render time — matching the same rule the customer
  // pages use.
  // ------------------------------------------------------------------

  const loadTotals = useMemo(() => {
    const expected: OrderData = {};
    const delivered: OrderData = {};

    // Full-day load = both buckets, regardless of currentSlot. This is
    // what the driver actually needs to pack in the cart.
    const allStops = [...buckets.morning.stops, ...buckets.evening.stops];

    allStops.forEach((stop) => {
      Object.entries(stop.expectedOrder).forEach(([item, qty]) => {
        expected[item] = (expected[item] || 0) + qty;
      });
      if (stop.status === 'DELIVERED' && stop.actualOrder) {
        Object.entries(stop.actualOrder).forEach(([item, qty]) => {
          delivered[item] = (delivered[item] || 0) + qty;
        });
      }
    });

    // Milk shown in litres, everything else in its natural unit.
    const milkExpectedL = Math.round((expected.milk || 0) / 1000);
    const milkDeliveredL = Math.round((delivered.milk || 0) / 1000);

    const inventory = Object.keys(expected)
      .filter((name) => name !== 'milk' && expected[name] > 0)
      .map((name) => ({
        name,
        expected: expected[name],
        delivered: delivered[name] || 0,
      }));

    return { milkExpectedL, milkDeliveredL, inventory };
  }, [buckets]);

  const stops = currentBucket.stops;
  const completedCount = stops.filter((s) => s.status !== 'PENDING').length;
  const morningActive = shiftState?.morning?.status === 'ACTIVE';
  const eveningActive = shiftState?.evening?.status === 'ACTIVE';

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#0F172A" />
      </View>
    );
  }

  const noStopsForSlot = stops.length === 0;

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <FlatList
          data={stops}
          keyExtractor={(s) => s.id}
          renderItem={({ item, index }) => (
            <StopCard
              stop={item}
              index={index}
              onDeliver={handleDeliver}
              onSkip={handleSkip}
              onCall={(phone: string) => Linking.openURL(`tel:${phone}`)}
              onNavigate={(addr: string) => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(addr)}`)}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#0F172A" />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              {/* Header */}
              <View className="flex-row justify-between items-center px-1 pt-4 pb-4">
                <View>
                  <Text className="text-slate-500 text-sm font-semibold">{today}</Text>
                  <Text className="text-2xl font-black text-slate-900 tracking-tight">{driverName}</Text>
                </View>
                {queueCount > 0 && (
                  <View className="flex-row items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
                    <CloudOff size={14} color="#D97706" />
                    <Text className="text-amber-800 text-xs font-black">{queueCount} pending</Text>
                  </View>
                )}
              </View>

              {/* Slot picker */}
              <SlotPicker
                current={currentSlot}
                onChange={setCurrentSlot}
                morningActive={morningActive}
                eveningActive={eveningActive}
              />

              {/* Shift control */}
              <ShiftControl
                shift={currentShift}
                slot={currentSlot}
                busy={busy}
                onStart={startShift}
                onEnd={endShift}
              />

              {/* Load aggregation — always shows full-day totals across
                  both slots so the driver knows what to pack, even if
                  they haven't started the shift yet. */}
              <MilkStatCard expected={loadTotals.milkExpectedL} delivered={loadTotals.milkDeliveredL} />
              <SecondaryInventoryBadges items={loadTotals.inventory} />

              {!noStopsForSlot && (
                <ProgressBar completed={completedCount} total={stops.length} />
              )}
            </View>
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-16 px-6">
              <Package size={40} color="#CBD5E1" />
              <Text className="text-slate-500 font-bold mt-3 text-center">
                No stops assigned for the {currentSlot} slot today.
              </Text>
              {currentSlot === 'morning' && buckets.evening.stops.length > 0 && (
                <Pressable onPress={() => setCurrentSlot('evening')} className="mt-3 px-4 py-2 bg-white rounded-full border border-slate-200 active:bg-slate-100">
                  <Text className="text-slate-700 font-bold text-sm">Switch to Evening →</Text>
                </Pressable>
              )}
              {currentSlot === 'evening' && buckets.morning.stops.length > 0 && (
                <Pressable onPress={() => setCurrentSlot('morning')} className="mt-3 px-4 py-2 bg-white rounded-full border border-slate-200 active:bg-slate-100">
                  <Text className="text-slate-700 font-bold text-sm">← Switch to Morning</Text>
                </Pressable>
              )}
            </View>
          }
        />

        <DeliveryModal
          visible={deliveryModalVisible}
          stop={activeStop}
          editedOrder={editedOrder}
          onClose={() => setDeliveryModalVisible(false)}
          onAdjust={handleAdjust}
          onConfirm={confirmDelivery}
        />

        <CustomAlert visible={!!alertConfig} {...alertConfig} />
      </SafeAreaView>
    </View>
  );
}

// ==========================================
// Helpers
// ==========================================

// Rough "default the picker to what the driver probably wants to see."
// Before noon → morning, after → evening. They can always tap the other.
function guessSlot(): Slot {
  return new Date().getHours() < 14 ? 'morning' : 'evening';
}

// Convert one manifest fetch result to a SlotBucket. Handles both the
// success path and the "no route assigned" 404 path uniformly.
function manifestToBucket(res: PromiseSettledResult<any>): SlotBucket {
  if (res.status !== 'fulfilled' || !res.value?.stops?.length) {
    return { stops: [], routeId: '' };
  }
  const data = res.value;
  const stops: Stop[] = data.stops.map((backendStop: any) => {
    const expected: OrderData = {};
    Object.entries(backendStop.deliveryOrder || {}).forEach(([key, value]) => {
      if (typeof value === 'number' && value > 0) {
        const cleanKey = key.replace('Quantity', '');
        expected[cleanKey] = value;
      }
    });
    const actual: OrderData = {};
    if (backendStop.status === 'DELIVERED') {
      Object.entries(backendStop.actualOrder || {}).forEach(([key, value]) => {
        if (typeof value === 'number' && value > 0) {
          const cleanKey = key.replace('Quantity', '');
          actual[cleanKey] = value;
        }
      });
    }
    return {
      id: backendStop.id,
      customer: backendStop.customer || backendStop.name || 'Unknown',
      address: backendStop.houseAddress || 'No Address provided',
      phone: backendStop.phoneNumber || '',
      status: backendStop.status || 'PENDING',
      expectedOrder: expected,
      actualOrder: backendStop.status === 'DELIVERED' ? actual : undefined,
    };
  });
  return { stops, routeId: data.routeId || '' };
}

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  FlatList,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft, Route as RouteIcon, Save, Trash2, MapPin, Phone, MessageCircle, ChevronDown,
  Search, X, CheckCircle2, XCircle, Undo2, Minus, Plus, Layers, MapPinned, ShoppingBag, PlusCircle
} from 'lucide-react-native';

let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default; Marker = Maps.Marker;
  } catch (e) { console.log('react-native-maps not loaded'); }
}

import { api } from '../../../utils/api';

type CustomerDetail = { id: string; customer: string; phoneNumber: string; houseAddress: string; geoLatitude: string; geoLongitude: string; isActive: boolean; status: 'pending' | 'active' | 'disabled' | 'rejected'; stopOrder: number; routeId: string | null; };
type RouteItem = { id: string; name: string };
type RouteStop = { id: string; name: string; stopOrder: number; houseAddress: string };
type OrderState = {
  milkQuantity: number; curdQuantity: number; butterQuantity: number; gheeQuantity: number;
  lassiQuantity: number; paneerQuantity: number; jaggeryQuantity: number; khandQuantity: number;
  oilQuantity: number; attaQuantity: number; burfiQuantity: number;[key: string]: number;
};

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

function formatQty(baseUnits: number, unit: string): string {
  if (baseUnits <= 0) return '0';
  if (baseUnits < 1000) return `${baseUnits} ${unit === 'L' ? 'ml' : 'g'}`;
  return `${Number((baseUnits / 1000).toFixed(2))} ${unit}`;
}

const DAYS_OF_WEEK = [{ label: 'Su', index: 0 }, { label: 'Mo', index: 1 }, { label: 'Tu', index: 2 }, { label: 'We', index: 3 }, { label: 'Th', index: 4 }, { label: 'Fr', index: 5 }, { label: 'Sa', index: 6 }];

function RoutePickerModal({ visible, routes, selectedId, onSelect, onClose }: any) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => routes.filter((r: any) => r.name.toLowerCase().includes(query.toLowerCase())), [routes, query]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-slate-900/50 justify-end">
        <View className="bg-white rounded-t-[32px] max-h-[75%] pb-8">
          <View className="flex-row items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
            <View><Text className="text-xl font-black text-slate-900">Select Delivery Route</Text><Text className="text-xs text-slate-500 font-medium mt-0.5">Assign customer to a logistics pipeline</Text></View>
            <Pressable onPress={onClose} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center active:bg-slate-200"><X size={18} color="#0F172A" /></Pressable>
          </View>
          <View className="mx-6 my-4 flex-row items-center bg-slate-50 rounded-2xl px-4 h-12 border border-slate-200"><Search size={18} color="#94A3B8" /><TextInput value={query} onChangeText={setQuery} placeholder="Search routes..." placeholderTextColor="#94A3B8" className="flex-1 ml-3 text-base font-medium text-slate-800" /></View>
          <FlatList data={[{ id: '', name: 'Unassigned (No Route)' }, ...filtered]} keyExtractor={(item) => item.id || 'unassigned'} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 20 }} renderItem={({ item }) => {
            const isSelected = (item.id || null) === selectedId;
            return (
              <Pressable onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(item.id || null); onClose(); }} className={`flex-row items-center justify-between my-1.5 px-4 py-4 rounded-2xl border ${isSelected ? 'bg-slate-900 border-slate-900 shadow-sm' : 'bg-white border-slate-200'}`}>
                <View className="flex-row items-center gap-3"><RouteIcon size={18} color={isSelected ? 'white' : '#64748B'} /><Text className={`font-bold text-base ${isSelected ? 'text-white' : 'text-slate-800'}`}>{item.name}</Text></View>
                {isSelected && <CheckCircle2 size={20} color="white" />}
              </Pressable>
            );
          }} />
        </View>
      </View>
    </Modal>
  );
}

function Stepper({ value, onChange, min = 1, max = 999 }: any) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const handleTextChange = (val: string) => { const clean = val.replace(/[^0-9]/g, ''); setText(clean); onChange(clean === '' ? min : parseInt(clean, 10)); };
  const step = (delta: number) => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); const newVal = Math.max(min, Math.min(max, value + delta)); onChange(newVal); setText(String(newVal)); };
  return (
    <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl h-14 px-2 w-44 justify-between">
      <Pressable onPress={() => step(-1)} className="w-10 h-10 rounded-xl bg-white border border-slate-200 items-center justify-center active:bg-slate-100 shadow-sm"><Minus size={16} color="#0F172A" /></Pressable>
      <TextInput value={text} onChangeText={handleTextChange} keyboardType="number-pad" className="font-black text-lg text-slate-900 flex-1 text-center" />
      <Pressable onPress={() => step(1)} className="w-10 h-10 rounded-xl bg-white border border-slate-200 items-center justify-center active:bg-slate-100 shadow-sm"><Plus size={16} color="#0F172A" /></Pressable>
    </View>
  );
}

function ProductStepper({ value, onChange, min, max, step, unit }: any) {
  const bump = (delta: number) => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(Math.max(min, Math.min(max, value + delta))); };
  return (
    <View className="flex-row items-center justify-between w-32 bg-slate-50 border border-slate-200 rounded-xl h-10 px-1">
      <Pressable onPress={() => bump(-step)} className="w-8 h-8 rounded-lg items-center justify-center active:bg-slate-200"><Minus size={14} color="#0F172A" /></Pressable>
      <Text className="font-black text-xs text-slate-900">{formatQty(value, unit)}</Text>
      <Pressable onPress={() => bump(step)} className="w-8 h-8 rounded-lg items-center justify-center active:bg-slate-200"><Plus size={14} color="#0F172A" /></Pressable>
    </View>
  );
}

function RejectModal({ visible, onClose, onConfirm, loading }: any) {
  const [selected, setSelected] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');
  const finalReason = selected === 'Other' ? customReason.trim() : selected || '';
  const canConfirm = finalReason.length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/40 justify-end">
        <View className="bg-white rounded-t-[32px] p-6 pb-10">
          <Text className="text-xl font-black text-slate-900 mb-1">Reject Registration</Text>
          <Text className="text-xs text-slate-500 font-medium mb-5 leading-5">This will decline the customer's onboarding request and automatically notify them via WhatsApp.</Text>

          {['Outside our delivery area', 'Duplicate registration', 'Unable to verify address', 'Other'].map((reason) => {
            const isSelected = selected === reason;
            return (
              <Pressable key={reason} onPress={() => setSelected(reason)} className={`px-4 py-3.5 rounded-2xl border mb-2.5 ${isSelected ? 'bg-rose-50 border-rose-400' : 'bg-slate-50 border-slate-200'}`}>
                <Text className={`font-bold text-sm ${isSelected ? 'text-rose-700' : 'text-slate-700'}`}>{reason}</Text>
              </Pressable>
            );
          })}

          {selected === 'Other' && (
            <TextInput value={customReason} onChangeText={setCustomReason} placeholder="Specify custom rejection reason..." placeholderTextColor="#94A3B8" multiline className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-medium text-slate-800 min-h-[80px] mb-3" />
          )}

          <View className="flex-row gap-3 mt-4">
            <Pressable onPress={onClose} className="flex-1 h-14 rounded-2xl bg-slate-100 items-center justify-center active:bg-slate-200"><Text className="font-bold text-slate-700 text-base">Cancel</Text></Pressable>
            <Pressable onPress={() => canConfirm && onConfirm(finalReason)} disabled={!canConfirm || loading} className={`flex-1 h-14 rounded-2xl items-center justify-center active:opacity-90 ${canConfirm ? 'bg-rose-500' : 'bg-rose-200'}`}>
              {loading ? <ActivityIndicator color="white" /> : <Text className="font-black text-white text-base">Confirm Rejection</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// --- MAIN SCREEN ---
export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [loadingRouteStops, setLoadingRouteStops] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [routeId, setRouteId] = useState<string | null>(null);
  const [stopOrder, setStopOrder] = useState(1);
  const [isActive, setIsActive] = useState(true);

  const [scheduleType, setScheduleType] = useState<'daily' | 'alternate' | 'custom'>('daily');
  const [activeDays, setActiveDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const [order, setOrder] = useState<OrderState>({
    milkQuantity: 0, curdQuantity: 0, butterQuantity: 0, gheeQuantity: 0, lassiQuantity: 0,
    paneerQuantity: 0, jaggeryQuantity: 0, khandQuantity: 0, oilQuantity: 0, attaQuantity: 0, burfiQuantity: 0,
  });

  const [showRoutePicker, setShowRoutePicker] = useState(false);
  const [showApprovalPanel, setShowApprovalPanel] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const fetchDetails = useCallback(async () => {
    try {
      const [custData, routeData] = await Promise.all([api.get(`/customer/${id}`), api.get('/route')]);
      setCustomer(custData);
      setRoutes(routeData || []);

      setName(custData.customer || '');
      setPhone(custData.phoneNumber || '');
      setAddress(custData.houseAddress || '');
      setRouteId(custData.routeId || null);
      setStopOrder(custData.stopOrder && custData.stopOrder > 0 ? custData.stopOrder : 1);
      setIsActive(custData.status === 'active');

      try {
        const subData = await api.get(`/subscription/customer/${id}`);
        if (subData) {
          setScheduleType(subData.scheduleType || 'daily');
          setActiveDays(subData.activeDays || [0, 1, 2, 3, 4, 5, 6]);

          const source = subData.defaultOrder || subData;
          setOrder({
            milkQuantity: Number(source.milkQuantity || 0),
            curdQuantity: Number(source.curdQuantity || 0),
            butterQuantity: Number(source.butterQuantity || 0),
            gheeQuantity: Number(source.gheeQuantity || 0),
            lassiQuantity: Number(source.lassiQuantity || 0),
            paneerQuantity: Number(source.paneerQuantity || 0),
            jaggeryQuantity: Number(source.jaggeryQuantity || 0),
            khandQuantity: Number(source.khandQuantity || 0),
            oilQuantity: Number(source.oilQuantity || 0),
            attaQuantity: Number(source.attaQuantity || 0),
            burfiQuantity: Number(source.burfiQuantity || 0),
          });
        }
      } catch (e: any) {
        // 🚀 LOUD ALERTS: Ignore 404s (expected for new users), but scream if it's a 500 error!
        if (e.message && !e.message.includes('404') && !e.message.includes('found')) {
          Alert.alert("Subscription Fetch Crash", `Backend threw: ${e.message}`);
        }
      }
    } catch (err: any) {
      Alert.alert('Load Profile Error', err.message || 'Failed to load customer profile');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetails(); }, [fetchDetails]);

  useEffect(() => {
    if (!routeId) { setRouteStops([]); return; }
    let isMounted = true;
    setLoadingRouteStops(true);

    // 🚀 LOUD ALERTS: Catch Roster crashes instantly
    api.get(`/route/${routeId}/roster`)
      .then((res: any) => {
        if (isMounted) setRouteStops((res.stops || []).map((s: any) => ({ id: s.id, name: s.name || 'Customer', stopOrder: s.stopOrder || 0, houseAddress: s.houseAddress || '' })));
      })
      .catch((err) => {
        if (isMounted) {
          setRouteStops([]);
          Alert.alert("Route Inspector Crash", `Backend threw: ${err.message}`);
        }
      })
      .finally(() => { if (isMounted) setLoadingRouteStops(false); });
    return () => { isMounted = false; };
  }, [routeId]);

  const selectedRouteName = routes.find((r) => r.id === routeId)?.name || 'Unassigned';

  const toggleDay = (dayIndex: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveDays((prev) => (prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex].sort()));
  };

  const handleSave = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      const customerPayload = {
        customer: name,
        phoneNumber: phone,
        houseAddress: address,
        geoLatitude: customer.geoLatitude || '0',
        geoLongitude: customer.geoLongitude || '0',
        isActive: customer.status === 'active' ? isActive : customer.isActive,
        status: customer.status === 'active' ? (isActive ? 'active' : 'disabled') : customer.status,
        stopOrder,
        routeId: routeId || null,
      };

      const activeOrder: any = {};
      PRODUCTS.forEach(p => { if (order[p.key] > 0) activeOrder[p.key] = order[p.key]; });

      const subPayload = {
        customerId: id,
        scheduleType,
        activeDays: scheduleType === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : activeDays,
        anchorDate: new Date().toISOString().split('T')[0],
        defaultOrder: activeOrder,
      };

      await api.put(`/customer/${id}`, customerPayload);

      // 🚀 NO MORE SILENT FAILURES. Let the app throw an alert if this POST fails!
      await api.post(`/subscription`, subPayload);

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Profile and subscription updated.');
      fetchDetails();
    } catch (err: any) {
      Alert.alert('Save Error', err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!routeId) return Alert.alert('Route required', 'Please select a delivery route before approving.');
    setApproving(true);
    try {
      const activeOrder: any = {};
      PRODUCTS.forEach(p => { if (order[p.key] > 0) activeOrder[p.key] = order[p.key]; });

      const subPayload = {
        customerId: id,
        scheduleType,
        activeDays: scheduleType === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : activeDays,
        anchorDate: new Date().toISOString().split('T')[0],
        defaultOrder: activeOrder,
      };

      await Promise.all([
        api.post(`/customer/${id}/approve`, { routeId, stopOrder }),
        api.post(`/subscription`, subPayload)
      ]);

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Approved!', 'Customer approved and notified via WhatsApp.');
      fetchDetails();
      setShowApprovalPanel(false);
    } catch (err: any) {
      Alert.alert('Approval Error', err.message);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (reason: string) => {
    try {
      await api.post(`/customer/${id}/reject`, { reason });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRejectModal(false);
      Alert.alert('Rejected', 'Customer registration declined and notified via WhatsApp.');
      fetchDetails();
    } catch (err: any) {
      Alert.alert('Rejection Error', err.message || 'Failed to reject customer');
    }
  };

  const handleResetToPending = () => {
    Alert.alert('Revert to Pending', 'Are you sure you want to move this customer back to the pending queue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm', onPress: async () => {
          try {
            await api.put(`/customer/${id}`, {
              customer: name, phoneNumber: phone, houseAddress: address,
              geoLatitude: customer?.geoLatitude || '0', geoLongitude: customer?.geoLongitude || '0',
              isActive: false, status: 'pending', stopOrder, routeId: routeId || null,
            });
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Moved to Pending', 'Customer reverted to pending queue.');
            fetchDetails();
          } catch (err: any) { Alert.alert('Error', err.message || 'Failed to reset status'); }
        }
      }
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Delete Customer Identity', 'This action is permanent. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Permanently', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/customer/${id}`);
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch (err: any) { Alert.alert('Delete Error', err.message || 'Failed to delete customer.'); }
        }
      }
    ]);
  };

  const activeProducts = PRODUCTS.filter((p) => (order[p.key] || 0) > 0);
  const inactiveProducts = PRODUCTS.filter((p) => (order[p.key] || 0) === 0);

  if (loading) return <View className="flex-1 bg-slate-50 items-center justify-center"><ActivityIndicator size="large" color="#10B981" /></View>;

  const lat = parseFloat(customer?.geoLatitude || '28.6139');
  const lon = parseFloat(customer?.geoLongitude || '77.2090');
  const hasCoords = !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0;

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-200 bg-white shadow-sm z-10">
          <Pressable onPress={() => router.back()} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center active:bg-slate-200">
            <ArrowLeft size={20} color="#0F172A" />
          </Pressable>
          <Text className="text-lg font-black text-slate-900 tracking-tight">Control Center</Text>
          <View className="flex-row gap-2">
            <Pressable onPress={() => phone && Linking.openURL(`tel:${phone}`)} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center"><Phone size={16} color="#0F172A" /></Pressable>
            <Pressable onPress={() => phone && Linking.openURL(`https://wa.me/${phone.replace(/[^0-9]/g, '')}`)} className="w-10 h-10 bg-emerald-50 rounded-full items-center justify-center"><MessageCircle size={16} color="#16A34A" /></Pressable>
            <Pressable onPress={handleDelete} className="w-10 h-10 bg-rose-50 rounded-full items-center justify-center"><Trash2 size={16} color="#E11D48" /></Pressable>
          </View>
        </View>

        <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          {customer?.status === 'pending' && (
            <View className="bg-amber-50 border border-amber-200 rounded-[28px] p-5 mb-6 shadow-sm">
              <View className="flex-row items-center gap-2 mb-1.5"><View className="w-2.5 h-2.5 rounded-full bg-amber-500" /><Text className="text-amber-900 font-black text-base tracking-tight">Pending Approval Queue</Text></View>
              <Text className="text-amber-700 text-xs font-medium mb-4 leading-5">Assign route and order details below to activate.</Text>
              {!showApprovalPanel ? (
                <View className="flex-row gap-3">
                  <Pressable onPress={() => setShowApprovalPanel(true)} className="flex-1 bg-emerald-600 h-13 rounded-2xl items-center flex-row justify-center gap-2 active:opacity-90"><CheckCircle2 size={18} color="white" /><Text className="text-white font-black text-sm">Review & Approve</Text></Pressable>
                  <Pressable onPress={() => setShowRejectModal(true)} className="flex-1 bg-rose-500 h-13 rounded-2xl items-center flex-row justify-center gap-2 active:opacity-90"><XCircle size={18} color="white" /><Text className="text-white font-black text-sm">Reject</Text></Pressable>
                </View>
              ) : (
                <View className="bg-white/80 rounded-2xl p-4 border border-amber-200 gap-3 mt-2">
                  <Text className="text-xs font-black text-slate-800 uppercase tracking-wider">Destination Route</Text>
                  <Pressable onPress={() => setShowRoutePicker(true)} className="flex-row items-center justify-between bg-white border border-slate-200 rounded-2xl h-12 px-4"><Text className="font-bold text-slate-800 text-sm">{selectedRouteName}</Text><ChevronDown size={16} color="#64748B" /></Pressable>
                  <View className="flex-row gap-3 mt-2">
                    <Pressable onPress={() => setShowApprovalPanel(false)} className="flex-1 bg-slate-100 h-13 rounded-2xl items-center justify-center"><Text className="font-bold text-slate-700 text-sm">Cancel</Text></Pressable>
                    <Pressable onPress={handleApprove} disabled={approving} className="flex-1 bg-emerald-600 h-13 rounded-2xl items-center justify-center">{approving ? <ActivityIndicator color="white" /> : <Text className="text-white font-black text-sm">Confirm Approval</Text>}</Pressable>
                  </View>
                </View>
              )}
            </View>
          )}

          {customer?.status === 'rejected' && (
            <View className="bg-rose-50 border border-rose-200 rounded-[28px] p-5 mb-6 shadow-sm">
              <Text className="text-rose-900 font-black text-base mb-1">❌ Registration Declined</Text>
              <Text className="text-rose-600 text-xs font-medium mb-4 leading-5">This registration was previously rejected.</Text>
              <Pressable onPress={handleResetToPending} className="bg-white border border-rose-300 h-12 rounded-2xl items-center flex-row justify-center gap-2 active:bg-rose-50 shadow-sm"><Undo2 size={16} color="#E11D48" /><Text className="text-rose-600 font-black text-sm">Revert to Pending Queue</Text></Pressable>
            </View>
          )}

          {(customer?.status === 'active' || customer?.status === 'disabled') && (
            <>
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Operational Delivery State</Text>
              <View className="flex-row bg-slate-200/60 p-1.5 rounded-2xl mb-6">
                {[{ label: 'Active (Delivering)', value: true }, { label: 'Paused (Suspended)', value: false }].map((opt) => (
                  <Pressable key={String(opt.value)} onPress={() => setIsActive(opt.value)} className={`flex-1 py-3 items-center rounded-xl ${isActive === opt.value ? 'bg-slate-900 shadow-sm' : ''}`}>
                    <Text className={`text-xs font-black tracking-wide ${isActive === opt.value ? 'text-white' : 'text-slate-600'}`}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Personal Identity</Text>
          <View className="bg-white rounded-[28px] p-5 border border-slate-200 mb-6 gap-4 shadow-sm">
            <View><Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Name</Text><TextInput value={name} onChangeText={setName} className="bg-slate-50 border border-slate-200 rounded-2xl h-12 px-4 font-bold text-slate-800 text-base" /></View>
            <View><Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Phone Number</Text><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" className="bg-slate-50 border border-slate-200 rounded-2xl h-12 px-4 font-bold text-slate-800 text-base" /></View>
            <View><Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">House Address</Text><TextInput value={address} onChangeText={setAddress} multiline className="bg-slate-50 border border-slate-200 rounded-2xl p-4 font-medium text-slate-800 min-h-[70px] text-sm" /></View>
          </View>

          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Logistics & Route</Text>
          <View className="bg-white rounded-[28px] p-5 border border-slate-200 mb-6 gap-5 shadow-sm">
            <View>
              <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assigned Route</Text>
              <Pressable onPress={() => setShowRoutePicker(true)} className="flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl h-12 px-4">
                <View className="flex-row items-center gap-2.5"><RouteIcon size={18} color="#0F172A" /><Text className="font-bold text-slate-900 text-sm">{selectedRouteName}</Text></View><ChevronDown size={18} color="#94A3B8" />
              </Pressable>
            </View>
            <View>
              <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Stop Sequence Order</Text>
              <Stepper value={stopOrder} onChange={setStopOrder} />
            </View>

            {routeId && (
              <View className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mt-2">
                <Text className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3">Live Route Context ({routeStops.length} Stops)</Text>
                {loadingRouteStops ? <ActivityIndicator size="small" color="#0F172A" className="py-2" /> : routeStops.length === 0 ? <Text className="text-xs text-slate-400 font-medium italic text-center py-2">This route has no other assigned customers yet.</Text> : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {routeStops.map((stop) => {
                      const isCurrent = stop.id === id;
                      return (
                        <View key={stop.id} className={`w-36 p-3 rounded-2xl border mr-2.5 ${isCurrent ? 'bg-slate-900 border-slate-900 shadow-sm' : 'bg-white border-slate-200'}`}>
                          <Text className={`text-[10px] font-black uppercase ${isCurrent ? 'text-emerald-400' : 'text-slate-400'}`}>Stop #{stop.stopOrder}</Text>
                          <Text className={`font-black text-xs mt-1 ${isCurrent ? 'text-white' : 'text-slate-800'}`} numberOfLines={1}>{stop.name}</Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}
          </View>

          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Default Order Details</Text>
          <View className="bg-white rounded-[28px] p-5 border border-slate-200 mb-6 shadow-sm">
            <View className="flex-row bg-slate-100 p-1.5 rounded-2xl mb-5">
              {[{ id: 'daily', label: 'Daily' }, { id: 'alternate', label: 'Alternate' }, { id: 'custom', label: 'Custom' }].map((opt) => (
                <Pressable key={opt.id} onPress={() => setScheduleType(opt.id as any)} className={`flex-1 py-2.5 items-center rounded-xl ${scheduleType === opt.id ? 'bg-slate-900 shadow-sm' : ''}`}>
                  <Text className={`text-xs font-black ${scheduleType === opt.id ? 'text-white' : 'text-slate-500'}`}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            {scheduleType === 'custom' && (
              <View className="flex-row justify-between mb-5 px-1">
                {DAYS_OF_WEEK.map((day) => {
                  const isSelected = activeDays.includes(day.index);
                  return (
                    <Pressable key={day.index} onPress={() => toggleDay(day.index)} className={`w-10 h-10 rounded-full items-center justify-center border ${isSelected ? 'bg-emerald-500 border-emerald-600' : 'bg-slate-50 border-slate-200'}`}>
                      <Text className={`text-xs font-black ${isSelected ? 'text-white' : 'text-slate-400'}`}>{day.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View className="gap-3">
              {activeProducts.length === 0 && (
                <View className="bg-slate-50 border border-slate-200 rounded-2xl p-6 items-center justify-center mb-3">
                  <ShoppingBag size={24} color="#94A3B8" />
                  <Text className="font-bold text-slate-700 mt-2">No Items Assigned</Text>
                  <Text className="text-xs text-slate-400 text-center mt-1 px-4">Tap below to add products to this customer's recurring delivery.</Text>
                </View>
              )}

              {activeProducts.map((p) => (
                <View key={p.key} className="flex-row items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                  <View className="flex-row items-center gap-3"><Text className="text-xl">{p.icon}</Text><Text className="font-bold text-slate-800">{p.label}</Text></View>
                  <ProductStepper value={order[p.key] || 0} onChange={(v: number) => setOrder({ ...order, [p.key]: v })} min={0} max={p.max} step={p.step} unit={p.unit} />
                </View>
              ))}

              <Pressable onPress={() => setShowAddItemModal(true)} className="flex-row items-center justify-center gap-2 py-4 mt-2 border-2 border-dashed border-slate-200 rounded-2xl active:bg-slate-50">
                <PlusCircle size={18} color="#64748B" /><Text className="font-bold text-slate-500 text-sm">Add Item to Delivery</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        <View className="absolute bottom-6 left-5 right-5">
          <Pressable onPress={handleSave} disabled={saving} className="bg-slate-900 h-16 rounded-[24px] items-center justify-center flex-row gap-2 active:opacity-90 shadow-xl shadow-slate-900/30">
            {saving ? <ActivityIndicator color="white" /> : <><Save size={20} color="white" /><Text className="text-white text-base font-black">Save Customer & Order</Text></>}
          </Pressable>
        </View>
      </SafeAreaView>

      <Modal visible={showAddItemModal} animationType="slide" transparent onRequestClose={() => setShowAddItemModal(false)}>
        <View className="flex-1 bg-slate-900/50 justify-end">
          <View className="bg-white rounded-t-[32px] max-h-[80%] pb-10 px-6 pt-6">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-xl font-black text-slate-900">Add Product</Text>
              <Pressable onPress={() => setShowAddItemModal(false)} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center"><X size={18} color="#0F172A" /></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {inactiveProducts.length === 0 ? <Text className="text-center text-slate-400 py-10 font-medium">All products are already in the order.</Text> : (
                inactiveProducts.map(p => (
                  <Pressable key={p.key} onPress={() => { setOrder({ ...order, [p.key]: p.step }); setShowAddItemModal(false); }} className="flex-row items-center justify-between p-4 mb-3 border border-slate-200 rounded-2xl active:bg-slate-50">
                    <View className="flex-row items-center gap-3"><Text className="text-2xl">{p.icon}</Text><View><Text className="font-bold text-slate-800 text-base">{p.label}</Text><Text className="text-xs text-slate-400 font-medium mt-0.5">Tap to add</Text></View></View>
                    <Plus size={20} color="#0F172A" />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <RoutePickerModal visible={showRoutePicker} routes={routes} selectedId={routeId} onSelect={setRouteId} onClose={() => setShowRoutePicker(false)} />
      <RejectModal visible={showRejectModal} onClose={() => setShowRejectModal(false)} onConfirm={handleReject} />
    </View>
  );
}

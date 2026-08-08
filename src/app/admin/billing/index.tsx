import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, ChevronRight, Receipt, TrendingUp, CircleCheck,
  Clock, Zap, X, Banknote, Smartphone, FileText,
} from 'lucide-react-native';

import { api } from '../../../utils/api';

// -------------------------------------------------------------------------
// Types — mirror billing.MonthSummary / CustomerTally / InvoiceRow
// -------------------------------------------------------------------------

type CustomerTally = {
  customerId: string;
  customerName: string;
  phoneNumber: string;
  deliveryCount: number;
  totalAmount: number;
  invoiceId: string | null;
  invoiceStatus: string | null;
  isFinalized: boolean;
};

type MonthSummary = {
  month: string;
  customerCount: number;
  totalRevenue: number;
  finalizedCount: number;
  pendingAmount: number;
  collectedAmount: number;
  tallies: CustomerTally[];
};

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ym(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function labelFor(month: string) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
function rupees(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PAID_ONLINE: { label: 'Paid · Online', cls: 'bg-green-100 border-green-200 text-green-800' },
  PAID_CASH: { label: 'Paid · Cash', cls: 'bg-green-100 border-green-200 text-green-800' },
  PENDING: { label: 'Pending', cls: 'bg-amber-100 border-amber-200 text-amber-800' },
};

export default function BillingScreen() {
  const [month, setMonth] = useState(ym(new Date()));
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Mark-paid modal
  const [selectedTally, setSelectedTally] = useState<CustomerTally | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);

  const isCurrentOrFuture = month >= ym(new Date());

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.get(`/billing/live?month=${month}`);
      setSummary(data);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load billing');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month]);

  useEffect(() => {
    setLoading(true);
    fetchSummary();
  }, [fetchSummary]);

  const shiftMonth = (delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(ym(d));
  };

  const handleGenerate = () => {
    Alert.alert(
      'Generate Invoices',
      `Freeze ${labelFor(month)} into invoices? Each customer's bill is locked at the prices they were charged. This can't be undone, but re-running is safe — existing invoices won't be duplicated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setGenerating(true);
            try {
              const res = await api.post('/billing/generate', { month });
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                'Done',
                `${res.invoicesGenerated} invoice(s) generated${res.alreadyExisted > 0 ? `, ${res.alreadyExisted} already existed` : ''}.`,
              );
              fetchSummary();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to generate invoices');
            } finally {
              setGenerating(false);
            }
          },
        },
      ],
    );
  };

  const handleMarkPaid = async (status: 'PAID_ONLINE' | 'PAID_CASH' | 'PENDING') => {
    if (!selectedTally?.invoiceId) return;
    try {
      await api.put(`/billing/invoices/${selectedTally.invoiceId}/status`, { status });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowPayModal(false);
      setSelectedTally(null);
      fetchSummary();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update status');
    }
  };

  const router = useRouter()

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1">
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchSummary();
              }}
              tintColor="#16A34A"
            />
          }
        >
          <View className="px-5 pt-4 pb-3">
            <Text className="text-3xl font-black text-slate-800 tracking-tighter">Billing</Text>
            <Text className="text-sm font-semibold text-slate-400">Running tallies and monthly invoices</Text>
          </View>

          {/* Month switcher */}
          <View className="flex-row items-center justify-between mx-5 mb-5 bg-white rounded-2xl border border-slate-200 p-2">
            <Pressable onPress={() => shiftMonth(-1)} className="w-11 h-11 bg-slate-50 rounded-xl items-center justify-center active:bg-slate-100">
              <ChevronLeft size={20} color="#0F172A" />
            </Pressable>
            <Text className="text-lg font-black text-slate-800">{labelFor(month)}</Text>
            <Pressable
              onPress={() => shiftMonth(1)}
              disabled={isCurrentOrFuture}
              className={`w-11 h-11 rounded-xl items-center justify-center ${isCurrentOrFuture ? 'bg-slate-50 opacity-40' : 'bg-slate-50 active:bg-slate-100'}`}
            >
              <ChevronRight size={20} color="#0F172A" />
            </Pressable>
          </View>

          {loading ? (
            <View className="items-center justify-center py-20">
              <ActivityIndicator size="large" color="#16A34A" />
            </View>
          ) : !summary ? null : (
            <>
              {/* Summary cards */}
              <View className="flex-row px-5 gap-3 mb-3">
                <View className="flex-1 bg-white rounded-3xl p-4 border border-slate-200">
                  <TrendingUp size={20} color="#0F172A" />
                  <Text className="text-2xl font-black text-slate-900 mt-3 tracking-tight">{rupees(summary.totalRevenue)}</Text>
                  <Text className="text-xs font-bold text-slate-500 mt-0.5">Total {isCurrentOrFuture ? '(running)' : ''}</Text>
                </View>
                <View className="flex-1 bg-white rounded-3xl p-4 border border-slate-200">
                  <Receipt size={20} color="#0F172A" />
                  <Text className="text-2xl font-black text-slate-900 mt-3 tracking-tight">{summary.customerCount}</Text>
                  <Text className="text-xs font-bold text-slate-500 mt-0.5">Customers billed</Text>
                </View>
              </View>

              {summary.finalizedCount > 0 && (
                <View className="flex-row px-5 gap-3 mb-3">
                  <View className="flex-1 bg-green-50 rounded-3xl p-4 border border-green-100">
                    <CircleCheck size={20} color="#16A34A" />
                    <Text className="text-xl font-black text-green-800 mt-3 tracking-tight">{rupees(summary.collectedAmount)}</Text>
                    <Text className="text-xs font-bold text-green-700 mt-0.5">Collected</Text>
                  </View>
                  <View className="flex-1 bg-amber-50 rounded-3xl p-4 border border-amber-100">
                    <Clock size={20} color="#D97706" />
                    <Text className="text-xl font-black text-amber-800 mt-3 tracking-tight">{rupees(summary.pendingAmount)}</Text>
                    <Text className="text-xs font-bold text-amber-700 mt-0.5">Outstanding</Text>
                  </View>
                </View>
              )}

              {/* Generate button — only for completed months */}
              {!isCurrentOrFuture && summary.finalizedCount < summary.customerCount && (
                <Pressable
                  onPress={handleGenerate}
                  disabled={generating}
                  className="mx-5 mb-5 bg-slate-900 h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90"
                >
                  {generating ? <ActivityIndicator color="white" /> : (
                    <>
                      <Zap size={18} color="white" />
                      <Text className="text-white font-black text-sm">Generate Invoices for {labelFor(month)}</Text>
                    </>
                  )}
                </Pressable>
              )}

              {isCurrentOrFuture && (
                <View className="mx-5 mb-5 bg-blue-50 border border-blue-100 rounded-2xl p-4 flex-row items-start gap-2.5">
                  <Clock size={16} color="#2563EB" className="mt-0.5" />
                  <Text className="text-blue-700 text-xs font-semibold flex-1 leading-5">
                    This month is still running. Totals update live as deliveries come in. You can generate invoices once the month ends.
                  </Text>
                </View>
              )}

              {/* Per-customer tallies */}
              <Text className="px-5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Customer Bills</Text>

              {summary.tallies.length === 0 ? (
                <View className="items-center justify-center py-12">
                  <FileText size={40} color="#CBD5E1" />
                  <Text className="text-slate-500 font-bold mt-3">No deliveries this month</Text>
                </View>
              ) : (
                summary.tallies.map((t) => {
                  const statusMeta = t.invoiceStatus ? STATUS_META[t.invoiceStatus] : null;
                  return (
                    <Pressable
                      key={t.customerId}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(`/admin/billing/${t.customerId}?month=${month}&name=${encodeURIComponent(t.customerName)}`);
                      }}
                      className="bg-white rounded-3xl p-5 mx-5 mb-3 border border-slate-200 active:opacity-90"
                    >
                      <View className="flex-row justify-between items-start">
                        <View className="flex-1 pr-2">
                          <Text className="text-lg font-black text-slate-800 tracking-tight">{t.customerName}</Text>
                          <Text className="text-slate-400 text-xs font-semibold mt-0.5">
                            {t.deliveryCount} deliver{t.deliveryCount === 1 ? 'y' : 'ies'}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-xl font-black text-slate-900">{rupees(t.totalAmount)}</Text>
                          {statusMeta ? (
                            <View className={`px-2 py-0.5 rounded-lg border mt-1 ${statusMeta.cls}`}>
                              <Text className={`text-[10px] font-bold uppercase ${statusMeta.cls.split(' ')[2]}`}>{statusMeta.label}</Text>
                            </View>
                          ) : (
                            <View className="px-2 py-0.5 rounded-lg border mt-1 bg-slate-100 border-slate-200">
                              <Text className="text-[10px] font-bold uppercase text-slate-500">Running</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {
                        <Text className="text-[11px] text-slate-400 font-semibold mt-2">Tap to update payment status</Text>
                      }
                    </Pressable>
                  );
                })
              )}
            </>
          )}
        </ScrollView>

        {/* Mark-paid modal */}
        <Modal visible={showPayModal} transparent animationType="slide" onRequestClose={() => setShowPayModal(false)}>
          <View className="flex-1 justify-end bg-slate-900/40">
            <Pressable className="absolute inset-0" onPress={() => setShowPayModal(false)} />
            <View className="bg-white rounded-t-[32px] p-6 pb-10">
              <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-6" />
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-2xl font-black text-slate-800">Payment Status</Text>
                <Pressable onPress={() => setShowPayModal(false)} className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100">
                  <X size={18} color="#64748B" />
                </Pressable>
              </View>
              <Text className="text-slate-500 font-medium mb-6">
                {selectedTally?.customerName} · {selectedTally ? rupees(selectedTally.totalAmount) : ''}
              </Text>

              <Pressable
                onPress={() => handleMarkPaid('PAID_CASH')}
                className="flex-row items-center gap-3 p-4 rounded-2xl border border-green-200 bg-green-50 mb-3 active:opacity-80"
              >
                <Banknote size={20} color="#16A34A" />
                <Text className="font-bold text-green-800">Mark Paid — Cash</Text>
              </Pressable>
              <Pressable
                onPress={() => handleMarkPaid('PAID_ONLINE')}
                className="flex-row items-center gap-3 p-4 rounded-2xl border border-green-200 bg-green-50 mb-3 active:opacity-80"
              >
                <Smartphone size={20} color="#16A34A" />
                <Text className="font-bold text-green-800">Mark Paid — Online</Text>
              </Pressable>
              <Pressable
                onPress={() => handleMarkPaid('PENDING')}
                className="flex-row items-center gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50 active:opacity-80"
              >
                <Clock size={20} color="#64748B" />
                <Text className="font-bold text-slate-600">Reset to Pending</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

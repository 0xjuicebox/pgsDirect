import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Users,
  UserCheck,
  AlertCircle,
  ChevronRight,
  Bell,
  X,
  CheckCircle2,
  Phone,
  MapPin,
  Clock,
  Truck,
  IndianRupee,
  PackageCheck,
  Settings,
  ClipboardList,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { api } from '../../utils/api';

// --- TYPES ---
type FlaggedDelivery = {
  id: string;
  customerId: string;
  customerName: string;
  phoneNumber: string;
  houseAddress: string;
  deliveryDate: string;
  status: string;
  customerFeedback: string;
  updatedAt: string;
};

// Mirrors stats.AdminStats on the Go side.
type AdminStats = {
  date: string;
  activeDrivers: number;
  totalDrivers: number;
  runsTotal: number;
  runsInProgress: number;
  runsCompleted: number;
  stopsExpected: number;
  stopsDelivered: number;
  completionPct: number;
  pendingApprovals: number;
  flaggedCount: number;
  activeCustomers: number;
  monthRevenue: number;
  monthLabel: string;
};

// --- HELPERS ---
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

function rupees(n: number) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k';
  return '₹' + Math.round(n);
}

// --- COMPONENTS ---

// A stat that navigates. Every number on this screen should be a door to the
// screen that explains it — a dashboard you can't drill into is decoration.
const StatCard = ({ label, value, sub, icon: Icon, iconColor, iconBg, onPress }: any) => (
  <Pressable
    onPress={onPress}
    className="flex-1 bg-white rounded-[24px] p-4 border border-slate-200 active:bg-slate-50"
    style={Platform.OS === 'android' ? { elevation: 2 } : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }}
  >
    <View className="flex-row justify-between items-start mb-3">
      <View className={`w-10 h-10 rounded-2xl items-center justify-center ${iconBg}`}>
        <Icon color={iconColor} size={20} strokeWidth={2.2} />
      </View>
      <ChevronRight color="#CBD5E1" size={16} />
    </View>
    <Text className="text-2xl font-black text-slate-900 tracking-tight">{value}</Text>
    <Text className="text-xs font-bold text-slate-500 mt-0.5">{label}</Text>
    {sub ? <Text className="text-[11px] font-medium text-slate-400 mt-1">{sub}</Text> : null}
  </Pressable>
);

// Today's shift progress. This is the number an operations person actually
// opens the app to see, so it gets the most visual weight on the screen.
const ProgressHero = ({ stats }: { stats: AdminStats }) => {
  const pct = Math.min(100, Math.max(0, stats.completionPct));
  const nothingDue = stats.stopsExpected === 0;

  return (
    <View
      className="bg-slate-900 rounded-[28px] p-6 mb-4"
      style={
        Platform.OS === 'android'
          ? { elevation: 6 }
          : { shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }
      }
    >
      <View className="flex-row justify-between items-center mb-1">
        <Text className="text-slate-400 text-xs font-bold uppercase tracking-widest">Today's Progress</Text>
        <View className="flex-row items-center gap-1.5">
          <View className={`w-2 h-2 rounded-full ${stats.runsInProgress > 0 ? 'bg-green-400' : 'bg-slate-600'}`} />
          <Text className="text-slate-400 text-[11px] font-bold">
            {stats.runsInProgress > 0 ? `${stats.runsInProgress} running` : 'Idle'}
          </Text>
        </View>
      </View>

      {nothingDue ? (
        <Text className="text-slate-300 font-semibold text-base mt-3">No deliveries scheduled today.</Text>
      ) : (
        <>
          <View className="flex-row items-end gap-2 mt-2 mb-4">
            <Text className="text-white text-5xl font-black tracking-tighter">{pct}%</Text>
            <Text className="text-slate-400 font-bold text-sm mb-2">
              {stats.stopsDelivered} of {stats.stopsExpected} stops
            </Text>
          </View>

          <View className="h-2.5 bg-slate-700/60 rounded-full overflow-hidden">
            <View className="h-full bg-green-400 rounded-full" style={{ width: `${pct}%` }} />
          </View>

          <View className="flex-row justify-between mt-4">
            <Text className="text-slate-400 text-xs font-semibold">
              {stats.runsCompleted}/{stats.runsTotal} runs complete
            </Text>
            <Text className="text-slate-400 text-xs font-semibold">
              {stats.stopsExpected - stats.stopsDelivered} remaining
            </Text>
          </View>
        </>
      )}
    </View>
  );
};

export default function AdminDashboard() {
  const router = useRouter();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [flaggedIssues, setFlaggedIssues] = useState<FlaggedDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Resolution Modal State
  const [selectedIssue, setSelectedIssue] = useState<FlaggedDelivery | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolving, setResolving] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    // allSettled, not all — one endpoint failing shouldn't blank the whole screen.
    const [statsRes, issuesRes] = await Promise.allSettled([
      api.get('/admin/stats'),
      api.get('/delivery/flagged?limit=10'),
    ]);

    if (statsRes.status === 'fulfilled') setStats(statsRes.value);
    else console.log('Stats failed:', statsRes.reason?.message);

    if (issuesRes.status === 'fulfilled') setFlaggedIssues(issuesRes.value || []);
    else console.log('Flagged failed:', issuesRes.reason?.message);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Approving a customer on another tab should be reflected when you come
  // back here, so refetch on focus rather than only on mount.
  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [fetchDashboardData])
  );

  const handleResolveIssue = async () => {
    if (!selectedIssue) return;
    setResolving(true);
    try {
      await api.post(`/delivery/${selectedIssue.id}/resolve`, {});
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowResolveModal(false);
      fetchDashboardData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to resolve issue');
    } finally {
      setResolving(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown Date';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const go = (path: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as any);
  };

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchDashboardData();
              }}
              tintColor="#0F172A"
            />
          }
        >
          {/* Header: greeting on the left, action buttons grouped on the right. */}
          <View className="flex-row justify-between items-center px-6 pt-5 pb-5">
            <View className="flex-1">
              <Text className="text-base font-medium text-slate-500 tracking-wide">{greeting()}</Text>
              <Text className="text-3xl font-black text-slate-900 tracking-tighter mt-1">Admin</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => go('/admin/customers')}
                className="w-12 h-12 bg-white rounded-full justify-center items-center border border-slate-200 active:bg-slate-50"
              >
                <Bell color="#0F172A" size={22} strokeWidth={2} />
                {(flaggedIssues.length > 0 || (stats?.pendingApprovals ?? 0) > 0) && (
                  <View className="absolute top-3 right-3.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
                )}
              </Pressable>
              <Pressable
                onPress={() => go('/admin/settings')}
                className="w-12 h-12 bg-white rounded-full justify-center items-center border border-slate-200 active:bg-slate-50"
              >
                <Settings color="#0F172A" size={22} strokeWidth={2} />
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View className="py-20 items-center">
              <ActivityIndicator size="large" color="#0F172A" />
            </View>
          ) : (
            <>
              {/* Live progress */}
              <View className="px-5">
                {stats ? (
                  <ProgressHero stats={stats} />
                ) : (
                  <View className="bg-white rounded-[28px] p-6 mb-4 border border-slate-200 items-center">
                    <Text className="text-slate-500 font-semibold">Couldn't load today's stats.</Text>
                    <Text className="text-slate-400 text-xs mt-1">Pull down to retry.</Text>
                  </View>
                )}
              </View>

              {/* Delivery Logs entry — sits directly under the progress hero
                  because it's the "fix what's broken" surface. If a stop is
                  stuck or a sync failure is pending, this is the door. */}
              <View className="px-5 mb-4">
                <Pressable
                  onPress={() => go('/admin/delivery-logs')}
                  className="bg-white border border-slate-200 rounded-2xl p-4 flex-row items-center justify-between active:bg-slate-50"
                  style={Platform.OS === 'android' ? { elevation: 1 } : { shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6 }}
                >
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="w-10 h-10 rounded-2xl bg-slate-100 items-center justify-center">
                      <ClipboardList size={18} color="#0F172A" strokeWidth={2.2} />
                    </View>
                    <View className="flex-1">
                      <Text className="font-black text-slate-900 text-sm">Delivery Logs</Text>
                      <Text className="text-xs text-slate-500 font-medium mt-0.5">
                        Review, edit, or fix any log
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={16} color="#CBD5E1" />
                </Pressable>
              </View>

              {/* Stat grid */}
              {stats && (
                <>
                  <View className="flex-row px-5 gap-3 mb-3">
                    <StatCard
                      label="Pending Approvals"
                      value={stats.pendingApprovals}
                      sub={stats.pendingApprovals > 0 ? 'Needs review' : 'All clear'}
                      icon={UserCheck}
                      iconColor="#D97706"
                      iconBg="bg-amber-50"
                      onPress={() => go('/admin/customers')}
                    />
                    <StatCard
                      label="Active Drivers"
                      value={stats.activeDrivers}
                      sub={`${stats.totalDrivers} total`}
                      icon={Truck}
                      iconColor="#2563EB"
                      iconBg="bg-blue-50"
                      onPress={() => go('/admin/drivers')}
                    />
                  </View>

                  <View className="flex-row px-5 gap-3 mb-8">
                    <StatCard
                      label="Revenue This Month"
                      value={rupees(stats.monthRevenue)}
                      sub={stats.monthLabel}
                      icon={IndianRupee}
                      iconColor="#059669"
                      iconBg="bg-emerald-50"
                      onPress={() => go('/admin/billing')}
                    />
                    <StatCard
                      label="Active Customers"
                      value={stats.activeCustomers}
                      sub={`${stats.stopsExpected} stops today`}
                      icon={Users}
                      iconColor="#7C3AED"
                      iconBg="bg-violet-50"
                      onPress={() => go('/admin/customers')}
                    />
                  </View>
                </>
              )}

              {/* Action Required */}
              <View className="px-5 mb-8">
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-xl font-black text-slate-900 tracking-tight">Action Required</Text>
                  {flaggedIssues.length > 0 && (
                    <View className="bg-red-100 px-2.5 py-1 rounded-lg">
                      <Text className="text-xs font-black text-red-700">{flaggedIssues.length}</Text>
                    </View>
                  )}
                </View>

                {flaggedIssues.length === 0 ? (
                  <View className="bg-white rounded-3xl p-6 border border-slate-200 items-center justify-center">
                    <PackageCheck size={32} color="#10B981" />
                    <Text className="text-slate-800 font-bold text-base mt-3">All clear!</Text>
                    <Text className="text-slate-500 text-sm mt-1">No customer complaints pending.</Text>
                  </View>
                ) : (
                  flaggedIssues.map((issue) => (
                    <Pressable
                      key={issue.id}
                      onPress={() => {
                        setSelectedIssue(issue);
                        setShowResolveModal(true);
                      }}
                      className="bg-white rounded-3xl p-4 border border-red-100 flex-row items-center gap-4 mb-3 active:bg-slate-50"
                      style={
                        Platform.OS === 'android'
                          ? { elevation: 2 }
                          : { shadowColor: '#EF4444', shadowOpacity: 0.05, shadowRadius: 8 }
                      }
                    >
                      <View className="w-12 h-12 rounded-full bg-red-50 justify-center items-center">
                        <AlertCircle color="#EF4444" size={24} strokeWidth={2.5} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-base font-black text-slate-900 mb-1">
                          {issue.customerName} reported an issue
                        </Text>
                        <Text className="text-sm font-medium text-slate-500" numberOfLines={1}>
                          {issue.customerFeedback}
                        </Text>
                      </View>
                      <ChevronRight color="#94A3B8" size={20} />
                    </Pressable>
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>

        {/* ISSUE RESOLUTION BOTTOM SHEET MODAL */}
        <Modal
          visible={showResolveModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowResolveModal(false)}
        >
          <View className="flex-1 justify-end bg-slate-900/40">
            <Pressable className="absolute inset-0" onPress={() => setShowResolveModal(false)} />
            <View className="bg-white rounded-t-[32px] p-6 pb-10" style={Platform.OS === 'android' ? { elevation: 24 } : {}}>
              <View className="w-10 h-1.5 bg-slate-200 rounded-full self-center mb-6" />

              <View className="flex-row justify-between items-center mb-6">
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-red-50 justify-center items-center">
                    <AlertCircle color="#EF4444" size={20} strokeWidth={2.5} />
                  </View>
                  <Text className="text-2xl font-black text-slate-800 tracking-tight">Review Issue</Text>
                </View>
                <Pressable
                  onPress={() => setShowResolveModal(false)}
                  className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100 active:bg-slate-100"
                >
                  <X size={18} color="#64748B" />
                </Pressable>
              </View>

              {selectedIssue && (
                <View className="bg-slate-50 rounded-[24px] p-5 border border-slate-100 mb-8 gap-4">
                  <View>
                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Customer</Text>
                    <Text className="text-lg font-black text-slate-800 tracking-tight">{selectedIssue.customerName}</Text>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <Phone size={14} color="#64748B" />
                    <Text className="text-slate-600 font-medium">{selectedIssue.phoneNumber}</Text>
                  </View>

                  <View className="flex-row items-start gap-2">
                    <MapPin size={14} color="#64748B" className="mt-0.5" />
                    <Text className="text-slate-600 font-medium flex-1">{selectedIssue.houseAddress}</Text>
                  </View>

                  <View className="h-px bg-slate-200 my-2" />

                  <View>
                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Complaint Details
                    </Text>
                    <View className="bg-white p-4 rounded-xl border border-red-100">
                      <Text className="text-slate-800 font-semibold leading-5">{selectedIssue.customerFeedback}</Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2 mt-2">
                    <Clock size={14} color="#94A3B8" />
                    <Text className="text-slate-500 text-xs font-medium">
                      Reported for delivery on {formatDate(selectedIssue.deliveryDate)}
                    </Text>
                  </View>
                </View>
              )}

              <Pressable
                onPress={handleResolveIssue}
                disabled={resolving}
                className="bg-slate-900 h-16 rounded-[24px] items-center justify-center flex-row gap-2 active:opacity-90"
              >
                {resolving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <CheckCircle2 size={20} color="white" />
                    <Text className="text-white text-base font-black tracking-wide">Mark as Resolved</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

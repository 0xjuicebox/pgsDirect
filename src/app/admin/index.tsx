import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Users,
  Route as RouteIcon,
  AlertCircle,
  TrendingUp,
  ChevronRight,
  Bell,
  X,
  CheckCircle2,
  Phone,
  MapPin,
  Clock
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

// Reusable Metric Card
const StatCard = ({ title, value, icon: Icon, trend, colorClass, iconColor }: any) => (
  <View
    className="flex-1 bg-white rounded-[24px] p-5 border border-slate-200"
    style={Platform.OS === 'android' ? { elevation: 2 } : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }}
  >
    <View className="flex-row justify-between items-center mb-4">
      <Icon color={iconColor} size={22} strokeWidth={2} />
      <View className="flex-row items-center bg-slate-50 px-2 py-1 rounded-xl">
        <TrendingUp color="#0F172A" size={14} strokeWidth={2.5} />
        <Text className="text-xs font-bold text-slate-900 ml-1">{trend}</Text>
      </View>
    </View>
    <View className="gap-1">
      <Text className={`text-3xl font-black tracking-tight ${colorClass}`}>{value}</Text>
      <Text className="text-xs font-bold text-slate-500">{title}</Text>
    </View>
  </View>
);

export default function AdminDashboard() {
  const [flaggedIssues, setFlaggedIssues] = useState<FlaggedDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Resolution Modal State
  const [selectedIssue, setSelectedIssue] = useState<FlaggedDelivery | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolving, setResolving] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      // Fetch flagged deliveries requiring admin attention
      const issues = await api.get('/delivery/flagged?limit=10');
      setFlaggedIssues(issues || []);
    } catch (err: any) {
      console.log('Failed to fetch dashboard data:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleResolveIssue = async () => {
    if (!selectedIssue) return;
    setResolving(true);
    try {
      await api.post(`/delivery/${selectedIssue.id}/resolve`, {});
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowResolveModal(false);
      fetchDashboardData(); // Refresh the list
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

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDashboardData(); }} tintColor="#0F172A" />}
        >
          {/* Header Section */}
          <View className="flex-row justify-between items-center px-6 pt-5 pb-6">
            <View>
              <Text className="text-base font-medium text-slate-500 tracking-wide">Good morning,</Text>
              <Text className="text-3xl font-black text-slate-900 tracking-tighter mt-1">Admin</Text>
            </View>
            <TouchableOpacity className="w-12 h-12 bg-white rounded-full justify-center items-center border border-slate-200">
              <Bell color="#0F172A" size={24} strokeWidth={2} />
              {flaggedIssues.length > 0 && (
                <View className="absolute top-3 right-3.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
              )}
            </TouchableOpacity>
          </View>

          {/* Top Level Metrics Grid (Mocked for now) */}
          <View className="flex-row px-5 gap-4 mb-8">
            <StatCard
              title="Active Drivers"
              value="24"
              icon={Users}
              trend="+2"
              colorClass="text-blue-600"
              iconColor="#3B82F6"
            />
            <StatCard
              title="Routes in Progress"
              value="18"
              icon={RouteIcon}
              trend="+5"
              colorClass="text-slate-900"
              iconColor="#0F172A"
            />
          </View>

          {/* Alerts / Action Required Section */}
          <View className="px-5 mb-8">
            <Text className="text-xl font-black text-slate-900 tracking-tight mb-4">Action Required</Text>

            {loading ? (
              <ActivityIndicator size="small" color="#0F172A" className="my-4" />
            ) : flaggedIssues.length === 0 ? (
              <View className="bg-white rounded-3xl p-6 border border-slate-200 items-center justify-center shadow-sm">
                <CheckCircle2 size={32} color="#10B981" />
                <Text className="text-slate-800 font-bold text-base mt-3">All clear!</Text>
                <Text className="text-slate-500 text-sm mt-1">No customer complaints pending.</Text>
              </View>
            ) : (
              flaggedIssues.map((issue) => (
                <TouchableOpacity
                  key={issue.id}
                  onPress={() => { setSelectedIssue(issue); setShowResolveModal(true); }}
                  className="bg-white rounded-3xl p-4 border border-red-100 flex-row items-center gap-4 mb-3"
                  style={Platform.OS === 'android' ? { elevation: 2 } : { shadowColor: '#EF4444', shadowOpacity: 0.05, shadowRadius: 8 }}
                >
                  <View className="w-12 h-12 rounded-full bg-red-50 justify-center items-center">
                    <AlertCircle color="#EF4444" size={24} strokeWidth={2.5} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-black text-slate-900 mb-1">{issue.customerName} reported an issue</Text>
                    <Text className="text-sm font-medium text-slate-500" numberOfLines={1}>{issue.customerFeedback}</Text>
                  </View>
                  <ChevronRight color="#94A3B8" size={20} />
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>

        {/* ISSUE RESOLUTION BOTTOM SHEET MODAL */}
        <Modal visible={showResolveModal} transparent animationType="slide" onRequestClose={() => setShowResolveModal(false)}>
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
                <Pressable onPress={() => setShowResolveModal(false)} className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100 active:bg-slate-100">
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
                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Complaint Details</Text>
                    <View className="bg-white p-4 rounded-xl border border-red-100 shadow-sm">
                      <Text className="text-slate-800 font-semibold leading-5">{selectedIssue.customerFeedback}</Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2 mt-2">
                    <Clock size={14} color="#94A3B8" />
                    <Text className="text-slate-500 text-xs font-medium">Reported for delivery on {formatDate(selectedIssue.deliveryDate)}</Text>
                  </View>
                </View>
              )}

              <Pressable
                onPress={handleResolveIssue}
                disabled={resolving}
                className="bg-slate-900 h-16 rounded-[24px] items-center justify-center flex-row gap-2 active:opacity-90 shadow-xl shadow-slate-900/10"
              >
                {resolving ? <ActivityIndicator color="white" /> : (
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

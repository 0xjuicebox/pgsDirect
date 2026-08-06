import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Truck, ChevronLeft, ArrowRight, ShieldCheck, User, Phone } from 'lucide-react-native';
import { supabase } from '../../utils/supabase';

export default function DriverLoginScreen() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSendOTP = async () => {
    if (!name.trim() || phone.length < 10) {
      setErrorMsg('Please enter a valid name and 10-digit phone number.');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: `+91${phone}`,
        options: {
          channel: 'whatsapp',
          data: {
            full_name: name.trim() // Saves name to Supabase user metadata
          }
        }
      });

      if (error) throw error;

      setStep(2);
    } catch (error: any) {
      setErrorMsg(error.message || "Failed to send WhatsApp message.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      setErrorMsg('Please enter the 6-digit code.');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: `+91${phone}`,
        token: otp,
        type: 'sms', // Required as 'sms' by Supabase even when using WhatsApp
      });

      if (error) throw error;

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // No router.push() needed!
      // The RootLayout listener will catch the session and redirect automatically.

    } catch (error: any) {
      setErrorMsg(error.message || "Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header Navigation */}
        <View className="px-5 pt-4 pb-2 flex-row items-center">
          <TouchableOpacity
            onPress={() => {
              if (step === 2) setStep(1);
              else router.back();
            }}
            className="w-10 h-10 bg-white rounded-full items-center justify-center border border-slate-200 shadow-sm active:bg-slate-50"
          >
            <ChevronLeft size={24} color="#0F172A" />
          </TouchableOpacity>
        </View>

        <View className="flex-1 px-6 justify-center pb-20">

          {/* Icon Header */}
          <View className="w-16 h-16 bg-green-50 rounded-2xl items-center justify-center mb-6 border border-green-100">
            {step === 1 ? (
              <Truck size={32} color="#16A34A" strokeWidth={2.5} />
            ) : (
              <ShieldCheck size={32} color="#16A34A" strokeWidth={2.5} />
            )}
          </View>

          <Text className="text-3xl font-black text-slate-800 tracking-tighter mb-2">
            {step === 1 ? 'Driver Access' : 'Verify Account'}
          </Text>
          <Text className="text-slate-500 font-medium text-base mb-8 leading-6">
            {step === 1
              ? 'Enter your details to receive a secure login code via WhatsApp.'
              : `We sent a 6-digit WhatsApp code to +91 ${phone}.`
            }
          </Text>

          {errorMsg ? (
            <View className="bg-red-50 px-4 py-3 rounded-xl border border-red-100 mb-6">
              <Text className="text-red-600 font-semibold text-sm">{errorMsg}</Text>
            </View>
          ) : null}

          {/* Form Fields */}
          {step === 1 ? (
            <View className="space-y-4">
              <View>
                <Text className="text-slate-800 font-bold text-sm mb-2 px-1">Full Name</Text>
                <View className="flex-row items-center bg-white border border-slate-200 rounded-2xl h-14 px-4 shadow-sm focus:border-green-500">
                  <User size={20} color="#94A3B8" className="mr-3" />
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Raju Kumar"
                    placeholderTextColor="#94A3B8"
                    className="flex-1 text-slate-800 font-semibold text-base h-full outline-none"
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>
              </View>

              <View>
                <Text className="text-slate-800 font-bold text-sm mb-2 px-1">WhatsApp Number</Text>
                <View className="flex-row items-center bg-white border border-slate-200 rounded-2xl h-14 px-4 shadow-sm focus:border-green-500">
                  <View className="flex-row items-center border-r border-slate-200 pr-3 mr-3">
                    <Phone size={18} color="#94A3B8" className="mr-2" />
                    <Text className="text-slate-800 font-bold text-base">+91</Text>
                  </View>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="99999 00000"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    maxLength={10}
                    className="flex-1 text-slate-800 font-semibold text-base tracking-widest h-full outline-none"
                  />
                </View>
              </View>
            </View>
          ) : (
            <View>
              <Text className="text-slate-800 font-bold text-sm mb-2 px-1">6-Digit Code</Text>
              <View className="flex-row items-center bg-white border border-slate-200 rounded-2xl h-16 px-6 shadow-sm focus:border-green-500">
                <TextInput
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="• • • • • •"
                  placeholderTextColor="#CBD5E1"
                  keyboardType="number-pad"
                  maxLength={6}
                  className="flex-1 text-center text-slate-800 font-black text-3xl tracking-[12px] h-full outline-none"
                  autoFocus
                />
              </View>
            </View>
          )}

          {/* Action Button */}
          <TouchableOpacity
            onPress={step === 1 ? handleSendOTP : handleVerifyOTP}
            disabled={loading}
            className={`h-14 rounded-2xl items-center justify-center mt-8 flex-row shadow-sm ${loading ? 'bg-green-400' : 'bg-green-600 active:bg-green-700'
              }`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text className="text-white font-black text-base tracking-wide mr-2">
                  {step === 1 ? 'Send WhatsApp Code' : 'Verify & Login'}
                </Text>
                <ArrowRight size={20} color="white" strokeWidth={2.5} />
              </>
            )}
          </TouchableOpacity>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

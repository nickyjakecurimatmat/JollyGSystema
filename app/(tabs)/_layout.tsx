import { Tabs } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const savedRole = await SecureStore.getItemAsync('user_role');
        setRole(savedRole);
      } catch (e) {
        console.error("Error fetching role", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRole();
  }, []);

  // Prevent UI flickering while role is loading
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F2F2F7' }}>
        <ActivityIndicator color="#eeb909" size="large" />
      </View>
    );
  }

  const isAdmin = role === 'admin';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      
      {/* 1. HOME: Admin Only */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          href: (isAdmin ? '/' : null) as any,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      
      {/* 2. DRIVER: Only for non-admins */}
      <Tabs.Screen
        name="driver"
        options={{
          title: 'Driver',
          href: (!isAdmin ? 'driver' : null) as any, 
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="steeringwheel" color={color} />,
        }}
      />

      {/* 3. REPORTS: Admin Only */}
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          href: (isAdmin ? 'reports' : null) as any,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="chart.bar.fill" color={color} />,
        }}
      />

      {/* 4. FINANCES: Admin Only */}
      <Tabs.Screen
        name="finances"
        options={{
          title: 'Finances',
          href: (isAdmin ? 'finances' : null) as any,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="dollarsign.circle.fill" color={color} />,
        }}
      />

      {/* 5. VEHICLE: Admin Only */}
      <Tabs.Screen
        name="vehicle"
        options={{
          title: 'Vehicle',
          href: (isAdmin ? 'vehicle' : null) as any,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="car.fill" color={color} />,
        }}
      />
      
      {/* 6. NOTIFICATION: Admin Only */}
      <Tabs.Screen
        name="notification"
        options={{
          title: 'Notifications',
          href: (isAdmin ? 'notification' : null) as any,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="bell.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
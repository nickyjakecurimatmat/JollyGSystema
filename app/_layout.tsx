import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect } from 'react';
import { PaperProvider } from 'react-native-paper';
import { auth } from '../firebaseConfig';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const inTabsGroup = segments[0] === '(tabs)';

      // RULE: Only redirect if NO USER and trying to access TABS
      if (!user && inTabsGroup) {
        router.replace('/');
      }
      
      // IMPORTANT: We removed the "else if (user && !inTabsGroup)" block.
      // This stops the app from jumping to tabs automatically.
    });

    return unsubscribe;
  }, [segments]);

  return (
    <PaperProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" /> 
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </PaperProvider>
  );
}
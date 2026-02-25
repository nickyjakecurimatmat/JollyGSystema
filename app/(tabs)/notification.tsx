import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  eachDayOfInterval,
  format,
  startOfWeek,
  subDays
} from 'date-fns';
import * as Notifications from 'expo-notifications';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Checkbox,
  Divider,
  List,
  Surface,
  Switch,
  Text,
} from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

const STORAGE_KEY = '@gap_reminder_config';

const COLORS = {
  gold: '#eeb909',
  deepGold: '#B8860B',
  bg: '#F8F9FA',
  card: '#FFFFFF',
  textMain: '#222222',
  textSub: '#666666',
  danger: '#D32F2F',
};

// Expo Trigger: 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
const DAYS_OF_WEEK = [
  { label: 'Mon', value: 2 },
  { label: 'Tue', value: 3 },
  { label: 'Wed', value: 4 },
  { label: 'Thu', value: 5 },
  { label: 'Fri', value: 6 },
  { label: 'Sat', value: 7 },
  { label: 'Sun', value: 1 },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    // Add these two lines to satisfy the new type requirement:
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function GapRemindersScreen() {
  const [vehicles, setVehicles] = useState<{ id: string; name: string; selected: boolean }[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [isReminderActive, setIsReminderActive] = useState(false);

  useEffect(() => {
    async function setup() {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('reminders', {
          name: 'JollyG Reminders',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: COLORS.gold,
        });
      }
      await Notifications.requestPermissionsAsync();

      try {
        const snap = await getDocs(collection(db, 'vehicles'));
        setVehicles(snap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || 'Unknown',
          selected: true,
        })));
      } catch (e) {
        console.error("Error fetching vehicles:", e);
      }

      try {
        const savedConfig = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedConfig) {
          const parsed = JSON.parse(savedConfig);
          setSelectedDays(parsed.selectedDays || []);
          setIsReminderActive(parsed.isReminderActive || false);
        }
      } catch (e) {
        console.error("Failed to load config", e);
      }
    }
    setup();
  }, []);

  const saveConfigToDisk = async (days: number[], active: boolean) => {
    try {
      const config = JSON.stringify({ selectedDays: days, isReminderActive: active });
      await AsyncStorage.setItem(STORAGE_KEY, config);
    } catch (e) {
      console.error("Save error", e);
    }
  };

  const calculateAndSchedule = async () => {
    await saveConfigToDisk(selectedDays, isReminderActive);
    await Notifications.cancelAllScheduledNotificationsAsync();

    if (!isReminderActive) {
      Alert.alert("Success", "Reminders disabled.");
      return;
    }

    if (selectedDays.length === 0) {
      Alert.alert("Required", "Select at least one day for reminders.");
      return;
    }

    try {
      const today = new Date();
      // Logic: Look back to the START of LAST WEEK (Monday)
      // This catches gaps from the week that just passed.
      const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
      const searchStart = subDays(currentWeekStart, 7); 
      
      const startDateStr = format(searchStart, 'yyyy-MM-dd');
      const endDateStr = format(today, 'yyyy-MM-dd');

      const q = query(
        collection(db, 'finances'),
        where('date', '>=', startDateStr),
        where('date', '<=', endDateStr)
      );
      
      const financeSnap = await getDocs(q);
      const logMap: Record<string, Set<string>> = {};
      
      financeSnap.forEach(doc => {
        const data = doc.data();
        if (!logMap[data.vehicleId]) logMap[data.vehicleId] = new Set();
        logMap[data.vehicleId].add(data.date);
      });

      const daysToTrack = eachDayOfInterval({ start: searchStart, end: today });
      let totalGaps = 0;

      for (const vehicle of vehicles) {
        if (!vehicle.selected) continue;
        const vehicleLogs = logMap[vehicle.id] || new Set();
        const missing = daysToTrack.filter(d => !vehicleLogs.has(format(d, 'yyyy-MM-dd')));
        totalGaps += missing.length;
      }

      if (totalGaps > 0) {
        // Schedule recurring weekly triggers for each selected day
        for (const dayValue of selectedDays) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `⚠️ JollyG! Unfinished Logs`,
              body: `You have ${totalGaps} missing logs from the last two weeks. Please clear your backlog!`,
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday: dayValue,
              hour: 18, // 6:00 PM
              minute: 0,
            },
          });
        }
        Alert.alert("Backlog Detected", `Found ${totalGaps} missing logs. Reminders set for your selected days.`);
      } else {
        Alert.alert("All Caught Up!", "No gaps found in the last 14 days. Reminders are armed but won't trigger.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not sync schedule.");
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.header}>JollyG! Reminders</Text>

          <Card style={styles.sectionCard} mode="contained">
            <Card.Title 
              title="1. SELECT VEHICLES" 
              titleStyle={styles.cardHeader} 
              subtitle="Checks gaps for previous & current week"
            />
            <Divider />
            <Card.Content>
              {vehicles.map(v => (
                <List.Item
                  key={v.id}
                  title={v.name}
                  titleStyle={styles.vehicleTitle}
                  onPress={() => setVehicles(vehicles.map(item => item.id === v.id ? {...item, selected: !item.selected} : item))}
                  right={() => <Checkbox status={v.selected ? 'checked' : 'unchecked'} color={COLORS.gold} />}
                />
              ))}
            </Card.Content>
          </Card>

          <Card style={styles.sectionCard} mode="contained">
            <Card.Title title="2. REMINDER DAYS" titleStyle={styles.cardHeader} />
            <Divider />
            <Card.Content style={{ paddingTop: 15 }}>
              <View style={styles.daysGrid}>
                {DAYS_OF_WEEK.map(day => (
                  <Button
                    key={day.value}
                    mode={selectedDays.includes(day.value) ? 'contained' : 'outlined'}
                    onPress={() => setSelectedDays(prev => 
                      prev.includes(day.value) ? prev.filter(d => d !== day.value) : [...prev, day.value]
                    )}
                    style={[styles.dayButton, !selectedDays.includes(day.value) && { borderColor: COLORS.gold }]}
                    buttonColor={selectedDays.includes(day.value) ? COLORS.gold : 'transparent'}
                    textColor={selectedDays.includes(day.value) ? '#000' : COLORS.deepGold}
                    labelStyle={{ fontWeight: '900', fontSize: 12 }}
                  >
                    {day.label}
                  </Button>
                ))}
              </View>
            </Card.Content>
          </Card>

          <Card style={[styles.sectionCard, { borderLeftColor: COLORS.gold, borderLeftWidth: 4 }]} mode="contained">
            <Card.Content>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.labelBold}>Enable Backlog Alerts</Text>
                  <Text style={styles.labelSub}>Nag me if I miss any logs</Text>
                </View>
                <Switch value={isReminderActive} onValueChange={setIsReminderActive} color={COLORS.gold} />
              </View>
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            onPress={calculateAndSchedule}
            style={styles.saveBtn}
            buttonColor={COLORS.gold}
            textColor="#000"
            labelStyle={styles.saveBtnLabel}
          >
            SAVE & SYNC SCHEDULE
          </Button>

          <Surface style={styles.infoBox} elevation={0}>
            <Text style={styles.infoText}>
              Reminders check for gaps in the last 14 days. If you've missed a day last week, you'll be reminded until it's filled.
            </Text>
          </Surface>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  header: { fontSize: 28, fontWeight: '900', color: COLORS.gold, marginBottom: 20, letterSpacing: -0.5 },
  sectionCard: { marginBottom: 15, borderRadius: 12, backgroundColor: COLORS.card },
  cardHeader: { fontSize: 13, fontWeight: '900', color: COLORS.textSub, letterSpacing: 1 },
  vehicleTitle: { fontWeight: '700', color: COLORS.textMain },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  dayButton: { minWidth: 65, marginBottom: 5 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelBold: { fontWeight: '900', fontSize: 16, color: COLORS.textMain },
  labelSub: { fontSize: 12, color: COLORS.textSub, fontWeight: '500' },
  saveBtn: { marginTop: 10, borderRadius: 12, height: 55, justifyContent: 'center', elevation: 4 },
  saveBtnLabel: { fontWeight: '900', fontSize: 16 },
  infoBox: { marginTop: 25, padding: 15, borderRadius: 12, backgroundColor: '#FFF9E6', alignItems: 'center' },
  infoText: { fontSize: 12, textAlign: 'center', color: '#7A5C00', fontWeight: '600', lineHeight: 18 }
});
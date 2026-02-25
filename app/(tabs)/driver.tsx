import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Card, DefaultTheme, PaperProvider, Text } from 'react-native-paper';
import { auth, db } from '../../firebaseConfig';

const GOLD = '#eeb909';
const CHARCOAL = '#1C1C1E';
const BG_GRAY = '#F2F2F7';

const LOCATION_TRACKING_TASK = 'background-location-task';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        // Add these two lines to satisfy the new NotificationBehavior type:
        shouldShowBanner: true, 
        shouldShowList: true,
    }),
});

/**
 * BACKGROUND TASK DEFINITION
 * This must be defined at the top level (outside the component)
 */
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }: any) => {
    if (error) {
        console.error("Task Error:", error);
        return;
    }
    if (data) {
        const { locations } = data;
        const location = locations[0];
        const user = auth.currentUser;

        if (location && user) {
            try {
                await setDoc(doc(db, 'drivers', user.uid), {
                    liveLocation: {
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude,
                    },
                    lastUpdated: serverTimestamp(),
                }, { merge: true });
            } catch (err) {
                console.error("Background Sync Error:", err);
            }
        }
    }
});

export default function DriverScreen() {
    const [isSharing, setIsSharing] = useState(false);

    // Sync UI state with the actual background task status on load
    useEffect(() => {
        const checkTaskStatus = async () => {
            const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
            setIsSharing(running);
        };
        checkTaskStatus();
    }, []);

    const toggleRealtimeSharing = async () => {
        const user = auth.currentUser;
        if (!user) {
            Alert.alert("Error", "No driver logged in.");
            return;
        }

        // --- STOP TRACKING LOGIC ---
        if (isSharing) {
            await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
            
            await setDoc(doc(db, 'drivers', user.uid), { 
                status: 'completed',
                lastUpdated: serverTimestamp() 
            }, { merge: true });

            setIsSharing(false);
            Alert.alert("Trip Ended", "Tracking is now offline.");
            return;
        }

        // --- START TRACKING (1ST INSTALL / INITIALIZATION) ---

        // 1. Request Notification Permissions (Required for Foreground Service)
        const { status: nStatus } = await Notifications.requestPermissionsAsync();
        if (nStatus !== 'granted') {
            Alert.alert("Permission Required", "Notifications are needed to show your active delivery status.");
            return;
        }

        // 2. Request Location Permissions (Foreground first)
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted') {
            Alert.alert("Permission Denied", "Location access is needed to track your delivery.");
            return;
        }

        // 3. Request Background Location (The "Allow All The Time" prompt)
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
            Alert.alert(
                "Action Required", 
                "To track in the background, please set Location to 'Allow all the time' in your phone settings."
            );
            return;
        }

        const sessionId = Date.now().toString();

        // 4. Start the Background Task with Foreground Service
        await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000, 
            distanceInterval: 5, 
            foregroundService: {
                notificationTitle: "JollyG! Delivery Live",
                notificationBody: "Sharing your live location with the customer...",
                notificationColor: GOLD,
            },
            // FIX: Removed "Location" from the property name
            pausesUpdatesAutomatically: false, 
            showsBackgroundLocationIndicator: true, 
        });

        // 5. Initialize Firebase Record
        await setDoc(doc(db, 'drivers', user.uid), {
            driverName: user.email?.split('@')[0].toUpperCase() || "JOLLYG DRIVER",
            status: 'active',
            currentSessionId: sessionId,
            lastUpdated: serverTimestamp()
        }, { merge: true });

        setIsSharing(true);

        // 6. Generate and Copy Link
        const trackingUrl = `https://systema-jollyg.web.app/?id=${user.uid}&session=${sessionId}`;
        await Clipboard.setStringAsync(trackingUrl);
        Alert.alert("Link Ready!", "Tracking link copied to clipboard. Send it to your customer!");
    };

    return (
        <PaperProvider theme={{...DefaultTheme, colors: {...DefaultTheme.colors, primary: GOLD}}}>
            <View style={styles.mainContainer}>
                <View style={styles.header}>
                    <Text style={styles.logoText}>JollyG!</Text>
                    <Text style={styles.subText}>Active Driver: {auth.currentUser?.email}</Text>
                </View>

                <Card style={[styles.statusCard, isSharing && styles.cardActive]}>
                    <Card.Content>
                        <View style={styles.statusRow}>
                            <View style={[styles.dot, isSharing ? styles.dotLive : styles.dotOff]} />
                            <Text style={styles.statusLabel}>
                                {isSharing ? 'LIVE TRACKING ON' : 'TRACKING OFFLINE'}
                            </Text>
                        </View>
                        
                        <Text style={styles.instruction}>
                            {isSharing 
                                ? 'Your location is live. A persistent notification is visible in your tray.' 
                                : 'Tap the button below to start sharing your location with the customer.'}
                        </Text>

                        <Button 
                            mode="contained" 
                            onPress={toggleRealtimeSharing} 
                            style={styles.button}
                            buttonColor={isSharing ? '#FF3B30' : GOLD}
                            textColor={isSharing ? '#FFF' : CHARCOAL}
                        >
                            {isSharing ? 'STOP & END TRIP' : 'GO LIVE NOW'}
                        </Button>
                    </Card.Content>
                </Card>
            </View>
        </PaperProvider>
    );
}

const styles = StyleSheet.create({
    mainContainer: { flex: 1, backgroundColor: BG_GRAY, padding: 20, paddingTop: 60 },
    header: { marginBottom: 30 },
    logoText: { fontWeight: '900', color: GOLD, fontSize: 42, letterSpacing: -1 },
    subText: { color: '#8e8e93', fontSize: 14, marginTop: 4 },
    statusCard: { backgroundColor: CHARCOAL, borderRadius: 24, padding: 10, elevation: 8 },
    cardActive: { borderColor: GOLD, borderWidth: 2 },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    dot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
    dotLive: { backgroundColor: '#34C759' }, // Green for Active
    dotOff: { backgroundColor: '#555' },
    statusLabel: { color: '#FFF', fontWeight: '800', fontSize: 18 },
    instruction: { color: '#CCC', fontSize: 15, lineHeight: 22, marginBottom: 25 },
    button: { borderRadius: 12, paddingVertical: 6 }
});
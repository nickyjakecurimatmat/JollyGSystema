import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { signInWithEmailAndPassword } from "firebase/auth";
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity,
  View
} from 'react-native';
import { auth } from '../firebaseConfig';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [authTypeLabel, setAuthTypeLabel] = useState('Biometrics');
  
  const router = useRouter();

  useEffect(() => {
    checkInitialState();
  }, []);

  const checkInitialState = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    
    setIsBiometricSupported(compatible && enrolled);

    if (Platform.OS === 'ios') {
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setAuthTypeLabel('FaceID');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setAuthTypeLabel('TouchID');
      }
    } else {
      setAuthTypeLabel('Fingerprint');
    }

    const savedEmail = await SecureStore.getItemAsync('user_email');
    const savedPass = await SecureStore.getItemAsync('user_password');
    const savedRole = await SecureStore.getItemAsync('user_role');
    
    if (savedEmail && savedPass && savedRole) {
      setEmail(savedEmail); 
      if (compatible && enrolled) {
        // Pass the role to the biometric handler so it knows where to redirect
        setTimeout(() => handleBiometricAuth(savedEmail, savedPass, savedRole), 800);
      }
    }
  };

  const handleLogin = async (targetEmail?: string, targetPass?: string) => {
    const finalEmail = targetEmail || email;
    const finalPass = targetPass || password;

    if (!finalEmail || !finalPass) {
      Alert.alert("Input Required", "Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, finalEmail, finalPass);
      
      // 1. Get the custom claim (role) from Firebase
      const idTokenResult = await userCredential.user.getIdTokenResult(true);
      const userRole = (idTokenResult.claims.role as string) || 'user';

      // 2. Persist everything
      await SecureStore.setItemAsync('user_role', userRole);
      await SecureStore.setItemAsync('user_email', finalEmail);
      await SecureStore.setItemAsync('user_password', finalPass);
      
      // 3. SMART REDIRECT
      // If admin, go to default (Home). If driver/user, go specifically to driver tab.
      if (userRole === 'admin') {
        router.replace('/(tabs)');
      } else {
        router.replace('/(tabs)/driver' as any);
      }

    } catch (error: any) {
      console.log(error);
      Alert.alert("Login Error", "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricAuth = async (storedEmail?: string, storedPass?: string, storedRole?: string) => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Authenticate with ${authTypeLabel}`,
      disableDeviceFallback: true,
      cancelLabel: 'Use Password',
    });

    if (result.success) {
      const e = storedEmail || await SecureStore.getItemAsync('user_email');
      const p = storedPass || await SecureStore.getItemAsync('user_password');
      if (e && p) {
        handleLogin(e, p);
      }
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>JollyG!</Text>
        
        <TextInput 
          style={styles.input} 
          placeholder="Email" 
          value={email} 
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput 
          style={styles.input} 
          placeholder="Password" 
          value={password} 
          onChangeText={setPassword} 
          secureTextEntry 
        />

        <TouchableOpacity 
          style={styles.loginBtn} 
          onPress={() => handleLogin()} 
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Login</Text>}
        </TouchableOpacity>

        <View style={styles.dividerContainer}>
           <View style={styles.line} />
           <Text style={styles.dividerText}>OR</Text>
           <View style={styles.line} />
        </View>

        {isBiometricSupported && (
          <TouchableOpacity style={styles.biometricBtn} onPress={() => handleBiometricAuth()}>
            <Text style={styles.biometricText}>🔓 Use {authTypeLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', padding: 30 },
  title: { fontSize: 36, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, color: '#eeb909' },
  input: { borderWidth: 1, borderColor: '#eee', padding: 15, borderRadius: 10, marginBottom: 15, backgroundColor: '#fafafa' },
  loginBtn: { backgroundColor: '#eeb909', padding: 18, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 30 },
  line: { flex: 1, height: 1, backgroundColor: '#eee' },
  dividerText: { width: 40, textAlign: 'center', color: '#aaa', fontSize: 12 },
  biometricBtn: { borderWidth: 1, borderColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center' },
  biometricText: { color: '#007AFF', fontWeight: '600' }
});
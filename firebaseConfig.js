import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// Notice we import 'initializeAuth' and 'getReactNativePersistence' specifically
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDcZMQ7zwkhP1g79jtBhR3MuVJwkpBz1ag",
  authDomain: "systema-jollyg.firebaseapp.com",
  projectId: "systema-jollyg",
  storageBucket: "systema-jollyg.firebasestorage.app",
  messagingSenderId: "972903672446",
  appId: "1:972903672446:web:04d2e10453b43ea1fd462f",
  measurementId: "G-P6HJSWWGQ3"
};

// Initialize Firebase App (prevents double initialization)
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// 1. Initialize Auth with Persistence (This keeps users logged in)
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// 2. Initialize Firestore
const db = getFirestore(app);

// Export them for use in your app
export { auth, db };

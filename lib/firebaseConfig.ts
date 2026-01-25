import { initializeApp } from 'firebase/app';
import { getMessaging, Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyD75bGgH-5XM-zVdS77ghEx0p3LAmkm3es",
  authDomain: "spark-walk.firebaseapp.com",
  projectId: "spark-walk",
  storageBucket: "spark-walk.firebasestorage.app",
  messagingSenderId: "293075383902",
  appId: "1:293075383902:web:d3ef6c9f60c7063ecc26cf",
  measurementId: "G-Q87NPK7N40"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging and get a reference to the service
let messaging: Messaging | null = null;

if (typeof window !== 'undefined') {
  messaging = getMessaging(app);
}

export { messaging, getMessaging as getToken, onMessage } from 'firebase/messaging';
export default app;

// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  projectId: "baro-de-mau",
  appId: "1:214288673341:web:32b3b650cebac0c9521854",
  storageBucket: "baro-de-mau.firebasestorage.app",
  apiKey: "AIzaSyBMr3qg-Iyi51uAtGWdRTNemaksKmwD8aM",
  authDomain: "baro-de-mau.firebaseapp.com",
  measurementId: "",
  messagingSenderId: "214288673341",
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { app, db };

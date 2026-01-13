// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://firebase.google.com/docs/web/learn-more#config-object
const firebaseConfig = {
    apiKey: "AIzaSyDcC6Fkm226-tuAKLVXuodbkIH4Ew8cpXw",
    authDomain: "website-197a8.firebaseapp.com",
    projectId: "website-197a8",
    storageBucket: "website-197a8.firebasestorage.app",
    messagingSenderId: "701443390508",
    appId: "1:701443390508:web:c2c333dbd28eab12dfe589",
    measurementId: "G-44BZJ1DKWX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };

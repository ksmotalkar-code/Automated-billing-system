import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, AuthError, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

let isSigningIn = false;

export const loginWithGoogle = async () => {
  if (isSigningIn) return;
  isSigningIn = true;
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Error signing in with Google", error);
    const authError = error as AuthError;
    if (authError.code === 'auth/popup-blocked') {
      throw new Error("Sign-in popup was blocked by your browser. Please allow popups for this site to sign in, or try opening the app in a new tab.");
    } else if (authError.code === 'auth/cancelled-popup-request') {
      // User closed the popup before finishing, or multiple popups were requested
      console.warn("Sign-in popup was closed or cancelled.");
    } else if (authError.code === 'auth/network-request-failed') {
      throw new Error("Network request failed. This is common in iframes due to ad-blockers or privacy settings. Please try opening the app in a new tab.");
    } else if (authError.code === 'auth/operation-not-allowed') {
      throw new Error("Google Sign-In is not enabled in the Firebase Console. Please enable it under Authentication > Sign-in method.");
    } else if (authError.code === 'auth/unauthorized-domain') {
      throw new Error("This domain is not authorized for OAuth operations. To fix this, go to Firebase Console > Authentication > Settings > Authorized domains, and add this website's domain name.");
    } else if (authError.message && authError.message.includes('INTERNAL ASSERTION FAILED')) {
      throw new Error("An internal authentication error occurred. Please try opening the app in a new tab or allowing popups.");
    } else {
      throw error;
    }
  } finally {
    isSigningIn = false;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};

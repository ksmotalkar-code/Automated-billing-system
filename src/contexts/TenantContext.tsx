import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth } from '../firebase';
import { User, onAuthStateChanged } from 'firebase/auth';

export interface TenantContextType {
  currentOwnerId: string | null;
  tenantId: string | null;
  currentUser: User | null;
  isAuthenticated: boolean;
  isTenantReady: boolean;
}

const TenantContext = createContext<TenantContextType>({
  currentOwnerId: null,
  tenantId: null,
  currentUser: null,
  isAuthenticated: false,
  isTenantReady: false,
});

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [isTenantReady, setIsTenantReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsTenantReady(true);
    });

    return () => unsubscribe();
  }, []);

  const currentOwnerId = currentUser?.uid || null;
  const tenantId = currentOwnerId;
  const isAuthenticated = !!currentUser;

  return (
    <TenantContext.Provider
      value={{
        currentOwnerId,
        tenantId,
        currentUser,
        isAuthenticated,
        isTenantReady,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => useContext(TenantContext);

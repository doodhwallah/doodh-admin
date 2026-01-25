import { useEffect, useCallback, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

interface UseCapacitorReturn {
  isNative: boolean;
  platform: string;
  hapticLight: () => Promise<void>;
  hapticMedium: () => Promise<void>;
  hapticHeavy: () => Promise<void>;
  hapticSuccess: () => Promise<void>;
  hapticWarning: () => Promise<void>;
  hapticError: () => Promise<void>;
  keyboardHeight: number;
  isKeyboardVisible: boolean;
}

export function useCapacitor(): UseCapacitorReturn {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  useEffect(() => {
    if (!isNative) return;

    // Initialize status bar
    const initStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#2d5a47' });
      } catch (e) {
        console.log('StatusBar not available:', e);
      }
    };

    // Hide splash screen after app loads
    const hideSplash = async () => {
      try {
        await SplashScreen.hide();
      } catch (e) {
        console.log('SplashScreen not available:', e);
      }
    };

    // Keyboard listeners
    const setupKeyboard = async () => {
      try {
        await Keyboard.addListener('keyboardWillShow', (info) => {
          setKeyboardHeight(info.keyboardHeight);
          setIsKeyboardVisible(true);
        });

        await Keyboard.addListener('keyboardWillHide', () => {
          setKeyboardHeight(0);
          setIsKeyboardVisible(false);
        });
      } catch (e) {
        console.log('Keyboard not available:', e);
      }
    };

    // App state listener
    const setupAppState = async () => {
      try {
        await App.addListener('appStateChange', ({ isActive }) => {
          console.log('App state changed. Is active?', isActive);
        });

        await App.addListener('backButton', ({ canGoBack }) => {
          if (!canGoBack) {
            App.exitApp();
          } else {
            window.history.back();
          }
        });
      } catch (e) {
        console.log('App listeners not available:', e);
      }
    };

    initStatusBar();
    hideSplash();
    setupKeyboard();
    setupAppState();

    return () => {
      if (isNative) {
        Keyboard.removeAllListeners();
        App.removeAllListeners();
      }
    };
  }, [isNative]);

  // Haptic feedback functions
  const hapticLight = useCallback(async () => {
    if (!isNative) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      console.log('Haptics not available');
    }
  }, [isNative]);

  const hapticMedium = useCallback(async () => {
    if (!isNative) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {
      console.log('Haptics not available');
    }
  }, [isNative]);

  const hapticHeavy = useCallback(async () => {
    if (!isNative) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (e) {
      console.log('Haptics not available');
    }
  }, [isNative]);

  const hapticSuccess = useCallback(async () => {
    if (!isNative) return;
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch (e) {
      console.log('Haptics not available');
    }
  }, [isNative]);

  const hapticWarning = useCallback(async () => {
    if (!isNative) return;
    try {
      await Haptics.notification({ type: NotificationType.Warning });
    } catch (e) {
      console.log('Haptics not available');
    }
  }, [isNative]);

  const hapticError = useCallback(async () => {
    if (!isNative) return;
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch (e) {
      console.log('Haptics not available');
    }
  }, [isNative]);

  return {
    isNative,
    platform,
    hapticLight,
    hapticMedium,
    hapticHeavy,
    hapticSuccess,
    hapticWarning,
    hapticError,
    keyboardHeight,
    isKeyboardVisible,
  };
}

// Standalone haptic functions for use outside of React components
export const triggerHaptic = async (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light') => {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    switch (type) {
      case 'light':
        await Haptics.impact({ style: ImpactStyle.Light });
        break;
      case 'medium':
        await Haptics.impact({ style: ImpactStyle.Medium });
        break;
      case 'heavy':
        await Haptics.impact({ style: ImpactStyle.Heavy });
        break;
      case 'success':
        await Haptics.notification({ type: NotificationType.Success });
        break;
      case 'warning':
        await Haptics.notification({ type: NotificationType.Warning });
        break;
      case 'error':
        await Haptics.notification({ type: NotificationType.Error });
        break;
    }
  } catch (e) {
    // Haptics not available
  }
};

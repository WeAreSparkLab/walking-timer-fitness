import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, pad } from './theme';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Check if already installed
    const standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator as any)?.standalone === true;
    setIsStandalone(standalone);

    console.log('🔍 PWA Debug:', {
      isStandalone: standalone,
      userAgent: navigator.userAgent.substring(0, 50),
      dismissed: localStorage.getItem('pwa-install-dismissed')
    });

    // Check if already dismissed
    const alreadyDismissed =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('pwa-install-dismissed') === '1';

    // Listen for the beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      console.log('✅ beforeinstallprompt event fired - app is installable!');
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      if (!alreadyDismissed) {
        setShowPrompt(true);
      }
    };

    const onInstalled = () => {
      setShowPrompt(false);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);

    // TEST MODE: Show prompt after 3 seconds regardless of event (for debugging)
    const testTimer = setTimeout(() => {
      console.log('🧪 Test mode: Showing prompt. Event fired:', !!deferredPrompt);
      if (!alreadyDismissed && !standalone) {
        setShowPrompt(true);
      }
    }, 3000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(testTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      console.log('No deferred prompt available');
      return;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User ${outcome} the install prompt`);
      
      setShowPrompt(false);
      localStorage.setItem('pwa-install-dismissed', '1');
      setDeferredPrompt(null);
    } catch (error) {
      console.error('Error showing install prompt:', error);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', '1');
  };

  if (Platform.OS !== 'web' || isStandalone || !showPrompt) return null;

  return (
    <View style={styles.container}>
      <View style={styles.prompt}>
        <TouchableOpacity 
          style={styles.closeBtn} 
          onPress={handleDismiss}
        >
          <Ionicons name="close" size={20} color={colors.sub} />
        </TouchableOpacity>
        
        <View style={styles.iconContainer}>
          <Ionicons name="download-outline" size={36} color={colors.accent} />
        </View>
        
        <Text style={styles.title}>Install Spark Walk</Text>
        <Text style={styles.description}>
          Install this app on your device for quick access and a better experience!
          {!deferredPrompt && '\n\n🧪 Test Mode: Event not fired yet'}
        </Text>
        
        <View style={styles.buttons}>
          <TouchableOpacity 
            style={[styles.button, styles.installButton, !deferredPrompt && styles.disabledButton]} 
            onPress={handleInstall}
            activeOpacity={0.8}
            disabled={!deferredPrompt}
          >
              <Text style={styles.installText}>Install</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.dismissButton]} 
              onPress={handleDismiss}
              activeOpacity={0.8}
            >
              <Text style={styles.dismissText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute' as any,
    bottom: 0,
    left: 0,
    right: 0,
    padding: pad.md,
    zIndex: 1000,
    pointerEvents: 'box-none' as any,
  },
  prompt: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: pad.lg,
    paddingTop: pad.xl,
    borderWidth: 2,
    borderColor: colors.accent + '40',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  closeBtn: {
    position: 'absolute' as any,
    top: pad.sm,
    right: pad.sm,
    padding: 4,
    zIndex: 1,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: pad.md,
  },
  icon: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    color: colors.sub,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  iosInstructions: {
    gap: pad.md,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: pad.sm,
    backgroundColor: colors.bg,
    padding: pad.md,
    borderRadius: radius.md,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  instructionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  installButton: {
    backgroundColor: colors.accent,
  },
  disabledButton: {
    backgroundColor: colors.line,
    opacity: 0.5,
  },
  installText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  dismissButton: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  dismissText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

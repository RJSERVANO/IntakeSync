import React from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BottomNavigationProps {
  currentRoute?: string;
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({ currentRoute }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  
  // Determine active tab based on current route
  const getActiveTab = () => {
    if (currentRoute) return currentRoute;
    
    if (pathname.includes('/home')) return 'home';
    if (pathname.includes('/components/pages/hydration')) return 'hydration';
    if (pathname.includes('/components/pages/medication')) return 'medication';
    if (pathname.includes('/components/pages/notification')) return 'notification';
    if (pathname.includes('/components/pages/profile')) return 'profile';
    if (pathname.includes('/components/pages/settings')) return 'settings';
    return 'home';
  };

  const activeTab = getActiveTab();

  const bottomPadding =
    Platform.OS === 'ios'
      ? Math.min(Math.max(insets.bottom, 8), 18)
      : Math.min(Math.max(insets.bottom, 4), 10);

  const getIconName = (key: string, isActive: boolean) => {
    const icons: Record<string, { active: string; inactive: string }> = {
      home: { active: 'home', inactive: 'home-outline' },
      hydration: { active: 'water', inactive: 'water-outline' },
      medication: { active: 'medkit', inactive: 'medkit-outline' },
      notification: { active: 'notifications', inactive: 'notifications-outline' },
      profile: { active: 'person', inactive: 'person-outline' },
    };

    const icon = icons[key] ?? icons.home;
    return isActive ? icon.active : icon.inactive;
  };

  const navigationItems = [
    { 
      key: 'home', 
      icon: 'home', 
      label: 'Home',
      route: '/home'
    },
    { 
      key: 'hydration', 
      icon: 'water', 
      label: 'Beverage',
      route: '/components/pages/hydration/Hydration'
    },
    { 
      key: 'medication', 
      icon: 'fitness',
      label: 'Medication',
      route: '/components/pages/medication/Medication'
    },
    { 
      key: 'notification', 
      icon: 'notifications',
      label: 'Alerts',
      route: '/components/pages/notification/Notification'
    },
    { 
      key: 'profile', 
      icon: 'person', 
      label: 'Profile',
      route: '/components/pages/profile/Profile'
    },
  ];

  const handleNavigation = (item: typeof navigationItems[0]) => {
    try {
      if (item.key === 'home') {
        router.push({ pathname: item.route, params: { token } } as any);
      } else {
        router.push({ pathname: item.route, params: { token } } as any);
      }
    } catch (error) {
      console.log('Navigation error:', error);
    }
  };

  return (
    // allow touches to pass through areas not occupied by the nav
    <View style={[styles.bottomNav, { paddingBottom: bottomPadding }]} pointerEvents="box-none">
      {navigationItems.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={[styles.navItem, activeTab === item.key && styles.activeNavItem]}
          onPress={() => handleNavigation(item)}
          activeOpacity={0.82}
        >
          <Ionicons
            name={getIconName(item.key, activeTab === item.key) as any}
            size={activeTab === item.key ? 22 : 21}
            color={activeTab === item.key ? '#FFFFFF' : '#A0B4E0'}
          />
          <Text style={[
            styles.navLabel,
            activeTab === item.key && styles.activeNavLabel
          ]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E3A8A',
    paddingTop: 8,
    paddingHorizontal: 12,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 24,
  },
  activeNavItem: {
    backgroundColor: '#2563EB',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  navLabel: {
    fontSize: 10,
    color: '#A0B4E0',
    marginTop: 2,
    fontWeight: '600',
  },
  activeNavLabel: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});

export default BottomNavigation;

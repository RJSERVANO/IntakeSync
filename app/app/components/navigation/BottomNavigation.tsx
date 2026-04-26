import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
      icon: 'medkit', // UPDATED: Changed to 'medkit' (Medical Bag)
      label: 'Medication',
      route: '/components/pages/medication/Medication'
    },
    { 
      key: 'notification', 
      icon: 'pulse', // UPDATED: Changed to 'pulse' (Activity Line)
      label: 'Activity',
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
      console.log('BottomNavigation: token=', token);
      console.log('BottomNavigation: navigating to', item.route);
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
    <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      {navigationItems.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={[styles.navItem, activeTab === item.key && styles.activeNavItem]}
          onPress={() => handleNavigation(item)}
          activeOpacity={0.82}
        >
          <Ionicons
            name={item.icon as any}
            size={activeTab === item.key ? 21 : 20}
            color={activeTab === item.key ? '#2563EB' : '#64748B'}
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
    backgroundColor: '#FFFFFF',
    paddingTop: 10,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#DBEAFE',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 14,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    paddingVertical: 7,
    paddingHorizontal: 3,
    borderRadius: 18,
  },
  activeNavItem: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  navLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '700',
  },
  activeNavLabel: {
    color: '#2563EB',
    fontWeight: '900',
  },
});

export default BottomNavigation;

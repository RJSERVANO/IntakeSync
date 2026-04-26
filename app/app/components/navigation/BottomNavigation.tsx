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
      icon: 'fitness',
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
    <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 6) }]} pointerEvents="box-none">
      {navigationItems.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={[styles.navItem, activeTab === item.key && styles.activeNavItem]}
          onPress={() => handleNavigation(item)}
          activeOpacity={0.82}
        >
          <Ionicons
            name={item.icon as any}
            size={activeTab === item.key ? 20 : 18}
            color={activeTab === item.key ? '#FFFFFF' : '#CBD5F5'}
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
    paddingTop: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#DBEAFE',
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
    minHeight: 38,
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: 12,
  },
  activeNavItem: {
    backgroundColor: '#3B82F6',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  navLabel: {
    fontSize: 10,
    color: '#E0E7FF',
    marginTop: 2,
    fontWeight: '700',
  },
  activeNavLabel: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});

export default BottomNavigation;

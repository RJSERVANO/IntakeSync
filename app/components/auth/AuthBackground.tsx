import React from 'react';
import { View } from 'react-native';
import { authStyles } from './authStyles';

export function AuthBackground() {
  return (
    <View style={authStyles.backgroundLayer} pointerEvents="none">
      <View style={authStyles.backgroundWashTop} />
      <View style={authStyles.backgroundWashBottom} />

      <View style={authStyles.backgroundPanelLeft} />
      <View style={authStyles.backgroundPanelRight} />
      <View style={authStyles.heroOrbLarge} />
      <View style={authStyles.heroOrbSmall} />
      <View style={authStyles.heroPill} />
      <View style={authStyles.heroBand} />
      <View style={authStyles.heroDotCluster} />
    </View>
  );
}

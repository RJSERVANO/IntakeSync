import React from 'react';
import {
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authStyles } from './authStyles';

type AuthFieldProps = TextInputProps & {
  label: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  optional?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  shellStyle?: StyleProp<ViewStyle>;
  rightAccessory?: React.ReactNode;
};

type AuthSelectFieldProps = {
  label: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  value?: string;
  placeholder: string;
  optional?: boolean;
  onPress: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  shellStyle?: StyleProp<ViewStyle>;
  rightAccessory?: React.ReactNode;
};

export function AuthField({
  label,
  iconName,
  optional,
  containerStyle,
  shellStyle,
  rightAccessory,
  placeholderTextColor = '#8A94A6',
  style,
  ...inputProps
}: AuthFieldProps) {
  return (
    <View style={[authStyles.fieldBlock, containerStyle]}>
      <View style={authStyles.fieldLabelRow}>
        <Text style={authStyles.fieldLabel}>{label}</Text>
        {optional ? (
          <View style={authStyles.optionalChip}>
            <Text style={authStyles.optionalChipText}>Optional</Text>
          </View>
        ) : null}
      </View>
      <View style={[authStyles.fieldShell, optional && authStyles.fieldShellMuted, shellStyle]}>
        <Ionicons name={iconName} size={20} color="#8A94A6" style={authStyles.fieldIcon} />
        <TextInput
          {...inputProps}
          style={[authStyles.fieldInput, style]}
          placeholderTextColor={placeholderTextColor}
        />
        {rightAccessory}
      </View>
    </View>
  );
}

export function AuthSelectField({
  label,
  iconName,
  value,
  placeholder,
  optional,
  onPress,
  containerStyle,
  shellStyle,
  rightAccessory,
}: AuthSelectFieldProps) {
  return (
    <View style={[authStyles.fieldBlock, containerStyle]}>
      <View style={authStyles.fieldLabelRow}>
        <Text style={authStyles.fieldLabel}>{label}</Text>
        {optional ? (
          <View style={authStyles.optionalChip}>
            <Text style={authStyles.optionalChipText}>Optional</Text>
          </View>
        ) : null}
      </View>
      <TouchableOpacity
        style={[authStyles.fieldShell, optional && authStyles.fieldShellMuted, shellStyle]}
        onPress={onPress}
        accessibilityRole="button"
      >
        <Ionicons name={iconName} size={20} color="#8A94A6" style={authStyles.fieldIcon} />
        <Text style={[authStyles.fieldTextValue, !value && authStyles.fieldPlaceholder]}>
          {value || placeholder}
        </Text>
        {rightAccessory || <Ionicons name="chevron-down-outline" size={20} color="#8A94A6" />}
      </TouchableOpacity>
    </View>
  );
}

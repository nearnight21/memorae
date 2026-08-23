import { useWindowDimensions, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export type AuthEntryPhase = 'booting' | 'account' | 'locked' | 'setup';

interface AuthEntryScreenProps {
  phase: AuthEntryPhase;
  accountValue: string;
  accountPassword: string;
  privatePassword: string;
  privatePasswordConfirmation: string;
  showAccountPassword: boolean;
  showPrivatePassword: boolean;
  error: string;
  busy: boolean;
  onAccountChange: (value: string) => void;
  onAccountPasswordChange: (value: string) => void;
  onPrivatePasswordChange: (value: string) => void;
  onPrivatePasswordConfirmationChange: (value: string) => void;
  onToggleAccountPassword: () => void;
  onTogglePrivatePassword: () => void;
  onTogglePrivatePasswordConfirmation: () => void;
  onSubmit: () => void;
}

const mapCanvas = require('../../assets/login/figma-map-canvas.png');
const memoryPhoto = require('../../assets/login/figma-memory-photo.png');
const timePath = require('../../assets/login/figma-time-path.png');

function PasswordField({
  placeholder,
  value,
  visible,
  onChangeText,
  onToggle,
  onSubmitEditing,
}: {
  placeholder: string;
  value: string;
  visible: boolean;
  onChangeText: (value: string) => void;
  onToggle: () => void;
  onSubmitEditing?: () => void;
}) {
  return (
    <View style={styles.field}>
      <TextInput
        style={styles.fieldInput}
        placeholder={placeholder}
        placeholderTextColor="#8e918b"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={!visible}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={onSubmitEditing ? 'done' : 'next'}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={visible ? '隐藏密码' : '显示密码'} onPress={onToggle} hitSlop={8}>
        <Text style={styles.showPassword}>{visible ? '隐藏' : '显示'}</Text>
      </Pressable>
    </View>
  );
}

function AuthVisual() {
  return (
    <>
      <Image source={mapCanvas} resizeMode="cover" style={styles.mapCanvas} />
      <View pointerEvents="none" style={styles.mapWash} />
      <View pointerEvents="none" style={styles.lowerWash} />
      <View style={styles.brand}>
        <Text style={styles.brandChinese}>所忆</Text>
        <Text style={styles.brandLatin}>MEMORAE</Text>
        <View style={styles.betaBadge}><Text style={styles.betaText}>内测</Text></View>
      </View>
      <Image source={memoryPhoto} resizeMode="contain" style={styles.memoryPhoto} />
      <Image source={timePath} resizeMode="stretch" style={styles.timePath} />
      <View pointerEvents="none" style={styles.timeLabels}>
        <Text style={[styles.year, styles.year2007]}>2007</Text>
        <Text style={[styles.year, styles.year2018]}>2018</Text>
        <Text style={[styles.year, styles.year2026]}>2026</Text>
      </View>
    </>
  );
}

export default function AuthEntryScreen({
  phase,
  accountValue,
  accountPassword,
  privatePassword,
  privatePasswordConfirmation,
  showAccountPassword,
  showPrivatePassword,
  error,
  busy,
  onAccountChange,
  onAccountPasswordChange,
  onPrivatePasswordChange,
  onPrivatePasswordConfirmationChange,
  onToggleAccountPassword,
  onTogglePrivatePassword,
  onTogglePrivatePasswordConfirmation,
  onSubmit,
}: AuthEntryScreenProps) {
  const { height } = useWindowDimensions();

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.page, { minHeight: Math.max(844, height) }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <AuthVisual />
          <View style={styles.form}>
            {phase === 'booting' ? (
              <Text style={styles.loading}>正在检查账号状态……</Text>
            ) : phase === 'account' ? (
              <>
                <Text style={styles.title}>账号登录</Text>
                <View style={styles.formGap} />
                <View style={styles.field}>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="手机号 / 账号"
                    placeholderTextColor="#8e918b"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={accountValue}
                    onChangeText={onAccountChange}
                    returnKeyType="next"
                  />
                </View>
                <PasswordField
                  placeholder="密码"
                  value={accountPassword}
                  visible={showAccountPassword}
                  onChangeText={onAccountPasswordChange}
                  onToggle={onToggleAccountPassword}
                  onSubmitEditing={onSubmit}
                />
                <ErrorSlot message={error} />
                <PrimaryButton label="登录" busy={busy} onPress={onSubmit} />
                <Text style={styles.note}>账号密码 · 登录所忆，可以重置</Text>
                <Text style={styles.note}>仅限受邀用户</Text>
              </>
            ) : phase === 'locked' ? (
              <>
                <Text style={styles.accountStatus}>账号已登录</Text>
                <Text style={styles.title}>私密空间</Text>
                <Text style={styles.subtitle}>输入私密空间密码以解锁加密记忆</Text>
                <View style={styles.formGapSmall} />
                <PasswordField
                  placeholder="私密空间密码"
                  value={privatePassword}
                  visible={showPrivatePassword}
                  onChangeText={onPrivatePasswordChange}
                  onToggle={onTogglePrivatePassword}
                  onSubmitEditing={onSubmit}
                />
                <ErrorSlot message={error} />
                <PrimaryButton label="解锁并进入" busy={busy} onPress={onSubmit} />
                <Text style={styles.note}>这里输入的是私密空间密码，不是账号密码</Text>
                <Text style={styles.note}>密码仅在本机验证，不会上传</Text>
              </>
            ) : (
              <>
                <Text style={styles.accountStatus}>第 2 步</Text>
                <Text style={styles.title}>建立私密空间</Text>
                <Text style={styles.subtitle}>再设置一个仅在本机使用的密码，所忆不会保存</Text>
                <View style={styles.formGapSmall} />
                <PasswordField
                  placeholder="设置私密空间密码"
                  value={privatePassword}
                  visible={showPrivatePassword}
                  onChangeText={onPrivatePasswordChange}
                  onToggle={onTogglePrivatePassword}
                />
                <PasswordField
                  placeholder="再次输入密码"
                  value={privatePasswordConfirmation}
                  visible={showPrivatePassword}
                  onChangeText={onPrivatePasswordConfirmationChange}
                  onToggle={onTogglePrivatePasswordConfirmation}
                  onSubmitEditing={onSubmit}
                />
                <ErrorSlot message={error} />
                <PrimaryButton label="建立并进入" busy={busy} onPress={onSubmit} />
                <Text style={styles.note}>私密空间密码 · 解锁记忆，无法找回</Text>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ErrorSlot({ message }: { message: string }) {
  return <Text style={[styles.error, !message && styles.errorEmpty]}>{message || ' '}</Text>;
}

function PrimaryButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && !busy && styles.primaryButtonPressed, busy && styles.primaryButtonBusy]}
    >
      <Text style={styles.primaryButtonText}>{busy ? '处理中…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f2f0e8' },
  root: { flex: 1 },
  page: { width: '100%', alignItems: 'center', position: 'relative', paddingTop: 34, paddingBottom: 34, overflow: 'hidden' },
  mapCanvas: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  mapWash: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(246,243,234,0.68)' },
  lowerWash: { position: 'absolute', top: 424, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(247,244,235,0.62)' },
  brand: { height: 84, alignItems: 'center', zIndex: 1 },
  brandChinese: { color: '#343631', fontFamily: Platform.OS === 'android' ? 'serif' : undefined, fontSize: 34, lineHeight: 44, fontWeight: '500' },
  brandLatin: { marginTop: 2, color: '#565a53', fontSize: 11, lineHeight: 16, letterSpacing: 2.6 },
  betaBadge: { marginTop: 2, height: 20, minWidth: 36, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(125,126,117,0.28)', backgroundColor: 'rgba(250,249,243,0.68)', alignItems: 'center', justifyContent: 'center' },
  betaText: { color: '#7f8179', fontSize: 10, lineHeight: 12 },
  memoryPhoto: { width: '75%', maxWidth: 312, aspectRatio: 312 / 319, marginTop: 14, zIndex: 1 },
  timePath: { width: '77.4%', maxWidth: 302, height: 92, marginTop: -44, zIndex: 1 },
  timeLabels: { width: '77.4%', maxWidth: 302, height: 92, marginTop: -92, position: 'relative', zIndex: 2 },
  year: { position: 'absolute', color: '#74776f', fontSize: 10, lineHeight: 14 },
  year2007: { left: '10%', top: 28 },
  year2018: { left: '46%', top: 54 },
  year2026: { right: '5%', top: 82 },
  form: { width: '83.6%', maxWidth: 326, marginTop: 31, zIndex: 3 },
  title: { color: '#3b3a34', fontFamily: Platform.OS === 'android' ? 'serif' : undefined, fontSize: 24, lineHeight: 32, fontWeight: '500' },
  accountStatus: { color: '#777870', fontSize: 11, lineHeight: 16 },
  subtitle: { marginTop: 2, color: '#85857c', fontSize: 11, lineHeight: 18 },
  formGap: { height: 10 },
  formGapSmall: { height: 10 },
  field: { minHeight: 52, marginBottom: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(168,165,154,0.22)', backgroundColor: 'rgba(255,254,249,0.86)', flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 14 },
  fieldInput: { flex: 1, minHeight: 50, color: '#45443d', fontSize: 14, paddingVertical: 0 },
  showPassword: { color: '#b37d3f', fontSize: 12, fontWeight: '600' },
  primaryButton: { minHeight: 56, borderRadius: 10, backgroundColor: '#b98348', alignItems: 'center', justifyContent: 'center', marginBottom: 10, shadowColor: '#72502f', shadowOpacity: 0.12, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  primaryButtonPressed: { opacity: 0.82 },
  primaryButtonBusy: { opacity: 0.58 },
  primaryButtonText: { color: '#fffaf2', fontSize: 15, lineHeight: 22, fontWeight: '600' },
  note: { color: '#85857c', fontSize: 10, lineHeight: 16, textAlign: 'center' },
  error: { minHeight: 17, color: '#a34d3b', fontSize: 11, lineHeight: 17, marginTop: -2, marginBottom: 2 },
  errorEmpty: { opacity: 0 },
  loading: { color: '#777870', fontSize: 14, textAlign: 'center', paddingTop: 12 },
});

import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Canvas, Circle, Path, RadialGradient, vec } from '@shopify/react-native-skia';
import { androidTopInset } from '../ui/layout';

export type AuthEntryPhase = 'booting' | 'select' | 'account' | 'locked' | 'setup';

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
  onSelectLocal: () => void;
  onSelectCloud: () => void;
}

const mapCanvas = require('../../assets/login/figma-map-canvas.png');
const travelPhoto = require('../../assets/login/travel-photo.png');

function EyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={visible ? '隐藏密码' : '显示密码'}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onToggle();
      }}
      hitSlop={10}
      style={styles.eyeButton}
    >
      <View style={styles.eyeOutline}>
        <View style={styles.eyePupil} />
        {!visible && <View style={styles.eyeSlash} />}
      </View>
    </Pressable>
  );
}

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
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.field, focused && styles.fieldFocused]}>
      <TextInput
        style={styles.fieldInput}
        placeholder={placeholder}
        placeholderTextColor="#9f998e"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={!visible}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={onSubmitEditing ? 'done' : 'next'}
      />
      <EyeToggle visible={visible} onToggle={onToggle} />
    </View>
  );
}

function AccountInputField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.field, focused && styles.fieldFocused]}>
      <TextInput
        style={styles.fieldInput}
        placeholder="手机号 / 账号"
        placeholderTextColor="#9f998e"
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="next"
      />
    </View>
  );
}

function AuthVisual({ viewportWidth }: { viewportWidth: number }) {
  const visualWidth = Math.min(Math.max(viewportWidth * 0.88, 280), 340);
  const pathHeight = 72;

  // 几何节点：2007 (起点), 2018 (高光回忆点), 2026 (未来点)
  const x1 = 28;
  const y1 = 58;
  const x2 = visualWidth * 0.54;
  const y2 = 38;
  const x3 = visualWidth - 28;
  const y3 = 16;

  const curvePath = `M ${x1} ${y1} Q ${visualWidth * 0.28} ${y1 + 4} ${x2} ${y2} T ${x3} ${y3}`;

  return (
    <View style={styles.visualSection}>
      {/* 拍立得真实质感相框 */}
      <View style={styles.polaroidWrapper}>
        <View style={styles.polaroidCard}>
          <View style={styles.photoFrame}>
            <Image source={travelPhoto} resizeMode="cover" style={styles.photoImage} />
          </View>
          <View style={styles.polaroidBottom}>
            <Text style={styles.polaroidDate}>2018.07.21 · 太原</Text>
          </View>
        </View>
      </View>

      {/* Skia 矢量时光轨迹 */}
      <View style={[styles.timelineContainer, { width: visualWidth, height: pathHeight }]}>
        <Canvas style={StyleSheet.absoluteFill}>
          {/* 柔和外发光底线 */}
          <Path
            color="rgba(167, 107, 62, 0.16)"
            path={curvePath}
            strokeWidth={4.5}
            style="stroke"
          />
          {/* 细腻主轨迹线 */}
          <Path
            color="rgba(167, 107, 62, 0.58)"
            path={curvePath}
            strokeWidth={1.4}
            style="stroke"
          />

          {/* 2007 小节点 */}
          <Circle cx={x1} cy={y1} r={3} color="#9e734b" />
          <Circle cx={x1} cy={y1} r={5} color="rgba(158, 115, 75, 0.2)" style="stroke" strokeWidth={1} />

          {/* 2018 高光水晶节点 */}
          <Circle cx={x2} cy={y2} r={9}>
            <RadialGradient
              c={vec(x2, y2)}
              r={9}
              colors={['rgba(255, 248, 238, 0.95)', 'rgba(212, 154, 103, 0.4)', 'rgba(167, 107, 62, 0)']}
            />
          </Circle>
          <Circle cx={x2} cy={y2} r={8.5} color="rgba(167, 107, 62, 0.72)" style="stroke" strokeWidth={1.2} />
          <Circle cx={x2} cy={y2} r={3.2} color="#8b552b" />

          {/* 2026 小节点 */}
          <Circle cx={x3} cy={y3} r={3} color="#9e734b" />
          <Circle cx={x3} cy={y3} r={5} color="rgba(158, 115, 75, 0.2)" style="stroke" strokeWidth={1} />
        </Canvas>

        {/* 年份文字精准对齐 */}
        <Text style={[styles.timelineYear, { left: x1 - 14, top: y1 - 18 }]}>2007</Text>
        <Text style={[styles.timelineYear, styles.timelineYearCurrent, { left: x2 - 16, top: y2 - 20 }]}>
          2018
        </Text>
        <Text style={[styles.timelineYear, { left: x3 - 14, top: y3 - 18 }]}>2026</Text>
      </View>
    </View>
  );
}

function SecurityBadge({ text }: { text: string }) {
  return (
    <View style={styles.securityBadge}>
      <View style={styles.shieldIcon}>
        <View style={styles.shieldShape} />
      </View>
      <Text style={styles.securityText}>{text}</Text>
    </View>
  );
}

function PrimaryButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && !busy && styles.primaryButtonPressed,
        busy && styles.primaryButtonBusy,
      ]}
    >
      {busy ? (
        <View style={styles.buttonBusyRow}>
          <ActivityIndicator size="small" color="#fffaf2" />
          <Text style={styles.primaryButtonText}>处理中…</Text>
        </View>
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function ErrorSlot({ message }: { message: string }) {
  return <Text style={[styles.error, !message && styles.errorEmpty]}>{message || ' '}</Text>;
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
  onSelectLocal,
  onSelectCloud,
}: AuthEntryScreenProps) {
  const { width, height } = useWindowDimensions();

  return (
    <View style={styles.safeArea}>
      {/* 优雅温暖的水洗地图底图 */}
      <Image source={mapCanvas} resizeMode="cover" style={styles.mapCanvas} />
      <View pointerEvents="none" style={styles.mapWash} />

      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { minHeight: Math.max(height - androidTopInset(), 680) },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* 品牌 Header */}
          <View style={styles.brand}>
            <Text style={styles.brandChinese}>所忆</Text>
            <Text style={styles.brandLatin}>MEMORAE</Text>
            <View style={styles.betaBadge}>
              <Text style={styles.betaText}>内测</Text>
            </View>
          </View>

          {/* 真实拍立得相纸 + Skia 矢量时光轴 */}
          <AuthVisual viewportWidth={width} />

          {/* 表单卡片区域 */}
          <View style={styles.form}>
            {phase === 'booting' ? (
              <View style={styles.bootingContainer}>
                <ActivityIndicator size="small" color="#a76b3e" />
                <Text style={styles.loading}>正在校验加密记忆空间状态……</Text>
              </View>
            ) : phase === 'select' ? (
              <>
                <View style={styles.formHeader}>
                  <Text style={styles.title}>选择使用方式</Text>
                  <Text style={styles.subtitle}>本地模式不上传私人数据；地点搜索与反向地点需要联网。</Text>
                </View>
                <View style={styles.privacyNotice}>
                  <Text style={styles.privacyTitle}>本地模式</Text>
                  <Text style={styles.privacyBody}>记忆、照片、标题和地点内容只保存在这台设备，不登录、不同步。</Text>
                  <Text style={styles.privacyBody}>地图搜索、反向地点和照片地点识别会联网并产生服务费用，内测/公测期间由 Memorae 承担。</Text>
                </View>
                <PrimaryButton label="本地使用" busy={busy} onPress={onSelectLocal} />
                <Pressable accessibilityRole="button" onPress={onSelectCloud} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>登录云端账号</Text>
                </Pressable>
              </>
            ) : phase === 'account' ? (
              <>
                <View style={styles.formHeader}>
                  <Text style={styles.title}>账号登录</Text>
                  <Text style={styles.subtitle}>登录所忆账号以获取云端密文记忆</Text>
                </View>
                <View style={styles.formGap} />
                <AccountInputField value={accountValue} onChangeText={onAccountChange} />
                <PasswordField
                  placeholder="账号密码"
                  value={accountPassword}
                  visible={showAccountPassword}
                  onChangeText={onAccountPasswordChange}
                  onToggle={onToggleAccountPassword}
                  onSubmitEditing={onSubmit}
                />
                <ErrorSlot message={error} />
                <PrimaryButton label="登录所忆" busy={busy} onPress={onSubmit} />
                <SecurityBadge text="仅限受邀用户 · 登录密码用于账号验证与密文同步" />
              </>
            ) : phase === 'locked' ? (
              <>
                <View style={styles.formHeader}>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>账号已就绪</Text>
                  </View>
                  <Text style={styles.title}>解锁私密空间</Text>
                  <Text style={styles.subtitle}>输入您的私密空间密码以解密本地记忆</Text>
                </View>
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
                <SecurityBadge text="钥匙仅保存在本机内存，所忆服务器无法解密您的回忆" />
              </>
            ) : (
              <>
                <View style={styles.formHeader}>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>第二步 · 初始设置</Text>
                  </View>
                  <Text style={styles.title}>建立私密空间</Text>
                  <Text style={styles.subtitle}>设置仅在本机解密使用的密码，此密码不可重置</Text>
                </View>
                <View style={styles.formGapSmall} />
                <PasswordField
                  placeholder="设置私密空间密码"
                  value={privatePassword}
                  visible={showPrivatePassword}
                  onChangeText={onPrivatePasswordChange}
                  onToggle={onTogglePrivatePassword}
                />
                <PasswordField
                  placeholder="确认私密空间密码"
                  value={privatePasswordConfirmation}
                  visible={showPrivatePassword}
                  onChangeText={onPrivatePasswordConfirmationChange}
                  onToggle={onTogglePrivatePasswordConfirmation}
                  onSubmitEditing={onSubmit}
                />
                <ErrorSlot message={error} />
                <PrimaryButton label="创建并进入" busy={busy} onPress={onSubmit} />
                <SecurityBadge text="零知识端到端加密体系 · 密码遗失后数据将永久封存" />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: androidTopInset(),
    backgroundColor: '#f7f4ec',
  },
  root: {
    flex: 1,
  },
  mapCanvas: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    opacity: 0.38,
  },
  mapWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(247, 244, 236, 0.76)',
  },
  scrollContent: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 28,
  },

  /* 品牌标识 */
  brand: {
    alignItems: 'center',
    marginBottom: 10,
    zIndex: 2,
  },
  brandChinese: {
    color: '#2a2622',
    fontFamily: Platform.OS === 'ios' ? 'Songti SC' : 'serif',
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '600',
    letterSpacing: 3,
  },
  brandLatin: {
    marginTop: 1,
    color: '#766e63',
    fontSize: 10.5,
    lineHeight: 15,
    letterSpacing: 5.5,
    fontWeight: '500',
  },
  betaBadge: {
    marginTop: 4,
    height: 18,
    paddingHorizontal: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(167, 107, 62, 0.28)',
    backgroundColor: 'rgba(252, 248, 240, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  betaText: {
    color: '#936437',
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
  },

  /* 视觉 Hero 区：拍立得 + 矢量时光轴 */
  visualSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 6,
    zIndex: 2,
  },
  polaroidWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  polaroidCard: {
    width: 172,
    padding: 7,
    paddingBottom: 16,
    backgroundColor: '#fffdf9',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(215, 204, 188, 0.82)',
    transform: [{ rotate: '2.4deg' }],
    shadowColor: '#453524',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  photoFrame: {
    width: '100%',
    height: 124,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: '#ebe6db',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  polaroidBottom: {
    marginTop: 6,
    alignItems: 'center',
  },
  polaroidDate: {
    color: '#827869',
    fontSize: 9.5,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.6,
    fontWeight: '500',
  },
  timelineContainer: {
    marginTop: -16,
    position: 'relative',
    alignItems: 'center',
  },
  timelineYear: {
    position: 'absolute',
    color: '#8b8275',
    fontSize: 10.5,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  timelineYearCurrent: {
    color: '#8b542c',
    fontWeight: '700',
  },

  /* 表单区域 */
  form: {
    width: '85%',
    maxWidth: 334,
    marginTop: 6,
    zIndex: 3,
  },
  formHeader: {
    marginBottom: 12,
  },
  title: {
    color: '#2a2622',
    fontFamily: Platform.OS === 'ios' ? 'Songti SC' : 'serif',
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: 3,
    color: '#7f776a',
    fontSize: 12,
    lineHeight: 18,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(167, 107, 62, 0.12)',
    marginBottom: 6,
  },
  statusPillText: {
    color: '#936437',
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
  },
  formGap: {
    height: 4,
  },
  formGapSmall: {
    height: 4,
  },
  privacyNotice: { marginBottom: 18, padding: 16, borderRadius: 12, backgroundColor: 'rgba(255,250,242,0.88)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(167,107,62,0.28)' },
  privacyTitle: { color: '#754f31', fontSize: 15, fontWeight: '600', lineHeight: 22 },
  privacyBody: { marginTop: 8, color: '#75695c', fontSize: 12, lineHeight: 19 },
  secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#754f31', fontSize: 14, fontWeight: '600' },

  /* 输入控件 */
  field: {
    minHeight: 50,
    marginBottom: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(195, 185, 170, 0.58)',
    backgroundColor: 'rgba(255, 253, 249, 0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 12,
    shadowColor: '#5a4630',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  fieldFocused: {
    borderColor: '#a76b3e',
    backgroundColor: '#ffffff',
    shadowColor: '#a76b3e',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 2,
  },
  fieldInput: {
    flex: 1,
    minHeight: 48,
    color: '#2d2925',
    fontSize: 14.5,
    paddingVertical: 0,
  },

  /* 自绘极简眼睛图标 */
  eyeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeOutline: {
    width: 19,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.4,
    borderColor: '#8c7d6b',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  eyePupil: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#8c7d6b',
  },
  eyeSlash: {
    position: 'absolute',
    width: 20,
    height: 1.4,
    backgroundColor: '#8c7d6b',
    transform: [{ rotate: '-45deg' }],
  },

  /* 主行动按钮 */
  primaryButton: {
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: '#a76b3e',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.28)',
    shadowColor: '#6d4323',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  primaryButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  primaryButtonBusy: {
    opacity: 0.65,
  },
  buttonBusyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#fffdf8',
    fontSize: 15.5,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: 1.2,
  },

  /* 安全徽标说明 */
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  shieldIcon: {
    width: 10,
    height: 12,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#988f82',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldShape: {
    width: 3,
    height: 4,
    backgroundColor: '#988f82',
    borderRadius: 1,
  },
  securityText: {
    color: '#877f72',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    flexShrink: 1,
  },

  /* 错误与加载提示 */
  error: {
    minHeight: 18,
    color: '#b3473b',
    fontSize: 11.5,
    lineHeight: 18,
    marginTop: -3,
    marginBottom: 3,
    paddingLeft: 2,
  },
  errorEmpty: {
    opacity: 0,
  },
  bootingContainer: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 12,
  },
  loading: {
    color: '#7f776a',
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
  },
});

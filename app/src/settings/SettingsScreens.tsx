import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CameraState } from '../map/MemoraeMap';
import { androidTopInset } from '../ui/layout';
import { cameraCoordinateLabel, cameraZoomLabel } from './settingsModel';
import type { UpdateCheckResult } from './updateService';

export type UtilityRoute = 'settings' | 'help' | 'about' | 'support';

interface PageProps {
  title: string;
  onBack: () => void;
  children: ReactNode;
}

function Page({ title, onBack, children }: PageProps) {
  return (
    <View style={styles.pageRoot}>
      <View style={[styles.header, { paddingTop: androidTopInset() + 4 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`返回${title}`} onPress={onBack} style={styles.headerButton}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

function Row({ label, detail, onPress }: { label: string; detail?: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={detail ? `${label}，${detail}` : label}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
}

export function MoreMenuSheet({
  onSelect,
  onClose,
}: {
  onSelect: (route: UtilityRoute) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.sheetRoot}>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭更多菜单" onPress={onClose} style={styles.backdrop} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>更多</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="打开设置"
          onPress={() => onSelect('settings')}
          style={({ pressed }) => [styles.menuRow, pressed && styles.rowPressed]}
        >
          <Text style={styles.menuGlyph}>⌖</Text><Text style={styles.menuLabel}>设置</Text><Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="打开帮助"
          onPress={() => onSelect('help')}
          style={({ pressed }) => [styles.menuRow, pressed && styles.rowPressed]}
        >
          <Text style={styles.menuGlyph}>?</Text><Text style={styles.menuLabel}>帮助</Text><Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="打开关于"
          onPress={() => onSelect('about')}
          style={({ pressed }) => [styles.menuRow, pressed && styles.rowPressed]}
        >
          <Text style={styles.menuGlyph}>i</Text><Text style={styles.menuLabel}>关于</Text><Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SettingsScreen({
  userCamera,
  effectiveCamera,
  onEditMap,
  onRestoreMap,
  onBack,
}: {
  userCamera: CameraState | null;
  effectiveCamera: CameraState;
  onEditMap: () => void;
  onRestoreMap: () => void;
  onBack: () => void;
}) {
  return (
    <Page title="设置" onBack={onBack}>
      <Text style={styles.sectionLabel}>默认地图视图</Text>
      <View style={styles.summaryBand}>
        <View>
          <Text style={styles.summaryTitle}>{userCamera ? '自定义视图' : '中国全景'}</Text>
          <Text style={styles.summaryMeta}>{cameraCoordinateLabel(effectiveCamera)} · {cameraZoomLabel(effectiveCamera)}</Text>
        </View>
        <View style={styles.coordinateDot} />
      </View>
      <View style={styles.listSection}>
        <Row label="在地图上重新设置" onPress={onEditMap} />
        <View style={styles.divider} />
        <Row label="恢复系统默认" detail="中国全景 · Zoom 3.5" onPress={onRestoreMap} />
      </View>
      <Text style={styles.footnote}>首次进入地图和时间轴下拉回到全景时使用此视图。</Text>
    </Page>
  );
}

export function HelpScreen({ onReplay, onBack }: { onReplay: () => void; onBack: () => void }) {
  return (
    <Page title="帮助" onBack={onBack}>
      <Text style={styles.sectionLabel}>使用引导</Text>
      <View style={styles.listSection}>
        <Row label="重新查看使用引导" detail="地图、时间轴与隐私空间" onPress={onReplay} />
      </View>
    </Page>
  );
}

export function AboutScreen({
  version,
  buildVersion,
  updateResult,
  checking,
  onCheckUpdate,
  onOpenUpdate,
  onSupport,
  onBack,
}: {
  version: string;
  buildVersion: string;
  updateResult: UpdateCheckResult | null;
  checking: boolean;
  onCheckUpdate: () => void;
  onOpenUpdate: () => void;
  onSupport: () => void;
  onBack: () => void;
}) {
  return (
    <Page title="关于" onBack={onBack}>
      <View style={styles.brandBlock}>
        <Text style={styles.brandName}>所忆</Text>
        <Text style={styles.brandLatin}>MEMORAE</Text>
        <Text style={styles.version}>版本 {version} · 构建 {buildVersion}</Text>
      </View>
      <View style={styles.listSection}>
        <Row label={checking ? '正在检查更新…' : '检查更新'} onPress={checking ? undefined : onCheckUpdate} />
        {updateResult ? (
          <>
            <View style={styles.divider} />
            <Row
              label={updateResult.message}
              onPress={updateResult.status === 'available' ? onOpenUpdate : undefined}
            />
          </>
        ) : null}
        <View style={styles.divider} />
        <Row label="支持开发者" onPress={onSupport} />
      </View>
    </Page>
  );
}

export function SupportScreen({ onOpenProject, onBack }: { onOpenProject: () => void; onBack: () => void }) {
  return (
    <Page title="支持开发者" onBack={onBack}>
      <View style={styles.supportCopy}>
        <Text style={styles.supportTitle}>让所忆继续生长</Text>
        <Text style={styles.supportBody}>所忆由独立开发者持续设计与维护。你的反馈、分享和关注都会帮助产品继续完善。</Text>
      </View>
      <Pressable accessibilityRole="link" onPress={onOpenProject} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}>
        <Text style={styles.primaryText}>访问项目主页</Text>
      </Pressable>
    </Page>
  );
}

export function DefaultMapEditorOverlay({
  camera,
  onCancel,
  onSave,
}: {
  camera: CameraState;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <View pointerEvents="box-none" style={styles.mapEditorRoot}>
      <View style={[styles.mapEditorHeader, { paddingTop: androidTopInset() + 8 }]}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.editorAction}><Text style={styles.editorCancel}>取消</Text></Pressable>
        <View style={styles.editorTitleWrap}>
          <Text style={styles.editorTitle}>默认地图视图</Text>
          <Text style={styles.editorMeta}>{cameraZoomLabel(camera)}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onSave} style={styles.editorAction}><Text style={styles.editorSave}>设为默认</Text></Pressable>
      </View>
      <View pointerEvents="none" style={styles.centerMarker}>
        <View style={styles.centerRing}><View style={styles.centerCore} /></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { ...StyleSheet.absoluteFill, zIndex: 20, backgroundColor: '#f6f5ef' },
  header: { minHeight: 82, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cfd4cf', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', backgroundColor: '#f8f7f2' },
  headerButton: { width: 46, height: 44, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { color: '#3f4b43', fontSize: 38, lineHeight: 40 },
  headerTitle: { color: '#353c37', fontSize: 17, lineHeight: 24, fontWeight: '600', paddingBottom: 10 },
  pageContent: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 44 },
  sectionLabel: { color: '#747d76', fontSize: 12, lineHeight: 18, marginBottom: 8 },
  summaryBand: { minHeight: 86, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#cfd4cf', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryTitle: { color: '#353c37', fontSize: 18, lineHeight: 26, fontWeight: '600' },
  summaryMeta: { marginTop: 3, color: '#79817b', fontSize: 13, lineHeight: 19 },
  coordinateDot: { width: 15, height: 15, borderRadius: 8, backgroundColor: '#aa7748', borderWidth: 4, borderColor: '#eadbc9' },
  listSection: { marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#cfd4cf' },
  row: { minHeight: 62, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center' },
  rowPressed: { backgroundColor: 'rgba(77,91,82,0.06)' },
  rowCopy: { flex: 1, paddingVertical: 10 },
  rowLabel: { color: '#39413c', fontSize: 15, lineHeight: 22 },
  rowDetail: { marginTop: 2, color: '#858c87', fontSize: 12, lineHeight: 18 },
  chevron: { color: '#909892', fontSize: 26, lineHeight: 28 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#cfd4cf' },
  footnote: { marginTop: 14, color: '#858c87', fontSize: 12, lineHeight: 20 },
  sheetRoot: { ...StyleSheet.absoluteFill, zIndex: 18 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(25,29,26,0.18)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 26, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: '#faf9f4', shadowColor: '#20251f', shadowOpacity: 0.16, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
  handle: { alignSelf: 'center', width: 34, height: 4, borderRadius: 2, backgroundColor: '#c1c4bd' },
  sheetTitle: { marginTop: 12, marginBottom: 4, color: '#3d443f', fontSize: 16, lineHeight: 24, fontWeight: '600', textAlign: 'center' },
  menuRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuGlyph: { width: 24, color: '#6d5845', fontSize: 18, lineHeight: 24, textAlign: 'center', fontWeight: '600' },
  menuLabel: { flex: 1, color: '#39413c', fontSize: 15, lineHeight: 22 },
  brandBlock: { alignItems: 'center', paddingVertical: 32 },
  brandName: { color: '#343b36', fontSize: 34, lineHeight: 44, fontWeight: '500' },
  brandLatin: { color: '#747c76', fontSize: 11, lineHeight: 17, letterSpacing: 2.4 },
  version: { marginTop: 12, color: '#858c87', fontSize: 12, lineHeight: 18 },
  supportCopy: { paddingVertical: 28 },
  supportTitle: { color: '#343b36', fontSize: 25, lineHeight: 34, fontWeight: '600' },
  supportBody: { marginTop: 14, color: '#69736c', fontSize: 15, lineHeight: 26 },
  primaryButton: { minHeight: 52, borderRadius: 8, backgroundColor: '#52655a', alignItems: 'center', justifyContent: 'center' },
  primaryPressed: { opacity: 0.82 },
  primaryText: { color: '#f9f7ef', fontSize: 15, lineHeight: 22, fontWeight: '600' },
  mapEditorRoot: { ...StyleSheet.absoluteFill, zIndex: 22, justifyContent: 'center', alignItems: 'center' },
  mapEditorHeader: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 92, paddingHorizontal: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', backgroundColor: 'rgba(248,247,242,0.94)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cfd4cf' },
  editorAction: { minWidth: 74, height: 44, justifyContent: 'center' },
  editorCancel: { color: '#65716a', fontSize: 14, lineHeight: 20 },
  editorSave: { color: '#865c37', fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'right' },
  editorTitleWrap: { alignItems: 'center', paddingBottom: 2 },
  editorTitle: { color: '#353c37', fontSize: 16, lineHeight: 22, fontWeight: '600' },
  editorMeta: { color: '#7e8781', fontSize: 11, lineHeight: 16 },
  centerMarker: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  centerRing: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#9c6c40', backgroundColor: 'rgba(250,247,238,0.82)', alignItems: 'center', justifyContent: 'center' },
  centerCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#9c6c40' },
});

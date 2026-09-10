import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  daysInMonth,
  formatDateString,
  localizedDateSummary,
  parseDateParts,
} from './datePickerModel';

interface Props {
  visible: boolean;
  initialDate?: string;
  onConfirm: (date: string) => void;
  onCancel: () => void;
}

const ITEM_HEIGHT = 40;
const VISIBLE_COUNT = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT;
const PADDING_ITEMS = 2; // (VISIBLE_COUNT - 1) / 2

interface WheelColumnProps {
  items: readonly number[];
  selectedValue: number;
  unit: string;
  onSelect: (value: number) => void;
}

function WheelColumn({ items, selectedValue, unit, onSelect }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const isUserScrolling = useRef(false);

  const selectedIndex = useMemo(() => {
    const idx = items.indexOf(selectedValue);
    return idx >= 0 ? idx : 0;
  }, [items, selectedValue]);

  useEffect(() => {
    if (!isUserScrolling.current) {
      scrollRef.current?.scrollTo({
        y: selectedIndex * ITEM_HEIGHT,
        animated: false,
      });
    }
  }, [selectedIndex]);

  function handleMomentumScrollEnd(event: { nativeEvent: { contentOffset: { y: number } } }) {
    isUserScrolling.current = false;
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.min(Math.max(0, Math.round(offsetY / ITEM_HEIGHT)), items.length - 1);
    const item = items[index];
    if (item !== undefined && item !== selectedValue) {
      onSelect(item);
    }
  }

  function handleItemPress(index: number) {
    const item = items[index];
    if (item !== undefined) {
      scrollRef.current?.scrollTo({
        y: index * ITEM_HEIGHT,
        animated: true,
      });
      onSelect(item);
    }
  }

  return (
    <View style={styles.columnWrap}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onScrollBeginDrag={() => {
          isUserScrolling.current = true;
        }}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        contentContainerStyle={styles.columnContent}
      >
        {items.map((item, index) => {
          const isSelected = item === selectedValue;
          return (
            <Pressable
              key={item}
              style={styles.itemRow}
              onPress={() => handleItemPress(index)}
            >
              <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
                {item}
                <Text style={styles.unitText}>{unit}</Text>
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function CrystalDatePicker({ visible, initialDate, onConfirm, onCancel }: Props) {
  const parsed = useMemo(() => parseDateParts(initialDate), [initialDate, visible]);
  const [year, setYear] = useState(parsed.year);
  const [month, setMonth] = useState(parsed.month);
  const [day, setDay] = useState(parsed.day);

  useEffect(() => {
    if (visible) {
      setYear(parsed.year);
      setMonth(parsed.month);
      setDay(parsed.day);
    }
  }, [visible, parsed.year, parsed.month, parsed.day]);

  // Adjust day if selected day exceeds maximum days in new year/month
  useEffect(() => {
    const maxDays = daysInMonth(year, month);
    if (day > maxDays) {
      setDay(maxDays);
    }
  }, [year, month, day]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const list: number[] = [];
    for (let y = 1970; y <= currentYear + 2; y += 1) {
      list.push(y);
    }
    return list;
  }, []);

  const months = useMemo(() => {
    const list: number[] = [];
    for (let m = 1; m <= 12; m += 1) {
      list.push(m);
    }
    return list;
  }, []);

  const days = useMemo(() => {
    const max = daysInMonth(year, month);
    const list: number[] = [];
    for (let d = 1; d <= max; d += 1) {
      list.push(d);
    }
    return list;
  }, [year, month]);

  function selectToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setDay(now.getDate());
  }

  function selectYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setYear(yesterday.getFullYear());
    setMonth(yesterday.getMonth() + 1);
    setDay(yesterday.getDate());
  }

  function handleConfirm() {
    onConfirm(formatDateString(year, month, day));
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={styles.paperCard}>
          {/* Subtle paper tab accent */}
          <View pointerEvents="none" style={styles.paperTopNotch} />

          {/* Header Bar */}
          <View style={styles.headerBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="取消选择日期"
              onPress={onCancel}
              style={styles.actionButton}
            >
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
            <Text style={styles.headerTitle}>选择日期</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="确定选择日期"
              onPress={handleConfirm}
              style={styles.actionButton}
            >
              <Text style={styles.confirmText}>确定</Text>
            </Pressable>
          </View>

          {/* Localized Summary & Quick Chips */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryDateText}>{localizedDateSummary(year, month, day)}</Text>
            <View style={styles.quickChipGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="设为今天"
                onPress={selectToday}
                style={styles.quickChip}
              >
                <Text style={styles.quickChipText}>今天</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="设为昨天"
                onPress={selectYesterday}
                style={styles.quickChip}
              >
                <Text style={styles.quickChipText}>昨天</Text>
              </Pressable>
            </View>
          </View>

          {/* Wheel Selector Stage */}
          <View style={styles.wheelStage}>
            {/* Debossed Paper Date Stamp Slot */}
            <View pointerEvents="none" style={styles.stampSlot}>
              <View style={styles.stampSlotBevelTop} />
              <View style={styles.stampSlotBevelBottom} />
            </View>

            {/* Three columns: Year, Month, Day */}
            <WheelColumn
              items={years}
              selectedValue={year}
              unit="年"
              onSelect={setYear}
            />
            <WheelColumn
              items={months}
              selectedValue={month}
              unit="月"
              onSelect={setMonth}
            />
            <WheelColumn
              items={days}
              selectedValue={day}
              unit="日"
              onSelect={setDay}
            />
          </View>

          {/* Paper card bottom edge (like stacked journal folio) */}
          <View pointerEvents="none" style={styles.paperBottomEdge} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(28, 22, 16, 0.44)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    paddingHorizontal: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  paperCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(251, 246, 237, 0.98)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(215, 201, 182, 0.9)',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    shadowColor: '#261a10',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  paperTopNotch: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -24,
    width: 48,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: 'rgba(189, 169, 145, 0.45)',
  },
  paperBottomEdge: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 3,
    height: 1.5,
    backgroundColor: 'rgba(216, 201, 181, 0.55)',
    borderRadius: 1,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 178, 155, 0.28)',
  },
  actionButton: {
    minWidth: 48,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    color: 'rgba(118, 104, 91, 0.9)',
    fontSize: 14,
    fontWeight: '500',
  },
  headerTitle: {
    color: '#342c23',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  confirmText: {
    color: '#754f31',
    fontSize: 15,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(210, 194, 174, 0.4)',
  },
  summaryDateText: {
    color: '#3d342b',
    fontSize: 13.5,
    fontWeight: '600',
  },
  quickChipGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  quickChip: {
    paddingHorizontal: 11,
    paddingVertical: 4.5,
    borderRadius: 8,
    backgroundColor: 'rgba(240, 230, 216, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(202, 183, 158, 0.58)',
  },
  quickChipText: {
    color: '#754f31',
    fontSize: 12,
    fontWeight: '600',
  },
  wheelStage: {
    position: 'relative',
    height: WHEEL_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 4,
  },
  stampSlot: {
    position: 'absolute',
    left: 2,
    right: 2,
    top: ITEM_HEIGHT * PADDING_ITEMS,
    height: ITEM_HEIGHT,
    borderRadius: 8,
    backgroundColor: 'rgba(238, 226, 210, 0.52)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(168, 143, 114, 0.36)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.85)',
  },
  stampSlotBevelTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(148, 122, 94, 0.08)',
  },
  stampSlotBevelBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  columnWrap: {
    flex: 1,
    height: WHEEL_HEIGHT,
  },
  columnContent: {
    paddingVertical: ITEM_HEIGHT * PADDING_ITEMS,
  },
  itemRow: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    color: 'rgba(126, 113, 99, 0.5)',
    fontSize: 15,
    fontWeight: '400',
  },
  itemTextSelected: {
    color: '#27231e',
    fontSize: 17,
    fontWeight: '700',
  },
  unitText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(117, 79, 49, 0.8)',
    marginLeft: 2,
  },
});

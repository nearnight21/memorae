export type OnboardingTourStep =
  | 'pull_create'
  | 'guide_location'
  | 'pick_location'
  | 'edit_form'
  | 'detail_view'
  | 'timeline_browse'
  | 'timeline_now'
  | 'timeline_reset_map'
  | 'tour_completed';

export interface OnboardingTourState {
  step: OnboardingTourStep;
  photoPickerDismissed: boolean;
  locationPickerDismissed: boolean;
  completed: boolean;
}

export function initialTourState(): OnboardingTourState {
  return {
    step: 'pull_create',
    photoPickerDismissed: false,
    locationPickerDismissed: false,
    completed: false,
  };
}

export function handlePullCreateTriggered(state: OnboardingTourState): OnboardingTourState {
  if (state.step !== 'pull_create') return state;
  return {
    ...state,
    photoPickerDismissed: false,
  };
}

export function handlePhotoPickerCancelled(state: OnboardingTourState): OnboardingTourState {
  if (state.step !== 'pull_create') return state;
  return {
    ...state,
    photoPickerDismissed: true,
  };
}

export function handleDraftCreated(state: OnboardingTourState): OnboardingTourState {
  if (state.step === 'pull_create') {
    return {
      ...state,
      step: 'guide_location',
      photoPickerDismissed: false,
    };
  }
  return state;
}

export function handleEnterLocationPicker(state: OnboardingTourState): OnboardingTourState {
  if (state.step === 'guide_location' || state.step === 'edit_form') {
    return {
      ...state,
      step: 'pick_location',
      locationPickerDismissed: false,
    };
  }
  return state;
}

export function handleLocationConfirmed(state: OnboardingTourState): OnboardingTourState {
  if (state.step === 'pick_location') {
    return {
      ...state,
      step: 'edit_form',
      locationPickerDismissed: false,
    };
  }
  return state;
}

export function handleLocationCancelled(state: OnboardingTourState): OnboardingTourState {
  if (state.step === 'pick_location') {
    return {
      ...state,
      step: 'guide_location',
      locationPickerDismissed: true,
    };
  }
  return state;
}

export function handleDraftCancelled(state: OnboardingTourState): OnboardingTourState {
  if (state.step === 'guide_location' || state.step === 'pick_location' || state.step === 'edit_form') {
    return {
      ...state,
      step: 'pull_create',
      photoPickerDismissed: false,
      locationPickerDismissed: false,
    };
  }
  return state;
}

export function handleMemorySaved(state: OnboardingTourState, hasDetail: boolean): OnboardingTourState {
  if (state.step === 'guide_location' || state.step === 'edit_form' || state.step === 'pick_location') {
    return {
      ...state,
      step: hasDetail ? 'detail_view' : 'timeline_browse',
      photoPickerDismissed: false,
      locationPickerDismissed: false,
    };
  }
  return state;
}

export function handleDetailClosed(state: OnboardingTourState): OnboardingTourState {
  if (state.step === 'detail_view') {
    return {
      ...state,
      step: 'timeline_browse',
    };
  }
  return state;
}

export function handleTimelineScrolled(state: OnboardingTourState): OnboardingTourState {
  if (state.step === 'timeline_browse') {
    return {
      ...state,
      step: 'timeline_now',
    };
  }
  return state;
}

export function handleQuickReturnNow(state: OnboardingTourState): OnboardingTourState {
  if (state.step === 'timeline_now') {
    return {
      ...state,
      step: 'timeline_reset_map',
    };
  }
  return state;
}

export function handleResetMapView(state: OnboardingTourState): OnboardingTourState {
  if (state.step === 'timeline_reset_map') {
    return {
      ...state,
      step: 'tour_completed',
    };
  }
  return state;
}

export function handleSkipCurrentStep(state: OnboardingTourState): OnboardingTourState {
  switch (state.step) {
    case 'pull_create':
      return { ...state, step: 'timeline_browse' };
    case 'guide_location':
      return { ...state, step: 'edit_form' };
    case 'pick_location':
      return { ...state, step: 'edit_form' };
    case 'edit_form':
      return { ...state, step: 'timeline_browse' };
    case 'detail_view':
      return { ...state, step: 'timeline_browse' };
    case 'timeline_browse':
      return { ...state, step: 'timeline_now' };
    case 'timeline_now':
      return { ...state, step: 'timeline_reset_map' };
    case 'timeline_reset_map':
      return { ...state, step: 'tour_completed' };
    case 'tour_completed':
      return { ...state, completed: true };
    default:
      return state;
  }
}

export function tourStepProgress(step: OnboardingTourStep): { current: number; total: number } {
  switch (step) {
    case 'pull_create':
      return { current: 1, total: 6 };
    case 'guide_location':
    case 'pick_location':
      return { current: 2, total: 6 };
    case 'edit_form':
      return { current: 3, total: 6 };
    case 'detail_view':
    case 'timeline_browse':
      return { current: 4, total: 6 };
    case 'timeline_now':
      return { current: 5, total: 6 };
    case 'timeline_reset_map':
      return { current: 6, total: 6 };
    case 'tour_completed':
      return { current: 6, total: 6 };
  }
}

export interface TourCopy {
  title: string;
  hint: string;
  actionText?: string;
}

export function tourStepCopy(state: OnboardingTourState): TourCopy {
  switch (state.step) {
    case 'pull_create':
      if (state.photoPickerDismissed) {
        return {
          title: '未选择照片',
          hint: '向上拉动中心按钮重新选择照片，开启你的第一段记忆。',
          actionText: '继续上拉新建',
        };
      }
      return {
        title: '上拉新建记忆',
        hint: '按住时间轴中心按钮向上拉动，挑选照片并创建一段新记忆。',
        actionText: '上拉中心按钮',
      };
    case 'guide_location':
      if (state.locationPickerDismissed) {
        return {
          title: '未设置地点',
          hint: '可重新点击“地点”栏进入地图选点，或直接保存。',
          actionText: '点击地点栏',
        };
      }
      return {
        title: '选择记忆发生地',
        hint: '点击下方的“选择地点”栏，进入地图标记这段记忆的坐标。',
        actionText: '点击地点栏',
      };
    case 'pick_location':
      return {
        title: '地图选点与搜索',
        hint: '拖动地图移动图钉，或在顶部搜索地点，选好后点击右下角“确定”。',
        actionText: '确定地点',
      };
    case 'edit_form':
      return {
        title: '保存第一段记忆',
        hint: '写下当时的标题与感受，点击右上角的“完成”将记忆加密落入地图。',
        actionText: '点击完成',
      };
    case 'detail_view':
      return {
        title: '记忆手账已就绪',
        hint: '向下滑动卡片或轻触暗色背景合上手账，返回地图查看地标。',
        actionText: '合上手账返回',
      };
    case 'timeline_browse':
      return {
        title: '左右滑动浏览时间',
        hint: '新记忆已落在地图上！横向滑动时间轴，查看不同年份的记忆。',
        actionText: '左右滑动时间轴',
      };
    case 'timeline_now':
      return {
        title: '双击回到当前时间',
        hint: '双击中心年份按钮，无论身在何年都能瞬间回到当下。',
        actionText: '双击中心按钮',
      };
    case 'timeline_reset_map':
      return {
        title: '下拉重置地图视角',
        hint: '向下拉动中心按钮，快速重置回你的默认全局地图视野。',
        actionText: '向下拉动中心按钮',
      };
    case 'tour_completed':
      return {
        title: '新手探索旅程已就绪',
        hint: '你已掌握所忆的核心交互！随时在地图上追寻你的岁月足迹。',
        actionText: '开始探索',
      };
  }
}

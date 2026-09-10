import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleDetailClosed,
  handleDraftCancelled,
  handleDraftCreated,
  handleEnterLocationPicker,
  handleLocationCancelled,
  handleLocationConfirmed,
  handleMemorySaved,
  handlePhotoPickerCancelled,
  handlePullCreateTriggered,
  handleQuickReturnNow,
  handleResetMapView,
  handleSkipCurrentStep,
  handleTimelineScrolled,
  initialTourState,
  tourStepCopy,
  tourStepProgress,
} from '../src/onboarding/onboardingTourModel';

test('引导状态机全流程完整推进链路', () => {
  let state = initialTourState();
  assert.equal(state.step, 'pull_create');

  state = handlePullCreateTriggered(state);
  assert.equal(state.step, 'pull_create');
  assert.equal(state.photoPickerDismissed, false);

  // 1. 创建草稿 -> 引导选点
  state = handleDraftCreated(state);
  assert.equal(state.step, 'guide_location');

  // 2. 进入地图选点
  state = handleEnterLocationPicker(state);
  assert.equal(state.step, 'pick_location');

  // 3. 确认选点 -> 编辑表单准备完成
  state = handleLocationConfirmed(state);
  assert.equal(state.step, 'edit_form');

  // 4. 保存记忆 -> 进入详情页展示
  state = handleMemorySaved(state, true);
  assert.equal(state.step, 'detail_view');

  // 5. 合上手账 -> 进入时间轴滑动浏览
  state = handleDetailClosed(state);
  assert.equal(state.step, 'timeline_browse');

  // 6. 滑动时间轴 -> 引导双击回到当年
  state = handleTimelineScrolled(state);
  assert.equal(state.step, 'timeline_now');

  // 7. 双击回到当年 -> 引导下拉重置地图
  state = handleQuickReturnNow(state);
  assert.equal(state.step, 'timeline_reset_map');

  // 8. 下拉重置地图 -> 引导完成
  state = handleResetMapView(state);
  assert.equal(state.step, 'tour_completed');
});

test('分支容错与状态恢复机制', () => {
  let state = initialTourState();

  // 相册取消未选照片
  state = handlePhotoPickerCancelled(state);
  assert.equal(state.step, 'pull_create');
  assert.equal(state.photoPickerDismissed, true);
  assert.match(tourStepCopy(state).title, /未选择照片/);

  // 重新创建草稿后，清除取消标记
  state = handleDraftCreated(state);
  assert.equal(state.step, 'guide_location');
  assert.equal(state.photoPickerDismissed, false);

  // 进入选点后取消
  state = handleEnterLocationPicker(state);
  assert.equal(state.step, 'pick_location');
  state = handleLocationCancelled(state);
  assert.equal(state.step, 'guide_location');
  assert.equal(state.locationPickerDismissed, true);
  assert.match(tourStepCopy(state).title, /未设置地点/);

  // 用户在表单中直接取消退出，平滑回退至 pull_create
  state = handleDraftCancelled(state);
  assert.equal(state.step, 'pull_create');
  assert.equal(state.locationPickerDismissed, false);
});

test('跳过步骤与跳过全部机制', () => {
  let state = initialTourState();
  state = handleSkipCurrentStep(state);
  assert.equal(state.step, 'timeline_browse');

  state = handleSkipCurrentStep(state);
  assert.equal(state.step, 'timeline_now');

  state = handleSkipCurrentStep(state);
  assert.equal(state.step, 'timeline_reset_map');

  state = handleSkipCurrentStep(state);
  assert.equal(state.step, 'tour_completed');

  state = handleSkipCurrentStep(state);
  assert.equal(state.completed, true);
});

test('步骤进度与文案匹配', () => {
  const p1 = tourStepProgress('pull_create');
  assert.equal(p1.current, 1);
  assert.equal(p1.total, 6);

  const pFinal = tourStepProgress('tour_completed');
  assert.equal(pFinal.current, 6);
  assert.equal(pFinal.total, 6);

  const copy = tourStepCopy(initialTourState());
  assert.equal(copy.title, '上拉新建记忆');
  assert.ok(copy.hint.length > 0);
});

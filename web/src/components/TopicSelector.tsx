import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, Compass, EllipsisVertical, MapPin, Plus, X } from 'lucide-react';
import type { Memory } from '../types';
import type { MemoryTopic } from '../memory/topic';
import { filterMemoriesByTopic, sortTopicsByRecent, topicCoverPhoto } from '../lib/topicFilters';
import TopicBadge from './TopicBadge';
import './TopicSelector.css';

interface TopicSelectorProps {
  topics: MemoryTopic[];
  lastUsedAt: Record<string, string>;
  selectedTopicId: string | null;
  memories: Memory[];
  onSelectTopic: (topicId: string | null) => void;
  onCreateTopic: (name: string) => MemoryTopic | Promise<MemoryTopic> | void;
  onRenameTopic: (topicId: string, name: string) => void | Promise<void>;
  onDeleteTopic: (topicId: string) => void | Promise<void>;
  onAddMemory?: (topicId: string) => void;
  onPickMemories?: (topicId: string) => void;
}

interface TopicSummary {
  count: number;
  cover: string | null;
}

interface StackItemCustom {
  index: number;
  reverseIndex: number;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export default function TopicSelector({
  topics,
  lastUsedAt,
  selectedTopicId,
  memories,
  onSelectTopic,
  onCreateTopic,
  onRenameTopic,
  onDeleteTopic,
  onAddMemory,
  onPickMemories,
}: TopicSelectorProps) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const summaryById = useMemo(() => {
    const map = new Map<string, TopicSummary>();
    for (const topic of topics) {
      const scoped = filterMemoriesByTopic(memories, topic.id);
      map.set(topic.id, { count: scoped.length, cover: topicCoverPhoto(scoped) });
    }
    return map;
  }, [memories, topics]);

  const orderedTopics = useMemo(() => sortTopicsByRecent(topics, lastUsedAt), [topics, lastUsedAt]);
  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId) ?? null;
  const selectedCover = selectedTopic ? summaryById.get(selectedTopic.id)?.cover ?? null : null;

  const resetTransient = () => {
    setMenuOpen(false);
    setCreating(false);
    setDraftName('');
    setRenaming(false);
    setRenameValue('');
    setDeleteArmed(false);
  };

  const closeAll = () => {
    setOpen(false);
    resetTransient();
  };

  useEffect(() => {
    if (!open && !menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeAll();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAll();
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, menuOpen]);

  const toggleOpen = () => {
    if (open) {
      closeAll();
      return;
    }
    resetTransient();
    setOpen(true);
  };

  const submitCreate = async () => {
    const name = draftName.trim();
    if (!name) return;
    await onCreateTopic(name);
    setDraftName('');
    setCreating(false);
  };

  const submitRename = async () => {
    if (!selectedTopic) return;
    const name = renameValue.trim();
    if (!name) return;
    await onRenameTopic(selectedTopic.id, name);
    setRenaming(false);
    setRenameValue('');
    setMenuOpen(false);
  };

  const confirmDelete = async () => {
    if (!selectedTopic) return;
    await onDeleteTopic(selectedTopic.id);
    closeAll();
  };

  const stackRows = orderedTopics.length + 1;
  const customFor = (index: number): StackItemCustom => ({
    index,
    reverseIndex: Math.max(0, stackRows - 1 - index),
  });

  const stackVariants = {
    hidden: { height: 0, opacity: 0 },
    visible: {
      height: 'auto',
      opacity: 1,
      transition: { duration: reduceMotion ? 0.08 : 0.3, ease: EASE },
    },
    exit: {
      height: 0,
      opacity: 0,
      transition: { duration: reduceMotion ? 0.08 : 0.2, ease: EASE, delay: reduceMotion ? 0 : 0.06 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: -10, scale: 0.985 },
    visible: (custom: StackItemCustom) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        delay: reduceMotion ? 0 : 0.03 + custom.index * 0.045,
        duration: reduceMotion ? 0.08 : 0.32,
        ease: EASE,
      },
    }),
    exit: (custom: StackItemCustom) => ({
      opacity: 0,
      y: -6,
      scale: 0.99,
      transition: {
        delay: reduceMotion ? 0 : custom.reverseIndex * 0.012,
        duration: reduceMotion ? 0.06 : 0.12,
        ease: EASE,
      },
    }),
  };

  return (
    <div className="topic-selector" ref={rootRef}>
      <div className={`topic-header ${selectedTopic ? 'is-active' : ''}`}>
        <button
          type="button"
          className="topic-header-main"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-label={selectedTopic ? `当前主题 ${selectedTopic.name}，点击展开主题列表` : '展开主题列表'}
        >
          <span className="topic-header-icon">
            {selectedTopic
              ? <TopicBadge name={selectedTopic.name} cover={selectedCover} seed={selectedTopic.id} />
              : <Compass size={20} strokeWidth={1.6} aria-hidden="true" />}
          </span>
          <span className="topic-header-name">{selectedTopic?.name ?? '未选择主题'}</span>
          <motion.span
            className="topic-header-caret"
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.24, ease: EASE }}
            aria-hidden="true"
          >
            <ChevronDown size={16} strokeWidth={1.9} />
          </motion.span>
        </button>

        {selectedTopic && (
          <button
            type="button"
            className="topic-header-clear"
            onClick={() => onSelectTopic(null)}
            aria-label="取消选择主题"
            title="取消选择主题"
          >
            <X size={15} strokeWidth={1.9} />
          </button>
        )}

        {selectedTopic && (
          <div className="topic-header-more-wrap">
            <button
              type="button"
              className="topic-header-more"
              onClick={() => {
                setMenuOpen((value) => !value);
                setRenaming(false);
                setDeleteArmed(false);
              }}
              aria-label="主题操作"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <EllipsisVertical size={16} strokeWidth={1.8} />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  className="topic-menu"
                  role="menu"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: reduceMotion ? 0.06 : 0.14, ease: EASE }}
                >
                  {deleteArmed ? (
                    <div className="topic-menu-confirm">
                      <p>删除主题只解除关联，不会删除记忆。</p>
                      <div className="topic-menu-confirm-row">
                        <button type="button" className="is-danger" onClick={() => void confirmDelete()}>确认删除</button>
                        <button type="button" onClick={() => setDeleteArmed(false)}>取消</button>
                      </div>
                    </div>
                  ) : renaming ? (
                    <div className="topic-menu-rename">
                      <input
                        value={renameValue}
                        autoFocus
                        maxLength={40}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void submitRename();
                          if (event.key === 'Escape') setRenaming(false);
                        }}
                        aria-label="重命名主题"
                      />
                      <button type="button" className="topic-menu-icon-btn" onClick={() => void submitRename()} aria-label="确认重命名">
                        <Check size={14} strokeWidth={2} />
                      </button>
                      <button type="button" className="topic-menu-icon-btn" onClick={() => setRenaming(false)} aria-label="取消重命名">
                        <X size={14} strokeWidth={2} />
                      </button>
                    </div>
                  ) : (
                    <>
                      {onPickMemories && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onPickMemories(selectedTopic.id);
                            closeAll();
                          }}
                        >
                          <MapPin size={14} strokeWidth={1.8} aria-hidden="true" />
                          选择地图上的记忆
                        </button>
                      )}
                      {onAddMemory && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onAddMemory(selectedTopic.id);
                            closeAll();
                          }}
                        >
                          <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
                          新建记忆
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setRenameValue(selectedTopic.name);
                          setRenaming(true);
                        }}
                      >
                        重命名主题
                      </button>
                      <button type="button" role="menuitem" className="is-danger" onClick={() => setDeleteArmed(true)}>
                        删除主题
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="topic-stack"
            variants={stackVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="topic-stack-inner">
              {orderedTopics.map((topic, index) => {
                const summary = summaryById.get(topic.id);
                const isSelected = topic.id === selectedTopicId;
                return (
                  <motion.button
                    key={topic.id}
                    type="button"
                    custom={customFor(index)}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className={`topic-row ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      onSelectTopic(isSelected ? null : topic.id);
                      closeAll();
                    }}
                    title={isSelected ? '再次点击取消选择' : `进入主题：${topic.name}`}
                  >
                    <span className="topic-row-cover">
                      <TopicBadge name={topic.name} cover={summary?.cover ?? null} seed={topic.id} />
                    </span>
                    <span className="topic-row-copy">
                      <strong>{topic.name}</strong>
                      <span>{summary?.count ?? 0} 段记忆</span>
                    </span>
                  </motion.button>
                );
              })}

              {creating ? (
                <motion.div
                  key="topic-create-input"
                  className="topic-create-input"
                  custom={customFor(orderedTopics.length)}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <input
                    value={draftName}
                    autoFocus
                    maxLength={40}
                    placeholder="主题名称"
                    onChange={(event) => setDraftName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void submitCreate();
                      if (event.key === 'Escape') {
                        setCreating(false);
                        setDraftName('');
                      }
                    }}
                    aria-label="新主题名称"
                  />
                  <button type="button" className="topic-menu-icon-btn" onClick={() => void submitCreate()} aria-label="创建主题">
                    <Check size={14} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="topic-menu-icon-btn"
                    onClick={() => {
                      setCreating(false);
                      setDraftName('');
                    }}
                    aria-label="取消创建"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="topic-create"
                  type="button"
                  className="topic-create-row"
                  custom={customFor(orderedTopics.length)}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  onClick={() => setCreating(true)}
                >
                  <span className="topic-create-icon">
                    <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  新建主题
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

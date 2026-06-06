"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { notesApi } from "@/lib/api";
import TipTapEditor from "@/components/TipTapEditor";

interface NoteNode {
  id: number;
  parent_id: number | null;
  title: string;
  order: number;
  children: NoteNode[];
}

interface NoteDetail {
  id: number;
  title: string;
  content: string;
  updated_at: string;
}

type DropPosition = "before" | "after" | "into";

interface DropInfo {
  targetId: number;
  position: DropPosition;
}

// ── 树节点组件 ─────────────────────────────────────────────────────────────────

interface TreeItemProps {
  node: NoteNode;
  depth: number;
  selectedId: number | null;
  expanded: Set<number>;
  dragId: number | null;
  dropInfo: DropInfo | null;
  onSelect: (id: number) => void;
  onToggleExpand: (id: number) => void;
  onAddChild: (parentId: number) => void;
  onDelete: (id: number, title: string) => void;
  onDragStart: (id: number) => void;
  onDragOver: (e: React.DragEvent, id: number) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function NoteTreeItem({
  node, depth, selectedId, expanded, dragId, dropInfo,
  onSelect, onToggleExpand, onAddChild, onDelete,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: TreeItemProps) {
  const isSelected = selectedId === node.id;
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const isDragging = dragId === node.id;
  const drop = dropInfo?.targetId === node.id ? dropInfo.position : null;

  return (
    <div>
      <div
        draggable
        onDragStart={() => onDragStart(node.id)}
        onDragOver={(e) => onDragOver(e, node.id)}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        style={{ paddingLeft: depth * 14 + 4 }}
        className={[
          "flex items-center gap-0.5 group py-0.5 pr-1 rounded-md cursor-pointer select-none",
          isDragging ? "opacity-40" : "",
          drop === "into" ? "bg-blue-100 ring-1 ring-blue-400" :
            isSelected ? "bg-blue-50 text-blue-700" : "hover:bg-gray-100 text-gray-700",
          drop === "before" ? "border-t-2 border-blue-500" : "",
          drop === "after" ? "border-b-2 border-blue-500" : "",
        ].join(" ")}
      >
        {/* 展开/折叠按钮 */}
        <button
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0 text-xs"
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggleExpand(node.id); }}
        >
          {hasChildren ? (isExpanded ? "▼" : "▶") : ""}
        </button>
        {/* 拖拽手柄 */}
        <span className="opacity-0 group-hover:opacity-100 text-gray-300 cursor-grab text-xs shrink-0 select-none">⠿</span>
        {/* 标题 */}
        <span
          className="flex-1 text-sm truncate py-1"
          onClick={() => onSelect(node.id)}
        >
          📄 {node.title || "未命名页面"}
        </span>
        {/* Hover 操作按钮 */}
        <button
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 text-sm shrink-0"
          onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
          title="新建子页面"
        >+</button>
        <button
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 text-sm shrink-0"
          onClick={(e) => { e.stopPropagation(); onDelete(node.id, node.title); }}
          title="删除"
        >×</button>
      </div>
      {/* 子节点 */}
      {isExpanded && node.children.map((child) => (
        <NoteTreeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expanded={expanded}
          dragId={dragId}
          dropInfo={dropInfo}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
          onAddChild={onAddChild}
          onDelete={onDelete}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
}

// ── 树查找辅助 ────────────────────────────────────────────────────────────────

function findNodeInfo(
  nodes: NoteNode[],
  id: number,
  parentId: number | null,
): { node: NoteNode; parentId: number | null } | null {
  for (const n of nodes) {
    if (n.id === id) return { node: n, parentId };
    const found = findNodeInfo(n.children, id, n.id);
    if (found) return found;
  }
  return null;
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function NotesPage() {
  const [tree, setTree] = useState<NoteNode[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [dirty, setDirty] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [treeLoading, setTreeLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const noteRef = useRef<NoteDetail | null>(null);

  // 拖拽状态
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropInfo, setDropInfo] = useState<DropInfo | null>(null);
  const dragIdRef = useRef<number | null>(null);
  const dropInfoRef = useRef<DropInfo | null>(null);

  // 同步 dirty/note 到 ref（避免 Ctrl+S effect 闭包过期）
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { noteRef.current = note; }, [note]);
  useEffect(() => { dragIdRef.current = dragId; }, [dragId]);
  useEffect(() => { dropInfoRef.current = dropInfo; }, [dropInfo]);

  // 加载树
  const loadTree = useCallback(async (silent = false) => {
    if (!silent) setTreeLoading(true);
    try {
      const data = await notesApi.tree();
      setTree(data);
    } catch {
      toast.error("加载笔记列表失败");
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => { loadTree(); }, [loadTree]);

  // 保存（用 ref 避免闭包问题）
  const handleSave = useCallback(async (silent = false) => {
    const n = noteRef.current;
    if (!n || !dirtyRef.current) return;
    setSaving(true);
    try {
      await notesApi.update(n.id, { title: n.title, content: n.content });
      setDirty(false);
      if (!silent) toast.success("已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }, []);

  // Ctrl+S
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  // 选中笔记
  async function handleSelect(id: number) {
    if (dirtyRef.current) await handleSave(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSelectedId(id);
    setDirty(false);
    setContentLoading(true);
    try {
      const data = await notesApi.get(id);
      setNote(data);
    } catch {
      toast.error("加载笔记内容失败");
    } finally {
      setContentLoading(false);
    }
  }

  // 折叠/展开
  function handleToggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // 新建根笔记
  async function handleAddRoot() {
    try {
      const created = await notesApi.create({ title: "未命名页面" });
      await loadTree(true);
      await handleSelect(created.id);
    } catch {
      toast.error("创建失败");
    }
  }

  // 新建子页面
  async function handleAddChild(parentId: number) {
    try {
      const created = await notesApi.create({ title: "未命名页面", parent_id: parentId });
      setExpanded((prev) => new Set([...prev, parentId]));
      await loadTree(true);
      await handleSelect(created.id);
    } catch {
      toast.error("创建子页面失败");
    }
  }

  // 删除笔记
  async function handleDelete(id: number, title: string) {
    if (!window.confirm(`删除「${title || "未命名页面"}」及其所有子页面？此操作不可恢复。`)) return;
    try {
      await notesApi.delete(id);
      if (selectedId === id) { setSelectedId(null); setNote(null); setDirty(false); }
      await loadTree(true);
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  }

  // 标题失焦自动保存
  async function handleTitleBlur() {
    if (dirtyRef.current) await handleSave(true);
  }

  // ── 拖拽处理 ──────────────────────────────────────────────────────────────

  function handleDragStart(id: number) {
    setDragId(id);
  }

  function handleDragOver(e: React.DragEvent, targetId: number) {
    e.preventDefault();
    const currentDragId = dragIdRef.current;
    if (currentDragId === null || currentDragId === targetId) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;

    let position: DropPosition;
    if (ratio < 0.25) position = "before";
    else if (ratio > 0.75) position = "after";
    else position = "into";

    const info = dropInfoRef.current;
    if (info?.targetId !== targetId || info?.position !== position) {
      setDropInfo({ targetId, position });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = dragIdRef.current;
    const info = dropInfoRef.current;
    if (id === null || info === null) return;
    handleMove(id, info.targetId, info.position);
    setDragId(null);
    setDropInfo(null);
  }

  function handleDragEnd() {
    setDragId(null);
    setDropInfo(null);
  }

  async function handleMove(draggedId: number, targetId: number, position: DropPosition) {
    const targetInfo = findNodeInfo(tree, targetId, null);
    if (!targetInfo) return;

    let newParentId: number | null;
    let newOrder: number;

    if (position === "into") {
      newParentId = targetId;
      newOrder = targetInfo.node.children.length;
    } else if (position === "before") {
      newParentId = targetInfo.parentId;
      newOrder = targetInfo.node.order;
    } else {
      newParentId = targetInfo.parentId;
      newOrder = targetInfo.node.order + 1;
    }

    try {
      await notesApi.move(draggedId, { parent_id: newParentId, order: newOrder });
      await loadTree(true);
      if (position === "into") {
        setExpanded((prev) => new Set([...prev, targetId]));
      }
    } catch {
      toast.error("移动失败");
    }
  }

  return (
    <div className="flex h-full">
      {/* ── 左侧树 ── */}
      <aside className="w-56 border-r bg-white flex flex-col shrink-0">
        <div className="p-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-sm text-gray-700">学习笔记</h2>
          <button
            onClick={handleAddRoot}
            className="text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded px-1.5 py-0.5 transition-colors"
            title="新建页面"
          >
            + 新建
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto p-1.5"
          onDragOver={(e) => e.preventDefault()}
        >
          {treeLoading ? (
            <div className="px-3 py-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : tree.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-4">还没有笔记</p>
          ) : (
            tree.map((node) => (
              <NoteTreeItem
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                expanded={expanded}
                dragId={dragId}
                dropInfo={dropInfo}
                onSelect={handleSelect}
                onToggleExpand={handleToggleExpand}
                onAddChild={handleAddChild}
                onDelete={handleDelete}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              />
            ))
          )}
        </div>

      </aside>

      {/* ── 右侧编辑区 ── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white">
        {!note && !contentLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-5xl mb-4">📝</p>
              <p className="text-sm">选择左侧笔记开始阅读，或点击&quot;+ 新建页面&quot;</p>
            </div>
          </div>
        ) : contentLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-400">加载中...</p>
          </div>
        ) : note && (
          <>
            {/* 标题栏 */}
            <div className="border-b px-10 py-5">
              <input
                className="w-full text-2xl font-bold outline-none text-gray-800 placeholder-gray-300 bg-transparent"
                value={note.title}
                placeholder="页面标题"
                onChange={(e) => {
                  setNote((n) => n ? { ...n, title: e.target.value } : n);
                  setDirty(true);
                }}
                onBlur={handleTitleBlur}
              />
            </div>

            {/* 内容区：TipTap WYSIWYG 编辑器 */}
            <div className="flex-1 overflow-y-auto px-10 py-6">
              <TipTapEditor
                key={note.id}
                content={note.content}
                onChange={(markdown) => {
                  setNote((n) => n ? { ...n, content: markdown } : n);
                  setDirty(true);
                  // 自动保存：1 秒无操作后触发
                  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = setTimeout(() => handleSave(true), 1000);
                }}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

interface Props {
  content: string;
  onChange: (markdown: string) => void;
}

const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.78;

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas error")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function copyImageToClipboard(src: string) {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const type = blob.type.startsWith("image/") ? blob.type : "image/png";
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
    toast.success("图片已复制到剪贴板");
  } catch {
    toast.error("复制失败，请尝试右键另存为");
  }
}

export default function TipTapEditor({ content, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ allowBase64: true }),
      Markdown.configure({ transformPastedText: true }),
      Placeholder.configure({ placeholder: "用 Markdown 写点什么…" }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "tiptap-editor outline-none min-h-[400px] text-gray-800",
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (!file) continue;
            compressImage(file).then((dataUrl) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const node = (view.state.schema.nodes as any).image?.create({ src: dataUrl });
              if (node) view.dispatch(view.state.tr.replaceSelectionWith(node));
            }).catch(() => toast.error("图片压缩失败"));
            return true;
          }
        }
        return false;
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (!imgs.length) return false;
        event.preventDefault();
        for (const file of imgs) {
          compressImage(file).then((dataUrl) => {
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const node = (view.state.schema.nodes as any).image?.create({ src: dataUrl });
            if (node && pos) view.dispatch(view.state.tr.insert(pos.pos, node));
          }).catch(() => toast.error("图片压缩失败"));
        }
        return true;
      },
    },
    onUpdate({ editor }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChange((editor.storage as any).markdown.getMarkdown());
    },
  });

  // key={noteId} 已处理切换笔记的场景，此 effect 仅作兜底
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (editor.storage as any).markdown.getMarkdown();
    if (current !== content) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  function handleInsertImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    e.target.value = "";
    compressImage(file).then((dataUrl) => {
      editor.chain().focus().setImage({ src: dataUrl }).run();
    }).catch(() => toast.error("图片压缩失败"));
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      copyImageToClipboard((target as HTMLImageElement).src);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded px-2 py-1 border border-gray-200 transition-colors"
        >
          🖼 插入图片
        </button>
        <span className="text-xs text-gray-300">支持粘贴 / 拖拽 · 点击图片可复制到剪贴板</span>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleInsertImage} />
      </div>
      <div onClick={handleClick}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

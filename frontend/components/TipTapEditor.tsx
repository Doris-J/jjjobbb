"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useEffect } from "react";

interface Props {
  content: string;
  onChange: (markdown: string) => void;
}

export default function TipTapEditor({ content, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ transformPastedText: true }),
      Placeholder.configure({ placeholder: "用 Markdown 写点什么…" }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "tiptap-editor outline-none min-h-[400px] text-gray-800",
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

  return <EditorContent editor={editor} />;
}

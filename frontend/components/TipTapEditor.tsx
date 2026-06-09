"use client";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

interface Props {
  content: string;
  onChange: (json: string) => void;
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
      if (!ctx) {
        reject(new Error("canvas error"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function TipTapEditor({ content, onChange }: Props) {
  const onChangeRef = useRef(onChange);

  let initialContent;
  try {
    initialContent = content ? JSON.parse(content) : undefined;
  } catch {
    initialContent = undefined;
  }

  const editor = useCreateBlockNote({
    initialContent,
    uploadFile: async (file: File) => {
      try {
        const dataUrl = await compressImage(file);
        return dataUrl;
      } catch {
        toast.error("图片压缩失败");
        throw new Error("图片压缩失败");
      }
    },
  });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  return (
    <div className="blocknote-wrapper">
      <BlockNoteView
        editor={editor}
        onChange={() => {
          onChangeRef.current(JSON.stringify(editor.document));
        }}
        slashMenu={true}
      />
    </div>
  );
}

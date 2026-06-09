"use client";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  createCodeBlockSpec,
  BlockNoteEditor,
} from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useRef, useState, useMemo } from "react";
import { toast } from "sonner";
import mermaid from "mermaid";

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

// ── Mermaid Block Component ──
interface MermaidBlockType {
  type: "mermaid";
  props: { source: string };
  content: never[];
}

function MermaidView({
  block,
  editor,
}: {
  block: MermaidBlockType;
  editor: BlockNoteEditor;
}) {
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [source, setSource] = useState(block.props.source);

  // 初始化 mermaid（仅一次）
  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: "default" });
  }, []);

  // 渲染 Mermaid 图表
  useEffect(() => {
    if (!editor.isEditable) {
      const render = async () => {
        try {
          const { svg } = await mermaid.render(
            "mermaid-" + Math.random(),
            source
          );
          setSvgHtml(svg);
          setError("");
        } catch (err) {
          setError(
            `Mermaid 渲染失败: ${err instanceof Error ? err.message : String(err)}`
          );
          setSvgHtml("");
        }
      };
      render();
    }
  }, [source, editor.isEditable]);

  const handleSourceChange = (newSource: string) => {
    setSource(newSource);
    editor.updateBlock(block, { props: { source: newSource } });
  };

  return (
    <div className="mermaid-container my-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
      {editor.isEditable ? (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600">
            Mermaid 源代码
          </label>
          <textarea
            value={source}
            onChange={(e) => handleSourceChange(e.target.value)}
            className="w-full h-32 p-2 text-sm font-mono border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="输入 Mermaid 语法..."
          />
          <div className="text-xs text-gray-500">
            支持：flowchart, sequence, gantt, class, state 等 Mermaid 语法
          </div>
        </div>
      ) : (
        <div className="mermaid-preview">
          {error ? (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          ) : (
            <div
              dangerouslySetInnerHTML={{ __html: svgHtml }}
              className="flex justify-center"
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function TipTapEditor({ content, onChange }: Props) {
  const onChangeRef = useRef(onChange);

  // 安全解析初始内容
  let initialContent;
  try {
    initialContent = content ? JSON.parse(content) : undefined;
  } catch {
    initialContent = undefined;
  }

  // 在客户端创建 schema
  const schema = useMemo(() => {
    const codeBlock = createCodeBlockSpec({
      defaultLanguage: "text",
      supportedLanguages: {
        text: { name: "Plain Text" },
        javascript: { name: "JavaScript", aliases: ["js"] },
        typescript: { name: "TypeScript", aliases: ["ts"] },
        java: { name: "Java" },
        kotlin: { name: "Kotlin", aliases: ["kt"] },
        python: { name: "Python", aliases: ["py"] },
        shell: { name: "Shell", aliases: ["bash", "sh"] },
        sql: { name: "SQL" },
        html: { name: "HTML" },
        css: { name: "CSS" },
        json: { name: "JSON" },
        xml: { name: "XML" },
        yaml: { name: "YAML", aliases: ["yml"] },
        markdown: { name: "Markdown", aliases: ["md"] },
      },
    });

    const MermaidBlockSpec = createReactBlockSpec(
      {
        type: "mermaid" as const,
        propSchema: { source: { default: "flowchart TD\n    A --> B" } },
        content: "none",
      },
      {
        render: ({ block, editor }) => (
          <MermaidView block={block as MermaidBlockType} editor={editor} />
        ),
      }
    );

    return BlockNoteSchema.create({
      blockSpecs: {
        ...defaultBlockSpecs,
        codeBlock,
        mermaid: MermaidBlockSpec,
      },
    });
  }, []);

  const editor = useCreateBlockNote({
    schema,
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

  // 保持 onChange 引用最新
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

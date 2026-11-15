import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { useGetDocByIdQuery, useUpdateDocMutation } from "@/infrastructure/api/docsApi";
import type { DocDto } from "@/core/interfaces/docs";
import { workspaceSchema } from "@/presentation/components/BlockNote/useBlockNoteEditor";
import "@/presentation/components/BlockNote/code-block-affine.css";
import { EmbeddedFrameChrome } from "./EmbeddedFrameChrome";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import { codeBlockOptions } from "@blocknote/code-block";
import "./EmbeddedDocFrame.scss";

const AUTOSAVE_DEBOUNCE_MS = 1500;
const MIN_BODY_HEIGHT = 120;

interface EmbeddedDocFrameProps {
  docId: number;
  elementId: string;
  isCollapsed: boolean;
  width: number;
  onContentHeightChange: (height: number) => void;
  strokeColor?: string;
  backgroundColor?: string;
  opacity?: number;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roundness?: unknown | null;
}

export function EmbeddedDocFrame({
  docId,
  elementId,
  isCollapsed,
  width,
  onContentHeightChange,
  strokeColor,
  backgroundColor,
  opacity,
  strokeWidth,
  strokeStyle,
  roundness,
}: EmbeddedDocFrameProps) {
  const { data: doc, isLoading } = useGetDocByIdQuery(docId);

  if (isLoading || !doc) {
    return (
      <EmbeddedFrameChrome
        isCollapsed={isCollapsed}
        title={doc?.title || "Untitled"}
        strokeColor={strokeColor}
        backgroundColor={backgroundColor}
        opacity={opacity}
        strokeWidth={strokeWidth}
        strokeStyle={strokeStyle}
        roundness={roundness}
      >
        <div className="embedded-doc-frame embedded-doc-frame--loading">
          <Loading size="sm" />
        </div>
      </EmbeddedFrameChrome>
    );
  }

  return (
    <EmbeddedDocFrameBody
      key={doc.id}
      doc={doc}
      elementId={elementId}
      isCollapsed={isCollapsed}
      width={width}
      onContentHeightChange={onContentHeightChange}
      strokeColor={strokeColor}
      backgroundColor={backgroundColor}
      opacity={opacity}
      strokeWidth={strokeWidth}
      strokeStyle={strokeStyle}
      roundness={roundness}
    />
  );
}

interface EmbeddedDocFrameBodyProps {
  doc: DocDto;
  elementId: string;
  isCollapsed: boolean;
  width: number;
  onContentHeightChange: (height: number) => void;
  strokeColor?: string;
  backgroundColor?: string;
  opacity?: number;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roundness?: unknown | null;
}

function EmbeddedDocFrameBody({
  doc,
  elementId: _elementId,
  isCollapsed,
  width,
  onContentHeightChange,
  strokeColor,
  backgroundColor,
  opacity,
  strokeWidth,
  strokeStyle,
  roundness,
}: EmbeddedDocFrameBodyProps) {
  const [updateDoc] = useUpdateDocMutation();

  const initialBlocks = parseDocBlocks(doc.content ?? null);

  const editor = useCreateBlockNote({
    schema: workspaceSchema,
    initialContent: initialBlocks.length > 0 ? (initialBlocks as any) : undefined,
    codeBlock: codeBlockOptions,
  } as any) as any;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const save = useCallback(() => {
    const current = docRef.current;
    const blocks = (editor as any).document;
    updateDoc({
      id: current.id,
      body: {
        title: current.title,
        content: JSON.stringify(blocks),
        plainText: null,
        metadata: current.metadata,
        lastSync: new Date().toISOString(),
        status: current.status,
      },
    });
  }, [editor, updateDoc]);

  useEffect(() => {
    const unsub = (editor as any).onChange(() => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
    });
    return () => {
      unsub?.();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [editor, save]);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const lastReportedHeightRef = useRef<number>(0);
  const onContentHeightChangeRef = useRef(onContentHeightChange);
  onContentHeightChangeRef.current = onContentHeightChange;

  const measure = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measured = Math.max(MIN_BODY_HEIGHT, el.scrollHeight);
    const total = Math.ceil(measured);
    if (Math.abs(total - lastReportedHeightRef.current) < 2) return;
    lastReportedHeightRef.current = total;
    onContentHeightChangeRef.current(total);
  }, []);

  useLayoutEffect(() => {
    if (isCollapsed) return;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(measure);
      (raf1 as any)._next = raf2;
    });
    return () => {
      cancelAnimationFrame(raf1);
      const next = (raf1 as any)._next;
      if (next != null) cancelAnimationFrame(next);
    };
  }, [isCollapsed, doc.id, width, measure]);

  useEffect(() => {
    if (isCollapsed) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = (editor as any).onChange(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => requestAnimationFrame(measure), 100);
    });
    return () => {
      unsub?.();
      if (timer) clearTimeout(timer);
    };
  }, [editor, isCollapsed, measure]);

  return (
    <EmbeddedFrameChrome
      isCollapsed={isCollapsed}
      title={doc.title || "Untitled"}
      strokeColor={strokeColor}
      backgroundColor={backgroundColor}
      opacity={opacity}
      strokeWidth={strokeWidth}
      strokeStyle={strokeStyle}
      roundness={roundness}
    >
      <div className="embedded-doc-frame" ref={bodyRef}>
        <BlockNoteView editor={editor} editable theme="light" spellCheck={false} />
      </div>
    </EmbeddedFrameChrome>
  );
}

function parseDocBlocks(content: string | null): unknown[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

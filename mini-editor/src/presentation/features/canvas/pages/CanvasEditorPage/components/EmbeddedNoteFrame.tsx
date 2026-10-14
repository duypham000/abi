import { useCallback, useEffect, useRef } from "react";
import { useGetNoteByIdQuery, useUpdateNoteMutation } from "@/infrastructure/api/notesApi";
import { EmbeddedFrameChrome } from "./EmbeddedFrameChrome";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import "./EmbeddedNoteFrame.scss";

const AUTOSAVE_DEBOUNCE_MS = 1000;

interface EmbeddedNoteFrameProps {
  noteId: number;
  strokeColor?: string;
  backgroundColor?: string;
  opacity?: number;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roundness?: unknown | null;
}

export function EmbeddedNoteFrame({
  noteId,
  strokeColor,
  backgroundColor,
  opacity,
  strokeWidth,
  strokeStyle,
  roundness,
}: EmbeddedNoteFrameProps) {
  const { data: note, isLoading } = useGetNoteByIdQuery(noteId);
  const [updateNote] = useUpdateNoteMutation();

  const contentRef = useRef<string>(note?.content ?? "");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    if (note?.content != null) {
      contentRef.current = note.content;
    }
  }, [note?.id]);

  const save = useCallback(() => {
    const current = noteRef.current;
    if (!current) return;
    updateNote({
      id: noteId,
      body: {
        title: current.title,
        content: contentRef.current,
        metadata: current.metadata,
        lastSync: new Date().toISOString(),
        status: current.status,
      },
    });
  }, [noteId, updateNote]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      contentRef.current = e.target.value;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
    },
    [save]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="embedded-note-frame embedded-note-frame--loading">
        <Loading size="sm" />
      </div>
    );
  }

  return (
    <EmbeddedFrameChrome
      strokeColor={strokeColor}
      backgroundColor={backgroundColor}
      opacity={opacity}
      strokeWidth={strokeWidth}
      strokeStyle={strokeStyle}
      roundness={roundness}
    >
      <div className="embedded-note-frame">
        <div className="embedded-note-frame__title">{note?.title || "Note"}</div>
        <textarea
          className="embedded-note-frame__textarea"
          defaultValue={note?.content ?? ""}
          onChange={handleChange}
          placeholder="Write your note…"
        />
      </div>
    </EmbeddedFrameChrome>
  );
}

export type HitlFieldType =
  | 'checkbox_group'
  | 'select'
  | 'multi_select'
  | 'radio_group'
  | 'textarea'
  | 'text_input'
  | 'number_input'
  | 'slider'
  | 'tags_input'
  | 'confirm'; // bare yes/no, no extra fields

export interface HitlOption {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface HitlField {
  key: string;
  type: HitlFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: HitlOption[];       // checkbox_group | select | multi_select | radio_group
  min?: number;                 // number_input | slider
  max?: number;
  step?: number;                // slider
  marks?: Record<number, string>; // slider labels
  rows?: number;                // textarea
  defaultValue?: any;
}

export interface HitlRequest {
  thread_id: string;
  reason: string;               // short human-readable action description
  preview?: string;             // raw text/code to display in a preview box
  previewLanguage?: string;     // e.g. 'json', 'markdown', 'python' — for syntax hint
  fields?: HitlField[];
}

export type HitlValues = Record<string, any>;

export interface HitlSubmission {
  approved: boolean;
  feedback?: string;
  values?: HitlValues;
}

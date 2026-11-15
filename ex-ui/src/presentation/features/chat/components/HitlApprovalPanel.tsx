import React, { useState } from 'react';
import {
  Button, Checkbox, Select, Radio, Input, InputNumber, Slider,
  Form, Typography, Collapse, Tag, Avatar,
} from 'antd';
import {
  CheckCircleFilled, CloseCircleFilled, CaretRightOutlined, CheckOutlined,
  SettingOutlined, CodeOutlined, UserOutlined, NodeIndexOutlined,
} from '@ant-design/icons';
import type { HitlRequest, HitlField, HitlSubmission, HitlValues } from '../types/hitl';

const { Text } = Typography;

interface HitlApprovalPanelProps {
  request: HitlRequest;
  onSubmit?: (submission: HitlSubmission) => void;
}

type Status = 'pending' | 'approved' | 'rejected';

const THEME: Record<Status, { border: string; bg: string; bar: string }> = {
  pending:  { border: '#d4d4d8', bg: '#ffffff', bar: '#f59e0b' },
  approved: { border: '#86efac', bg: '#f0fdf4', bar: '#16a34a' },
  rejected: { border: '#fca5a5', bg: '#fef2f2', bar: '#ef4444' },
};

export const HitlApprovalPanel: React.FC<HitlApprovalPanelProps> = ({ request, onSubmit }) => {
  const [form] = Form.useForm<HitlValues>();
  const [status, setStatus] = useState<Status>('pending');
  const [snapshot, setSnapshot] = useState<HitlValues | null>(null);

  const takeSnapshot = (): HitlValues => form.getFieldsValue(true) as HitlValues;

  const handleApprove = async () => {
    try {
      await form.validateFields();
      const values = takeSnapshot();
      setSnapshot(values);
      setStatus('approved');
      onSubmit?.({ approved: true, values });
    } catch { /* validation errors shown inline */ }
  };

  const handleReject = () => {
    setSnapshot(takeSnapshot());
    setStatus('rejected');
    onSubmit?.({ approved: false });
  };

  const done = status !== 'pending';
  const th = THEME[status];
  const requiredCount = request.fields?.filter((f) => f.required).length ?? 0;

  const collapseItems = [];

  if (request.preview) {
    collapseItems.push({
      key: 'preview',
      label: <span style={S.clabel}><CodeOutlined />Nội dung</span>,
      children: <pre style={S.pre}><code>{request.preview}</code></pre>,
    });
  }

  if (request.fields?.length) {
    collapseItems.push({
      key: 'fields',
      label: (
        <span style={S.clabel}>
          <SettingOutlined />
          {done
            ? (status === 'approved' ? 'Thiết lập đã xác nhận' : 'Thiết lập khi từ chối')
            : `Thiết lập${requiredCount > 0 ? ` · ${requiredCount} bắt buộc` : ''}`
          }
        </span>
      ),
      children: done && snapshot
        ? <ReadOnlySummary fields={request.fields} values={snapshot} />
        : <HitlFieldsForm form={form} fields={request.fields} />,
    });
  }

  return (
    <div style={{ ...S.wrap, borderColor: th.border, background: th.bg }}>
      <div style={{ ...S.bar, background: th.bar }} />

      <div style={S.inner}>
        <div style={S.row}>
          <NodeIndexOutlined style={{ color: th.bar, fontSize: 12, flexShrink: 0, marginTop: 2 }} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <Text style={S.reason}>{request.reason}</Text>
          </div>

          {done ? (
            <span style={S.badge(status)}>
              {status === 'approved'
                ? <><CheckCircleFilled style={{ fontSize: 11 }} /> Đã xác nhận</>
                : <><CloseCircleFilled style={{ fontSize: 11 }} /> Đã từ chối</>
              }
            </span>
          ) : (
            <div style={S.btnGroup}>
              <Button
                size="small" type="text" danger onClick={handleReject}
                style={{ fontSize: 11.5, height: 24, paddingInline: 8, color: '#71717a', border: '1px solid #e4e4e7' }}
              >
                Từ chối
              </Button>
              <Button
                size="small" type="primary" onClick={handleApprove}
                style={{ fontSize: 11.5, height: 24, paddingInline: 10, background: '#16a34a', borderColor: '#16a34a' }}
              >
                Xác nhận →
              </Button>
            </div>
          )}
        </div>

        {collapseItems.length > 0 && (
          <Collapse
            ghost size="small"
            expandIcon={({ isActive }) => (
              <CaretRightOutlined rotate={isActive ? 90 : 0} style={{ fontSize: 9, color: '#a1a1aa' }} />
            )}
            style={{ marginTop: 1 }}
            items={collapseItems}
          />
        )}
      </div>
    </div>
  );
};

/* ─── editable form ─── */

interface HitlFieldsFormProps {
  form: ReturnType<typeof Form.useForm<HitlValues>>[0];
  fields: HitlField[];
}

const HitlFieldsForm: React.FC<HitlFieldsFormProps> = ({ form, fields }) => (
  <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 2 }}>
    {fields.map((field) => (
      <Form.Item
        key={field.key}
        name={field.key}
        label={
          <span style={{ fontSize: 11.5, color: '#71717a', fontWeight: 400 }}>
            {field.label}
            {field.required && <span style={{ marginLeft: 3, color: '#ef4444', fontSize: 10 }}>*</span>}
          </span>
        }
        help={field.description && (
          <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.4 }}>{field.description}</Text>
        )}
        rules={field.required ? [{ required: true, message: `${field.label} là bắt buộc` }] : []}
        initialValue={field.defaultValue}
        style={{ marginBottom: 9 }}
      >
        <FieldInput field={field} />
      </Form.Item>
    ))}
  </Form>
);

/* ─── read-only parameter summary ─── */

const ReadOnlySummary: React.FC<{ fields: HitlField[]; values: HitlValues }> = ({ fields, values }) => (
  <div style={S.summaryGrid}>
    {fields.map((field) => {
      const val = values[field.key];
      const empty = val === undefined || val === null || val === '' ||
        (Array.isArray(val) && val.length === 0);
      return (
        <React.Fragment key={field.key}>
          <Text style={S.summaryLabel}>{field.label}</Text>
          <div>
            {empty
              ? <Text style={{ fontSize: 11.5, color: '#a1a1aa', fontStyle: 'italic' }}>—</Text>
              : <SummaryValue field={field} value={val} />
            }
          </div>
        </React.Fragment>
      );
    })}
  </div>
);

const SummaryValue: React.FC<{ field: HitlField; value: any }> = ({ field, value }) => {
  const textStyle = { fontSize: 12, color: '#3f3f46' } as React.CSSProperties;

  switch (field.type) {
    case 'checkbox_group': {
      const labels = (Array.isArray(value) ? value : []).map(
        (v: string) => field.options?.find((o) => o.value === v)?.label ?? v
      );
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {labels.map((l: string) => (
            <Tag key={l} icon={<CheckOutlined style={{ fontSize: 9 }} />}
              style={{ fontSize: 11, margin: 0, padding: '0 6px', lineHeight: '20px' }}>
              {l}
            </Tag>
          ))}
        </div>
      );
    }
    case 'radio_group':
    case 'select': {
      const label = field.options?.find((o) => o.value === value)?.label ?? value;
      return <Text style={textStyle}>{label}</Text>;
    }
    case 'multi_select': {
      const vals: string[] = Array.isArray(value) ? value : [];
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {vals.map((v) => (
            <Tag key={v} style={{ fontSize: 11, margin: 0, padding: '0 6px', lineHeight: '20px' }}>
              {field.options?.find((o) => o.value === v)?.label ?? v}
            </Tag>
          ))}
        </div>
      );
    }
    case 'tags_input': {
      const tags: string[] = Array.isArray(value) ? value : [];
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {tags.map((t) => (
            <Tag key={t} style={{ fontSize: 11, margin: 0, padding: '0 6px', lineHeight: '20px', background: '#f4f4f5', border: '1px solid #e4e4e7' }}>
              {t}
            </Tag>
          ))}
        </div>
      );
    }
    case 'textarea':
    case 'text_input':
      return <Text style={{ ...textStyle, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{value}</Text>;
    case 'number_input':
      return <Text style={{ ...textStyle, fontVariantNumeric: 'tabular-nums' }}>{value}</Text>;
    case 'slider':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={S.sliderTrack}>
            <div style={S.sliderFill(value, field.min ?? 0, field.max ?? 100)} />
          </div>
          <Text style={{ ...textStyle, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</Text>
        </div>
      );
    default:
      return <Text style={textStyle}>{String(value)}</Text>;
  }
};

/* ─── editable field controls ─── */

const FieldInput: React.FC<{ field: HitlField }> = ({ field }) => {
  switch (field.type) {
    case 'checkbox_group':
      return (
        <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {field.options?.map((opt) => (
            <Checkbox key={opt.value} value={opt.value} disabled={opt.disabled}>
              <span style={{ fontSize: 12, color: '#3f3f46' }}>{opt.label}</span>
              {opt.description && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginLeft: 1 }}>
                  {opt.description}
                </Text>
              )}
            </Checkbox>
          ))}
        </Checkbox.Group>
      );
    case 'radio_group':
      return (
        <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {field.options?.map((opt) => (
            <Radio key={opt.value} value={opt.value} disabled={opt.disabled}>
              <span style={{ fontSize: 12, color: '#3f3f46' }}>{opt.label}</span>
              {opt.description && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginLeft: 1 }}>
                  {opt.description}
                </Text>
              )}
            </Radio>
          ))}
        </Radio.Group>
      );
    case 'select':
      return (
        <Select size="small" placeholder={field.placeholder ?? 'Chọn...'} style={{ width: '100%' }}
          options={field.options?.map((o) => ({ label: o.label, value: o.value, disabled: o.disabled }))} />
      );
    case 'multi_select':
      return (
        <Select size="small" mode="multiple" placeholder={field.placeholder ?? 'Chọn...'} style={{ width: '100%' }}
          options={field.options?.map((o) => ({ label: o.label, value: o.value, disabled: o.disabled }))} />
      );
    case 'tags_input':
      return (
        <Select size="small" mode="tags" placeholder={field.placeholder ?? 'Nhập và Enter...'}
          style={{ width: '100%' }} tokenSeparators={[',']} />
      );
    case 'textarea':
      return (
        <Input.TextArea placeholder={field.placeholder}
          autoSize={{ minRows: field.rows ?? 3, maxRows: 8 }} style={{ fontSize: 12 }} />
      );
    case 'text_input':
      return <Input size="small" placeholder={field.placeholder} style={{ fontSize: 12 }} />;
    case 'number_input':
      return (
        <InputNumber size="small" min={field.min} max={field.max}
          placeholder={field.placeholder} style={{ width: '100%' }} />
      );
    case 'slider':
      return (
        <div style={{ padding: '0 4px' }}>
          <Slider min={field.min ?? 0} max={field.max ?? 100}
            step={field.step ?? 1} marks={field.marks} />
        </div>
      );
    default:
      return <Input size="small" placeholder={field.placeholder} />;
  }
};

/* ─── confirmation bubble — rendered in chat after submit ─── */

export const HitlConfirmationBubble: React.FC<{
  request: HitlRequest;
  submission: HitlSubmission;
}> = ({ request, submission }) => {
  const ok = submission.approved;
  const bar    = ok ? '#16a34a' : '#ef4444';
  const bg     = ok ? '#f0fdf4' : '#fef2f2';
  const border = ok ? '#86efac' : '#fca5a5';
  const label  = ok ? '#14532d' : '#7f1d1d';

  const collapseItems = ok && submission.values && request.fields?.length
    ? [{
        key: 'detail',
        label: <span style={S.clabel}><SettingOutlined />Thiết lập đã xác nhận</span>,
        children: <ReadOnlySummary fields={request.fields} values={submission.values} />,
      }]
    : [];

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'flex-end' }}>
      <div style={{
        flex: '0 1 460px', minWidth: 0, border: `1px solid ${border}`,
        borderRadius: 8, background: bg, overflow: 'hidden', display: 'flex',
      }}>
        <div style={{ width: 3, flexShrink: 0, background: bar }} />
        <div style={{ flex: 1, padding: '8px 10px 6px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ fontSize: 11.5, fontWeight: 600, color: label, flexShrink: 0 }}>
              {ok ? 'Đã xác nhận' : 'Đã từ chối'}
            </Text>
            <Text style={{
              fontSize: 11.5, color: '#71717a', flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {request.reason}
            </Text>
          </div>
          {collapseItems.length > 0 && (
            <Collapse ghost size="small"
              expandIcon={({ isActive }) => (
                <CaretRightOutlined rotate={isActive ? 90 : 0} style={{ fontSize: 9, color: '#a1a1aa' }} />
              )}
              style={{ marginTop: 1 }}
              items={collapseItems}
            />
          )}
        </div>
      </div>
      <Avatar style={{ backgroundColor: '#a3e635', color: '#3f3f46', flexShrink: 0 }} icon={<UserOutlined />} />
    </div>
  );
};

/* ─── styles ─── */

const S = {
  wrap: {
    display: 'flex',
    border: '1px solid',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    transition: 'border-color 0.2s, background 0.2s',
  } as React.CSSProperties,

  bar: {
    width: 3,
    flexShrink: 0,
    transition: 'background 0.2s',
  } as React.CSSProperties,

  inner: {
    flex: 1,
    padding: '9px 11px 7px',
    minWidth: 0,
  } as React.CSSProperties,

  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 7,
  } as React.CSSProperties,

  reason: {
    fontSize: 12.5,
    color: '#27272a',
    lineHeight: 1.5,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  btnGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  } as React.CSSProperties,

  badge: (status: Status) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11.5,
    fontWeight: 500,
    flexShrink: 0,
    whiteSpace: 'nowrap' as const,
    color: status === 'approved' ? '#16a34a' : '#ef4444',
    marginTop: 2,
  } as React.CSSProperties),

  clabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: '#a1a1aa',
    fontWeight: 400,
  } as React.CSSProperties,

  pre: {
    background: '#0d1117',
    color: '#c9d1d9',
    borderRadius: 6,
    padding: '10px 12px',
    fontSize: 11.5,
    lineHeight: 1.65,
    overflowX: 'auto' as const,
    maxHeight: 200,
    overflowY: 'auto' as const,
    margin: 0,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
  } as React.CSSProperties,

  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: 14,
    rowGap: 6,
    paddingTop: 2,
    alignItems: 'start',
  } as React.CSSProperties,

  summaryLabel: {
    fontSize: 11,
    color: '#a1a1aa',
    whiteSpace: 'nowrap' as const,
    paddingTop: 3,
    lineHeight: 1.4,
  } as React.CSSProperties,

  sliderTrack: {
    flex: 1,
    height: 3,
    background: '#e4e4e7',
    borderRadius: 2,
    overflow: 'hidden',
  } as React.CSSProperties,

  sliderFill: (val: number, min: number, max: number) => ({
    height: '100%',
    width: `${Math.round(((val - min) / (max - min)) * 100)}%`,
    background: '#3b82f6',
    borderRadius: 2,
  } as React.CSSProperties),
};

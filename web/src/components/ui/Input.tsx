import { Input as AntdInput, InputProps as AntdInputProps } from "antd";
import { PasswordProps } from "antd/es/input";
import { ReactNode } from "react";

interface InputProps extends AntdInputProps {
  isError?: boolean;
}

export function Input({ isError, className = "", ...props }: InputProps) {
  return (
    <AntdInput
      className={`figma-input ${isError ? "error" : ""} ${className}`.trim()}
      {...props}
    />
  );
}

Input.Password = function InputPassword({ isError, className = "", ...props }: PasswordProps & { isError?: boolean }) {
  return (
    <AntdInput.Password
      className={`figma-input ${isError ? "error" : ""} ${className}`.trim()}
      {...props}
    />
  );
};

interface ReadonlyInputProps {
  value: string;
  actionIcon?: ReactNode;
  onActionClick?: () => void;
  actionTitle?: string;
}

export function ReadonlyInput({ value, actionIcon, onActionClick, actionTitle }: ReadonlyInputProps) {
  return (
    <div className="figma-input-readonly">
      <span>{value}</span>
      {actionIcon && (
        <button
          type="button"
          onClick={onActionClick}
          className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 p-1 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded transition-colors"
          title={actionTitle}
        >
          {actionIcon}
        </button>
      )}
    </div>
  );
}

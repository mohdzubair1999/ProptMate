"use client";

export default function ConfirmSubmitButton({
  children,
  confirmMessage,
  className,
  disabled,
}: {
  children: React.ReactNode;
  confirmMessage: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
      className={className}
    >
      {children}
    </button>
  );
}

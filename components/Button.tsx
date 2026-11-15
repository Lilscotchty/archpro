import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: React.ReactNode;
}

// Same button language as the studios: flat, 3px corners, single blue accent.
export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', className = '', icon, ...props }) => {
  const baseStyle = 'inline-flex items-center justify-center px-3 py-1.5 text-xs rounded-[var(--ui-r)] focus-visible:outline outline-2 outline-offset-2 outline-[var(--ui-accent)] disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-[var(--ui-accent)] text-[var(--ui-accentInk)] font-medium hover:brightness-110',
    secondary: 'border border-[var(--ui-rule)] text-[var(--ui-text)] hover:bg-[var(--ui-hover)]',
    danger: 'border border-[var(--ui-danger)] text-[var(--ui-danger)] hover:bg-[color-mix(in_srgb,var(--ui-danger)_10%,transparent)]',
    ghost: 'text-[var(--ui-dim)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-hover)]',
  };
  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </button>
  );
};

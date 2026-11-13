import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: React.ReactNode;
}

// Same button language as the studios: flat, 3px corners, single blue accent.
export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', className = '', icon, ...props }) => {
  const baseStyle = 'inline-flex items-center justify-center px-3 py-1.5 text-xs rounded-[3px] focus-visible:outline outline-2 outline-offset-2 outline-[#4aa3ff] disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-[#4aa3ff] text-[#06121f] font-medium hover:brightness-110',
    secondary: 'border border-[#2e333a] text-[#c9cfd6] hover:bg-white/5',
    danger: 'border border-[#e5484d] text-[#e5484d] hover:bg-[#e5484d]/10',
    ghost: 'text-[#7d8590] hover:text-[#c9cfd6] hover:bg-white/5',
  };
  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </button>
  );
};

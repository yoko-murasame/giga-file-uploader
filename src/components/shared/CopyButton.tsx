import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { Check, Copy } from 'lucide-react';

import { copyToClipboard } from '@/lib/tauri';

interface CopyButtonProps {
  text: string;
  className?: string;
}

function CopyButtonInner({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? '已复制' : '复制链接'}
      className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-border hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${className ?? ''}`}
    >
      {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
    </button>
  );
}

const CopyButton = memo(CopyButtonInner);
export default CopyButton;

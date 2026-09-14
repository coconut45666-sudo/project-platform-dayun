"use client";
import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadToolArchive } from '@/lib/tool-download';
import { toast } from 'sonner';

export default function ToolDownload({ filename, label }: { filename: string; label: string }) {
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => {
    mounted.current = true;
    const cancel = () => controller.current?.abort();
    window.addEventListener('pagehide', cancel);
    window.addEventListener('dayun:logout', cancel);
    return () => {
      mounted.current = false;
      cancel();
      window.removeEventListener('pagehide', cancel);
      window.removeEventListener('dayun:logout', cancel);
    };
  }, []);

  async function download() {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setProgress(0);
    try {
      await downloadToolArchive('/api/assets/' + encodeURIComponent(filename) + '?download=1', filename, {
        signal: active.signal,
        onProgress: ({ downloaded, total }) => {
          if (mounted.current && !active.signal.aborted) setProgress(Math.floor(downloaded / total * 100));
        },
      });
      if (mounted.current) toast.success('工具包已完整接收，正在交给浏览器保存。');
    } catch (error) {
      if (mounted.current) {
        if (active.signal.aborted) toast.info('下载已取消，未保存残缺文件。');
        else toast.error(error instanceof Error ? error.message : '工具包下载失败，请稍后重试。');
      }
    } finally {
      if (controller.current === active) controller.current = null;
      if (mounted.current) setProgress(null);
    }
  }

  return <span className="inline-controls" style={{ display: 'inline-flex', flexWrap: 'wrap' }}>
    <Button type="button" variant="outline" disabled={progress !== null} onClick={download}>
      <Download size={16}/>{label}
    </Button>
    {progress !== null && <>
      <span role="status" aria-live="polite">正在下载 {progress}%</span>
      <Button type="button" variant="ghost" size="sm" onClick={() => controller.current?.abort()}><X size={14}/>取消下载</Button>
    </>}
  </span>;
}

import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function CrawlLogPanel() {
  const { crawlLogs, crawlProgress, crawlStatus, setCrawlStatus, clearCrawlLogs } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [crawlLogs]);

  if (crawlLogs.length === 0 && crawlStatus !== 'running') {
    return null;
  }

  const handleClose = () => {
    clearCrawlLogs();
  };

  // Safe parsing of log line class
  const getLineClass = (line: string) => {
    if (line.startsWith('🚀') || line.startsWith('Tìm thấy') || line.startsWith('Đang khởi động')) return 'info';
    if (line.startsWith('Đang cào')) return 'progress';
    if (line.startsWith('  -') || line.startsWith('  →') || line.startsWith('    ❌')) return 'log';
    if (line.startsWith('🎉') || line.startsWith('Hoàn thành')) return 'done';
    if (line.startsWith('🚨') || line.startsWith('Không tìm thấy')) return 'error';
    return 'log';
  };

  const percentage = crawlProgress
    ? Math.round((crawlProgress.current / crawlProgress.total) * 100)
    : 0;

  return (
    <div className="crawl-log-panel">
      <div className="crawl-log-header">
        <div className="crawl-log-title">
          <span>🕷</span>
          <span>Tiến trình Cào dữ liệu</span>
        </div>
        {crawlStatus !== 'running' && (
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {crawlProgress && (
        <>
          <div className="crawl-progress-bar-container">
            <div className="crawl-progress-bar" style={{ width: `${percentage}%` }} />
          </div>
          <div
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              background: 'var(--color-bg-3)',
              color: 'var(--color-text-secondary)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            {crawlProgress.message} ({percentage}%)
          </div>
        </>
      )}

      <div className="crawl-log-content" ref={scrollRef}>
        {crawlLogs.map((log, idx) => (
          <div key={idx} className={`crawl-log-line ${getLineClass(log)}`}>
            {log}
          </div>
        ))}
        {crawlStatus === 'running' && crawlLogs.length === 0 && (
          <div className="crawl-log-line info">⏳ Đang kết nối tới máy chủ thu thập dữ liệu...</div>
        )}
      </div>
    </div>
  );
}

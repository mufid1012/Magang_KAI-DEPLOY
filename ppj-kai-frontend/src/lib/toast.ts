/**
 * Custom toast notification system — replaces browser alert() with styled in-app toasts.
 * Usage: showToast('Pesan Anda', 'success' | 'error' | 'warning' | 'info')
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

const ICONS: Record<ToastType, string> = {
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

const COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string; progress: string }> = {
  success: {
    bg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
    border: '#86efac',
    text: '#166534',
    icon: '#22c55e',
    progress: '#22c55e',
  },
  error: {
    bg: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',
    border: '#fca5a5',
    text: '#991b1b',
    icon: '#ef4444',
    progress: '#ef4444',
  },
  warning: {
    bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    border: '#fcd34d',
    text: '#92400e',
    icon: '#f59e0b',
    progress: '#f59e0b',
  },
  info: {
    bg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
    border: '#93c5fd',
    text: '#1e40af',
    icon: '#3b82f6',
    progress: '#3b82f6',
  },
};

let toastContainer: HTMLDivElement | null = null;

function getContainer(): HTMLDivElement {
  if (toastContainer && document.body.contains(toastContainer)) return toastContainer;

  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  Object.assign(toastContainer.style, {
    position: 'fixed',
    top: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '99999',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    pointerEvents: 'none',
    width: '100%',
    maxWidth: '420px',
    padding: '0 16px',
    boxSizing: 'border-box',
  });
  document.body.appendChild(toastContainer);
  return toastContainer;
}

export function showToast(message: string, type: ToastType = 'info', durationMs = 3500) {
  if (typeof window === 'undefined') return;

  const container = getContainer();
  const colors = COLORS[type];
  const icon = ICONS[type];

  const toast = document.createElement('div');
  Object.assign(toast.style, {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 20px',
    background: colors.bg,
    border: `1.5px solid ${colors.border}`,
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
    backdropFilter: 'blur(12px)',
    color: colors.text,
    fontFamily: "'Outfit', sans-serif",
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '1.4',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    opacity: '0',
    transform: 'translateY(-16px) scale(0.96)',
    transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
    position: 'relative',
    overflow: 'hidden',
    cursor: 'pointer',
  });

  // Icon
  const iconEl = document.createElement('span');
  iconEl.className = 'material-symbols-outlined';
  iconEl.textContent = icon;
  Object.assign(iconEl.style, {
    fontSize: '22px',
    color: colors.icon,
    flexShrink: '0',
    fontVariationSettings: "'FILL' 1",
  });

  // Message text
  const textEl = document.createElement('span');
  textEl.textContent = message;
  Object.assign(textEl.style, {
    flex: '1',
    wordBreak: 'break-word',
  });

  // Close button
  const closeBtn = document.createElement('span');
  closeBtn.className = 'material-symbols-outlined';
  closeBtn.textContent = 'close';
  Object.assign(closeBtn.style, {
    fontSize: '18px',
    color: colors.text,
    opacity: '0.5',
    cursor: 'pointer',
    flexShrink: '0',
    borderRadius: '50%',
    padding: '2px',
    transition: 'opacity 0.2s',
  });
  closeBtn.onmouseenter = () => { closeBtn.style.opacity = '1'; };
  closeBtn.onmouseleave = () => { closeBtn.style.opacity = '0.5'; };

  // Progress bar
  const progressBar = document.createElement('div');
  Object.assign(progressBar.style, {
    position: 'absolute',
    bottom: '0',
    left: '0',
    height: '3px',
    background: colors.progress,
    borderRadius: '0 0 16px 16px',
    width: '100%',
    transformOrigin: 'left',
    transition: `transform ${durationMs}ms linear`,
  });

  toast.appendChild(iconEl);
  toast.appendChild(textEl);
  toast.appendChild(closeBtn);
  toast.appendChild(progressBar);
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0) scale(1)';
    // Start progress bar shrink
    requestAnimationFrame(() => {
      progressBar.style.transform = 'scaleX(0)';
    });
  });

  const dismiss = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-16px) scale(0.96)';
    setTimeout(() => {
      toast.remove();
      if (container.childElementCount === 0) {
        container.remove();
        toastContainer = null;
      }
    }, 350);
  };

  // Click to dismiss
  toast.onclick = dismiss;
  closeBtn.onclick = (e) => { e.stopPropagation(); dismiss(); };

  // Auto dismiss
  setTimeout(dismiss, durationMs);
}

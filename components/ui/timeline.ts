// Timeline Components for AFT Request Tracking
// Provides visual timeline representation of request workflow states

export interface TimelineStep {
  id: string;
  title: string;
  description?: string;
  status: 'completed' | 'current' | 'pending' | 'skipped' | 'error';
  timestamp?: number;
  assignedTo?: string;
  notes?: string;
  duration?: number; // in hours
}

export interface TimelineProps {
  steps: TimelineStep[];
  orientation?: 'vertical' | 'horizontal';
  showTimestamps?: boolean;
  showDuration?: boolean;
  compact?: boolean;
  className?: string;
}

export interface StatusProgressProps {
  currentStatus: string;
  allStatuses: string[];
  statusLabels?: Record<string, string>;
  className?: string;
}

// Main Timeline Component
export function Timeline({
  steps,
  orientation = 'vertical',
  showTimestamps = true,
  showDuration = false,
  compact = false,
  className = ''
}: TimelineProps): string {
  const isVertical = orientation === 'vertical';
  
  return `
    <div class="timeline-container ${isVertical ? 'timeline-vertical' : 'timeline-horizontal'} ${compact ? 'timeline-compact' : ''} ${className}">
      <div class="timeline-track">
        ${steps.map((step, index) => renderTimelineStep(step, index, steps.length, {
          isVertical,
          showTimestamps,
          showDuration,
          compact
        })).join('')}
      </div>
    </div>
  `;
}

function renderTimelineStep(
  step: TimelineStep, 
  index: number, 
  totalSteps: number, 
  options: { isVertical: boolean; showTimestamps: boolean; showDuration: boolean; compact: boolean }
): string {
  const { isVertical, showTimestamps, showDuration, compact } = options;
  const isLast = index === totalSteps - 1;
  
  const statusClasses = {
    completed: 'timeline-step-completed',
    current: 'timeline-step-current',
    pending: 'timeline-step-pending',
    skipped: 'timeline-step-skipped',
    error: 'timeline-step-error'
  };

  const statusIcons = {
    completed: '✓',
    current: '●',
    pending: '○',
    skipped: '⊘',
    error: '✗'
  };

  const statusColors = {
    completed: 'var(--success)',
    current: 'var(--primary)',
    pending: 'var(--muted-foreground)',
    skipped: 'var(--warning)',
    error: 'var(--destructive)'
  };

  return `
    <div class="timeline-step ${statusClasses[step.status]} ${isVertical ? 'timeline-step-vertical' : 'timeline-step-horizontal'}" data-step-id="${step.id}">
      <div class="timeline-step-indicator">
        <div class="timeline-step-icon" style="background-color: ${statusColors[step.status]}; color: var(--background);">
          ${statusIcons[step.status]}
        </div>
        ${!isLast ? `<div class="timeline-step-connector ${step.status === 'completed' ? 'timeline-connector-active' : ''}"></div>` : ''}
      </div>
      
      <div class="timeline-step-content">
        <div class="timeline-step-header">
          <h4 class="timeline-step-title">${step.title}</h4>
          ${showTimestamps && step.timestamp ? `
            <time class="timeline-step-timestamp" datetime="${new Date(step.timestamp * 1000).toISOString()}">
              ${formatTimestamp(step.timestamp)}
            </time>
          ` : ''}
        </div>
        
        ${step.description && !compact ? `
          <p class="timeline-step-description">${step.description}</p>
        ` : ''}
        
        ${step.assignedTo ? `
          <div class="timeline-step-assignee">
            <span class="timeline-step-label">Assigned to:</span>
            <span class="timeline-step-value">${step.assignedTo}</span>
          </div>
        ` : ''}
        
        ${showDuration && step.duration ? `
          <div class="timeline-step-duration">
            <span class="timeline-step-label">Duration:</span>
            <span class="timeline-step-value">${formatDuration(step.duration)}</span>
          </div>
        ` : ''}
        
        ${step.notes ? `
          <div class="timeline-step-notes">
            <span class="timeline-step-label">Notes:</span>
            <p class="timeline-step-value">${step.notes}</p>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// Status Progress Bar Component
export function StatusProgress({
  currentStatus,
  allStatuses,
  statusLabels = {},
  className = ''
}: StatusProgressProps): string {
  const currentIndex = allStatuses.indexOf(currentStatus);
  const progressPercentage = currentIndex >= 0 ? ((currentIndex + 1) / allStatuses.length) * 100 : 0;
  
  return `
    <div class="status-progress ${className}">
      <div class="status-progress-bar">
        <div class="status-progress-fill" style="width: ${progressPercentage}%"></div>
      </div>
      <div class="status-progress-steps">
        ${allStatuses.map((status, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const label = statusLabels[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          
          return `
            <div class="status-progress-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}">
              <div class="status-progress-step-indicator">
                ${isCompleted ? '✓' : isCurrent ? '●' : '○'}
              </div>
              <span class="status-progress-step-label">${label}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// Enhanced Status Badge with Timeline Context
export function TimelineStatusBadge(
  status: string, 
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info',
  showProgress?: boolean,
  progressData?: { current: number; total: number }
): string {
  const baseClasses = 'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-all duration-200';
  
  const variantClasses = {
    default: 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]',
    success: 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20',
    warning: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20',
    error: 'bg-[var(--destructive)]/10 text-[var(--destructive)] border-[var(--destructive)]/20',
    info: 'bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/20'
  };

  const statusIcons = {
    draft: '📝',
    submitted: '📤',
    pending_dao: '👤',
    pending_approver: '🔍',
    pending_cpso: '🛡️',
    approved: '✅',
    rejected: '❌',
    pending_dta: '🔄',
    active_transfer: '📡',
    pending_sme_signature: '✍️',
    pending_sme: '🔬',
    pending_media_custodian: '💾',
    completed: '🎉',
    disposed: '🗑️',
    cancelled: '⛔'
  };

  const icon = statusIcons[status.toLowerCase() as keyof typeof statusIcons] || '●';
  const classes = `${baseClasses} ${variantClasses[variant || 'default']}`;
  
  return `
    <span class="${classes}" title="${status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}">
      <span class="timeline-badge-icon">${icon}</span>
      <span class="timeline-badge-text">${status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
      ${showProgress && progressData ? `
        <span class="timeline-badge-progress">
          (${progressData.current}/${progressData.total})
        </span>
      ` : ''}
    </span>
  `;
}

// Utility Functions
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

function formatDuration(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  } else if (hours < 24) {
    return `${Math.round(hours)}h`;
  } else {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
}

// AFT-specific timeline configuration
export const AFT_WORKFLOW_STEPS = [
  'draft',
  'submitted',
  'pending_dao',
  'pending_approver', 
  'pending_cpso',
  'approved',
  'pending_dta',
  'active_transfer',
  'pending_sme_signature',
  'pending_sme',
  'pending_media_custodian',
  'completed',
  'disposed'
];

export const AFT_STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  pending_dao: 'Pending DAO Review',
  pending_approver: 'Pending ISSM Review',
  pending_cpso: 'Pending CPSO Review',
  approved: 'Approved',
  rejected: 'Rejected',
  pending_dta: 'Pending DTA Assignment',
  active_transfer: 'Transfer in Progress',
  pending_sme_signature: 'Pending SME Signature',
  pending_sme: 'Pending SME Review',
  pending_media_custodian: 'Pending Media Disposition',
  completed: 'Completed',
  disposed: 'Media Disposed',
  cancelled: 'Cancelled'
};

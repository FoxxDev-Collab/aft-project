// UI Components Library Index
// Export all components for easy importing

// Button Components
export {
  Button,
  PrimaryButton,
  SecondaryButton,
  DestructiveButton,
  WarningButton,
  SuccessButton,
  type ButtonProps
} from './button';

// Card Components
export {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
  StatusCard,
  type CardProps,
  type CardHeaderProps,
  type CardContentProps,
  type CardFooterProps,
  type StatusCardProps
} from './card';

// Form Components
export {
  Input,
  Label,
  Select,
  Textarea,
  FormGroup,
  FormSection,
  ErrorMessage,
  SuccessMessage,
  type InputProps,
  type LabelProps,
  type SelectProps,
  type TextareaProps,
  type FormGroupProps
} from './form';

// Layout Components
export {
  PageHeader,
  Container,
  Grid,
  PageLayout,
  Sidebar,
  MainContent,
  PageFooter,
  SectionHeader,
  type PageHeaderProps,
  type ContainerProps,
  type GridProps
} from './layout';

// Table Components
export {
  Table,
  TableSearch,
  TableFilters,
  TableActions,
  TableContainer,
  StatusBadge,
  TableCellActions,
  type TableProps,
  type TableColumn,
  type TableRow,
  type TableSearchProps,
  type TableFiltersProps,
  type TableActionsProps
} from './table';

// Timeline Components
export {
  Timeline,
  StatusProgress,
  TimelineStatusBadge,
  AFT_WORKFLOW_STEPS,
  AFT_STATUS_LABELS,
  type TimelineStep,
  type TimelineProps,
  type StatusProgressProps
} from './timeline';

// Utility function to combine classes
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Theme utilities
export const theme = {
  colors: {
    primary: 'var(--primary)',
    'primary-foreground': 'var(--primary-foreground)',
    secondary: 'var(--secondary)',
    'secondary-foreground': 'var(--secondary-foreground)',
    destructive: 'var(--destructive)',
    'destructive-foreground': 'var(--destructive-foreground)',
    warning: 'var(--warning)',
    'warning-foreground': 'var(--warning-foreground)',
    success: 'var(--success)',
    'success-foreground': 'var(--success-foreground)',
    muted: 'var(--muted)',
    'muted-foreground': 'var(--muted-foreground)',
    accent: 'var(--accent)',
    'accent-foreground': 'var(--accent-foreground)',
    card: 'var(--card)',
    'card-foreground': 'var(--card-foreground)',
    border: 'var(--border)',
    input: 'var(--input)',
    ring: 'var(--ring)',
    background: 'var(--background)',
    foreground: 'var(--foreground)'
  },
  spacing: {
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem'
  },
  borderRadius: {
    sm: 'calc(var(--radius) - 2px)',
    md: 'var(--radius)',
    lg: 'calc(var(--radius) + 2px)'
  },
  shadows: {
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow)',
    lg: 'var(--shadow-lg)',
    xl: 'var(--shadow-xl)'
  }
};

// Component variants
export const variants = {
  button: {
    primary: 'action-btn primary',
    secondary: 'action-btn secondary',
    warning: 'action-btn warning',
    destructive: 'logout-btn',
    success: 'acknowledge-btn'
  },
  card: {
    default: 'status-card',
    elevated: 'status-card hover:shadow-lg',
    outlined: 'status-card border-2'
  }
} as const;
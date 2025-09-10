// Requestor Navigation Component for consistent navigation across requestor pages
import { ComponentBuilder } from "../components/ui/server-components";

export interface RequestorUser {
  email: string;
  role: string;
}

export interface RequestorNavItem {
  label: string;
  href: string;
  active?: boolean;
  icon?: string;
}

export class RequestorNavigation {
  private static readonly NAV_ITEMS: RequestorNavItem[] = [
    { label: 'Dashboard', href: '/requestor', icon: '🏠' },
    { label: 'My Requests', href: '/requestor/requests', icon: '📋' },
    { label: 'New Request', href: '/requestor/new-request', icon: '➕' },
  ];

  static getNavItems(currentPath: string): RequestorNavItem[] {
    return this.NAV_ITEMS.map(item => ({
      ...item,
      active: currentPath === item.href || 
               (item.href !== '/requestor' && currentPath.startsWith(item.href))
    }));
  }

  static renderNavigation(currentPath: string): string {
    const navItems = this.getNavItems(currentPath);
    
    return `
      <nav class="flex space-x-1 pb-4 border-t border-[var(--border)] pt-4">
        ${navItems.map(item => `
          <a 
            href="${item.href}" 
            class="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              item.active 
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
            }"
          >
            ${item.icon ? `<span class="w-4 h-4">${item.icon}</span>` : ''}
            ${item.label}
          </a>
        `).join('')}
      </nav>
    `;
  }

  static renderPageHeader(
    title: string, 
    subtitle: string, 
    user: RequestorUser, 
    currentPath: string,
    actions?: string
  ): string {
    return ComponentBuilder.pageHeader({
      title: `AFT Requestor - ${title}`,
      subtitle,
      classification: 'UNCLASSIFIED',
      user,
      actions: actions || ComponentBuilder.destructiveButton({
        children: 'Logout',
        onClick: "window.location.href='/logout'",
        size: 'sm'
      }),
      navigation: this.getNavItems(currentPath)
    });
  }

  static renderLayout(
    title: string,
    subtitle: string,
    user: RequestorUser,
    currentPath: string,
    content: string,
    actions?: string
  ): string {
    const header = this.renderPageHeader(title, subtitle, user, currentPath, actions);
    
    return ComponentBuilder.pageLayout({
      header,
      children: ComponentBuilder.container({ children: content }),
      footer: `
        <div class="flex justify-between items-center text-sm text-[var(--muted-foreground)] py-4">
          <span>AFT Requestor Portal v1.0 - Powered by Bun</span>
          <span>Last updated: ${new Date().toLocaleString()}</span>
        </div>
      `
    });
  }

  // Breadcrumb navigation for nested requestor pages
  static renderBreadcrumb(path: string): string {
    const segments = path.split('/').filter(Boolean);
    const breadcrumbs = segments.map((segment, index) => {
      const href = '/' + segments.slice(0, index + 1).join('/');
      const isLast = index === segments.length - 1;
      const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace('-', ' ');
      
      return {
        label,
        href,
        isLast
      };
    });

    return `
      <nav class="flex mb-6" aria-label="Breadcrumb">
        <ol class="inline-flex items-center space-x-1 md:space-x-3">
          <li class="inline-flex items-center">
            <a href="/requestor" class="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--primary)]">
              Home
            </a>
          </li>
          ${breadcrumbs.map(breadcrumb => `
            <li>
              <div class="flex items-center">
                <svg class="w-6 h-6 text-[var(--muted-foreground)]" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"></path>
                </svg>
                ${breadcrumb.isLast ? `
                  <span class="ml-1 text-sm font-medium text-[var(--foreground)] md:ml-2">${breadcrumb.label}</span>
                ` : `
                  <a href="${breadcrumb.href}" class="ml-1 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--primary)] md:ml-2">
                    ${breadcrumb.label}
                  </a>
                `}
              </div>
            </li>
          `).join('')}
        </ol>
      </nav>
    `;
  }

  // Quick stats card for requestor pages
  static renderQuickStats(stats: Array<{
    label: string;
    value: string | number;
    status?: 'operational' | 'warning' | 'error';
    change?: string;
  }>): string {
    return ComponentBuilder.statusCard({
      title: 'Request Statistics',
      items: stats.map(stat => ({
        label: stat.label,
        value: stat.value.toString(),
        status: stat.status || 'operational'
      }))
    });
  }
}
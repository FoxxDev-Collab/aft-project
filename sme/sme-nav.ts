// SME Navigation Component for consistent navigation across SME pages
import { ComponentBuilder } from "../components/ui/server-components";
import { EditIcon, ClipboardIcon, ListIcon, FileTextIcon } from "../components/icons";

export interface SMEUser {
  email: string;
  role: string;
}

export interface SMENavItem {
  label: string;
  href: string;
  active?: boolean;
  icon?: string;
}

export class SMENavigation {
  private static readonly NAV_ITEMS: SMENavItem[] = [
    { label: 'Dashboard', href: '/sme', icon: EditIcon({ size: 16 }) },
    { label: 'Requests', href: '/sme/requests', icon: ListIcon({ size: 16 }) },
    { label: 'All Requests', href: '/sme/all-requests', icon: FileTextIcon({ size: 16 }) },
    { label: 'Signature History', href: '/sme/history', icon: ClipboardIcon({ size: 16 }) }
  ];

  static getNavItems(currentPath: string): SMENavItem[] {
    return this.NAV_ITEMS.map(item => ({
      ...item,
      active: currentPath === item.href || 
               (item.href !== '/sme' && currentPath.startsWith(item.href))
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
            ${item.icon ? `<span class="icon-interactive">${item.icon}</span>` : ''}
            ${item.label}
          </a>
        `).join('')}
      </nav>
    `;
  }

  static renderPageHeader(
    title: string, 
    subtitle: string, 
    user: SMEUser, 
    currentPath: string,
    actions?: string
  ): string {
    return ComponentBuilder.pageHeader({
      title: `AFT SME - ${title}`,
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
    user: SMEUser,
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
          <span>AFT SME Portal v1.0</span>
          <span>Last updated: ${new Date().toLocaleString()}</span>
        </div>
      `
    });
  }
}
